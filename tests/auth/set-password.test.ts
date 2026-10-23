import { describe, expect, it, vi } from "vitest";
import type { ChallengeRecord } from "@/lib/db/repositories/otp.repository";
import type { PasswordTokenRecord } from "@/lib/db/repositories/password-tokens.repository";
import type { UserRecord } from "@/lib/db/repositories/users.repository";
import type { CompleteSignInDeps } from "@/server/auth/complete-sign-in";
import { AuthError } from "@/server/auth/errors";
import {
  completeForgotPasswordWithDeps,
  completeSetPasswordWithDeps,
  inspectSetPasswordLinkWithDeps,
  sendInvitationWithDeps,
  sendSetPasswordLinkWithDeps,
  startForgotPasswordWithDeps,
  startSetPasswordWithDeps,
  type PasswordFlowDeps,
} from "@/server/auth/set-password";
import type { RequestContext } from "@/types/auth";
import { userRecord } from "../helpers/user-fixtures";

const context: RequestContext = { ipAddress: "10.0.0.2", userAgent: "vitest", deviceKey: "known-device" };
const GOOD = "Newpass2026";

function build(user: UserRecord | null, overrides: Partial<PasswordFlowDeps> = {}) {
  const challenges: ChallengeRecord[] = [];
  const tokens: (PasswordTokenRecord & { hash: string })[] = [];
  const sentCodes: string[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const applied: Parameters<PasswordFlowDeps["applyNewPassword"]>[0][] = [];
  let tokenCounter = 0;
  const complete: CompleteSignInDeps = {
    findDevice: (async () => ({ id: 1, trustedSecondsRemaining: 100 })) as unknown as CompleteSignInDeps["findDevice"],
    createDevice: (async () => 1) as unknown as CompleteSignInDeps["createDevice"],
    touchDevice: (async () => undefined) as unknown as CompleteSignInDeps["touchDevice"],
    createSession: (async () => undefined) as unknown as CompleteSignInDeps["createSession"],
    markLoginSuccess: (async () => undefined) as unknown as CompleteSignInDeps["markLoginSuccess"],
    recordLogin: (async () => undefined) as unknown as CompleteSignInDeps["recordLogin"],
    recordAudit: (async () => undefined) as unknown as CompleteSignInDeps["recordAudit"],
    listSuperAdminIds: async () => [],
    notify: async () => undefined,
    dispatch: () => undefined,
    getTrustedDeviceDays: async () => 30,
    randomUUID: () => "new-session",
    now: () => new Date("2026-09-29T10:00:00Z"),
    appBaseUrl: () => "https://approval.arssteels.net",
  };
  const deps: PasswordFlowDeps = {
    getRecentOtpStats: async () => ({ countLastHour: 0, secondsSinceLast: null }),
    createChallenge: (async (input: { challengeTokenHash: string; userId: number; purpose: ChallengeRecord["purpose"]; otpHash: string; ttlSeconds: number; maxAttempts: number }) => {
      challenges.push({ id: challenges.length + 1, userId: input.userId, purpose: input.purpose, otpHash: input.otpHash, attemptCount: 0, maxAttempts: input.maxAttempts, consumed: false, secondsUntilExpiry: input.ttlSeconds, secondsSinceCreated: 0 });
      return challenges.length;
    }) as unknown as PasswordFlowDeps["createChallenge"],
    findChallengeByTokenHash: async () => challenges.at(-1) ?? null,
    reserveChallengeAttempt: async (id) => {
      const challenge = challenges.find((c) => c.id === id)!;
      if (challenge.consumed || challenge.attemptCount >= challenge.maxAttempts) return false;
      challenge.attemptCount += 1;
      return true;
    },
    consumeChallenge: async (id) => {
      const challenge = challenges.find((c) => c.id === id)!;
      if (challenge.consumed) return false;
      challenge.consumed = true;
      return true;
    },
    findOtpTemplate: async () => ({ id: 1, providerName: "wa_login_otp_v1", language: "en", variableKeys: ["otp_code"] }),
    sendOtpWhatsApp: async (_to, _template, code) => {
      sentCodes.push(code);
    },
    recordAudit: vi.fn(async () => undefined) as unknown as PasswordFlowDeps["recordAudit"],
    generateOtpCode: () => "271828",
    randomToken: () => `token-${++tokenCounter}`,
    findUserById: async () => user,
    findUserByLoginId: async () => user,
    createPasswordToken: (async (input: { userId: number; tokenHash: string }) => {
      tokens.push({ id: tokens.length + 1, userId: input.userId, used: false, secondsUntilExpiry: 72 * 3600, hash: input.tokenHash });
    }) as unknown as PasswordFlowDeps["createPasswordToken"],
    findPasswordToken: async (hash) => tokens.find((t) => t.hash === hash) ?? null,
    hashPassword: async (password) => `hashed:${password}`,
    applyNewPassword: async (input) => {
      if (input.tokenId !== null) {
        const token = tokens.find((t) => t.id === input.tokenId)!;
        if (token.used) return false;
        token.used = true;
      }
      applied.push(input);
      return true;
    },
    notify: vi.fn(async () => ({ recorded: true, email: { status: "SENT" as const }, whatsapp: null })),
    getConfig: async () => ({ otpLength: 6, otpTtlSeconds: 300, otpMaxAttempts: 3, otpCooldownSeconds: 30, otpMaxPerHour: 5, passwordMinLength: 10, lockoutThreshold: 5, lockoutMinutes: 15, trustedDeviceDays: 30 }),
    defer: (work) => {
      deferred.push(work);
    },
    appBaseUrl: () => "https://approval.arssteels.net",
    complete,
    ...overrides,
  };
  const runDeferred = async () => {
    for (const work of deferred.splice(0)) await work();
  };
  return { deps, challenges, tokens, sentCodes, applied, runDeferred };
}

const itAdmin = { id: 2, roles: ["USER", "IT_ADMIN"] as const, sessionId: "s", ipAddress: null };

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).code).toBe(code);
}

