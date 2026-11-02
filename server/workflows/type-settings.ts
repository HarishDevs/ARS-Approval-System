import { z } from "zod";
import { accessSchema } from "@/server/modules/settings";

// Per-approval-type submission policies (unified prompt FN1, FN3, EN-09,
// EN-10, FN5). Kept on the type, not the versioned form: a policy change
// applies to new submissions; requests already raised keep what was checked
// for them (request_submission_checks). Nothing is invented: every policy is
// off until IT switches it on for a type.
export const typeSettingsSchema = z.object({
  duplicates: z
    .object({
      fields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,49}$/)).max(5).default([]),
      windowDays: z.number().int().min(1).max(730).default(90),
      policy: z.enum(["WARN", "BLOCK"]).default("WARN"),
      // v1.7.0 (A10): whose requests count: anyone's, the same person's, or the same department's.
      scope: z.enum(["ANY", "SAME_REQUESTER", "SAME_DEPARTMENT"]).default("ANY"),
    })
    .default({ fields: [], windowDays: 90, policy: "WARN", scope: "ANY" }),
  // v1.7.0 (A10): identifiers that must never repeat on an open or approved
  // request of this type (e.g. invoice number). Always blocking, any date.
  // Submissions of a type are serialised by its row lock, so two can't pass together.
  unique: z.object({ fields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,49}$/)).max(5).default([]) }).default({ fields: [] }),
  attachments: z.object({ minimum: z.number().int().min(0).max(20).default(0), note: z.string().trim().max(200).optional() }).default({ minimum: 0 }),
  budget: z.object({ enabled: z.boolean().default(false), amountField: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).default("amount") }).default({ enabled: false, amountField: "amount" }),
  validityDays: z.number().int().min(1).max(3650).nullable().default(null),
  amendableFields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,49}$/)).max(40).nullable().default(null), // null = none allowed
  // v1.9.0 (owner brief §5.3, D-147): who may raise this type. Everyone by default.
  raisers: accessSchema.default({ mode: "EVERYONE", departmentIds: [], userIds: [] }),
  // DR-02 (owner, 2 Nov 2026): "May finish without an approver (all levels
  // skipped)". Off by default: such a request goes to the requester's HOD
  // (else IT) for one human approval. Predefined types only; custom never.
  mayFinishWithoutApprover: z.boolean().default(false),
});
export type TypeSettings = z.infer<typeof typeSettingsSchema>;

// DR-02: whether requests of this type may end Approved with no human approval.
export function mayFinishWithoutApprover(workflow: { kind: string; settings?: Pick<TypeSettings, "mayFinishWithoutApprover"> | null }): boolean {
  return workflow.kind === "PREDEFINED" && workflow.settings?.mayFinishWithoutApprover === true;
}

export const DEFAULT_TYPE_SETTINGS: TypeSettings = typeSettingsSchema.parse({});

export function parseTypeSettings(raw: unknown): TypeSettings {
  if (raw === null || raw === undefined) return DEFAULT_TYPE_SETTINGS;
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = typeSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TYPE_SETTINGS;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- budget maths (EN-09, BD-3) ---------------------------------------------------
// Financial year April–March in India time: 15 Mar 2027 → 2026 (FY 2026-27).
export function financialYear(at: Date): number {
  const india = new Date(at.getTime() + 330 * 60_000);
  const year = india.getUTCFullYear();
  return india.getUTCMonth() >= 3 ? year : year - 1;
}

export const fyLabel = (startYear: number) => `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

export type BudgetState = "NO_BUDGET" | "OK" | "WARN" | "OVER";

// Committed = amounts of open and approved requests already counted against
// this department and year (never including this one). Missing budget data
// is "no budget loaded", never unlimited.
export function budgetPosition(input: { budgetPaise: number | null; warnPercent: number; committedPaise: number; requestPaise: number }): { state: BudgetState; afterPaise: number; availablePaise: number | null; usedPercent: number | null } {
  const after = input.committedPaise + input.requestPaise;
  if (input.budgetPaise === null) return { state: "NO_BUDGET", afterPaise: after, availablePaise: null, usedPercent: null };
  const available = input.budgetPaise - input.committedPaise;
  const usedPercent = input.budgetPaise > 0 ? Math.round((after / input.budgetPaise) * 1000) / 10 : null;
  if (after > input.budgetPaise) return { state: "OVER", afterPaise: after, availablePaise: available, usedPercent };
  if (input.budgetPaise > 0 && after * 100 >= input.budgetPaise * input.warnPercent) return { state: "WARN", afterPaise: after, availablePaise: available, usedPercent };
  return { state: "OK", afterPaise: after, availablePaise: available, usedPercent };
}
