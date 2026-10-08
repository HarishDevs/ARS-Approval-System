import "server-only";
import { after } from "next/server";
import { findUserById, findUserByLoginId, type UserRecord } from "@/lib/db/repositories/users.repository";
import { createPasswordToken, findPasswordToken, markPasswordTokenUsed, setPasswordHash, type PasswordTokenRecord } from "@/lib/db/repositories/password-tokens.repository";
import { revokeAllSessionsForUser } from "@/lib/db/repositories/sessions.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { withTransaction } from "@/lib/db/transaction";
import { keyedHash } from "@/lib/security/hashing";
import { checkPasswordPolicy, hashPassword } from "@/lib/security/password";
import { getEnv } from "@/config/environment";
import { getAuthSecurityConfig, type AuthSecurityConfig } from "@/server/settings/values";
import { notify, type NotifyInput, type NotifySummary } from "@/server/notifications/notify";
import { passwordChangedMessage, setPasswordLinkMessage } from "@/server/notifications/security-messages";
import { AuthError } from "@/server/auth/errors";
import { consumeOtpCode, issueOtp, loadOpenChallenge, type OtpChallengeResult, type OtpDeps } from "@/server/auth/otp-flow";
import { defaultOtpDeps } from "@/server/auth/password-sign-in";
import { completeSignIn, defaultCompleteSignInDeps, type CompleteSignInDeps, type CompleteSignInResult } from "@/server/auth/complete-sign-in";
import { checkCanEdit, type Actor } from "@/server/admin/user-rules";
import { logError } from "@/lib/logging/logger";
import type { RequestContext } from "@/types/auth";

// F-04: set password (first sign-in, P1-13) and forgot password (P1-14).
// Both end with a WhatsApp code to the number on file (D-025), then set the
// password, end every other session, alert the user and sign them in.
export const SET_PASSWORD_LINK_HOURS = 72;
const SECURITY_LOCK_SECONDS = 365 * 24 * 60 * 60;

export interface PasswordFlowDeps extends OtpDeps {
  findUserById: (id: number) => Promise<UserRecord | null>;
  findUserByLoginId: (loginId: string) => Promise<UserRecord | null>;
  createPasswordToken: typeof createPasswordToken;
  findPasswordToken: (tokenHash: string) => Promise<PasswordTokenRecord | null>;
  hashPassword: (password: string) => Promise<string>;
  // One transaction: set the hash, use up the link (if any), end sessions,
  // audit. false = the link was used meanwhile.
  applyNewPassword: (input: { userId: number; passwordHash: string; tokenId: number | null; action: string; ipAddress: string | null }) => Promise<boolean>;
  notify: (input: NotifyInput) => Promise<NotifySummary>;
  getConfig: () => Promise<AuthSecurityConfig>;
  defer: (work: () => Promise<void>) => void;
  appBaseUrl: () => string;
  complete: CompleteSignInDeps;
}

const defaultDeps: PasswordFlowDeps = {
  ...defaultOtpDeps,
  findUserById: (id) => findUserById(id),
  findUserByLoginId: (loginId) => findUserByLoginId(loginId),
  createPasswordToken,
  findPasswordToken: (hash) => findPasswordToken(hash),
  hashPassword,
  applyNewPassword: ({ userId, passwordHash, tokenId, action, ipAddress }) =>
    withTransaction(async (connection) => {
      if (tokenId !== null && !(await markPasswordTokenUsed(tokenId, connection))) return false;
      await setPasswordHash(userId, passwordHash, connection);
      const ended = await revokeAllSessionsForUser(userId, action, connection);
      await recordAudit({ actorUserId: userId, action, entityType: "USER", entityId: userId, ipAddress, metadata: { sessionsEnded: ended } }, connection);
      return true;
    }),
  notify,
  getConfig: getAuthSecurityConfig,
  // Runs after the response is sent, so a real account and an unknown one
  // answer in the same time (forgot password, anti-enumeration).
  defer: (work) => after(() => work().catch((error) => logError("deferred password-flow work failed", error))),
  appBaseUrl: () => getEnv().APP_BASE_URL ?? "https://approval.arssteels.net",
  complete: defaultCompleteSignInDeps,
};

const tokenHash = (token: string) => keyedHash(`pwtoken:${token}`);
const isSecurityLocked = (user: UserRecord) => user.lockedSecondsRemaining > SECURITY_LOCK_SECONDS;

function canUsePassword(user: UserRecord | null): user is UserRecord & { whatsappNumber: string } {
  return !!user && user.active && user.signInMethod === "PASSWORD" && !user.isBreakGlass && !!user.whatsappNumber && !isSecurityLocked(user);
}

