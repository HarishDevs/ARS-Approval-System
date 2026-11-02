"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { addDraftVersion, saveWorkingDraft, createWorkflow, publishVersion, simulateVersion } from "@/server/approvals/service";
import { deleteUnusedWorkflow, findRequest, findWorkflow, findWorkflowVersion, listVersions, updateWorkflowDetails, updateWorkflowSettings } from "@/lib/db/repositories/approvals.repository";
import { NUMERIC_TYPES } from "@/server/forms/fields";
import { typeSettingsSchema } from "@/server/workflows/type-settings";
import { runMigration } from "@/server/workflows/migration";
import { withTransaction } from "@/lib/db/transaction";
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
  const actor = await getAdminActor("admin.workflows");
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
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const content = parseContent(formData);
  if (!content.ok) return { ok: false, message: content.message };
  // D-241: into the open draft (as the editor last saw it), or a new one.
  const seenRaw = formData.get("draftVersionId");
  const seen = { versionId: typeof seenRaw === "string" && /^\d+$/.test(seenRaw) ? Number(seenRaw) : null, revision: Math.max(0, Number(formData.get("draftRevision") ?? 0) || 0) };
  const autosave = formData.get("autosave") === "1";
  try {
    const result = await saveWorkingDraft(workflowId, { builder: content.builder, form: content.form }, actor, seen, { autosave });
    if (!result.ok) return { ok: false, message: result.message, data: { conflict: result.code === "CONFLICT" } };
    revalidatePath(`/admin/workflows/${workflowId}`);
    const { validation, versionNo, versionId, revision, created } = result.value;
    const what = created ? `Saved as draft version ${versionNo}` : `Draft version ${versionNo} saved`;
    return {
      ok: true,
      message: validation.valid ? `${what}. It passes every check; test it, then publish.` : `${what}, but it has errors to fix before publishing.`,
      data: { ...validationData(validation), draft: { versionId, versionNo, revision } },
    };
  } catch (error) {
    logError("saveDraftAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function publishAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
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
  const actor = await getAdminActor("admin.workflows");
  const versionId = parseId(formData.get("versionId"));
  const requesterId = parseId(formData.get("requesterId"));
  if (!actor || versionId === null) return NOT_FOUND;
  if (requesterId === null) return { ok: false, message: "Choose a sample requester.", fieldErrors: { requesterId: "Choose a person." } };
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field:") && typeof value === "string") fields[key.slice(6)] = value;
    // Line items in test mode: one sample line with the total entered.
    if (key.startsWith("lines:") && typeof value === "string" && value.trim()) fields[key.slice(6)] = JSON.stringify([{ description: "Sample total", quantity: "1", rate: value.replace(/[,\s₹]/g, "") }]);
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
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const workflow = await findWorkflow(workflowId);
  if (!workflow || workflow.kind !== "PREDEFINED") return NOT_FOUND;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 150) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Enter a name (3 to 150 characters)." } };
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000) || null;
  const active = formData.get("active") === "on";
  const resubmitPolicy = formData.get("resubmitPolicy") === "BEGINNING" ? "BEGINNING" : "REQUESTING_STEP";
  try {
    await updateWorkflowDetails(workflowId, { name, description, active, resubmitPolicy });
    await recordAudit({
      actorUserId: actor.id,
      action: "WORKFLOW_DETAILS_UPDATED",
      entityType: "WORKFLOW",
      entityId: workflowId,
      sessionId: actor.sessionId,
      ipAddress: actor.ipAddress,
      metadata: { before: { name: workflow.name, active: workflow.active, resubmitPolicy: workflow.resubmitPolicy }, after: { name, active, description, resubmitPolicy } },
    });
  } catch (error) {
    logError("updateDetailsAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath(`/admin/workflows/${workflowId}`);
  revalidatePath("/admin/workflows");
  return { ok: true, message: active ? "Saved." : "Saved. People can no longer raise new requests of this type; running ones continue." };
}

// An approval type nobody has raised a request on can be removed for good
// (audit gap A-05); one that has been used can only be closed (archived) with
// "Open for new requests" off, so its history stays.
export async function deleteWorkflowAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const workflow = await findWorkflow(workflowId);
  if (!workflow || workflow.kind !== "PREDEFINED") return NOT_FOUND;
  let removed = false;
  try {
    removed = await withTransaction(async (db) => {
      const done = await deleteUnusedWorkflow(workflowId, db);
      if (done) {
        await recordAudit(
          { actorUserId: actor.id, action: "WORKFLOW_DELETED", entityType: "WORKFLOW", entityId: workflowId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { code: workflow.code, name: workflow.name } },
          db,
        );
      }
      return done;
    });
  } catch (error) {
    logError("deleteWorkflowAction failed", error);
    return { ok: false, message: "Couldn't remove it. Please try again." };
  }
  if (!removed) return { ok: false, message: "Requests were raised on this approval type, so it can't be removed. Untick \"Open for new requests\" to archive it instead." };
  revalidatePath("/admin/workflows");
  redirect("/admin/workflows?removed=1");
}