// v1.13.0 (D-166, owner): invite and reset password, by email only.
describe("invite and reset password (D-166)", () => {
  const admin = () => ({ ...itAdmin, roles: [...itAdmin.roles] });
  type Sent = { eventType: string; email: { subject: string; text: string }; whatsappVariables: unknown };
  const sentOf = (deps: PasswordFlowDeps) => (deps.notify as unknown as { mock: { calls: [Sent][] } }).mock.calls.map((call) => call[0]);
  const audits = (deps: PasswordFlowDeps) => (deps.recordAudit as unknown as { mock: { calls: [{ action: string }][] } }).mock.calls.map((call) => call[0].action);

  it("a Google user is invited to sign in with Google as their email; no link is made", async () => {
    const { deps, tokens } = build(userRecord({ signInMethod: "GOOGLE", passwordHash: null }));
    const result = await sendInvitationWithDeps(5, admin(), deps);
    expect(result).toEqual({ ok: true, value: expect.stringContaining("Invitation emailed to staff@example.com") });
    expect(tokens).toHaveLength(0);
    const [sent] = sentOf(deps);
    expect(sent).toMatchObject({ eventType: "USER_INVITED", whatsappVariables: null, email: { subject: "You've been added to ARS Approvals" } });
    expect(sent!.email.text).toContain("https://approval.arssteels.net/login");
    expect(sent!.email.text).toContain("staff@example.com");
    expect(audits(deps)).toContain("USER_INVITED");
  });

  it("a password user's invitation carries their User ID and a set-password link", async () => {
    const { deps, tokens } = build(userRecord({ passwordHash: null }));
    const result = await sendInvitationWithDeps(5, admin(), deps);
    expect(result).toEqual({ ok: true, value: expect.stringContaining("Invitation with a set-password link emailed") });
    expect(tokens).toHaveLength(1);
    const [sent] = sentOf(deps);
    expect(sent!.eventType).toBe("USER_INVITED");
    expect(sent!.email.text).toContain("Your User ID: EMP005");
    expect(sent!.email.text).toContain("/set-password?token=token-1");
  });

  it("reset uses its own wording and event; before a first password it is a plain set-password link", async () => {
    const withPassword = build(userRecord({ passwordHash: "scrypt$x" }));
    expect(await sendSetPasswordLinkWithDeps(5, admin(), withPassword.deps, "RESET")).toEqual({ ok: true, value: expect.stringContaining("Password reset link emailed") });
    const [reset] = sentOf(withPassword.deps);
    expect(reset).toMatchObject({ eventType: "PASSWORD_RESET_LINK", email: { subject: "Reset your ARS Approvals password" } });
    expect(reset!.email.text).toContain("current password still works");
    expect(audits(withPassword.deps)).toContain("PASSWORD_RESET_LINK_SENT");

    const noPassword = build(userRecord({ passwordHash: null }));
    await sendSetPasswordLinkWithDeps(5, admin(), noPassword.deps, "RESET");
    expect(sentOf(noPassword.deps)[0]!.eventType).toBe("SET_PASSWORD_LINK");
  });

  it("the same rules: no invite for inactive or break-glass accounts, nor a password user without WhatsApp; a failed email says why", async () => {
    expect((await sendInvitationWithDeps(5, admin(), build(userRecord({ signInMethod: "GOOGLE", active: false })).deps)).ok).toBe(false);
    expect((await sendInvitationWithDeps(5, admin(), build(userRecord({ whatsappNumber: null })).deps)).ok).toBe(false);
    const superAdmin = { id: 1, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as ("USER" | "IT_ADMIN" | "SUPER_ADMIN")[], sessionId: "s", ipAddress: null };
    expect((await sendInvitationWithDeps(5, superAdmin, build(userRecord({ signInMethod: "GOOGLE", isBreakGlass: true })).deps)).ok).toBe(false);
    // Another IT Admin's account: only the Super Admin.
    expect((await sendInvitationWithDeps(5, admin(), build(userRecord({ signInMethod: "GOOGLE", roles: ["USER", "IT_ADMIN"] })).deps)).ok).toBe(false);
    const failing = build(userRecord({ signInMethod: "GOOGLE" }), { notify: async () => ({ recorded: true, email: { status: "FAILED", code: "EMAIL_NOT_CONFIGURED" }, whatsapp: null }) });
    expect(await sendInvitationWithDeps(5, admin(), failing.deps)).toEqual({ ok: false, message: expect.stringContaining("EMAIL_NOT_CONFIGURED") });
  });
});

