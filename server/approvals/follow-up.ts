import "server-only";
import { loadRequestView } from "@/server/approvals/view";
import type { Actor } from "@/server/approvals/service";
import type { FormField } from "@/server/forms/fields";

// EN-08: a follow-up starts from an approved request the person can see.
// Only reusable values are copied: same field key and type, never people
// (they may have moved on) or files; it's a new request with its own
// number and its own approvals.
export async function followUpSource(sourceId: number | null, actor: Actor): Promise<{ id: number; requestNo: string; title: string; fields: Record<string, string>; form: FormField[] } | null> {
  if (sourceId === null) return null;
  const view = await loadRequestView(sourceId, actor);
  if (!view || view.status !== "APPROVED") return null;
  return { id: view.id, requestNo: view.requestNo, title: view.title, fields: view.rawFields, form: view.form };
}

export function followUpValues(target: readonly FormField[], source: { fields: Record<string, string>; form: readonly FormField[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of target) {
    if (field.type === "PERSON") continue;
    const from = source.form.find((candidate) => candidate.key === field.key);
    const value = source.fields[field.key];
    if (!from || from.type !== field.type || value === undefined || value === "") continue;
    if (field.type === "CHOICE" && !(field.options ?? []).includes(value)) continue;
    out[field.key] = value;
  }
  return out;
}
