"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { deleteTemplate, saveTemplate } from "@/lib/db/repositories/templates.repository";
import { findPublishedVersion, findWorkflow } from "@/lib/db/repositories/approvals.repository";
import { loadRequestView } from "@/server/approvals/view";
import { reusableValues } from "@/server/approvals/autofill";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import { featureOn } from "@/server/settings/features";

// FN4 / RP-01 personal templates. Saved from the person's own request (or
// the form they are filling in); only reusable values are kept.
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

export async function saveTemplateFromRequestAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const requestId = id(formData.get("requestId"));
  if (!user || requestId === null) return { ok: false, message: "Not found." };
  if (!(await featureOn("templates", user))) return { ok: false, message: "Templates are switched off at the moment." };
  const name = cleanName(formData.get("templateName"));
  if (name.length < 2) return { ok: false, message: "Give the template a name.", fieldErrors: { templateName: "Use 2 to 80 characters." } };
  const view = await loadRequestView(requestId, user);
  if (!view || view.requesterId !== user.id || view.isCustom) return { ok: false, message: "Not found." };
  const workflowIdRow = await workflowOf(view.id);
  const workflow = workflowIdRow ? await findWorkflow(workflowIdRow) : null;
  const version = workflow ? await findPublishedVersion(workflow.id) : null;
  if (!workflow || !version) return { ok: false, message: "This approval type isn't available any more." };
  const { values } = reusableValues(version.form, { fields: view.rawFields, form: view.form });
  try {
    const result = await saveTemplate({ userId: user.id, workflowId: workflow.id, name, title: view.title, fields: values });
    if (result === "TOO_MANY") return { ok: false, message: "You have 100 templates already. Delete one first." };
    await recordAudit({ actorUserId: user.id, action: "TEMPLATE_SAVED", entityType: "WORKFLOW", entityId: workflow.id, metadata: { name, fromRequest: view.id } });
  } catch (error) {
    logError("saveTemplateFromRequestAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath(`/users/new/${workflow.id}`);
  return { ok: true, message: `Saved as "${name}". Use it from Request templates → ${workflow.name}.` };
}

export async function deleteTemplateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await me();
  const templateId = id(formData.get("templateId"));
  if (!user || templateId === null) return { ok: false, message: "Not found." };
  if (!(await deleteTemplate(user.id, templateId))) return { ok: false, message: "Not found." };
  revalidatePath("/users/new", "layout");
  return { ok: true, message: "Template deleted." };
}

async function workflowOf(requestId: number): Promise<number | null> {
  const { getDbPool } = await import("@/lib/db/client");
  const [rows] = await getDbPool().query<(import("mysql2/promise").RowDataPacket & { workflow_id: number })[]>("SELECT v.workflow_id FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id = ?", [requestId]);
  return rows[0]?.workflow_id ?? null;
}
