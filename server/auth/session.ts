import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { verifySessionToken, verifyPurposeToken } from "@/lib/session/token";
import { isSessionActive, revokeAllSessionsForUser, revokeSession, touchSession } from "@/lib/db/repositories/sessions.repository";
import { findUserById, securityLockUser, listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { notify } from "@/server/notifications/notify";
import { accountSecuredMessage } from "@/server/notifications/security-messages";
import { NOT_ME_PURPOSE } from "@/server/auth/complete-sign-in";
import type { AuthenticatedUser } from "@/types/auth";

export interface CurrentSession {
  sessionId: string;
  user: AuthenticatedUser;
}

// The signed cookie alone is never trusted: the session row must be live
// and the user is re-read (active flag and roles) on every request, so a
// deactivation, role change or "sign out everywhere" applies immediately.
// cache(): layouts and pages each call this; it runs once per request.
export const getCurrentSession = cache(loadCurrentSession);

async function loadCurrentSession(): Promise<CurrentSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (!(await isSessionActive(payload.sid, payload.uid))) return null;
  const user = await findUserById(payload.uid);
  if (!user || !user.active || user.lockedSecondsRemaining > 0) return null;
  if (user.isBreakGlass && user.breakGlassSecondsRemaining <= 0) return null;
  await touchSession(payload.sid);
  return {
    sessionId: payload.sid,
    user: {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      email: user.email,
      whatsappNumber: user.whatsappNumber,
      signInMethod: user.signInMethod,
      active: user.active,
      // A demo person never acts with admin rights (D-071).
      roles: user.isDemo ? ["USER"] : user.roles,
      isDemo: user.isDemo,
    },
  };
}

export async function signOut(sessionId: string, userId: number, ipAddress: string | null): Promise<void> {
  await revokeSession(sessionId, "SIGN_OUT");
  await recordAudit({ actorUserId: userId, action: "LOGOUT", entityType: "USER", entityId: userId, sessionId, ipAddress });
}

export async function signOutEverywhere(userId: number, actorUserId: number, reason: string, ipAddress: string | null): Promise<number> {
  const count = await revokeAllSessionsForUser(userId, reason);
  await recordAudit({ actorUserId, action: "SESSIONS_REVOKED", entityType: "USER", entityId: userId, ipAddress, metadata: { reason, count } });
  return count;
}

export type NotMeResult = "SECURED" | "INVALID_LINK";

// F-05 "This wasn't me": end every session, lock until IT unlocks, tell the
// user and the Super Admins. Only reached by a POST from the confirm page,
// never by the link itself (WhatsApp link previews fetch URLs).
export async function reportNotMe(token: string, ipAddress: string | null): Promise<NotMeResult> {
  const payload = verifyPurposeToken(token, NOT_ME_PURPOSE);
  if (!payload) return "INVALID_LINK";
  const user = await findUserById(payload.uid);
  if (!user) return "INVALID_LINK";

  await revokeAllSessionsForUser(user.id, "NOT_ME_REPORTED");
  await securityLockUser(user.id);
  await recordAudit({
    actorUserId: user.id,
    action: "NOT_ME_REPORTED",
    entityType: "USER",
    entityId: user.id,
    result: "SUCCESS",
    ipAddress,
    metadata: { reportedSessionId: payload.sid },
  });

  await notify({ eventType: "ACCOUNT_SECURED", userId: user.id, ...accountSecuredMessage(user.name) });
  const adminIds = await listUserIdsWithRole("SUPER_ADMIN");
  for (const adminId of adminIds) {
    await notify({
      eventType: "SECURITY_ALERT",
      userId: adminId,
      title: "Sign-in reported as not the user",
      message: `${user.name} (${user.loginId}) reported a sign-in that wasn't them. The account is locked until you unlock it.`,
      email: {
        subject: `Security: ${user.name} reported an unknown sign-in`,
        text: `${user.name} (${user.loginId}, ${user.email}) reported a sign-in that wasn't them.\nAll their sessions were ended and the account is locked until an admin unlocks it.`,
      },
      whatsappVariables: { user_name: user.name, login_id: user.loginId },
    });
  }
  return "SECURED";
}
