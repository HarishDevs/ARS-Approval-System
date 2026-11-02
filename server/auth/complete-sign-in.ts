import "server-only";
import crypto from "node:crypto";
import { createDevice, createSession, findDevice, touchDevice } from "@/lib/db/repositories/sessions.repository";
import { listUserIdsWithRole, markLoginSuccess, type UserRecord } from "@/lib/db/repositories/users.repository";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { keyedHash } from "@/lib/security/hashing";
import { SESSION_TTL_SECONDS } from "@/lib/session/constants";
import { createDeviceCookieValue, createPurposeToken, createSessionToken } from "@/lib/session/token";
import { notify, type NotifyInput } from "@/server/notifications/notify";
import { newSignInMessage, superAdminSignInMessage } from "@/server/notifications/security-messages";
import { getAuthSecurityConfig, getDailySessionScope } from "@/server/settings/values";
import { dailySessionApplies, secondsUntilIndiaMidnight, type DailySessionScope } from "@/lib/session/daily";
import { logError } from "@/lib/logging/logger";
import type { AuthMethod, RequestContext } from "@/types/auth";
import { appBaseUrl } from "@/lib/http/app-url";

export const NOT_ME_PURPOSE = "not-me";
const NOT_ME_TTL_SECONDS = 7 * 24 * 60 * 60;

// Everyone lands on /users; admins switch to their area from there (F-08).
export const POST_SIGN_IN_PATH = "/users";

export interface CompleteSignInResult {
  sessionToken: string;
  sessionId: string;
  // D-250: how long the session cookie lives (until midnight IST for a daily session).
  cookieMaxAge?: number;
  daily?: boolean;
  newDeviceCookie: string | null;
  isNewDevice: boolean;
  redirectTo: string;
}

export interface CompleteSignInDeps {
  findDevice: typeof findDevice;
  createDevice: typeof createDevice;
  touchDevice: typeof touchDevice;
  createSession: typeof createSession;
  markLoginSuccess: typeof markLoginSuccess;
  recordLogin: typeof recordLogin;
  recordAudit: typeof recordAudit;
  listSuperAdminIds: () => Promise<number[]>;
  notify: (input: NotifyInput) => Promise<unknown>;
  // Alerts run after the response is decided; they never block or fail sign-in.
  dispatch: (work: () => Promise<void>) => void;
  getTrustedDeviceDays: () => Promise<number>;
  // D-250: optional for tests (default: off, the 12-hour session).
  dailySessionScope?: () => Promise<DailySessionScope>;
  randomUUID: () => string;
  now: () => Date;
  appBaseUrl: () => string;
}

export const defaultCompleteSignInDeps: CompleteSignInDeps = {
  findDevice,
  createDevice,
  touchDevice,
  createSession,
  markLoginSuccess,
  recordLogin,
  recordAudit,
  listSuperAdminIds: () => listUserIdsWithRole("SUPER_ADMIN"),
  notify,
  dispatch(work) {
    void work().catch((error) => logError("sign-in alert dispatch failed", error));
  },
  getTrustedDeviceDays: async () => (await getAuthSecurityConfig()).trustedDeviceDays,
  dailySessionScope: () => getDailySessionScope(),
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date(),
  appBaseUrl: () => appBaseUrl(),
};

