import "server-only";
import { findUserById, findUserByLoginId, recordFailedPassword, resetFailedLogins, type UserRecord } from "@/lib/db/repositories/users.repository";
import {
  consumeChallenge,
  createChallenge,
  findChallengeByTokenHash,
  getRecentOtpStats,
  incrementChallengeAttempt,
  type ChallengeRecord,
  type RecentOtpStats,
} from "@/lib/db/repositories/otp.repository";
import { recordAudit, recordLogin } from "@/lib/db/repositories/audit.repository";
import { findActiveTemplate, tryConsumeWhatsAppRateLimit, type ActiveTemplate } from "@/lib/db/repositories/whatsapp.repository";
import { sendTemplateMessage } from "@/server/integrations/ceoitbox/client";
import { burnPasswordCheck, verifyPassword } from "@/lib/security/password";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "@/lib/security/otp";
import { keyedHash, randomToken } from "@/lib/security/hashing";
import { getAuthSecurityConfig, getWhatsAppConfig, type AuthSecurityConfig } from "@/server/settings/values";
import { notify, type NotifyInput } from "@/server/notifications/notify";
import { accountLockedMessage } from "@/server/notifications/security-messages";
import { AuthError, GENERIC_SIGN_IN_FAILED } from "@/server/auth/errors";
import { checkSignInAllowed, maskWhatsAppNumber } from "@/server/auth/sign-in-rules";
import { completeSignIn, defaultCompleteSignInDeps, type CompleteSignInDeps, type CompleteSignInResult } from "@/server/auth/complete-sign-in";
import { logError } from "@/lib/logging/logger";
import type { RequestContext } from "@/types/auth";

// F-02: User ID + password, then a WhatsApp-only OTP (D-025).
export interface PasswordSignInDeps {
  findUserByLoginId: (loginId: string) => Promise<UserRecord | null>;
  findUserById: (id: number) => Promise<UserRecord | null>;
  verifyPassword: (password: string, hash: string | null) => Promise<boolean>;
  burnPasswordCheck: (password: string) => Promise<void>;
  recordFailedPassword: (userId: number, threshold: number, lockMinutes: number) => Promise<{ failedCount: number; locked: boolean }>;
  resetFailedLogins: (userId: number) => Promise<void>;
  getRecentOtpStats: (userId: number) => Promise<RecentOtpStats>;
  createChallenge: typeof createChallenge;
  findChallengeByTokenHash: (hash: string) => Promise<ChallengeRecord | null>;
  incrementChallengeAttempt: (id: number) => Promise<void>;
  consumeChallenge: (id: number) => Promise<boolean>;
  findOtpTemplate: () => Promise<ActiveTemplate | null>;
  sendOtpWhatsApp: (to: string, template: ActiveTemplate, code: string) => Promise<void>;
  recordLogin: typeof recordLogin;
  recordAudit: typeof recordAudit;
  notify: (input: NotifyInput) => Promise<void>;
  getConfig: () => Promise<AuthSecurityConfig>;
  generateOtpCode: (length: number) => string;
  randomToken: () => string;
  complete: CompleteSignInDeps;
}

const defaultDeps: PasswordSignInDeps = {
  findUserByLoginId: (loginId) => findUserByLoginId(loginId),
  findUserById: (id) => findUserById(id),
  verifyPassword,
  burnPasswordCheck,
  recordFailedPassword: (userId, threshold, lockMinutes) => recordFailedPassword(userId, threshold, lockMinutes),
  resetFailedLogins: (userId) => resetFailedLogins(userId),
  getRecentOtpStats: (userId) => getRecentOtpStats(userId, "LOGIN"),
  createChallenge,
  findChallengeByTokenHash: (hash) => findChallengeByTokenHash(hash),
  incrementChallengeAttempt: (id) => incrementChallengeAttempt(id),
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
  recordLogin,
  recordAudit,
  notify,
  getConfig: getAuthSecurityConfig,
  generateOtpCode,
  randomToken: () => randomToken(32),
  complete: defaultCompleteSignInDeps,
};

