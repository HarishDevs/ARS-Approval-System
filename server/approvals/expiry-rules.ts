// Approval expiry rules (v1.7.0, A1), kept free of the database so they can
// be tested and used on any page. An approval with a valid-until date is
// VALID, EXPIRING in its last 7 days, then EXPIRED. Without a date it never
// expires (NONE).
export const EXPIRY_NOTICE_DAYS = 7;

export type ExpiryState = "NONE" | "VALID" | "EXPIRING" | "EXPIRED";

// DR-05 (owner, 2 Nov 2026): an approved request past its valid-until date
// is shown as Expired everywhere (lists, search, the request page, the PDF,
// phone cards). Derived only: the stored status stays APPROVED.
export const EXPIRED_LABEL = "Expired";

export function isExpiredApproval(status: string, validUntil: Date | string | null | undefined, now: Date = new Date()): boolean {
  return status === "APPROVED" && expiryState(validUntil, now) === "EXPIRED";
}

// DR-05: amending or raising a follow-up from an expired approval isn't
// blocked, but asks why; the reason is kept on the expired request's history.
export const EXPIRED_REASON_MIN = 5;

export function cleanExpiredReason(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

export function expiredReasonError(reason: string): string | null {
  return reason.length < EXPIRED_REASON_MIN ? `This approval has expired. Say why you're using it (at least ${EXPIRED_REASON_MIN} characters).` : null;
}

export function expiryState(validUntil: Date | string | null | undefined, now: Date = new Date()): ExpiryState {
  if (!validUntil) return "NONE";
  const until = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  if (Number.isNaN(until.getTime())) return "NONE";
  if (until.getTime() <= now.getTime()) return "EXPIRED";
  if (until.getTime() - now.getTime() <= EXPIRY_NOTICE_DAYS * 86_400_000) return "EXPIRING";
  return "VALID";
}
