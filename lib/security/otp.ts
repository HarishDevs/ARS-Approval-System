import "server-only";
import crypto from "node:crypto";
import { keyedHash, safeEqualHex } from "@/lib/security/hashing";

// Defaults when no /superadmin setting overrides them (P1-12).
export const DEFAULT_OTP_LENGTH = 6;
export const DEFAULT_OTP_TTL_SECONDS = 5 * 60;
export const DEFAULT_OTP_MAX_ATTEMPTS = 5;
export const DEFAULT_OTP_COOLDOWN_SECONDS = 30;
export const DEFAULT_OTP_MAX_PER_HOUR = 5;

export function generateOtpCode(length: number = DEFAULT_OTP_LENGTH): string {
  return crypto.randomInt(0, 10 ** length).toString().padStart(length, "0");
}

export function hashOtpCode(code: string): string {
  return keyedHash(`otp:${code}`);
}

export function verifyOtpCode(code: string, hash: string): boolean {
  if (!/^\d{4,8}$/.test(code)) return false;
  return safeEqualHex(hashOtpCode(code), hash);
}
