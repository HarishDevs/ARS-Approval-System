import type { UserRecord } from "@/lib/db/repositories/users.repository";
import { allowsGoogle, allowsPassword, type SignInAttempt } from "@/types/auth";

// Pure rules shared by both sign-in methods (unit-tested).
export type SignInDenialReason = "INACTIVE" | "WRONG_METHOD" | "LOCKED" | "BREAK_GLASS_DISABLED";

export type SignInRuleResult = { allowed: true } | { allowed: false; reason: SignInDenialReason; retryAfterSeconds?: number };

export function checkSignInAllowed(user: UserRecord, method: SignInAttempt): SignInRuleResult {
  if (!user.active) return { allowed: false, reason: "INACTIVE" };
  // D-005: the admin sets how each user signs in; D-208: BOTH allows either.
  if (!(method === "GOOGLE" ? allowsGoogle(user.signInMethod) : allowsPassword(user.signInMethod))) return { allowed: false, reason: "WRONG_METHOD" };
  if (user.lockedSecondsRemaining > 0) return { allowed: false, reason: "LOCKED", retryAfterSeconds: user.lockedSecondsRemaining };
  // D-011: the break-glass account works only inside its enabled window.
  if (user.isBreakGlass && user.breakGlassSecondsRemaining <= 0) return { allowed: false, reason: "BREAK_GLASS_DISABLED" };
  return { allowed: true };
}

// Q-015 (owner, 2 Nov 2026): while its window is open, the break-glass
// account signs in with the password alone (WhatsApp may be the very thing
// that is down). Every other account, and break-glass outside the window,
// keeps the WhatsApp code (D-025).
export function skipsWhatsAppCode(user: Pick<UserRecord, "isBreakGlass" | "breakGlassSecondsRemaining">): boolean {
  return Boolean(user.isBreakGlass) && user.breakGlassSecondsRemaining > 0;
}

// "91XXXXXXXX34" style mask for showing where a code was sent.
export function maskWhatsAppNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 2)}${"X".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-2)}`;
}
