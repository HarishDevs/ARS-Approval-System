import "server-only";
import type { ChallengeRecord, OtpPurpose, RecentOtpStats } from "@/lib/db/repositories/otp.repository";
import type { createChallenge } from "@/lib/db/repositories/otp.repository";
import type { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { ActiveTemplate } from "@/lib/db/repositories/whatsapp.repository";
import type { UserRecord } from "@/lib/db/repositories/users.repository";
import { hashOtpCode, verifyOtpCode } from "@/lib/security/otp";
import { keyedHash } from "@/lib/security/hashing";
import { AuthError } from "@/server/auth/errors";
import { maskWhatsAppNumber } from "@/server/auth/sign-in-rules";
import { logError } from "@/lib/logging/logger";
import type { AuthSecurityConfig } from "@/server/settings/values";
import type { RequestContext } from "@/types/auth";

// WhatsApp code steps shared by sign-in (F-02), set password and forgot
// password (F-04). Always WhatsApp (D-025); codes stored hashed; the limits
// are counted per purpose.
export interface OtpDeps {
  getRecentOtpStats: (userId: number, purpose: OtpPurpose) => Promise<RecentOtpStats>;
  createChallenge: typeof createChallenge;
  findChallengeByTokenHash: (hash: string) => Promise<ChallengeRecord | null>;
  reserveChallengeAttempt: (id: number) => Promise<boolean>;
  consumeChallenge: (id: number) => Promise<boolean>;
  findOtpTemplate: () => Promise<ActiveTemplate | null>;
  sendOtpWhatsApp: (to: string, template: ActiveTemplate, code: string) => Promise<void>;
  recordAudit: typeof recordAudit;
  generateOtpCode: (length: number) => string;
  randomToken: () => string;
}

export interface OtpChallengeResult {
  challengeToken: string;
  maskedNumber: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export function challengeHash(challengeToken: string): string {
  return keyedHash(`challenge:${challengeToken}`);
}

export async function issueOtp(
  user: UserRecord & { whatsappNumber: string },
  purpose: OtpPurpose,
  context: RequestContext,
  config: AuthSecurityConfig,
  deps: OtpDeps,
): Promise<OtpChallengeResult> {
  const stats = await deps.getRecentOtpStats(user.id, purpose);
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
    challengeTokenHash: challengeHash(challengeToken),
    userId: user.id,
    purpose,
    otpHash: hashOtpCode(code),
    ttlSeconds: config.otpTtlSeconds,
    maxAttempts: config.otpMaxAttempts,
    ipAddress: context.ipAddress,
  });

  try {
    await deps.sendOtpWhatsApp(user.whatsappNumber, template, code);
  } catch (error) {
    logError("WhatsApp OTP delivery failed", error, { userId: user.id, purpose });
    await deps.recordAudit({ actorUserId: user.id, action: "OTP_DELIVERY_FAILED", entityType: "USER", entityId: user.id, result: "FAILURE", ipAddress: context.ipAddress, metadata: { purpose } });
    throw new AuthError("AUTH_OTP_DELIVERY_FAILED", "We couldn't send the code on WhatsApp. Please try again in a moment.");
  }

  await deps.recordAudit({ actorUserId: user.id, action: "OTP_SENT", entityType: "USER", entityId: user.id, ipAddress: context.ipAddress, metadata: { channel: "WHATSAPP", purpose } });
  return {
    challengeToken,
    maskedNumber: maskWhatsAppNumber(user.whatsappNumber),
    expiresInSeconds: config.otpTtlSeconds,
    resendAfterSeconds: config.otpCooldownSeconds,
  };
}

export async function loadOpenChallenge(challengeToken: string, purpose: OtpPurpose, deps: Pick<OtpDeps, "findChallengeByTokenHash">): Promise<ChallengeRecord> {
  const challenge = await deps.findChallengeByTokenHash(challengeHash(challengeToken));
  if (!challenge || challenge.purpose !== purpose || challenge.consumed || challenge.secondsUntilExpiry <= 0) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please start again.");
  }
  return challenge;
}

// Checks the code and uses the challenge up. Every try (right or wrong) first
// claims one of the challenge's attempts in the database, so the limit holds
// even for simultaneous guesses; once they're used up, even a right code is
// refused.
export async function consumeOtpCode(
  challenge: ChallengeRecord,
  code: string,
  deps: Pick<OtpDeps, "reserveChallengeAttempt" | "consumeChallenge">,
  onFailure: (reason: "OTP_LOCKED" | "INVALID_OTP") => Promise<void>,
): Promise<void> {
  if (challenge.attemptCount >= challenge.maxAttempts || !(await deps.reserveChallengeAttempt(challenge.id))) {
    await onFailure("OTP_LOCKED");
    throw new AuthError("AUTH_OTP_LOCKED", "Too many wrong codes. Please start again.");
  }
  if (!verifyOtpCode(code.trim(), challenge.otpHash)) {
    await onFailure("INVALID_OTP");
    const left = challenge.maxAttempts - challenge.attemptCount - 1;
    throw new AuthError("AUTH_INVALID_OTP", left > 0 ? `That code is not right. ${left} tries left.` : "Too many wrong codes. Please start again.");
  }
  if (!(await deps.consumeChallenge(challenge.id))) {
    throw new AuthError("AUTH_CHALLENGE_EXPIRED", "This code was already used. Please start again.");
  }
}
