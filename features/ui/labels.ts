import type { RoleCode } from "@/types/auth";

// Words and formats shown in several places, kept in one spot (audit D-03).
export const ROLE_LABEL: Record<RoleCode, string> = { USER: "User", EXPORTER: "Can export", IT_ADMIN: "IT Admin", SUPER_ADMIN: "Super Admin" };

// The admin roles of a person, or "User".
export function accessLabel(roles: readonly RoleCode[]): string {
  return roles.filter((role) => role !== "USER").map((role) => ROLE_LABEL[role]).join(", ") || "User";
}

// A WhatsApp number shown without giving it away: +91 ••••• 3210.
export function maskWhatsApp(number: string | null | undefined): string | null {
  return number ? `+${number.slice(0, 2)} ••••• ${number.slice(-4)}` : null;
}

// Request status filter (My requests, Super Admin → Requests).
export const REQUEST_STATUS_OPTIONS = [
  ["", "Any status"],
  ["IN_PROGRESS", "In progress"],
  ["ON_HOLD", "On hold"],
  ["CHANGES_REQUIRED", "Changes required"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Withdrawn"],
] as const;

// The same words as the status pill (D-017), for plain-text places.
export const STATUS_WORD: Record<string, string> = Object.fromEntries(REQUEST_STATUS_OPTIONS.filter(([value]) => value !== "")) as Record<string, string>;
