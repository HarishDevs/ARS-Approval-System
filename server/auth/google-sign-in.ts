import "server-only";
import { verifyGoogleIdToken, type VerifiedGoogleIdentity } from "@/lib/firebase/admin";
import {
  findUnlinkedUserByEmail,
  findUserByFirebaseUid,
  isEmailLinkedToAnotherGoogle,
  linkFirebaseUid,
  type UserRecord,
} from "@/lib/db/repositories/users.repository";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { AuthError, GOOGLE_REFUSAL_MESSAGE, maskEmail } from "@/server/auth/errors";
import { completeSignIn, defaultCompleteSignInDeps, type CompleteSignInDeps, type CompleteSignInResult } from "@/server/auth/complete-sign-in";
import { checkSignInAllowed } from "@/server/auth/sign-in-rules";
import type { RequestContext } from "@/types/auth";
import { logError } from "@/lib/logging/logger";

// F-01: Google sign-in, no OTP (D-006). The account must already exist
// (created in /admin, any email domain — D-004) with sign-in method GOOGLE.
export interface GoogleSignInDeps {
  verifyIdToken: (idToken: string) => Promise<VerifiedGoogleIdentity>;
  findUserByFirebaseUid: (uid: string) => Promise<UserRecord | null>;
  findUnlinkedUserByEmail: (email: string) => Promise<UserRecord | null>;
  // v1.54.6: an account with this email exists but is linked to another Google identity.
  isEmailLinkedToAnotherGoogle?: (email: string, uid: string) => Promise<boolean>;
  linkFirebaseUid: (userId: number, uid: string) => Promise<void>;
  recordLogin: typeof recordLogin;
  recordAudit: typeof recordAudit;
  complete: CompleteSignInDeps;
}

const defaultDeps: GoogleSignInDeps = {
  verifyIdToken: verifyGoogleIdToken,
  findUserByFirebaseUid: (uid) => findUserByFirebaseUid(uid),
  findUnlinkedUserByEmail: (email) => findUnlinkedUserByEmail(email),
  isEmailLinkedToAnotherGoogle: (email, uid) => isEmailLinkedToAnotherGoogle(email, uid),
  linkFirebaseUid: (userId, uid) => linkFirebaseUid(userId, uid),
  recordLogin,
  recordAudit,
  complete: defaultCompleteSignInDeps,
};

export async function googleSignInWithDeps(
  idToken: string,
  context: RequestContext,
  deps: GoogleSignInDeps,
): Promise<CompleteSignInResult> {
  // v1.54.6: the sign-in history row carries the reason and the masked email
  // (an unknown account has no user to point at, so IT could not see who it was).
  let masked = "";
  const fail = async (userId: number | null, reason: string, error: AuthError): Promise<never> => {
    await deps.recordLogin({ userId, authMethod: "GOOGLE", step: "GOOGLE", success: false, failureReason: `${reason}${masked ? ` ${masked}` : ""}`.slice(0, 100), ipAddress: context.ipAddress, userAgent: context.userAgent });
    throw error;
  };
  const refuse = (userId: number | null, reason: string, email: string) => fail(userId, reason, new AuthError("AUTH_NOT_ALLOWED", (GOOGLE_REFUSAL_MESSAGE[reason] ?? GOOGLE_REFUSAL_MESSAGE.BREAK_GLASS_DISABLED!)(email), undefined, reason));

  let identity: VerifiedGoogleIdentity;
  try {
    identity = await deps.verifyIdToken(idToken);
  } catch (error) {
    // The reason goes to the server log only (e.g. Firebase Admin not set up,
    // a malformed private key, a token from another project); never the token.
    logError("google sign-in: token verification failed", error);
    return fail(null, "INVALID_TOKEN", new AuthError("AUTH_INVALID_TOKEN", "Google sign-in couldn't be confirmed. Please try again.", undefined, "INVALID_TOKEN"));
  }
  masked = identity.email ? maskEmail(identity.email) : "";
  if (!identity.email || !identity.emailVerified) {
    return refuse(null, "EMAIL_NOT_VERIFIED", identity.email ?? "");
  }
  // The Firebase project is shared with the Power BI site: only a real Google
  // sign-in counts here, not another provider with the same email (audit P-03).
  if (identity.provider !== "google.com") {
    return refuse(null, "NOT_GOOGLE_PROVIDER", identity.email);
  }

  let user = await deps.findUserByFirebaseUid(identity.uid);
  if (!user) {
    // First sign-in: link only an account the admin created with this exact
    // email that has never been linked.
    const unlinked = await deps.findUnlinkedUserByEmail(identity.email);
    if (unlinked) {
      await deps.linkFirebaseUid(unlinked.id, identity.uid);
      user = { ...unlinked, firebaseUid: identity.uid };
      await deps.recordAudit({ actorUserId: unlinked.id, action: "GOOGLE_ACCOUNT_LINKED", entityType: "USER", entityId: unlinked.id, ipAddress: context.ipAddress });
    }
  }
  if (!user) {
    // v1.54.6: an account with this email that is already linked to a different
    // Google identity is a different problem from "no account" (IT resets the link).
    const elsewhere = deps.isEmailLinkedToAnotherGoogle ? await deps.isEmailLinkedToAnotherGoogle(identity.email, identity.uid).catch(() => false) : false;
    return refuse(null, elsewhere ? "LINKED_ELSEWHERE" : "UNKNOWN_ACCOUNT", identity.email);
  }

  const rule = checkSignInAllowed(user, "GOOGLE");
  if (!rule.allowed) {
    if (rule.reason === "LOCKED") return fail(user.id, rule.reason, new AuthError("AUTH_ACCOUNT_LOCKED", "This account is locked. Try again later or contact IT.", rule.retryAfterSeconds, "LOCKED"));
    return refuse(user.id, rule.reason, identity.email);
  }

  return completeSignIn(user, "GOOGLE", context, deps.complete);
}

export function googleSignIn(idToken: string, context: RequestContext): Promise<CompleteSignInResult> {
  return googleSignInWithDeps(idToken, context, defaultDeps);
}