describe("set-password link (P1-13)", () => {
  it("an admin sends the link by email; it is never shown to the admin", async () => {
    const { deps, tokens } = build(userRecord({ passwordHash: null }));
    const result = await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    expect(result).toEqual({ ok: true, value: expect.stringContaining("emailed to staff@example.com") });
    expect(result.ok && result.value).not.toContain("token-");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.hash).not.toContain("token-1");
    const sent = (deps.notify as unknown as { mock: { calls: [{ email: { text: string } }][] } }).mock.calls[0]![0];
    expect(sent.email.text).toContain("https://approval.arssteels.net/set-password?token=token-1");
  });

  it("refuses Google users, users without WhatsApp, and the break-glass account", async () => {
    const admin = { ...itAdmin, roles: [...itAdmin.roles] };
    expect((await sendSetPasswordLinkWithDeps(5, admin, build(userRecord({ signInMethod: "GOOGLE" })).deps)).ok).toBe(false);
    expect((await sendSetPasswordLinkWithDeps(5, admin, build(userRecord({ whatsappNumber: null })).deps)).ok).toBe(false);
    const superAdmin = { id: 1, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] as ("USER" | "IT_ADMIN" | "SUPER_ADMIN")[], sessionId: "s", ipAddress: null };
    expect((await sendSetPasswordLinkWithDeps(5, superAdmin, build(userRecord({ isBreakGlass: true })).deps)).ok).toBe(false);
  });

  it("reports when the email couldn't be sent", async () => {
    const { deps } = build(userRecord(), { notify: async () => ({ recorded: true, email: { status: "FAILED", code: "EMAIL_NOT_CONFIGURED" }, whatsapp: null }) });
    const result = await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    expect(result).toEqual({ ok: false, message: expect.stringContaining("EMAIL_NOT_CONFIGURED") });
  });

  it("full flow: link → password → WhatsApp code → password set, link used up, signed in", async () => {
    const { deps, sentCodes, applied } = build(userRecord({ passwordHash: null }));
    await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    expect(await inspectSetPasswordLinkWithDeps("token-1", deps)).toEqual({ valid: true, name: "Staff", loginId: "EMP005" });

    const challenge = await startSetPasswordWithDeps("token-1", GOOD, GOOD, context, deps);
    expect(sentCodes).toEqual(["271828"]);
    const result = await completeSetPasswordWithDeps("token-1", challenge.challengeToken, "271828", GOOD, GOOD, context, deps);
    expect(result.sessionId).toBe("new-session");
    expect(applied).toEqual([expect.objectContaining({ userId: 5, passwordHash: `hashed:${GOOD}`, tokenId: 1, action: "PASSWORD_SET" })]);
    expect(await inspectSetPasswordLinkWithDeps("token-1", deps)).toEqual({ valid: false });
  });

  it("checks the password rules and the confirmation before sending a code", async () => {
    const { deps, sentCodes } = build(userRecord());
    await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    await expectCode(startSetPasswordWithDeps("token-1", GOOD, "Different2026", context, deps), "AUTH_PASSWORD_MISMATCH");
    await expectCode(startSetPasswordWithDeps("token-1", "short1", "short1", context, deps), "AUTH_PASSWORD_POLICY");
    expect(sentCodes).toEqual([]);
  });

  it("an unknown, expired or used link is refused", async () => {
    const { deps, tokens } = build(userRecord());
    await expectCode(startSetPasswordWithDeps("nope", GOOD, GOOD, context, deps), "AUTH_LINK_INVALID");
    await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    tokens[0]!.secondsUntilExpiry = 0;
    await expectCode(startSetPasswordWithDeps("token-1", GOOD, GOOD, context, deps), "AUTH_LINK_INVALID");
  });

  it("a link stops working if the user was deactivated", async () => {
    let current = userRecord();
    const { deps } = build(current, { findUserById: async () => current });
    await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    current = userRecord({ active: false });
    expect(await inspectSetPasswordLinkWithDeps("token-1", deps)).toEqual({ valid: false });
  });

  it("the wrong code doesn't set the password", async () => {
    const { deps, applied } = build(userRecord());
    await sendSetPasswordLinkWithDeps(5, { ...itAdmin, roles: [...itAdmin.roles] }, deps);
    const challenge = await startSetPasswordWithDeps("token-1", GOOD, GOOD, context, deps);
    await expectCode(completeSetPasswordWithDeps("token-1", challenge.challengeToken, "000000", GOOD, GOOD, context, deps), "AUTH_INVALID_OTP");
    expect(applied).toEqual([]);
  });
});

