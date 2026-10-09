import "server-only";
import { findUserById, findUserByLoginId, recordFailedPassword, resetFailedLogins, type UserRecord } from "@/lib/db/repositories/users.repository";
import {
  consumeChallenge,
  createChallenge,
  findChallengeByTokenHash,
  getRecentOtpStats,
  reserveChallengeAttempt,
} from "@/lib/db/repositories/otp.repository";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { findActiveTemplate, tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";
import { sendTemplateMessage } from "@/server/integrations/ceoitbox/client";
import { burnPasswordCheck, verifyPassword } from "@/lib/security/password";
import { generateOtpCode } from "@/lib/security/otp";
import { randomToken } from "@/lib/security/hashing";
import { getAuthSecurityConfig, getWhatsAppConfig, type AuthSecurityConfig } from "@/server/settings/values";
import { notify, type NotifyInput } from "@/server/notifications/notify";
import { accountLockedMessage } from "@/server/notifications/security-messages";
import { AuthError, GENERIC_SIGN_IN_FAILED } from "@/server/auth/errors";
import { checkSignInAllowed } from "@/server/auth/sign-in-rules";
import { consumeOtpCode, issueOtp, loadOpenChallenge, type OtpChallengeResult, type OtpDeps } from "@/server/auth/otp-flow";
import { completeSignIn, defaultCompleteSignInDeps, type CompleteSignInDeps, type CompleteSignInResult } from "@/server/auth/complete-sign-in";
import type { RequestContext } from "@/types/auth";

export type { OtpChallengeResult } from "@/server/auth/otp-flow";

// F-02: User ID + password, then a WhatsApp-only OTP (D-025).
export interface PasswordSignInDeps extends OtpDeps {
  findUserByLoginId: (loginId: string) => Promise<UserRecord | null>;
  findUserById: (id: number) => Promise<UserRecord | null>;
  verifyPassword: (password: string, hash: string | null) => Promise<boolean>;
  burnPasswordCheck: (password: string) => Promise<void>;
  recordFailedPassword: (userId: number, threshold: number, lockMinutes: number) => Promise<{ failedCount: number; locked: boolean }>;
  resetFailedLogins: (userId: number) => Promise<void>;
  recordLogin: typeof recordLogin;
  notify: (input: NotifyInput) => Promise<unknown>;
  getConfig: () => Promise<AuthSecurityConfig>;
  complete: CompleteSignInDeps;
}

export const defaultOtpDeps: OtpDeps = {
  getRecentOtpStats: (userId, purpose) => getRecentOtpStats(userId, purpose),
  createChallenge,
  findChallengeByTokenHash: (hash) => findChallengeByTokenHash(hash),
  reserveChallengeAttempt: (id) => reserveChallengeAttempt(id),
  consumeChallenge: (id) => consumeChallenge(id),
  findOtpTemplate: () => findActiveTemplate("OTP_LOGIN"),
  async sendOtpWhatsApp(to, template, code) {
    const variables = template.variableKeys.map((key) => (key === "otp_code" ? code : ""));
    await sendTemplateMessage(
      await getWhatsAppConfig(),
      { to, templateName: template.providerName, language: template.language, templateVariables: variables },
      { fetch, tryConsumeRateLimit: tryConsumeWhatsAppRateLimit },
    );
  },
  recordAudit,
  generateOtpCode,
  randomToken: () => randomToken(32),
};

const defaultDeps: PasswordSignInDeps = {
  ...defaultOtpDeps,
  findUserByLoginId: (loginId) => findUserByLoginId(loginId),
  findUserById: (id) => findUserById(id),
  verifyPassword,
  burnPasswordCheck,
  recordFailedPassword: (userId, threshold, lockMinutes) => recordFailedPassword(userId, threshold, lockMinutes),
  resetFailedLogins: (userId) => resetFailedLogins(userId),
  recordLogin,
  notify,
  getConfig: getAuthSecurityConfig,
  complete: defaultCompleteSignInDeps,
};

// Step 1: check the password, then send the WhatsApp code.
export async function startPasswordSignInWithDeps(
  loginId: string,
  password: string,
  context: RequestContext,
  deps: PasswordSignInDeps,
): Promise<OtpChallengeResult> {
  const config = await deps.getConfig();
  const logFailure = (userId: number | null, reason: string) =>
    deps.recordLogin({ userId, authMethod: "PASSWORD_OTP", step: "PASSWORD", success: false, failureReason: reason, ipAddress: context.ipAddress, userAgent: context.userAgent });

  const user = await deps.findUserByLoginId(loginId);
  if (!user) {
    await deps.burnPasswordCheck(password);
    await logFailure(null, "UNKNOWN_LOGIN_ID");
    throw new AuthError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED);
  }

  if (user.lockedSecondsRemaining > 0) {
    await deps.burnPasswordCheck(password);
    await logFailure(user.id, "LOCKED");
    throw new AuthError("AUTH_ACCOUNT_LOCKED", "This account is locked. Try again later or contact IT.", user.lockedSecondsRemaining);
  }

  const passwordOk = await deps.verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await logFailure(user.id, "WRONG_PASSWORD");
    if (user.active && user.signInMethod === "PASSWORD") {
      const { locked } = await deps.recordFailedPassword(user.id, config.lockoutThreshold, config.lockoutMinutes);
      if (locked) {
        await deps.recordAudit({ actorUserId: user.id, action: "ACCOUNT_LOCKED", entityType: "USER", entityId: user.id, result: "FAILURE", ipAddress: context.ipAddress });
        await deps.notify({ eventType: "ACCOUNT_LOCKED", userId: user.id, ...accountLockedMessage(user.name, config.lockoutMinutes) });
        throw new AuthError("AUTH_ACCOUNT_LOCKED", "Too many wrong passwords. The account is locked for a while.", config.lockoutMinutes * 60);
      }
    }
    throw new AuthError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED);
  }

  const rule = checkSignInAllowed(user, "PASSWORD");
  if (!rule.allowed) {
    await logFailure(user.id, rule.reason);
    throw new AuthError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED);
  }
  await deps.resetFailedLogins(user.id);

  if (!user.whatsappNumber) {
    await logFailure(user.id, "NO_WHATSAPP_NUMBER");
    throw new AuthError("AUTH_NO_WHATSAPP", "No WhatsApp number is set on your account. Ask IT to add it.");
  }

  await deps.recordLogin({ userId: user.id, authMethod: "PASSWORD_OTP", step: "PASSWORD", success: true, ipAddress: context.ipAddress, userAgent: context.userAgent });
  return issueOtp({ ...user, whatsappNumber: user.whatsappNumber }, "LOGIN", context, config, deps);
}