function checkNewPassword(password: string, confirm: string, config: AuthSecurityConfig): void {
  if (password !== confirm) throw new AuthError("AUTH_PASSWORD_MISMATCH", "The two passwords don't match.");
  const policy = checkPasswordPolicy(password, config.passwordMinLength);
  if (!policy.ok) throw new AuthError("AUTH_PASSWORD_POLICY", policy.reason);
}

// ---- admin: send the link -------------------------------------------------
export async function sendSetPasswordLinkWithDeps(
  userId: number,
  actor: Actor & { sessionId: string; ipAddress: string | null },
  deps: PasswordFlowDeps,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const user = await deps.findUserById(userId);
  if (!user) return { ok: false, message: "User not found." };
  const edit = checkCanEdit(actor, { id: user.id, roles: user.roles, active: user.active, isBreakGlass: user.isBreakGlass });
  if (!edit.ok) return edit;
  if (user.isBreakGlass) return { ok: false, message: "The break-glass password is set only from the hosting console." };
  if (!user.active) return { ok: false, message: "Reactivate the user first." };
  if (user.signInMethod !== "PASSWORD") return { ok: false, message: "This user signs in with Google, so no password is needed." };
  if (!user.whatsappNumber) return { ok: false, message: "Add a WhatsApp number first: setting a password needs a code on WhatsApp." };

  const token = deps.randomToken();
  await deps.createPasswordToken({ userId, tokenHash: tokenHash(token), ttlHours: SET_PASSWORD_LINK_HOURS, createdBy: actor.id });
  await deps.recordAudit({ actorUserId: actor.id, action: "SET_PASSWORD_LINK_SENT", entityType: "USER", entityId: userId, sessionId: actor.sessionId, ipAddress: actor.ipAddress });
  const link = `${deps.appBaseUrl()}/set-password?token=${encodeURIComponent(token)}`;
  const summary = await deps.notify({ eventType: "SET_PASSWORD_LINK", userId, ...setPasswordLinkMessage(user.name, user.loginId, link, SET_PASSWORD_LINK_HOURS) });
  if (summary.email?.status === "SENT") return { ok: true, value: `Set-password link emailed to ${user.email}. It works for ${SET_PASSWORD_LINK_HOURS} hours.` };
  // The link exists but the email didn't go out; never show the link here
  // (only the account owner should hold it).
  return { ok: false, message: `The link was created but the email couldn't be sent (${summary.email?.code ?? "not sent"}). Check the email settings, then send it again.` };
}

// ---- set password via the link ------------------------------------------------
async function loadLink(token: string, deps: PasswordFlowDeps): Promise<{ record: PasswordTokenRecord; user: UserRecord & { whatsappNumber: string } }> {
  const record = token ? await deps.findPasswordToken(tokenHash(token)) : null;
  const user = record ? await deps.findUserById(record.userId) : null;
  if (!record || record.used || record.secondsUntilExpiry <= 0 || !canUsePassword(user)) {
    throw new AuthError("AUTH_LINK_INVALID", "This link has expired or was already used. Ask IT for a new one.");
  }
  return { record, user };
}

export async function inspectSetPasswordLinkWithDeps(token: string, deps: PasswordFlowDeps): Promise<{ valid: true; name: string; loginId: string } | { valid: false }> {
  try {
    const { user } = await loadLink(token, deps);
    return { valid: true, name: user.name, loginId: user.loginId };
  } catch {
    return { valid: false };
  }
}

export async function startSetPasswordWithDeps(token: string, password: string, confirm: string, context: RequestContext, deps: PasswordFlowDeps): Promise<OtpChallengeResult> {
  const config = await deps.getConfig();
  const { user } = await loadLink(token, deps);
  checkNewPassword(password, confirm, config);
  return issueOtp(user, "VERIFY_WHATSAPP", context, config, deps);
}

export async function completeSetPasswordWithDeps(
  token: string,
  challengeToken: string,
  code: string,
  password: string,
  confirm: string,
  context: RequestContext,
  deps: PasswordFlowDeps,
): Promise<CompleteSignInResult> {
  const config = await deps.getConfig();
  const { record, user } = await loadLink(token, deps);
  checkNewPassword(password, confirm, config);
  const challenge = await loadOpenChallenge(challengeToken, "VERIFY_WHATSAPP", deps);
  if (challenge.userId !== user.id) throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please start again.");
  await consumeOtpCode(challenge, code, deps, async () => undefined);
  return finish(user, await deps.hashPassword(password), record.id, "PASSWORD_SET", context, deps);
}