// P5-04: a custom approval that worked well becomes a predefined approval
// type: its levels and form are copied into a new draft, which IT then
// reviews, tests and publishes like any other.
export async function promoteCustomAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
  const requestId = parseId(formData.get("requestId"));
  if (!actor || requestId === null) return NOT_FOUND;
  const request = await findRequest(requestId);
  const version = request ? await findWorkflowVersion(request.workflowVersionId) : null;
  const source = version ? await findWorkflow(version.workflowId) : null;
  if (!request || !version || !source || source.kind !== "CUSTOM" || !version.builder) return NOT_FOUND;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 150) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Enter a name (3 to 150 characters)." } };
  let workflowId: number;
  try {
    const result = await createWorkflow(
      {
        code: String(formData.get("code") ?? "").trim().toUpperCase(),
        name,
        description: `Made from custom approval ${request.requestNo}.`,
        kind: "PREDEFINED",
        requestPrefix: String(formData.get("prefix") ?? "").trim().toUpperCase(),
        builder: version.builder,
        form: version.form,
      },
      actor,
    );
    if (!result.ok) {
      const field = result.code === "INVALID_PREFIX" ? "prefix" : result.code === "INVALID_CODE" || result.code === "DUPLICATE_CODE" ? "code" : null;
      return { ok: false, message: result.message, ...(field ? { fieldErrors: { [field]: result.message } } : {}) };
    }
    workflowId = result.value.workflowId;
    await recordAudit({ actorUserId: actor.id, action: "CUSTOM_PROMOTED", entityType: "WORKFLOW", entityId: workflowId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { fromRequest: request.requestNo } });
  } catch (error) {
    logError("promoteCustomAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/workflows");
  redirect(`/admin/workflows/${workflowId}?created=1`);
}

