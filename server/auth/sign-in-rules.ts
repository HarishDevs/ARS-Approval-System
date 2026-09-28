import type { UserRecord } from "@/lib/db/repositories/users.repository";
import type { SignInMethod } from "@/types/auth";

// Pure rules shared by both sign-in methods (unit-tested).
export type SignInDenialReason = "INACTIVE" | "WRONG_METHOD" | "LOCKED" | "BREAK_GLASS_DISABLED";

export type SignInRuleResult = { allowed: true } | { allowed: false; reason: SignInDenialReason; retryAfterSeconds?: number };

export function checkSignInAllowed(user: UserRecord, method: SignInMethod): SignInRuleResult {
  if (!user.active) return { allowed: false, reason: "INACTIVE" };
  // D-005: each user has exactly one sign-in method, set by the admin.
  if (user.signInMethod !== method) return { allowed: false, reason: "WRONG_METHOD" };
  if (user.lockedSecondsRemaining > 0) return { allowed: false, reason: "LOCKED", retryAfterSeconds: user.lockedSecondsRemaining };
  // D-011: the break-glass account works only inside its enabled window.
  if (user.isBreakGlass && user.breakGlassSecondsRemaining <= 0) return { allowed: false, reason: "BREAK_GLASS_DISABLED" };
  return { allowed: true };
}

// "91XXXXXXXX34" style mask for showing where a code was sent.
export function maskWhatsAppNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 2)}${"X".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-2)}`;
}
