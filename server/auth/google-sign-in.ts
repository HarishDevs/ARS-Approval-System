import "server-only";
import { verifyGoogleIdToken, type VerifiedGoogleIdentity } from "@/lib/firebase/admin";
import { createHash } from "node:crypto";
import {
  findUnlinkedUserByEmail,
  findUserByFirebaseUid,
  findUserByGoogleSub,
  isEmailLinkedToAnotherGoogle,
  keepGoogleSub,
  linkFirebaseUid,
  relinkFirebaseUid,
  updateEmailFromGoogle,
  type UserRecord,
} from "@/lib/db/repositories/users.repository";
import { isRetiredDomain, movedEmails } from "@/config/email-domains";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { AuthError, GOOGLE_REFUSAL_MESSAGE, maskEmail } from "@/server/auth/errors";
import { completeSignIn, defaultCompleteSignInDeps, type CompleteSignInDeps, type CompleteSignInResult } from "@/server/auth/complete-sign-in";
import { checkSignInAllowed } from "@/server/auth/sign-in-rules";
import type { RequestContext } from "@/types/auth";
import { logError, logInfo } from "@/lib/logging/logger";

// F-01: Google sign-in, no OTP (D-006). The account must already exist
// (created in /admin, any email domain — D-004) with sign-in method GOOGLE.
export interface GoogleSignInDeps {
  verifyIdToken: (idToken: string) => Promise<VerifiedGoogleIdentity>;
  findUserByFirebaseUid: (uid: string) => Promise<UserRecord | null>;
  findUnlinkedUserByEmail: (email: string) => Promise<UserRecord | null>;
  // v1.54.6: an account with this email exists but is linked to another Google identity.
  isEmailLinkedToAnotherGoogle?: (email: string, uid: string) => Promise<boolean>;
  linkFirebaseUid: (userId: number, uid: string) => Promise<void>;
  // v1.54.7 (Workspace domain move): the Google account's permanent id (sub).
  findUserByGoogleSub?: (sub: string) => Promise<UserRecord | null>;
  keepGoogleSub?: (userId: number, sub: string) => Promise<void>;
  relinkFirebaseUid?: (userId: number, uid: string, sub: string) => Promise<boolean>;
  updateEmailFromGoogle?: (userId: number, email: string) => Promise<"UPDATED" | "TAKEN" | "SAME">;
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
  findUserByGoogleSub: (sub) => findUserByGoogleSub(sub),
  keepGoogleSub: (userId, sub) => keepGoogleSub(userId, sub),
  relinkFirebaseUid: (userId, uid, sub) => relinkFirebaseUid(userId, uid, sub),
  updateEmailFromGoogle: (userId, email) => updateEmailFromGoogle(userId, email),
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

  // v1.54.7 (owner: Workspace moved people from arsenergy.co.in to
  // arssteels.co.in): the account is found by who the Google account IS
  // (Firebase uid, then Google's permanent sub), and only then by email. The
  // email lookup also tries the same mailbox on the other side of the move,
  // because Google reports the new primary address while IT registered the
  // old one. Nothing is ever created here, and access still needs an
  // existing, active account that allows Google (checkSignInAllowed below).
  const sub = identity.googleSub ?? null;
  const subRef = sub ? createHash("sha256").update(sub).digest("hex").slice(0, 10) : "none";
  let found: "UID" | "SUB" | "EMAIL" | "MOVED_EMAIL" | "NONE" = "NONE";
  let user = await deps.findUserByFirebaseUid(identity.uid);
  if (user) found = "UID";
  if (!user && sub && deps.findUserByGoogleSub) {
    // The same Google account with a new Firebase link (e.g. its Firebase user was recreated).
    const bySub = await deps.findUserByGoogleSub(sub);
    if (bySub && deps.relinkFirebaseUid && (await deps.relinkFirebaseUid(bySub.id, identity.uid, sub))) {
      user = { ...bySub, firebaseUid: identity.uid };
      found = "SUB";
      await deps.recordAudit({ actorUserId: bySub.id, action: "GOOGLE_ACCOUNT_RELINKED", entityType: "USER", entityId: bySub.id, ipAddress: context.ipAddress });
    }
  }
  if (!user) {
    // First sign-in: link only an account the admin created that has never
    // been linked: this exact email first, then the moved-domain address.
    const exact = [...new Set([identity.email.trim().toLowerCase(), ...(identity.emails ?? [])])];
    const moved = exact.flatMap(movedEmails).filter((email) => !exact.includes(email));
    for (const [email, how] of [...exact.map((email) => [email, "EMAIL"] as const), ...moved.map((email) => [email, "MOVED_EMAIL"] as const)]) {
      const unlinked = await deps.findUnlinkedUserByEmail(email);
      if (!unlinked) continue;
      await deps.linkFirebaseUid(unlinked.id, identity.uid);
      user = { ...unlinked, firebaseUid: identity.uid };
      found = how;
      await deps.recordAudit({ actorUserId: unlinked.id, action: "GOOGLE_ACCOUNT_LINKED", entityType: "USER", entityId: unlinked.id, ipAddress: context.ipAddress, metadata: { matchedBy: how === "MOVED_EMAIL" ? "email domain move" : "email" } });
      break;
    }
  }
  // Safe diagnostics (never a token, never a full email or sub).
  logInfo("google sign-in lookup", { found, emailDomain: identity.email.split("@")[1] ?? "", email: masked, subRef, userId: user?.id ?? null });
  if (user && sub && deps.keepGoogleSub) await deps.keepGoogleSub(user.id, sub).catch((error: unknown) => logError("google sign-in: keeping the Google id failed", error));
  if (user && deps.updateEmailFromGoogle) {
    // The same Google account now reports another primary email: the account
    // takes it (never back onto a retired domain; never one another account uses).
    const current = (user.email ?? "").trim().toLowerCase();
    const reported = identity.email.trim().toLowerCase();
    if (current && reported !== current && !isRetiredDomain(reported)) {
      const outcome = await deps.updateEmailFromGoogle(user.id, reported).catch((error: unknown) => {
        logError("google sign-in: updating the email failed", error);
        return "SAME" as const;
      });
      if (outcome === "UPDATED") {
        user = { ...user, email: reported };
        await deps.recordAudit({ actorUserId: user.id, action: "USER_EMAIL_UPDATED_FROM_GOOGLE", entityType: "USER", entityId: user.id, ipAddress: context.ipAddress, metadata: { from: maskEmail(current), to: maskEmail(reported) } });
      } else if (outcome === "TAKEN") {
        logInfo("google sign-in: new email already used by another account; kept the old one", { userId: user.id, email: masked });
      }
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
