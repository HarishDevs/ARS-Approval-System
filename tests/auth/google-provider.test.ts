import { describe, expect, it, vi } from "vitest";
import { googleSignInWithDeps, type GoogleSignInDeps } from "@/server/auth/google-sign-in";
import { AuthError } from "@/server/auth/errors";

// Audit P-03: the Firebase project is shared with the Power BI site, so only
// an identity that signed in with Google itself may link or sign in.
function deps(provider: string | null): GoogleSignInDeps {
  return {
    verifyIdToken: async () => ({ uid: "u1", email: "ravi@example.test", emailVerified: true, provider }),
    findUserByFirebaseUid: vi.fn(async () => null),
    findUnlinkedUserByEmail: vi.fn(async () => null),
    linkFirebaseUid: vi.fn(async () => undefined),
    recordLogin: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    complete: {} as GoogleSignInDeps["complete"],
  };
}

const context = { ipAddress: null, userAgent: null, deviceKey: null };

describe("Google sign-in provider check (P-03)", () => {
  it("refuses an email/password or other provider identity before looking anyone up", async () => {
    for (const provider of ["password", "phone", null]) {
      const d = deps(provider);
      const error = await googleSignInWithDeps("token", context, d).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe("AUTH_NOT_ALLOWED");
      expect(d.findUnlinkedUserByEmail).not.toHaveBeenCalled();
      expect(d.recordLogin).toHaveBeenCalledWith(expect.objectContaining({ failureReason: expect.stringMatching(/^NOT_GOOGLE_PROVIDER( |$)/) }));
    }
  });

  it("a google.com identity goes on to the account lookup", async () => {
    const d = deps("google.com");
    await googleSignInWithDeps("token", context, d).catch(() => null);
    expect(d.findUserByFirebaseUid).toHaveBeenCalledWith("u1");
  });
});

// v1.54.6 (Google sign-in fix): each refusal says why, records the reason and
// a masked email (never the full address or the token), and is a 403 with a
// reason code; a verified, known, active Google account still signs in.
import type { UserRecord } from "@/lib/db/repositories/users.repository";
import { maskEmail } from "@/server/auth/errors";

const user = (over: Partial<UserRecord> = {}): UserRecord => ({ id: 7, active: true, signInMethod: "GOOGLE", lockedSecondsRemaining: 0, isBreakGlass: false, breakGlassSecondsRemaining: 0, firebaseUid: null, email: "ravi@example.test", ...over }) as UserRecord;
async function attempt(d: GoogleSignInDeps) {
  return googleSignInWithDeps("token", context, d).catch((caught: unknown) => caught as AuthError);
}

describe("Google sign-in: why a refusal happened (v1.54.6)", () => {
  it("masks an email for the history and the logs", () => {
    expect(maskEmail("Ravi.Kumar@Gmail.com")).toBe("ra***@gmail.com");
  });

  it("no account with this email: UNKNOWN_ACCOUNT, names the email back to its owner, history keeps the masked email", async () => {
    const d = deps("google.com");
    const error = (await attempt(d)) as AuthError;
    expect(error).toMatchObject({ code: "AUTH_NOT_ALLOWED", reason: "UNKNOWN_ACCOUNT" });
    expect(error.message).toMatch(/No ARS CMS account uses ravi@example.test/);
    expect(d.recordLogin).toHaveBeenCalledWith(expect.objectContaining({ success: false, userId: null, failureReason: "UNKNOWN_ACCOUNT ra***@example.test" }));
  });

  it("the email's account is linked to another Google identity: LINKED_ELSEWHERE", async () => {
    const d = { ...deps("google.com"), isEmailLinkedToAnotherGoogle: vi.fn(async () => true) };
    expect(await attempt(d)).toMatchObject({ reason: "LINKED_ELSEWHERE", message: expect.stringMatching(/linked to a different Google sign-in/) });
  });

  it("inactive, password-only and unverified accounts each say so", async () => {
    const inactive = { ...deps("google.com"), findUnlinkedUserByEmail: vi.fn(async () => user({ active: false })) };
    expect(await attempt(inactive)).toMatchObject({ reason: "INACTIVE", message: expect.stringMatching(/inactive/) });
    const password = { ...deps("google.com"), findUnlinkedUserByEmail: vi.fn(async () => user({ signInMethod: "PASSWORD" })) };
    expect(await attempt(password)).toMatchObject({ reason: "WRONG_METHOD", message: expect.stringMatching(/User ID and password/) });
    const unverified = { ...deps("google.com"), verifyIdToken: async () => ({ uid: "u1", email: "ravi@example.test", emailVerified: false, provider: "google.com" }) };
    expect(await attempt(unverified)).toMatchObject({ reason: "EMAIL_NOT_VERIFIED" });
  });

  it("a token that can't be verified is a 401 with its own reason, nothing linked", async () => {
    const d = { ...deps("google.com"), verifyIdToken: async () => Promise.reject(new Error("bad signature")) };
    expect(await attempt(d)).toMatchObject({ code: "AUTH_INVALID_TOKEN", reason: "INVALID_TOKEN" });
    expect(d.linkFirebaseUid).not.toHaveBeenCalled();
  });

  it("a known, active Google account links and goes on to sign in (no refusal)", async () => {
    const complete = vi.fn(async () => ({ redirectTo: "/users" }));
    const d = { ...deps("google.com"), findUnlinkedUserByEmail: vi.fn(async () => user()), complete: {} as GoogleSignInDeps["complete"] };
    const spy = vi.spyOn(await import("@/server/auth/complete-sign-in"), "completeSignIn").mockImplementation(complete as never);
    const result = await googleSignInWithDeps("token", context, d);
    expect(result).toMatchObject({ redirectTo: "/users" });
    expect(d.linkFirebaseUid).toHaveBeenCalledWith(7, "u1");
    spy.mockRestore();
  });
});

import { RATE_RULES } from "@/server/auth/rate-limit";
describe("Google sign-in rate limit (v1.54.6)", () => {
  it("an office behind one IP isn't stopped by everyone signing in together (300 per 15 minutes per IP)", () => {
    expect(RATE_RULES.GOOGLE).toEqual([{ scope: "ip", limit: 300, windowSeconds: 900 }]);
    // Password sign-in keeps its tighter limits (guessable secrets).
    expect(RATE_RULES.SIGNIN[0]).toMatchObject({ scope: "ip", limit: 20 });
  });
});