// FN1/FN3/EN-09/EN-10/FN5 per-type submission policies. Field keys must be
// on the newest version's form; numbers must be numbers. Audited.
export async function updateTypeSettingsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  if (!actor || workflowId === null) return NOT_FOUND;
  const workflow = await findWorkflow(workflowId);
  if (!workflow || workflow.kind !== "PREDEFINED") return NOT_FOUND;
  const latest = (await listVersions(workflowId))[0];
  const form = latest?.form ?? [];
  const keys = new Set(form.map((field) => field.key));
  const number = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? null : Number(raw);
  };
  const candidate = {
    duplicates: {
      fields: formData.getAll("dupField").map(String).filter((key) => keys.has(key)),
      windowDays: number("dupWindow") ?? 90,
      policy: formData.get("dupPolicy") === "BLOCK" ? "BLOCK" : "WARN",
      scope: ["SAME_REQUESTER", "SAME_DEPARTMENT"].includes(String(formData.get("dupScope"))) ? String(formData.get("dupScope")) : "ANY",
    },
    unique: { fields: formData.getAll("uniqueField").map(String).filter((key) => keys.has(key)) },
    attachments: { minimum: number("minFiles") ?? 0, note: String(formData.get("filesNote") ?? "").trim() || undefined },
    budget: { enabled: formData.get("budgetEnabled") === "on", amountField: String(formData.get("budgetField") ?? "amount") },
    validityDays: number("validityDays"),
    amendableFields: formData.get("amendEnabled") === "on" ? formData.getAll("amendField").map(String).filter((key) => keys.has(key)) : null,
    raisers: {
      mode: ["DEPARTMENTS", "PEOPLE"].includes(String(formData.get("raiserMode"))) ? String(formData.get("raiserMode")) : "EVERYONE",
      departmentIds: formData.getAll("raiserDept").map(String).filter((value) => /^\d{1,10}$/.test(value)).map(Number),
      userIds: formData.getAll("raiserPerson").map(String).filter((value) => /^\d{1,10}$/.test(value)).map(Number),
    },
    // DR-02: predefined types only (this action refuses custom ones above).
    mayFinishWithoutApprover: formData.get("mayFinishWithoutApprover") === "on",
  };
  const parsed = typeSettingsSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the values." };
  const settings = parsed.data;
  if (settings.raisers.mode === "DEPARTMENTS" && settings.raisers.departmentIds.length === 0) return { ok: false, message: "Choose at least one department that may raise this type.", fieldErrors: { raiserMode: "Choose at least one department." } };
  if (settings.raisers.mode === "PEOPLE" && settings.raisers.userIds.length === 0) return { ok: false, message: "Choose at least one person who may raise this type.", fieldErrors: { raiserMode: "Choose at least one person." } };
  if (settings.budget.enabled) {
    const field = form.find((item) => item.key === settings.budget.amountField);
    if (!field || !NUMERIC_TYPES.includes(field.type)) return { ok: false, message: "Choose a number, calculated or line-items field for the budget amount.", fieldErrors: { budgetField: "Choose a number field." } };
  }
  try {
    await updateWorkflowSettings(workflowId, settings);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_POLICIES_UPDATED", entityType: "WORKFLOW", entityId: workflowId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { before: workflow.settings ?? null, after: settings } });
  } catch (error) {
    logError("updateTypeSettingsAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath(`/admin/workflows/${workflowId}`);
  return { ok: true, message: "Saved. New submissions use these checks; requests already raised keep theirs." };
}

// Restore an older version as a new draft (version history). The draft is
// checked like any other before it can be published; nothing goes live here.
export async function restoreVersionAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  const versionId = parseId(formData.get("versionId"));
  if (!actor || workflowId === null || versionId === null) return { ok: false, message: "Not found." };
  const versions = await listVersions(workflowId);
  const version = versions.find((item) => item.id === versionId);
  if (!version) return { ok: false, message: "Not found." };
  if (versions[0]?.status === "DRAFT") return { ok: false, message: `Version ${versions[0].versionNo} is already a draft. Publish it, or change it, before restoring another.` };
  try {
    const result = await addDraftVersion(workflowId, version.builder ? { builder: version.builder, form: version.form } : { definition: version.definition, form: version.form }, actor);
    if (!result.ok) return { ok: false, message: result.message };
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_VERSION_RESTORED", entityType: "WORKFLOW", entityId: workflowId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { fromVersion: version.versionNo, newVersion: result.value.versionNo } });
    revalidatePath(`/admin/workflows/${workflowId}`);
    return { ok: true, message: `Version ${version.versionNo} copied as draft version ${result.value.versionNo}. Check it, then publish.` };
  } catch (error) {
    logError("restoreVersionAction failed", error);
    return { ok: false, message: "Couldn't restore. Please try again." };
  }
}

// FN7: move chosen open requests from an older version to the live one.
export async function runMigrationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.workflows");
  const workflowId = parseId(formData.get("workflowId"));
  const fromVersionId = parseId(formData.get("fromVersionId"));
  if (!actor || workflowId === null || fromVersionId === null) return { ok: false, message: "Not found." };
  const requestIds = formData.getAll("requestId").map((value) => parseId(value)).filter((value): value is number => value !== null);
  const mapping: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("map:") && typeof value === "string" && value) mapping[key.slice(4)] = value;
  }
  let migrationId: number;
  try {
    const result = await runMigration({ workflowId, fromVersionId, requestIds, mapping, acceptWarnings: formData.get("acceptWarnings") === "on" }, actor);
    if (!result.ok) return { ok: false, message: result.message };
    migrationId = result.report.migrationId;
  } catch (error) {
    logError("runMigrationAction failed", error);
    return { ok: false, message: "The migration stopped part-way. Requests already moved stay moved; see the run history." };
  }
  revalidatePath(`/admin/workflows/${workflowId}`);
  // The result stays on screen as a banner for this run (the list below changes).
  redirect(`/admin/workflows/${workflowId}/migrate?from=${fromVersionId}&run=${migrationId}`);
}
