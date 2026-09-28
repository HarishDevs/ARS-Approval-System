import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashOtpCode } from "@/lib/security/otp";
import type { ChallengeRecord } from "@/lib/db/repositories/otp.repository";
import type { UserRecord } from "@/lib/db/repositories/users.repository";
import { completeSignIn, type CompleteSignInDeps } from "@/server/auth/complete-sign-in";
import { AuthError } from "@/server/auth/errors";
import { resendOtpWithDeps, startPasswordSignInWithDeps, verifyOtpWithDeps, type PasswordSignInDeps } from "@/server/auth/password-sign-in";
import type { NotifyInput } from "@/server/notifications/notify";
import type { RequestContext } from "@/types/auth";
import { userRecord } from "../helpers/user-fixtures";

const context: RequestContext = { ipAddress: "10.0.0.1", userAgent: "vitest", deviceKey: null };

function completeDeps(overrides: Partial<CompleteSignInDeps> = {}) {
  const notified: NotifyInput[] = [];
  const deps: CompleteSignInDeps = {
    findDevice: vi.fn(async () => null) as unknown as CompleteSignInDeps["findDevice"],
    createDevice: vi.fn(async () => 9) as unknown as CompleteSignInDeps["createDevice"],
    touchDevice: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["touchDevice"],
    createSession: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["createSession"],
    markLoginSuccess: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["markLoginSuccess"],
    recordLogin: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["recordLogin"],
    recordAudit: vi.fn(async () => undefined) as unknown as CompleteSignInDeps["recordAudit"],
    listSuperAdminIds: async () => [1],
    notify: async (input) => {
      notified.push(input);
    },
    dispatch: (work) => {
      void work();
    },
    getTrustedDeviceDays: async () => 30,
    randomUUID: () => "session-uuid",
    now: () => new Date("2026-09-28T10:00:00Z"),
    appBaseUrl: () => "https://approvals.arssteels.net",
    ...overrides,
  };
  return { deps, notified };
}

function passwordDeps(user: UserRecord | null, overrides: Partial<PasswordSignInDeps> = {}) {
  const challenges: ChallengeRecord[] = [];
  const sentCodes: string[] = [];
  const { deps: complete, notified } = completeDeps();
  const deps: PasswordSignInDeps = {
    findUserByLoginId: async () => user,
    findUserById: async () => user,
    verifyPassword: async (password) => password === "Correct123",
    burnPasswordCheck: vi.fn(async () => undefined),
    recordFailedPassword: vi.fn(async () => ({ failedCount: 1, locked: false })),
    resetFailedLogins: vi.fn(async () => undefined),
    getRecentOtpStats: async () => ({ countLastHour: 0, secondsSinceLast: null }),
    createChallenge: vi.fn(async (input) => {
      challenges.push({
        id: challenges.length + 1,
        userId: input.userId,
        purpose: input.purpose,
        otpHash: input.otpHash,
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        consumed: false,
        secondsUntilExpiry: input.ttlSeconds,
        secondsSinceCreated: 0,
      });
      return challenges.length;
    }) as unknown as PasswordSignInDeps["createChallenge"],
    findChallengeByTokenHash: async () => challenges.at(-1) ?? null,
    incrementChallengeAttempt: vi.fn(async (id: number) => {
      const challenge = challenges.find((c) => c.id === id)!;
      challenge.attemptCount += 1;
    }),
    consumeChallenge: vi.fn(async (id: number) => {
      const challenge = challenges.find((c) => c.id === id)!;
      if (challenge.consumed) return false;
      challenge.consumed = true;
      return true;
    }),
    findOtpTemplate: async () => ({ id: 1, providerName: "wa_login_otp_v1", language: "en", variableKeys: ["otp_code"] }),
    sendOtpWhatsApp: vi.fn(async (_to, _template, code) => {
      sentCodes.push(code);
    }),
    recordLogin: vi.fn(async () => undefined) as unknown as PasswordSignInDeps["recordLogin"],
    recordAudit: vi.fn(async () => undefined) as unknown as PasswordSignInDeps["recordAudit"],
    notify: vi.fn(async () => undefined),
    getConfig: async () => ({
      otpLength: 6,
      otpTtlSeconds: 300,
      otpMaxAttempts: 3,
      otpCooldownSeconds: 30,
      otpMaxPerHour: 5,
      passwordMinLength: 10,
      lockoutThreshold: 5,
      lockoutMinutes: 15,
      trustedDeviceDays: 30,
    }),
    generateOtpCode: () => "482913",
    randomToken: () => "challenge-token",
    complete,
    ...overrides,
  };
  return { deps, challenges, sentCodes, notified };
}

