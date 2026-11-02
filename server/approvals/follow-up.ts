import "server-only";
import { loadRequestView } from "@/server/approvals/view";
import type { Actor } from "@/server/approvals/service";
import type { FormField } from "@/server/forms/fields";
import { isExpiredApproval } from "@/server/approvals/expiry-rules";

// EN-08: a follow-up starts from an approved request the person can see.
// Only reusable values are copied: same field key and type, never people
// (they may have moved on) or files; it's a new request with its own
// number and its own approvals.
// DR-05 (owner, 2 Nov 2026): `expired` = the approval is past its valid-until
// date; a follow-up from it then asks for a reason.
export async function followUpSource(
  sourceId: number | null,
  actor: Actor,
): Promise<{ id: number; requestNo: string; title: string; fields: Record<string, string>; form: FormField[]; expired: boolean; validUntil: Date | null } | null> {
  if (sourceId === null) return null;
  const view = await loadRequestView(sourceId, actor);
  if (!view || view.status !== "APPROVED") return null;
  return { id: view.id, requestNo: view.requestNo, title: view.title, fields: view.rawFields, form: view.form, expired: isExpiredApproval(view.status, view.validUntil), validUntil: view.validUntil };
}

export function followUpValues(target: readonly FormField[], source: { fields: Record<string, string>; form: readonly FormField[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of target) {
    if (field.type === "PERSON" || field.type === "ATTACHMENT") continue;
    const from = source.form.find((candidate) => candidate.key === field.key);
    const value = source.fields[field.key];
    if (!from || from.type !== field.type || value === undefined || value === "") continue;
    if (field.type === "MULTI_CHOICE") continue;
    if ((field.type === "CHOICE" || field.type === "RADIO") && !(field.options ?? []).includes(value)) continue;
    out[field.key] = value;
  }
  return out;
}
