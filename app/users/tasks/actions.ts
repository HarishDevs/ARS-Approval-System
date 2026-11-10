"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { getActionContext } from "@/lib/http/request-context";
import { readFiles } from "@/server/modules/upload";
import { actOnTask, createTask, type TaskActor } from "@/server/modules/tasks";
import { TASK_ACTIONS, type TaskAction } from "@/server/modules/task-rules";
import { findLiveType } from "@/lib/db/repositories/module-types.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.9.0 (D-143): Task Management actions. Each checks the session and page
// access (requireApiArea), then the service checks the task rules for this
// person inside a locked transaction.
async function actor(): Promise<TaskActor | null> {
  try {
    const session = await requireApiArea("users");
    if (!(await featureOn("tasks", session.user))) return null;
    const { ipAddress } = await getActionContext();
    return { id: session.user.id, name: session.user.name, roles: session.user.roles, modules: session.user.modules, sessionId: session.sessionId, ipAddress };
  } catch {
    return null;
  }
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const idOf = (value: string) => (/^\d{1,10}$/.test(value) ? Number(value) : null);

export async function createTaskAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const typeId = idOf(text(formData, "type"));
  if (!typeId) return { ok: false, message: "Choose a task type." };
  const type = await findLiveType("TASK", typeId);
  if (!type) return { ok: false, message: "That task type isn't available." };
  const files = await readFiles(
    formData,
    type.form.filter((field) => field.type === "ATTACHMENT").map((field) => field.key),
  );
  if (!files.ok) return { ok: false, message: files.message };
  const fields: Record<string, string | undefined> = {};
  for (const field of type.form) fields[field.key] = formData.has(field.key) ? text(formData, field.key) : undefined;
  const key = text(formData, "submission_key");
  let created: { id: number; taskNo: string };
  try {
    const result = await createTask(
      {
        typeId,
        title: text(formData, "title"),
        description: text(formData, "description"),
        priority: text(formData, "priority"),
        assigneeId: idOf(text(formData, "assignee")),
        due: text(formData, "due"),
        startsOn: text(formData, "starts_on"),
        related: text(formData, "related"),
        fields,
        submissionKey: /^[0-9a-f-]{36}$/i.test(key) ? key : null,
        holidayOk: text(formData, "holiday_ok") === "1",
        files: files.staged,
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    created = result.value;
  } catch (error) {
    logError("createTaskAction failed", error);
    return { ok: false, message: "Couldn't create the task. Please try again." };
  }
  revalidatePath("/users/tasks");
  redirect(`/users/tasks/${created.id}?created=1`);
}

export async function taskAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await actor();
  if (!me) return { ok: false, message: "Not found." };
  const taskId = idOf(text(formData, "taskId"));
  const action = text(formData, "action") as TaskAction;
  if (!taskId || !(TASK_ACTIONS as readonly string[]).includes(action)) return { ok: false, message: "Not found." };
  const files = await readFiles(formData, []);
  if (!files.ok) return { ok: false, message: files.message };
  const editFields: Record<string, string | undefined> = {};
  for (const [name, value] of formData.entries()) if (name.startsWith("field:") && typeof value === "string") editFields[name.slice(6)] = value;
  try {
    const version = idOf(text(formData, "rowVersion"));
    const result = await actOnTask(
      {
        taskId,
        action,
        rowVersion: version,
        reason: text(formData, "reason"),
        assigneeId: idOf(text(formData, "assignee")),
        edit: action === "EDIT" ? { title: text(formData, "title"), description: text(formData, "description"), priority: text(formData, "priority"), due: text(formData, "due"), fields: editFields, holidayOk: text(formData, "holiday_ok") === "1" } : undefined,
        files: files.staged,
      },
      me,
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    revalidatePath(`/users/tasks/${taskId}`);
    revalidatePath("/users/tasks");
    return { ok: true, message: result.value.message };
  } catch (error) {
    logError("taskAction failed", error, { action });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}
