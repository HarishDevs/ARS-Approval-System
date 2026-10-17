import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { verifySessionToken, verifyPurposeToken } from "@/lib/session/token";
import { sessionIdleSeconds, sessionState, revokeAllSessionsForUser, revokeSession, touchSession, claimSecurityLink } from "@/lib/db/repositories/sessions.repository";
import { findUserById, securityLockUser, listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { notify } from "@/server/notifications/notify";
import { accountSecuredMessage } from "@/server/notifications/security-messages";
import { NOT_ME_PURPOSE } from "@/server/auth/complete-sign-in";
import type { AuthenticatedUser } from "@/types/auth";
import { getNumberSetting } from "@/server/settings/values";
import { createHash } from "node:crypto";

export interface CurrentSession {
  sessionId: string;
  user: AuthenticatedUser;
}

// The signed cookie alone is never trusted: the session row must be live
// and the user is re-read (active flag and roles) on every request, so a
// deactivation, role change or "sign out everywhere" applies immediately.
// cache(): layouts and pages each call this; it runs once per request.
export const getCurrentSession = cache(() => loadCurrentSession(true));

// v1.8.0 (owner): sign out after this many minutes without activity.
// v1.12.1 (owner, D-158): for everyone, the Super Admin included.
export const IDLE_MINUTES_FALLBACK = 30;

export async function idleLimitMinutes(): Promise<number> {
  return getNumberSetting("auth.idle_timeout_minutes").catch(() => IDLE_MINUTES_FALLBACK);
}

// For the browser's session check: the same rules, but looking doesn't
// count as activity (a check every minute must not keep a session alive).
export async function peekSession(): Promise<{ signedIn: boolean; idleSecondsLeft: number | null }> {
  const loaded = await loadCurrentSession(false);
  if (!loaded) return { signedIn: false, idleSecondsLeft: null };
  return { signedIn: true, idleSecondsLeft: loaded.idleSecondsLeft };
}

// "Stay signed in": counts as activity now.
export async function keepSessionAlive(): Promise<boolean> {
  const loaded = await loadCurrentSession(false);
  if (!loaded) return false;
  await touchSession(loaded.session.sessionId, undefined, true);
  return true;
}

async function loadCurrentSession(touch: true): Promise<CurrentSession | null>;
async function loadCurrentSession(touch: false): Promise<{ session: CurrentSession; idleSecondsLeft: number | null } | null>;
async function loadCurrentSession(touch: boolean): Promise<CurrentSession | { session: CurrentSession; idleSecondsLeft: number | null } | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const idleSeconds = await sessionIdleSeconds(payload.sid, payload.uid);
  if (idleSeconds === null) return null;
  const user = await findUserById(payload.uid);
  if (!user || !user.active || user.lockedSecondsRemaining > 0) return null;
  if (user.isBreakGlass && user.breakGlassSecondsRemaining <= 0) return null;
  const limitSeconds = (await idleLimitMinutes()) * 60;
  if (idleSeconds >= limitSeconds) {
    // Ended for good: coming back later never revives it (D-158).
    await revokeSession(payload.sid, IDLE_REASON);
    return null;
  }
  if (touch) await touchSession(payload.sid);
  const session: CurrentSession = {
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
  return touch ? session : { session, idleSecondsLeft: limitSeconds === null ? null : limitSeconds - idleSeconds };
}

// v1.12.1 (D-158): why the person was signed out, for the signed-out page.
export const IDLE_REASON = "IDLE_TIMEOUT";
export type EndReason = "idle" | "expired" | "signed_out" | "revoked" | "deactivated" | "locked" | "unknown";

export async function sessionEndReason(): Promise<EndReason | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return "unknown";
  const [state, user] = await Promise.all([sessionState(payload.sid, payload.uid), findUserById(payload.uid)]);
  if (!user || !user.active) return "deactivated";
  if (user.lockedSecondsRemaining > 0) return "locked";
  if (!state) return "unknown";
  if (state.revoked) return state.revokeReason === IDLE_REASON ? "idle" : state.revokeReason === "SIGN_OUT" ? "signed_out" : "revoked";
  if (state.expired) return "expired";
  const idle = await sessionIdleSeconds(payload.sid, payload.uid);
  if (idle !== null && idle >= (await idleLimitMinutes()) * 60) return "idle";
  return null; // still live
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
  // Once used, the same link can't lock the account again after IT unlocks it.
  if (!(await claimSecurityLink(createHash("sha256").update(token).digest("hex")))) return "INVALID_LINK";

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