export interface OtpChallengeResult {
  challengeToken: string;
  maskedNumber: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

async function issueOtp(
  user: UserRecord & { whatsappNumber: string },
  context: RequestContext,
  config: AuthSecurityConfig,
  deps: PasswordSignInDeps,
): Promise<OtpChallengeResult> {
  const stats = await deps.getRecentOtpStats(user.id);
  if (stats.secondsSinceLast !== null && stats.secondsSinceLast < config.otpCooldownSeconds) {
    const wait = config.otpCooldownSeconds - stats.secondsSinceLast;
    throw new AuthError("AUTH_OTP_COOLDOWN", `Please wait ${wait} seconds before asking for another code.`, wait);
  }
  if (stats.countLastHour >= config.otpMaxPerHour) {
    throw new AuthError("AUTH_OTP_RATE_LIMITED", "Too many codes requested. Try again in an hour.", 3600);
  }

  const template = await deps.findOtpTemplate();
  if (!template) {
    logError("OTP template WA_LOGIN_OTP_V1 is not active/approved", new Error("TEMPLATE_NOT_CONFIGURED"));
    throw new AuthError("AUTH_OTP_DELIVERY_FAILED", "We couldn't send the code on WhatsApp. Contact IT.");
  }

  const code = deps.generateOtpCode(config.otpLength);
  const challengeToken = deps.randomToken();
  await deps.createChallenge({
    challengeTokenHash: keyedHash(`challenge:${challengeToken}`),
    userId: user.id,
    purpose: "LOGIN",
    otpHash: hashOtpCode(code),
    ttlSeconds: config.otpTtlSeconds,
    maxAttempts: config.otpMaxAttempts,
    ipAddress: context.ipAddress,
  });

  try {
    await deps.sendOtpWhatsApp(user.whatsappNumber, template, code);
  } catch (error) {
    logError("WhatsApp OTP delivery failed", error, { userId: user.id });
    await deps.recordAudit({ actorUserId: user.id, action: "OTP_DELIVERY_FAILED", entityType: "USER", entityId: user.id, result: "FAILURE", ipAddress: context.ipAddress });
    throw new AuthError("AUTH_OTP_DELIVERY_FAILED", "We couldn't send the code on WhatsApp. Please try again in a moment.");
  }

  await deps.recordAudit({ actorUserId: user.id, action: "OTP_SENT", entityType: "USER", entityId: user.id, ipAddress: context.ipAddress, metadata: { channel: "WHATSAPP" } });
  return {
    challengeToken,
    maskedNumber: maskWhatsAppNumber(user.whatsappNumber),
    expiresInSeconds: config.otpTtlSeconds,
    resendAfterSeconds: config.otpCooldownSeconds,
  };
}

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
  return issueOtp({ ...user, whatsappNumber: user.whatsappNumber }, context, config, deps);
}

async function loadOpenChallenge(challengeToken: string, deps: PasswordSignInDeps): Promise<ChallengeRecord> {
  const challenge = await deps.findChallengeByTokenHash(keyedHash(`challenge:${challengeToken}`));
  if (!challenge || challenge.purpose !== "LOGIN" || challenge.consumed || challenge.secondsUntilExpiry <= 0) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please sign in again.");
  }
  return challenge;
}

// Resend: only for an open challenge, after the cooldown, within the hourly cap.
export async function resendOtpWithDeps(challengeToken: string, context: RequestContext, deps: PasswordSignInDeps): Promise<OtpChallengeResult> {
  const config = await deps.getConfig();
  const challenge = await loadOpenChallenge(challengeToken, deps);
  const user = await deps.findUserById(challenge.userId);
  if (!user || !user.whatsappNumber || !checkSignInAllowed(user, "PASSWORD").allowed) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please sign in again.");
  }
  const result = await issueOtp({ ...user, whatsappNumber: user.whatsappNumber }, context, config, deps);
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

  const challenge = await loadOpenChallenge(challengeToken, deps);
  if (challenge.attemptCount >= challenge.maxAttempts) {
    await logFailure(challenge.userId, "OTP_LOCKED");
    throw new AuthError("AUTH_OTP_LOCKED", "Too many wrong codes. Please sign in again.");
  }
  if (!verifyOtpCode(code.trim(), challenge.otpHash)) {
    await deps.incrementChallengeAttempt(challenge.id);
    await logFailure(challenge.userId, "INVALID_OTP");
    const left = challenge.maxAttempts - challenge.attemptCount - 1;
    throw new AuthError("AUTH_INVALID_OTP", left > 0 ? `That code is not right. ${left} tries left.` : "Too many wrong codes. Please sign in again.");
  }
  if (!(await deps.consumeChallenge(challenge.id))) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code was already used. Please sign in again.");
  }

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
