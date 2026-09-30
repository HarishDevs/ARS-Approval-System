import { z } from "zod";
import { isValidWhatsAppNumber, normaliseRoles, normaliseWhatsAppNumber } from "@/server/admin/user-rules";
import type { RoleCode, SignInMethod } from "@/types/auth";

// Parses the user form (F-06). Pure and unit-tested.
export interface ParsedUserInput {
  loginId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
  departmentId: number | null;
  designationId: number | null;
  reportingManagerId: number | null;
  signInMethod: SignInMethod;
  roles: RoleCode[];
}

const optionalId = z
  .string()
  .optional()
  .transform((value) => (value && /^\d+$/.test(value) ? Number(value) : null));

const schema = z.object({
  loginId: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore only."),
  name: z.string().trim().min(2, "Enter the full name.").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(255),
  whatsappNumber: z.string().optional(),
  departmentId: optionalId,
  designationId: optionalId,
  reportingManagerId: optionalId,
  signInMethod: z.enum(["GOOGLE", "PASSWORD"], { message: "Choose how this person signs in." }),
});

export type ParseResult = { ok: true; value: ParsedUserInput } | { ok: false; fieldErrors: Record<string, string> };

export function parseUserForm(fields: Record<string, string | undefined>, roles: readonly string[]): ParseResult {
  const parsed = schema.safeParse(fields);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const whatsappNumber = normaliseWhatsAppNumber(parsed.data.whatsappNumber ?? "");
  if (whatsappNumber !== null && !isValidWhatsAppNumber(whatsappNumber)) {
    fieldErrors.whatsappNumber = "Enter a mobile number with country code, e.g. 91 98765 43210.";
  }
  // D-025: password users get their sign-in code on WhatsApp only.
  if (parsed.data.signInMethod === "PASSWORD" && whatsappNumber === null) {
    fieldErrors.whatsappNumber = "Password sign-in needs a WhatsApp number for the sign-in code.";
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      loginId: parsed.data.loginId,
      name: parsed.data.name,
      email: parsed.data.email,
      whatsappNumber,
      departmentId: parsed.data.departmentId,
      designationId: parsed.data.designationId,
      reportingManagerId: parsed.data.reportingManagerId,
      signInMethod: parsed.data.signInMethod,
      roles: normaliseRoles(roles),
    },
  };
}

// Before/after for the audit log: only the fields that changed.
export function diffFields<T extends Record<string, unknown>>(before: T, after: T): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[key] = { before: a ?? null, after: b ?? null };
  }
  return diff;
}
