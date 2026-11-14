import "server-only";
import type { RowDataPacket } from "mysql2";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { rolesSeeConfidential } from "@/server/approvals/confidential";
import { displayValue, isConfidential, type FormField } from "@/server/forms/fields";

// v1.54.16 (owner: "in Group by all the fields added in the custom form for
// Approvals and department from user details"): what the request lists need
// to group a page of rows by the requester's department or by any form field.
// Custom forms are each requester's own, so a field is matched by its label
// (the same label on two forms is one group). A confidential field shows
// "Hidden" to anyone who may not see it, as Priority does.

export interface FieldGroupChoice {
  id: string; // "f:<label slug>"
  label: string;
}
export interface ListGroupData {
  fields: FieldGroupChoice[];
  department: Record<number, string>;
  values: Record<number, Record<string, string>>;
}

// Field types that make no sense as groups.
const NOT_GROUPABLE = new Set(["SECTION", "ATTACHMENT", "LONG_TEXT", "LINE_ITEMS"]);
export const NO_VALUE = "No value";
export const HIDDEN = "Hidden";

export function fieldGroupId(label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug ? `f:${slug}` : null;
}

const json = <T,>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export async function listGroupData(requestIds: readonly number[], viewer: { id: number; roles?: readonly string[] }, db: Queryable = getDbPool()): Promise<ListGroupData> {
  const out: ListGroupData = { fields: [], department: {}, values: {} };
  const ids = [...new Set(requestIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const [rows] = await db.query<(RowDataPacket & { id: number; requester_id: number; form_json: unknown; form_data_json: unknown; department: string | null })[]>(
    `SELECT r.id, r.requester_id, v.form_json, r.form_data_json, d.name AS department
     FROM approval_requests r
     JOIN workflow_versions v ON v.id = r.workflow_version_id
     JOIN users u ON u.id = r.requester_id
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE r.id IN (?)`,
    [ids],
  );
  const parsed = rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    department: row.department,
    form: (json<FormField[]>(row.form_json) ?? []).filter((field) => field && typeof field.label === "string" && !NOT_GROUPABLE.has(field.type)),
    data: json<Record<string, unknown>>(row.form_data_json) ?? {},
  }));

  // Who may see confidential values: IT, the requester, anyone who holds or decided a step.
  const admin = rolesSeeConfidential(viewer.roles ?? []);
  const secret = parsed.filter((row) => !admin && row.requesterId !== viewer.id && row.form.some((field) => isConfidential(field))).map((row) => row.id);
  const involved = new Set<number>();
  if (secret.length) {
    const [tasks] = await db.query<(RowDataPacket & { request_id: number })[]>("SELECT DISTINCT request_id FROM approval_tasks WHERE request_id IN (?) AND (approver_id = ? OR decided_by = ?)", [secret, viewer.id, viewer.id]);
    for (const task of tasks) involved.add(task.request_id);
  }

  // Names for person fields (one query).
  const personIds = new Set<number>();
  for (const row of parsed)
    for (const field of row.form)
      if (field.type === "PERSON") for (const value of [row.data[field.key]].flat()) if (Number.isInteger(Number(value)) && Number(value) > 0) personIds.add(Number(value));
  const names = new Map<number, string>();
  if (personIds.size) {
    const [people] = await db.query<(RowDataPacket & { id: number; name: string })[]>("SELECT id, name FROM users WHERE id IN (?)", [[...personIds]]);
    for (const person of people) names.set(person.id, person.name);
  }

  const choices = new Map<string, string>();
  for (const row of parsed) {
    out.department[row.id] = row.department?.trim() || "No department";
    const values: Record<string, string> = {};
    const mayView = admin || row.requesterId === viewer.id || involved.has(row.id);
    for (const field of row.form) {
      const id = fieldGroupId(field.label);
      if (!id) continue;
      if (!choices.has(id)) choices.set(id, field.label.trim());
      if (values[id] !== undefined) continue;
      if (isConfidential(field) && !mayView) {
        values[id] = HIDDEN;
        continue;
      }
      const shown = displayValue(field, row.data[field.key], names);
      values[id] = !shown || shown === "—" ? NO_VALUE : shown.slice(0, 120);
    }
    out.values[row.id] = values;
  }
  out.fields = [...choices].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

// Groups in a readable order: by name, with "No value"/"Hidden"/"No department" last.
export function groupOrder(a: string, b: string): number {
  const last = (label: string) => (label === NO_VALUE || label === HIDDEN || label === "No department" ? 1 : 0);
  return last(a) - last(b) || a.localeCompare(b, "en", { numeric: true });
}