async function expectAuthError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AuthError);
  await promise.catch((error: AuthError) => expect(error.code).toBe(code));
}

describe("password + WhatsApp OTP sign-in (F-02)", () => {
  let user: UserRecord;
  beforeEach(() => {
    user = userRecord();
  });

  it("happy path: password → OTP on WhatsApp → session", async () => {
    const { deps, sentCodes, challenges } = passwordDeps(user);
    const started = await startPasswordSignInWithDeps("EMP005", "Correct123", context, deps);
    expect(started).toMatchObject({ challengeToken: "challenge-token", maskedNumber: "91XXXXXXXX10", expiresInSeconds: 300 });
    expect(sentCodes).toEqual(["482913"]);
    expect(challenges[0]!.otpHash).toBe(hashOtpCode("482913"));

    const result = await verifyOtpWithDeps("challenge-token", " 482913 ", context, deps);
    expect(result.redirectTo).toBe("/users");
    expect(result.sessionId).toBe("session-uuid");
    expect(challenges[0]!.consumed).toBe(true);
  });

  it("unknown user ID and wrong password give the same generic error", async () => {
    const unknown = passwordDeps(null);
    await expectAuthError(startPasswordSignInWithDeps("NOPE", "Correct123", context, unknown.deps), "AUTH_INVALID_CREDENTIALS");
    expect(unknown.deps.burnPasswordCheck).toHaveBeenCalled();

    const wrong = passwordDeps(user);
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Wrong1234", context, wrong.deps), "AUTH_INVALID_CREDENTIALS");
    expect(wrong.deps.recordFailedPassword).toHaveBeenCalledWith(5, 5, 15);
    expect(wrong.sentCodes).toEqual([]);
  });

  it("locks after too many wrong passwords and alerts the user", async () => {
    const { deps } = passwordDeps(user, { recordFailedPassword: async () => ({ failedCount: 5, locked: true }) });
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Wrong1234", context, deps), "AUTH_ACCOUNT_LOCKED");
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ACCOUNT_LOCKED", userId: 5 }));
  });

  it("a locked account can't sign in even with the right password", async () => {
    const { deps, sentCodes } = passwordDeps(userRecord({ lockedSecondsRemaining: 300 }));
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, deps), "AUTH_ACCOUNT_LOCKED");
    expect(sentCodes).toEqual([]);
  });

  it("inactive or Google-only users get the generic error, not a code", async () => {
    for (const blocked of [userRecord({ active: false }), userRecord({ signInMethod: "GOOGLE" })]) {
      const { deps, sentCodes } = passwordDeps(blocked);
      await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, deps), "AUTH_INVALID_CREDENTIALS");
      expect(sentCodes).toEqual([]);
    }
  });

  it("no WhatsApp number → tells the user to contact IT", async () => {
    const { deps } = passwordDeps(userRecord({ whatsappNumber: null }));
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, deps), "AUTH_NO_WHATSAPP");
  });

  it("OTP template not active → delivery failed (no code created)", async () => {
    const { deps, challenges } = passwordDeps(user, { findOtpTemplate: async () => null });
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, deps), "AUTH_OTP_DELIVERY_FAILED");
    expect(challenges).toHaveLength(0);
  });

  it("enforces cooldown and hourly cap", async () => {
    const cooling = passwordDeps(user, { getRecentOtpStats: async () => ({ countLastHour: 1, secondsSinceLast: 10 }) });
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, cooling.deps), "AUTH_OTP_COOLDOWN");
    const capped = passwordDeps(user, { getRecentOtpStats: async () => ({ countLastHour: 5, secondsSinceLast: 600 }) });
    await expectAuthError(startPasswordSignInWithDeps("EMP005", "Correct123", context, capped.deps), "AUTH_OTP_RATE_LIMITED");
  });

  it("wrong codes count attempts, then lock the challenge", async () => {
    const { deps } = passwordDeps(user);
    await startPasswordSignInWithDeps("EMP005", "Correct123", context, deps);
    await expectAuthError(verifyOtpWithDeps("challenge-token", "000000", context, deps), "AUTH_INVALID_OTP");
    await expectAuthError(verifyOtpWithDeps("challenge-token", "000000", context, deps), "AUTH_INVALID_OTP");
    await expectAuthError(verifyOtpWithDeps("challenge-token", "000000", context, deps), "AUTH_INVALID_OTP");
    // Right code after the limit is still refused.
    await expectAuthError(verifyOtpWithDeps("challenge-token", "482913", context, deps), "AUTH_OTP_LOCKED");
  });

  it("a code can be used only once, and expired codes are refused", async () => {
    const { deps, challenges } = passwordDeps(user);
    await startPasswordSignInWithDeps("EMP005", "Correct123", context, deps);
    await verifyOtpWithDeps("challenge-token", "482913", context, deps);
    await expectAuthError(verifyOtpWithDeps("challenge-token", "482913", context, deps), "AUTH_CHALLENGE_EXPIRED");

    const second = passwordDeps(user);
    await startPasswordSignInWithDeps("EMP005", "Correct123", context, second.deps);
    second.challenges[0]!.secondsUntilExpiry = 0;
    await expectAuthError(verifyOtpWithDeps("challenge-token", "482913", context, second.deps), "AUTH_CHALLENGE_EXPIRED");
    expect(challenges).toHaveLength(1);
  });

  it("re-checks the account after the OTP (deactivated meanwhile)", async () => {
    let current = user;
    const { deps } = passwordDeps(user, { findUserById: async () => current });
    await startPasswordSignInWithDeps("EMP005", "Correct123", context, deps);
    current = userRecord({ active: false });
    await expectAuthError(verifyOtpWithDeps("challenge-token", "482913", context, deps), "AUTH_INVALID_CREDENTIALS");
  });

  it("resend issues a new code and closes the old challenge", async () => {
    const { deps, challenges, sentCodes } = passwordDeps(user, {
      getRecentOtpStats: vi.fn().mockResolvedValueOnce({ countLastHour: 0, secondsSinceLast: null }).mockResolvedValue({ countLastHour: 1, secondsSinceLast: 45 }),
      findChallengeByTokenHash: async () => challenges[0] ?? null,
    });
    await startPasswordSignInWithDeps("EMP005", "Correct123", context, deps);
    await resendOtpWithDeps("challenge-token", context, deps);
    expect(sentCodes).toHaveLength(2);
    expect(challenges[0]!.consumed).toBe(true);
    expect(challenges).toHaveLength(2);
  });
});

