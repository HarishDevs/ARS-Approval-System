import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findTemplate } from "@/lib/db/repositories/templates.repository";
import { loadRequestView } from "@/server/approvals/view";
import type { FormField } from "@/server/forms/fields";

// Smart autofill (unified prompt FN4). Starting values for a new request,
// with where each came from. Only the person's own sources: their profile,
// their own templates, their own earlier requests (they can see them), or
// an approved request they raise a follow-up to. Never copied: people
// fields, files, decisions, approvers or request numbers. A value that no
// longer fits the form (a choice removed, a type changed) is left out and
// counted, so the page can say so. Nothing here is trusted: the server
// checks every value again on submit.
export type Source = "profile" | "template" | "previous" | "follow-up";
export const SOURCE_LABEL: Record<Source, string> = {
  profile: "Filled from your profile",
  template: "From your template",
  previous: "Copied from your earlier request",
  "follow-up": "Copied from the approved request",
};

export interface Prefill {
  values: Record<string, string>;
  sources: Record<string, Source>;
  title: string | null;
  dropped: number;
  origin: string | null; // e.g. 'template "Monthly stationery"'
}

// Same key, same type, still a valid choice; people fields are never copied.
export function reusableValues(form: readonly FormField[], source: { fields: Record<string, string>; form?: readonly FormField[] }): { values: Record<string, string>; dropped: number } {
  const values: Record<string, string> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(source.fields)) {
    if (value === undefined || value === null || value === "" || key.endsWith("__lines")) continue;
    const field = form.find((item) => item.key === key);
    const before = source.form?.find((item) => item.key === key);
    // Files (and attachment fields) are never copied.
    if (!field || field.type === "PERSON" || field.type === "CALC" || field.type === "SECTION" || field.type === "ATTACHMENT" || (before && before.type !== field.type) || field.type === "MULTI_CHOICE" || ((field.type === "CHOICE" || field.type === "RADIO") && !(field.options ?? []).includes(value))) {
      if (field?.type !== "CALC" && field?.type !== "PERSON") dropped += 1;
      continue;
    }
    values[key] = value;
    // Line items: the rows travel with the total (the editor reads them).
    const lines = source.fields[`${key}__lines`];
    if (field.type === "LINE_ITEMS" && lines) values[`${key}__lines`] = lines;
  }
  return { values, dropped };
}

export async function prefill(input: {
  user: { id: number; roles: readonly string[] };
  workflowId: number;
  form: readonly FormField[];
  templateId?: number | null;
  fromRequestId?: number | null;
}): Promise<Prefill> {
  const out: Prefill = { values: {}, sources: {}, title: null, dropped: 0, origin: null };
  if (input.templateId) {
    const template = await findTemplate(input.user.id, input.templateId);
    if (template && template.workflowId === input.workflowId) {
      const reused = reusableValues(input.form, { fields: template.fields });
      Object.assign(out.values, reused.values);
      for (const key of Object.keys(reused.values)) out.sources[key] = "template";
      out.title = template.title;
      out.dropped = reused.dropped;
      out.origin = `your template "${template.name}"`;
    }
  } else if (input.fromRequestId) {
    // "Raise again like this": an earlier request of the same type that the
    // person raised themselves.
    const view = await loadRequestView(input.fromRequestId, input.user as { id: number; roles: never[] });
    if (view && view.requesterId === input.user.id) {
      const reused = reusableValues(input.form, { fields: view.rawFields, form: view.form });
      Object.assign(out.values, reused.values);
      for (const key of Object.keys(reused.values)) out.sources[key] = "previous";
      out.title = view.title;
      out.dropped = reused.dropped;
      out.origin = `your request ${view.requestNo}`;
    }
  }
  // The person's own department and designation for "from the list" fields
  // that are still empty.
  const profile = await profileCodes(input.user.id);
  for (const field of input.form) {
    if (field.type !== "LOOKUP" || out.values[field.key]) continue;
    const code = field.source === "DEPARTMENT" ? profile.department : field.source === "DESIGNATION" ? profile.designation : null;
    if (code) {
      out.values[field.key] = code;
      out.sources[field.key] = "profile";
    }
  }
  return out;
}

async function profileCodes(userId: number): Promise<{ department: string | null; designation: string | null }> {
  const [rows] = await getDbPool().query<(RowDataPacket & { department: string | null; designation: string | null })[]>(
    `SELECT d.code AS department, g.code AS designation FROM users u
     LEFT JOIN departments d ON d.id = u.department_id AND d.active = TRUE
     LEFT JOIN designations g ON g.id = u.designation_id AND g.active = TRUE
     WHERE u.id = ?`,
    [userId],
  );
  return { department: rows[0]?.department ?? null, designation: rows[0]?.designation ?? null };
}