describe("forgot password (P1-14)", () => {
  it("unknown User ID looks exactly like a real one and sends nothing", async () => {
    const unknown = build(null);
    const fake = await startForgotPasswordWithDeps("NOPE", context, unknown.deps);
    await unknown.runDeferred();
    expect(unknown.sentCodes).toEqual([]);
    const real = build(userRecord());
    const genuine = await startForgotPasswordWithDeps("EMP005", context, real.deps);
    expect(Object.keys(fake).sort()).toEqual(Object.keys(genuine).sort());
    expect(fake.expiresInSeconds).toBe(genuine.expiresInSeconds);
  });

  it("the code is sent after the response, then code + new password resets and signs in", async () => {
    const { deps, sentCodes, applied, runDeferred } = build(userRecord());
    const start = await startForgotPasswordWithDeps("EMP005", context, deps);
    expect(sentCodes).toEqual([]);
    await runDeferred();
    expect(sentCodes).toEqual(["271828"]);
    const result = await completeForgotPasswordWithDeps(start.challengeToken, "271828", GOOD, GOOD, context, deps);
    expect(result.redirectTo).toBe("/users");
    expect(applied[0]).toMatchObject({ userId: 5, tokenId: null, action: "PASSWORD_RESET" });
  });

  it("a wrong code and an unknown challenge give the same message", async () => {
    const { deps, runDeferred } = build(userRecord());
    const start = await startForgotPasswordWithDeps("EMP005", context, deps);
    await runDeferred();
    const wrong = await completeForgotPasswordWithDeps(start.challengeToken, "000000", GOOD, GOOD, context, deps).catch((e: AuthError) => e);
    const unknown = build(null);
    const fake = await startForgotPasswordWithDeps("NOPE", context, unknown.deps);
    const bogus = await completeForgotPasswordWithDeps(fake.challengeToken, "000000", GOOD, GOOD, context, unknown.deps).catch((e: AuthError) => e);
    expect((wrong as AuthError).message).toBe((bogus as AuthError).message);
    expect((wrong as AuthError).code).toBe((bogus as AuthError).code);
  });

  it("an account locked by 'This wasn't me' can't reset itself", async () => {
    const { deps, sentCodes, runDeferred } = build(userRecord({ lockedSecondsRemaining: 400 * 24 * 3600 }));
    await startForgotPasswordWithDeps("EMP005", context, deps);
    await runDeferred();
    expect(sentCodes).toEqual([]);
  });

  it("a wrong-password lock doesn't stop a reset", async () => {
    const { deps, sentCodes, runDeferred } = build(userRecord({ lockedSecondsRemaining: 600 }));
    await startForgotPasswordWithDeps("EMP005", context, deps);
    await runDeferred();
    expect(sentCodes).toEqual(["271828"]);
  });

  it("Google users and inactive users can't use forgot password", async () => {
    for (const user of [userRecord({ signInMethod: "GOOGLE" }), userRecord({ active: false })]) {
      const { deps, sentCodes, runDeferred } = build(user);
      await startForgotPasswordWithDeps("EMP005", context, deps);
      await runDeferred();
      expect(sentCodes).toEqual([]);
    }
  });
});