// ---- forgot password ---------------------------------------------------------
export interface ForgotStartResult {
  challengeToken: string;
  expiresInSeconds: number;
}

export async function startForgotPasswordWithDeps(loginId: string, context: RequestContext, deps: PasswordFlowDeps): Promise<ForgotStartResult> {
  const config = await deps.getConfig();
  const user = await deps.findUserByLoginId(loginId);
  // Real or not, the answer looks the same and takes the same time.
  const challengeToken = deps.randomToken();
  if (!canUsePassword(user)) {
    await deps.recordAudit({ actorUserId: user?.id ?? null, action: "PASSWORD_RESET_REQUESTED", entityType: "USER", entityId: user?.id ?? null, result: "FAILURE", ipAddress: context.ipAddress, metadata: { reason: user ? "NOT_ELIGIBLE" : "UNKNOWN_LOGIN_ID" } });
    return { challengeToken, expiresInSeconds: config.otpTtlSeconds };
  }
  // The challenge is created with this token after the response is sent, so
  // the answer returns now and the WhatsApp send happens afterwards.
  deps.defer(async () => {
    await issueOtp(user, "PASSWORD_RESET", context, config, { ...deps, randomToken: () => challengeToken });
  });
  return { challengeToken, expiresInSeconds: config.otpTtlSeconds };
}

const UNIFORM_CODE_ERROR = "That code isn't right or has expired. Ask for a new code if you need one.";

export async function completeForgotPasswordWithDeps(
  challengeToken: string,
  code: string,
  password: string,
  confirm: string,
  context: RequestContext,
  deps: PasswordFlowDeps,
): Promise<CompleteSignInResult> {
  const config = await deps.getConfig();
  checkNewPassword(password, confirm, config);
  let userId: number;
  try {
    const challenge = await loadOpenChallenge(challengeToken, "PASSWORD_RESET", deps);
    await consumeOtpCode(challenge, code, deps, async () => undefined);
    userId = challenge.userId;
  } catch (error) {
    // One message for wrong, expired, used-up or unknown codes, so the
    // screen never reveals whether the User ID exists.
    if (error instanceof AuthError) throw new AuthError("AUTH_INVALID_OTP", UNIFORM_CODE_ERROR);
    throw error;
  }
  const user = await deps.findUserById(userId);
  if (!canUsePassword(user)) throw new AuthError("AUTH_INVALID_OTP", UNIFORM_CODE_ERROR);
  return finish(user, await deps.hashPassword(password), null, "PASSWORD_RESET", context, deps);
}

async function finish(
  user: UserRecord,
  passwordHash: string,
  tokenId: number | null,
  action: "PASSWORD_SET" | "PASSWORD_RESET",
  context: RequestContext,
  deps: PasswordFlowDeps,
): Promise<CompleteSignInResult> {
  const applied = await deps.applyNewPassword({ userId: user.id, passwordHash, tokenId, action, ipAddress: context.ipAddress });
  if (!applied) throw new AuthError("AUTH_LINK_INVALID", "This link has expired or was already used. Ask IT for a new one.");
  deps.defer(async () => {
    await deps.notify({ eventType: "PASSWORD_CHANGED", userId: user.id, ...passwordChangedMessage(user.name, new Date()) });
  });
  // The user just proved the password and the WhatsApp number, so they are
  // signed in straight away (a fresh session; every older one was ended).
  const fresh = (await deps.findUserById(user.id)) ?? user;
  return completeSignIn(fresh, "PASSWORD_OTP", context, deps.complete);
}

// ---- bound to the real dependencies ----------------------------------------
export const sendSetPasswordLink = (userId: number, actor: Actor & { sessionId: string; ipAddress: string | null }) => sendSetPasswordLinkWithDeps(userId, actor, defaultDeps);
export const inspectSetPasswordLink = (token: string) => inspectSetPasswordLinkWithDeps(token, defaultDeps);
export const startSetPassword = (token: string, password: string, confirm: string, context: RequestContext) =>
  startSetPasswordWithDeps(token, password, confirm, context, defaultDeps);
export const completeSetPassword = (token: string, challengeToken: string, code: string, password: string, confirm: string, context: RequestContext) =>
  completeSetPasswordWithDeps(token, challengeToken, code, password, confirm, context, defaultDeps);
export const startForgotPassword = (loginId: string, context: RequestContext) => startForgotPasswordWithDeps(loginId, context, defaultDeps);
export const completeForgotPassword = (challengeToken: string, code: string, password: string, confirm: string, context: RequestContext) =>
  completeForgotPasswordWithDeps(challengeToken, code, password, confirm, context, defaultDeps);
