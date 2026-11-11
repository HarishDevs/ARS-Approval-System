"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { deleteApprovalTemplate, renameApprovalTemplate, saveApprovalTemplate } from "@/lib/db/repositories/approval-templates.repository";
import { findRequest, findWorkflowVersion } from "@/lib/db/repositories/approvals.repository";
import { loadRequestView } from "@/server/approvals/view";
import { builderSpecSchema } from "@/server/workflows/builder";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { featureOn } from "@/server/settings/features";

// v1.54.0 (owner, D-309): approval templates are the person's own. A
// requester saves the approval levels of a request they raised (or of the
// New request form they are filling in) under a name; only the levels are
// kept, never form values or files. Only the person sees their templates.
async function me() {
  try {
    const session = await requireApiArea("users");
    return { id: session.user.id, roles: session.user.roles };
  } catch {
    return null;
  }
}
const cleanName = (value: FormDataEntryValue | null) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const id = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);

async function levelsFrom(formData: FormData, user: { id: number; roles: string[] }): Promise<{ ok: true; stages: unknown[]; fromRequest: number | null } | { ok: false; message: string }> {
  const requestId = id(formData.get("requestId"));
  if (requestId !== null) {
    const view = await loadRequestView(requestId, user as Parameters<typeof loadRequestView>[1]);
    if (!view || view.requesterId !== user.id || !view.isCustom) return { ok: false, message: "Not found." };
    const record = await findRequest(requestId);
    const version = record ? await findWorkflowVersion(record.workflowVersionId) : null;
    if (!version?.builder) return { ok: false, message: "This request's levels can't be saved." };
    return { ok: true, stages: version.builder.stages, fromRequest: requestId };
  }
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("spec") ?? "").slice(0, 200_000));
  } catch {
    raw = null;
  }
  const parsed = builderSpecSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: `Finish the approval levels first: ${parsed.error.issues[0]?.message ?? "a level isn't complete."}` };
  return { ok: true, stages: parsed.data.stages, fromRequest: null };
}

export async function saveApprovalTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  if (!user) return { ok: false, message: "Not found." };
  if (!(await featureOn("templates", user))) return { ok: false, message: "Templates are switched off at the moment." };
  const name = cleanName(formData.get("templateName"));
  if (name.length < 2) return { ok: false, message: "Give the template a name.", fieldErrors: { templateName: "Use 2 to 80 characters." } };
  const levels = await levelsFrom(formData, user);
  if (!levels.ok) return { ok: false, message: levels.message };
  try {
    const result = await saveApprovalTemplate(user.id, name, levels.stages);
    if (result === "TOO_MANY") return { ok: false, message: "You have 100 approval templates already. Delete one first." };
    await recordAudit({ actorUserId: user.id, action: "TEMPLATE_SAVED", entityType: "USER", entityId: user.id, metadata: { name, templateId: result.id, replaced: result.replaced, fromRequest: levels.fromRequest } });
    revalidatePath("/users/new");
    return { ok: true, message: result.replaced ? `Template "${name}" updated with these levels.` : `Saved as "${name}". Find it in Approval templates.` };
  } catch (error) {
    logError("saveApprovalTemplateAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function deleteApprovalTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const templateId = id(formData.get("templateId"));
  if (!user || templateId === null) return { ok: false, message: "Not found." };
  if (!(await deleteApprovalTemplate(user.id, templateId))) return { ok: false, message: "Not found." };
  revalidatePath("/users/new");
  return { ok: true, message: "Template deleted." };
}

export async function renameApprovalTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const templateId = id(formData.get("templateId"));
  const name = cleanName(formData.get("templateName"));
  if (!user || templateId === null) return { ok: false, message: "Not found." };
  if (name.length < 2) return { ok: false, message: "Use 2 to 80 characters.", fieldErrors: { templateName: "Use 2 to 80 characters." } };
  const result = await renameApprovalTemplate(user.id, templateId, name);
  if (result === "DUPLICATE") return { ok: false, message: "You have a template with that name.", fieldErrors: { templateName: "Choose another name." } };
  if (result === "NOT_FOUND") return { ok: false, message: "Not found." };
  revalidatePath("/users/new");
  return { ok: true, message: "Renamed." };
}
