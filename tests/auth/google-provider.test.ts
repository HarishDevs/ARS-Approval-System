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
      expect(d.recordLogin).toHaveBeenCalledWith(expect.objectContaining({ failureReason: "NOT_GOOGLE_PROVIDER" }));
    }
  });

  it("a google.com identity goes on to the account lookup", async () => {
    const d = deps("google.com");
    await googleSignInWithDeps("token", context, d).catch(() => null);
    expect(d.findUserByFirebaseUid).toHaveBeenCalledWith("u1");
  });
});
