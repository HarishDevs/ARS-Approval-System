import { describe, expect, it, vi } from "vitest";
import { googleSignInWithDeps, type GoogleSignInDeps } from "@/server/auth/google-sign-in";
import type { UserRecord } from "@/lib/db/repositories/users.repository";
import type { AuthError } from "@/server/auth/errors";
import { isRetiredDomain, movedEmails } from "@/config/email-domains";

// v1.54.7 (owner: Google Workspace moved people from arsenergy.co.in to
// arssteels.co.in; the old address stays an alias, and Google reports the new
// primary). The person's existing account is found and kept (same id, roles,
// history); no account is created; access still needs an active account.
const context = { ipAddress: null, userAgent: null, deviceKey: null };
const account = (over: Partial<UserRecord> = {}): UserRecord =>
  ({ id: 42, loginId: "7182", name: "Babu Lal", email: "babulal@arsenergy.co.in", active: true, signInMethod: "GOOGLE", lockedSecondsRemaining: 0, isBreakGlass: false, breakGlassSecondsRemaining: 0, firebaseUid: null, ...over }) as UserRecord;

function deps(accounts: UserRecord[], over: Partial<GoogleSignInDeps> = {}) {
  const complete = vi.fn(async (user: UserRecord) => ({ ok: true, userId: user.id, email: user.email }));
  const d = {
    verifyIdToken: async () => ({ uid: "fb-1", email: "babulal@arssteels.co.in", emailVerified: true, provider: "google.com", googleSub: "1093", emails: ["babulal@arssteels.co.in"] }),
    findUserByFirebaseUid: vi.fn(async (uid: string) => accounts.find((item) => item.firebaseUid === uid) ?? null),
    findUnlinkedUserByEmail: vi.fn(async (email: string) => accounts.find((item) => item.email.toLowerCase() === email.toLowerCase() && !item.firebaseUid) ?? null),
    isEmailLinkedToAnotherGoogle: vi.fn(async () => false),
    linkFirebaseUid: vi.fn(async () => undefined),
    findUserByGoogleSub: vi.fn(async () => null),
    keepGoogleSub: vi.fn(async () => undefined),
    relinkFirebaseUid: vi.fn(async () => true),
    updateEmailFromGoogle: vi.fn(async () => "UPDATED" as const),
    recordLogin: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    complete: {} as GoogleSignInDeps["complete"],
    ...over,
  } satisfies GoogleSignInDeps;
  return { d, complete };
}

// completeSignIn needs the database; the tests stop right before it by making it throw a marker.
vi.mock("@/server/auth/complete-sign-in", async (original) => ({
  ...(await original<typeof import("@/server/auth/complete-sign-in")>()),
  completeSignIn: vi.fn(async (user: UserRecord) => ({ signedIn: user.id, email: user.email })),
}));

describe("email domain move mapping", () => {
  it("maps the same mailbox both ways, only for the configured domains", () => {
    expect(movedEmails("Babulal@ARSSteels.co.in")).toEqual(["babulal@arsenergy.co.in"]);
    expect(movedEmails("babulal@arsenergy.co.in")).toEqual(["babulal@arssteels.co.in"]);
    expect(movedEmails("someone@gmail.com")).toEqual([]);
    expect(isRetiredDomain("x@arsenergy.co.in")).toBe(true);
    expect(isRetiredDomain("x@arssteels.co.in")).toBe(false);
  });
});