export async function completeSignIn(
  user: UserRecord,
  authMethod: AuthMethod,
  context: RequestContext,
  deps: CompleteSignInDeps,
  // Q-015: break-glass signed in inside its window without the WhatsApp code.
  options: { otpSkipped?: boolean } = {},
): Promise<CompleteSignInResult> {
  const otpSkipped = Boolean(options.otpSkipped && user.isBreakGlass);
  const trustedDays = await deps.getTrustedDeviceDays();

  // Device check (F-03). A browser without a valid device cookie gets one.
  let deviceKey = context.deviceKey;
  let newDeviceCookie: string | null = null;
  if (!deviceKey) {
    const minted = createDeviceCookieValue();
    deviceKey = minted.deviceKey;
    newDeviceCookie = minted.cookieValue;
  }
  const deviceKeyHash = keyedHash(`device:${deviceKey}`);
  const existing = await deps.findDevice(user.id, deviceKeyHash);
  const isNewDevice = existing === null;
  let deviceId: number;
  if (existing) {
    deviceId = existing.id;
    await deps.touchDevice({ deviceId, userAgent: context.userAgent, ipAddress: context.ipAddress, trustedDays });
  } else {
    deviceId = await deps.createDevice({
      userId: user.id,
      deviceKeyHash,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      trustedDays,
    });
  }

  const sessionId = deps.randomUUID();
  // D-250: a phone, tablet or the installed app stays signed in until the
  // next midnight, India time (the server's clock), with no idle sign-out.
  const scope = deps.dailySessionScope ? await deps.dailySessionScope().catch(() => "OFF" as const) : "OFF";
  // QA-SEC-03 (v1.42.1): the device kind comes from the browser (a cookie and
  // the user agent) and can't be trusted for privileged accounts: IT, the
  // Super Admin and break-glass always keep the idle sign-out.
  const privileged = user.isBreakGlass || user.roles.includes("IT_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const daily = !privileged && dailySessionApplies(scope, context.userAgent, context.clientKind ?? null);
  const ttlSeconds = daily ? secondsUntilIndiaMidnight(deps.now()) : SESSION_TTL_SECONDS;
  await deps.createSession({
    id: sessionId,
    userId: user.id,
    deviceId,
    authMethod,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ttlSeconds,
    daily,
  });
  await deps.markLoginSuccess(user.id);
  await deps.recordLogin({
    userId: user.id,
    authMethod,
    step: authMethod === "GOOGLE" ? "GOOGLE" : otpSkipped ? "PASSWORD" : "OTP",
    success: true,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    deviceId,
    newDevice: isNewDevice,
    sessionId,
  });
  await deps.recordAudit({
    actorUserId: user.id,
    action: "LOGIN_SUCCESS",
    entityType: "USER",
    entityId: user.id,
    ipAddress: context.ipAddress,
    sessionId,
    metadata: { authMethod, newDevice: isNewDevice, breakGlass: user.isBreakGlass, dailySession: daily, ...(otpSkipped ? { otpSkipped: true } : {}) },
  });
  // Q-015: a distinct audit entry for every break-glass sign-in without the code.
  if (otpSkipped) {
    await deps.recordAudit({
      actorUserId: user.id,
      action: "BREAK_GLASS_SIGNIN_NO_OTP",
      entityType: "USER",
      entityId: user.id,
      ipAddress: context.ipAddress,
      sessionId,
      metadata: { newDevice: isNewDevice, windowSecondsLeft: user.breakGlassSecondsRemaining },
    });
  }

  const details = { userName: user.name, when: deps.now(), userAgent: context.userAgent, ipAddress: context.ipAddress };

  // New-login alert (N-02). The very first sign-in on a fresh account is not
  // suspicious, so it is not alerted.
  if (isNewDevice && user.hasLoggedInBefore) {
    const token = createPurposeToken(NOT_ME_PURPOSE, user.id, sessionId, NOT_ME_TTL_SECONDS);
    const link = `${deps.appBaseUrl()}/security/not-me?token=${encodeURIComponent(token)}`;
    const message = newSignInMessage(details, link);
    deps.dispatch(async () => {
      await deps.notify({ eventType: "NEW_LOGIN", userId: user.id, deepLink: link, ...message });
    });
  }

  // Every Super Admin or break-glass sign-in alerts the Super Admins (N-04, N-05).
  if (user.roles.includes("SUPER_ADMIN") || user.isBreakGlass) {
    const eventType = user.isBreakGlass ? "BREAK_GLASS_USED" : "SUPER_ADMIN_SIGNIN";
    const base = superAdminSignInMessage(user.name, details);
    // Q-015: the alert says plainly that no WhatsApp code was asked for.
    const message = otpSkipped
      ? {
          ...base,
          title: "Break-glass sign-in without a WhatsApp code",
          message: `${base.message} No WhatsApp code was asked for (break-glass window open).`,
          email: { subject: "Break-glass sign-in without a WhatsApp code", text: `${base.email.text}\nNo WhatsApp code was asked for: the break-glass window is open.` },
        }
      : base;
    deps.dispatch(async () => {
      const adminIds = await deps.listSuperAdminIds();
      for (const adminId of adminIds) {
        await deps.notify({ eventType, userId: adminId, ...message });
      }
    });
  }

  return {
    sessionToken: createSessionToken(sessionId, user.id, Math.floor(deps.now().getTime() / 1000), ttlSeconds),
    sessionId,
    // D-250: the cookie outlives the session by 12 hours, so after midnight
    // the browser still sends it and the app can say why it ended (the token
    // and the session row both expire at midnight; nothing is extended).
    cookieMaxAge: daily ? ttlSeconds + 12 * 60 * 60 : ttlSeconds,
    daily,
    newDeviceCookie,
    isNewDevice,
    redirectTo: POST_SIGN_IN_PATH,
  };
}
