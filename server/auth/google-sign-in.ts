import "server-only";
import { verifyGoogleIdToken, type VerifiedGoogleIdentity } from "@/lib/firebase/admin";
import {
  findUnlinkedUserByEmail,
  findUserByFirebaseUid,
  linkFirebaseUid,
  type UserRecord,
} from "@/lib/db/repositories/users.repository";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { AuthError, GENERIC_GOOGLE_FAILED } from "@/server/auth/errors";
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
  linkFirebaseUid: (userId: number, uid: string) => Promise<void>;
  recordLogin: typeof recordLogin;
  recordAudit: typeof recordAudit;
  complete: CompleteSignInDeps;
}

const defaultDeps: GoogleSignInDeps = {
  verifyIdToken: verifyGoogleIdToken,
  findUserByFirebaseUid: (uid) => findUserByFirebaseUid(uid),
  findUnlinkedUserByEmail: (email) => findUnlinkedUserByEmail(email),
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
  const fail = async (userId: number | null, reason: string, error: AuthError): Promise<never> => {
    await deps.recordLogin({ userId, authMethod: "GOOGLE", step: "GOOGLE", success: false, failureReason: reason, ipAddress: context.ipAddress, userAgent: context.userAgent });
    throw error;
  };

  let identity: VerifiedGoogleIdentity;
  try {
    identity = await deps.verifyIdToken(idToken);
  } catch (error) {
    // The reason goes to the server log only (e.g. Firebase Admin not set up,
    // a malformed private key, a token from another project); never the token.
    logError("google sign-in: token verification failed", error);
    return fail(null, "INVALID_TOKEN", new AuthError("AUTH_INVALID_TOKEN", "Google sign-in failed. Please try again."));
  }
  if (!identity.email || !identity.emailVerified) {
    return fail(null, "EMAIL_NOT_VERIFIED", new AuthError("AUTH_NOT_ALLOWED", GENERIC_GOOGLE_FAILED));
  }
  // The Firebase project is shared with the Power BI site: only a real Google
  // sign-in counts here, not another provider with the same email (audit P-03).
  if (identity.provider !== "google.com") {
    return fail(null, "NOT_GOOGLE_PROVIDER", new AuthError("AUTH_NOT_ALLOWED", GENERIC_GOOGLE_FAILED));
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
    return fail(null, "UNKNOWN_ACCOUNT", new AuthError("AUTH_NOT_ALLOWED", GENERIC_GOOGLE_FAILED));
  }

  const rule = checkSignInAllowed(user, "GOOGLE");
  if (!rule.allowed) {
    const error =
      rule.reason === "LOCKED"
        ? new AuthError("AUTH_ACCOUNT_LOCKED", "This account is locked. Try again later or contact IT.", rule.retryAfterSeconds)
        : new AuthError("AUTH_NOT_ALLOWED", GENERIC_GOOGLE_FAILED);
    return fail(user.id, rule.reason, error);
  }

  return completeSignIn(user, "GOOGLE", context, deps.complete);
}

export function googleSignIn(idToken: string, context: RequestContext): Promise<CompleteSignInResult> {
  return googleSignInWithDeps(idToken, context, defaultDeps);
}
