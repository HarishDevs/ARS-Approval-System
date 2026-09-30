"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { addDraftVersion, createWorkflow, publishVersion, simulateVersion } from "@/server/approvals/service";
import { findWorkflow, updateWorkflowDetails } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { builderSpecSchema } from "@/server/workflows/builder";
import { formSchema } from "@/server/forms/fields";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";
import type { ValidationResult } from "@/server/engine";

// /admin/workflows (S3-05, F-50). IT Admin / Super Admin only; the service
// re-checks that the workflow is theirs to manage.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

function parseContent(formData: FormData): { ok: true; builder: z.infer<typeof builderSpecSchema>; form: z.infer<typeof formSchema> } | { ok: false; message: string } {
  try {
    const builder = builderSpecSchema.safeParse(JSON.parse(String(formData.get("spec") ?? "null")));
    const form = formSchema.safeParse(JSON.parse(String(formData.get("form") ?? "[]")));
    if (!builder.success) return { ok: false, message: builder.error.issues[0]?.message ?? "The steps aren't complete." };
    if (!form.success) return { ok: false, message: form.error.issues[0]?.message ?? "The form fields aren't complete." };
    return { ok: true, builder: builder.data, form: form.data };
  } catch {
    return { ok: false, message: "The workflow couldn't be read. Reload the page and try again." };
  }
}

function validationData(validation: ValidationResult) {
  return { errors: validation.errors.map((issue) => issue.message), warnings: validation.warnings.map((issue) => issue.message) };
}

export async function createWorkflowAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const content = parseContent(formData);
  if (!content.ok) return { ok: false, message: content.message };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 150) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Enter a name (3 to 150 characters)." } };
  let workflowId: number;
  try {
    const result = await createWorkflow(
      {
        code: String(formData.get("code") ?? "").trim().toUpperCase(),
        name,
        description: String(formData.get("description") ?? "").trim() || undefined,
        kind: "PREDEFINED",
        requestPrefix: String(formData.get("prefix") ?? "").trim().toUpperCase(),
        builder: content.builder,
        form: content.form,
      },
      actor,
    );
    if (!result.ok) {
      const field = result.code === "INVALID_PREFIX" ? "prefix" : result.code === "INVALID_CODE" || result.code === "DUPLICATE_CODE" ? "code" : null;
      return { ok: false, message: result.message, ...(field ? { fieldErrors: { [field]: result.message } } : {}) };
    }
    workflowId = result.value.workflowId;
  } catch (error) {
    logError("createWorkflowAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/workflows");
  redirect(`/admin/workflows/${workflowId}?created=1`);
}

export async function saveDraftAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const content = parseContent(formData);
  if (!content.ok) return { ok: false, message: content.message };
  try {
    const result = await addDraftVersion(workflowId, { builder: content.builder, form: content.form }, actor);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(`/admin/workflows/${workflowId}`);
    const { validation, versionNo } = result.value;
    return {
      ok: true,
      message: validation.valid ? `Saved as draft version ${versionNo}. It passes every check; test it, then publish.` : `Saved as draft version ${versionNo}, but it has errors to fix before publishing.`,
      data: validationData(validation),
    };
  } catch (error) {
    logError("saveDraftAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function publishAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const versionId = parseId(formData.get("versionId"));
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || versionId === null || workflowId === null) return NOT_FOUND;
  try {
    const result = await publishVersion(versionId, actor);
    if (!result.ok) return { ok: false, message: result.validation ? `${result.message} ${result.validation.errors.map((issue) => issue.message).join(" ")}` : result.message };
    revalidatePath(`/admin/workflows/${workflowId}`);
    revalidatePath("/admin/workflows");
    return { ok: true, message: `Version ${result.value.versionNo} is published. New requests use it; running ones stay on their version.` };
  } catch (error) {
    logError("publishAction failed", error);
    return { ok: false, message: "Couldn't publish. Please try again." };
  }
}

export async function simulateAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const versionId = parseId(formData.get("versionId"));
  const requesterId = parseId(formData.get("requesterId"));
  if (!actor || versionId === null) return NOT_FOUND;
  if (requesterId === null) return { ok: false, message: "Choose a sample requester.", fieldErrors: { requesterId: "Choose a person." } };
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:") && typeof value === "string") fields[key.slice(6)] = value;
  }
  try {
    const view = await simulateVersion(versionId, { requesterId, fields });
    if (!view) return NOT_FOUND;
    return { ok: true, message: view.outcome === "APPROVED" ? "This is the route a request like this would take." : "A request like this would get stuck. See the blocked steps.", data: { view } };
  } catch (error) {
    logError("simulateAction failed", error);
    return { ok: false, message: "Couldn't run the test. Please try again." };
  }
}

export async function updateDetailsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const workflow = await findWorkflow(workflowId);
  if (!workflow || workflow.kind !== "PREDEFINED") return NOT_FOUND;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 150) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Enter a name (3 to 150 characters)." } };
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  const active = formData.get("active") === "on";
  try {
    await updateWorkflowDetails(workflowId, { name, description, active });
    await recordAudit({
      actorUserId: actor.id,
      action: "WORKFLOW_DETAILS_UPDATED",
      entityType: "WORKFLOW",
      entityId: workflowId,
      sessionId: actor.sessionId,
      ipAddress: actor.ipAddress,
      metadata: { before: { name: workflow.name, active: workflow.active }, after: { name, active, description } },
    });
  } catch (error) {
    logError("updateDetailsAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath(`/admin/workflows/${workflowId}`);
  revalidatePath("/admin/workflows");
  return { ok: true, message: active ? "Saved." : "Saved. People can no longer raise new requests of this type; running ones continue." };
}
