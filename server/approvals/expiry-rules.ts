// Approval expiry rules (v1.7.0, A1), kept free of the database so they can
// be tested and used on any page. An approval with a valid-until date is
// VALID, EXPIRING in its last 7 days, then EXPIRED. Without a date it never
// expires (NONE).
export const EXPIRY_NOTICE_DAYS = 7;

export type ExpiryState = "NONE" | "VALID" | "EXPIRING" | "EXPIRED";

export function expiryState(validUntil: Date | string | null | undefined, now: Date = new Date()): ExpiryState {
  if (!validUntil) return "NONE";
  const until = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  if (Number.isNaN(until.getTime())) return "NONE";
  if (until.getTime() <= now.getTime()) return "EXPIRED";
  if (until.getTime() - now.getTime() <= EXPIRY_NOTICE_DAYS * 86_400_000) return "EXPIRING";
  return "VALID";
}