describe("Google sign-in after the Workspace domain move (v1.54.7)", () => {
  it("an unlinked account registered with the old address is linked, keeps its id, and takes the new primary email", async () => {
    const { d } = deps([account()]);
    const result = (await googleSignInWithDeps("token", context, d)) as unknown as { signedIn: number; email: string };
    expect(result).toEqual({ signedIn: 42, email: "babulal@arssteels.co.in" });
    expect(d.findUnlinkedUserByEmail).toHaveBeenNthCalledWith(1, "babulal@arssteels.co.in");
    expect(d.findUnlinkedUserByEmail).toHaveBeenNthCalledWith(2, "babulal@arsenergy.co.in");
    expect(d.linkFirebaseUid).toHaveBeenCalledWith(42, "fb-1");
    expect(d.keepGoogleSub).toHaveBeenCalledWith(42, "1093");
    expect(d.updateEmailFromGoogle).toHaveBeenCalledWith(42, "babulal@arssteels.co.in");
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "GOOGLE_ACCOUNT_LINKED", metadata: { matchedBy: "email domain move" } }));
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_EMAIL_UPDATED_FROM_GOOGLE", metadata: { from: "ba***@arsenergy.co.in", to: "ba***@arssteels.co.in" } }));
  });

  it("an exact-email account wins over the moved-domain one (never a second account)", async () => {
    const { d } = deps([account(), account({ id: 43, email: "babulal@arssteels.co.in" })]);
    const result = (await googleSignInWithDeps("token", context, d)) as unknown as { signedIn: number };
    expect(result.signedIn).toBe(43);
    expect(d.findUnlinkedUserByEmail).toHaveBeenCalledTimes(1);
    expect(d.updateEmailFromGoogle).not.toHaveBeenCalled();
  });

  it("an account already linked to this Google account signs in whatever its stored email is, and the email is refreshed", async () => {
    const { d } = deps([account({ firebaseUid: "fb-1" })]);
    const result = (await googleSignInWithDeps("token", context, d)) as unknown as { signedIn: number };
    expect(result.signedIn).toBe(42);
    expect(d.findUnlinkedUserByEmail).not.toHaveBeenCalled();
    expect(d.updateEmailFromGoogle).toHaveBeenCalledWith(42, "babulal@arssteels.co.in");
  });

  it("the same Google account (same sub) with a new Firebase link is found by its sub and relinked", async () => {
    const linked = account({ firebaseUid: "fb-old", email: "babulal@arssteels.co.in" });
    const { d } = deps([linked], { findUserByGoogleSub: vi.fn(async () => linked) });
    const result = (await googleSignInWithDeps("token", context, d)) as unknown as { signedIn: number };
    expect(result.signedIn).toBe(42);
    expect(d.relinkFirebaseUid).toHaveBeenCalledWith(42, "fb-1", "1093");
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "GOOGLE_ACCOUNT_RELINKED" }));
  });

  it("never moves an email back onto the retired domain (a stale Google profile)", async () => {
    const { d } = deps([account({ firebaseUid: "fb-1", email: "babulal@arssteels.co.in" })], {
      verifyIdToken: async () => ({ uid: "fb-1", email: "babulal@arsenergy.co.in", emailVerified: true, provider: "google.com", googleSub: "1093", emails: [] }),
    });
    await googleSignInWithDeps("token", context, d);
    expect(d.updateEmailFromGoogle).not.toHaveBeenCalled();
  });

  it("an email another account already uses is left alone; sign-in still works", async () => {
    const { d } = deps([account({ firebaseUid: "fb-1" })], { updateEmailFromGoogle: vi.fn(async () => "TAKEN" as const) });
    const result = (await googleSignInWithDeps("token", context, d)) as unknown as { signedIn: number; email: string };
    expect(result).toEqual({ signedIn: 42, email: "babulal@arsenergy.co.in" });
    expect(d.recordAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "USER_EMAIL_UPDATED_FROM_GOOGLE" }));
  });

  it("the domain alone grants nothing: no account, no sign-in, nothing created", async () => {
    const { d } = deps([]);
    const error = (await googleSignInWithDeps("token", context, d).catch((caught: unknown) => caught)) as AuthError;
    expect(error).toMatchObject({ code: "AUTH_NOT_ALLOWED", reason: "UNKNOWN_ACCOUNT" });
    expect(d.linkFirebaseUid).not.toHaveBeenCalled();
  });

  it("an inactive or password-only account found through the move is still refused", async () => {
    for (const over of [{ active: false }, { signInMethod: "PASSWORD" as const }]) {
      const { d } = deps([account(over)]);
      const error = (await googleSignInWithDeps("token", context, d).catch((caught: unknown) => caught)) as AuthError;
      expect(error.code).toBe("AUTH_NOT_ALLOWED");
    }
  });

  it("an already-linked old-domain account is not taken over by another Google account", async () => {
    const { d } = deps([account({ firebaseUid: "someone-else" })]);
    const error = (await googleSignInWithDeps("token", context, d).catch((caught: unknown) => caught)) as AuthError;
    expect(error.reason).toBe("UNKNOWN_ACCOUNT");
    expect(d.linkFirebaseUid).not.toHaveBeenCalled();
  });
});