// Resend: only for an open challenge, after the cooldown, within the hourly cap.
export async function resendOtpWithDeps(challengeToken: string, context: RequestContext, deps: PasswordSignInDeps): Promise<OtpChallengeResult> {
  const config = await deps.getConfig();
  const challenge = await loadOpenChallenge(challengeToken, "LOGIN", deps);
  const user = await deps.findUserById(challenge.userId);
  if (!user || !user.whatsappNumber || !checkSignInAllowed(user, "PASSWORD").allowed) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please sign in again.");
  }
  const result = await issueOtp({ ...user, whatsappNumber: user.whatsappNumber }, "LOGIN", context, config, deps);
  await deps.consumeChallenge(challenge.id);
  return result;
}

// Step 2: check the code and start the session.
export async function verifyOtpWithDeps(
  challengeToken: string,
  code: string,
  context: RequestContext,
  deps: PasswordSignInDeps,
): Promise<CompleteSignInResult> {
  const logFailure = (userId: number | null, reason: string) =>
    deps.recordLogin({ userId, authMethod: "PASSWORD_OTP", step: "OTP", success: false, failureReason: reason, ipAddress: context.ipAddress, userAgent: context.userAgent });

  const challenge = await loadOpenChallenge(challengeToken, "LOGIN", deps);
  await consumeOtpCode(challenge, code, deps, (reason) => logFailure(challenge.userId, reason));

  // Re-check the account: it may have been deactivated or locked meanwhile.
  const user = await deps.findUserById(challenge.userId);
  if (!user || !checkSignInAllowed(user, "PASSWORD").allowed) {
    await logFailure(challenge.userId, "NOT_ALLOWED_AFTER_OTP");
    throw new AuthError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED);
  }
  return completeSignIn(user, "PASSWORD_OTP", context, deps.complete);
}

export const startPasswordSignIn = (loginId: string, password: string, context: RequestContext) =>
  startPasswordSignInWithDeps(loginId, password, context, defaultDeps);
export const resendOtp = (challengeToken: string, context: RequestContext) => resendOtpWithDeps(challengeToken, context, defaultDeps);
export const verifyOtp = (challengeToken: string, code: string, context: RequestContext) =>
  verifyOtpWithDeps(challengeToken, code, context, defaultDeps);