describe("complete sign-in: new-login alerts (F-03, N-02, N-04)", () => {
  it("alerts on a new device for a returning user, with a 'This wasn't me' link", async () => {
    const { deps, notified } = completeDeps();
    const result = await completeSignIn(userRecord(), "PASSWORD_OTP", context, deps);
    expect(result.isNewDevice).toBe(true);
    expect(result.newDeviceCookie).toBeTruthy();
    await Promise.resolve();
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ eventType: "NEW_LOGIN", userId: 5 });
    expect(notified[0]!.deepLink).toContain("https://approvals.arssteels.net/security/not-me?token=");
  });

  it("no alert on a known device or on the very first sign-in", async () => {
    const known = completeDeps({ findDevice: (async () => ({ id: 3, trustedSecondsRemaining: 100 })) as unknown as CompleteSignInDeps["findDevice"] });
    await completeSignIn(userRecord(), "GOOGLE", { ...context, deviceKey: "known" }, known.deps);
    expect(known.notified).toHaveLength(0);

    const first = completeDeps();
    await completeSignIn(userRecord({ hasLoggedInBefore: false }), "GOOGLE", context, first.deps);
    expect(first.notified).toHaveLength(0);
  });

  it("every Super Admin and break-glass sign-in alerts the Super Admins", async () => {
    const admin = completeDeps({ findDevice: (async () => ({ id: 3, trustedSecondsRemaining: 100 })) as unknown as CompleteSignInDeps["findDevice"] });
    await completeSignIn(userRecord({ id: 1, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] }), "GOOGLE", { ...context, deviceKey: "k" }, admin.deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(admin.notified.map((n) => n.eventType)).toEqual(["SUPER_ADMIN_SIGNIN"]);

    const glass = completeDeps({ findDevice: (async () => ({ id: 3, trustedSecondsRemaining: 100 })) as unknown as CompleteSignInDeps["findDevice"] });
    await completeSignIn(userRecord({ isBreakGlass: true, breakGlassSecondsRemaining: 600 }), "PASSWORD_OTP", { ...context, deviceKey: "k" }, glass.deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(glass.notified.map((n) => n.eventType)).toEqual(["BREAK_GLASS_USED"]);
  });

  it("an alert failure never blocks sign-in", async () => {
    const { deps } = completeDeps({
      notify: async () => {
        throw new Error("provider down");
      },
      dispatch: (work) => {
        void work().catch(() => undefined);
      },
    });
    await expect(completeSignIn(userRecord(), "GOOGLE", context, deps)).resolves.toMatchObject({ redirectTo: "/users" });
  });
});
