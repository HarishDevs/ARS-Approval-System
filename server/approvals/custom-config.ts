import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { checkFormDefinition, formFieldSchema, type FormField } from "@/server/forms/fields";
import { DEFAULT_STEP_POLICY, parseStepPolicy, stepPolicySchema, type StepPolicy } from "@/server/workflows/step-policy";

// v1.8.0 (owner): the custom approval set-up, kept by IT in the Admin space.
// The fields people fill in on a custom approval, and the step options they
// may change. A change applies to new custom approvals only; a request keeps
// the form it was raised with (stored with its own workflow version).
export const DEFAULT_CUSTOM_FORM: FormField[] = [
  { key: "details", label: "Details", type: "LONG_TEXT", required: true },
  { key: "amount", label: "Amount (₹)", type: "NUMBER", required: false, min: 0 },
];

// Names the custom approval page itself uses; a field can't take them.
export const RESERVED_CUSTOM_KEYS = new Set(["title", "spec", "submission_key", "collaborator", "attachments", "allow_duplicate"]);
export const MAX_CUSTOM_FIELDS = 30;

export interface CustomConfig {
  form: FormField[];
  policy: StepPolicy;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export async function loadCustomConfig(): Promise<CustomConfig> {
  const [rows] = await getDbPool().query<(RowDataPacket & { form_json: unknown; policy_json: unknown; updated_at: Date; updated_by_name: string | null })[]>(
    "SELECT s.form_json, s.policy_json, s.updated_at, u.name AS updated_by_name FROM custom_approval_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1",
  );
  const row = rows[0];
  if (!row) return { form: DEFAULT_CUSTOM_FORM, policy: DEFAULT_STEP_POLICY, updatedAt: null, updatedByName: null };
  const form = formFieldSchema.array().safeParse(typeof row.form_json === "string" ? JSON.parse(row.form_json) : row.form_json);
  return { form: form.success ? form.data : DEFAULT_CUSTOM_FORM, policy: parseStepPolicy(row.policy_json), updatedAt: row.updated_at, updatedByName: row.updated_by_name };
}

// The problems with a proposed set-up (empty when it can be saved).
export function checkCustomConfig(form: readonly FormField[]): string[] {
  const problems = checkFormDefinition(form);
  if (form.length > MAX_CUSTOM_FIELDS) problems.push(`Use at most ${MAX_CUSTOM_FIELDS} fields.`);
  for (const field of form) if (RESERVED_CUSTOM_KEYS.has(field.key)) problems.push(`"${field.label}": the key "${field.key}" is used by the page itself. Choose another.`);
  return problems;
}

export async function saveCustomConfig(input: { form: unknown; policy: unknown }, actor: { id: number; roles: readonly string[]; sessionId?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!actor.roles.includes("IT_ADMIN") && !actor.roles.includes("SUPER_ADMIN")) return { ok: false, message: "Not found." };
  const form = formFieldSchema.array().safeParse(input.form);
  if (!form.success) return { ok: false, message: form.error.issues[0]?.message ?? "Check the fields." };
  const policy = stepPolicySchema.safeParse(input.policy);
  if (!policy.success) return { ok: false, message: policy.error.issues[0]?.message ?? "Check the step options." };
  const problems = checkCustomConfig(form.data);
  if (problems.length) return { ok: false, message: problems.join(" ") };
  const before = await loadCustomConfig();
  await getDbPool().query(
    `INSERT INTO custom_approval_settings (id, form_json, policy_json, updated_by) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE form_json = VALUES(form_json), policy_json = VALUES(policy_json), updated_by = VALUES(updated_by)`,
    [JSON.stringify(form.data), JSON.stringify(policy.data), actor.id],
  );
  await recordAudit({
    actorUserId: actor.id,
    action: "CUSTOM_APPROVAL_SETUP_CHANGED",
    entityType: "SETTING",
    entityId: "custom_approval",
    sessionId: actor.sessionId,
    metadata: { fieldsBefore: before.form.map((field) => field.key), fieldsAfter: form.data.map((field) => field.key), policyBefore: before.policy, policyAfter: policy.data },
  });
  return { ok: true };
}
