"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { listMeetingTypes, listManagementMembers, replaceManagementMembers, saveMeetingType } from "@/lib/db/repositories/meetings.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { withTransaction } from "@/lib/db/transaction";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.51.0 (D-300): IT sets the meeting types (with default points) and the
// Management group (owner: ED and MD), who see every meeting and dashboard.
const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function saveMeetingTypeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.meetings");
  if (!actor) return { ok: false, message: "Not found." };
  const id = parseId(formData.get("id"));
  const name = text(formData, "name").trim().slice(0, 100);
  if (name.length < 2) return { ok: false, message: "Give the type a name.", fieldErrors: { name: "At least 2 characters." } };
  const template = text(formData, "template").trim().slice(0, 10000) || null;
  const position = Math.max(0, Math.min(999, Number(text(formData, "position")) || 0));
  const active = text(formData, "active") !== "no";
  try {
    const types = await listMeetingTypes(true);
    if (id && !types.some((type) => type.id === id)) return { ok: false, message: "Not found." };
    if (types.some((type) => type.id !== id && type.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, message: "There's already a type with that name.", fieldErrors: { name: "Choose another name." } };
    const code = id ? "" : `T${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
    const saved = await saveMeetingType({ id, code, name, template, position, active });
    await recordAudit({
      actorUserId: actor.id,
      action: id ? "MEETING_TYPE_UPDATED" : "MEETING_TYPE_CREATED",
      entityType: "MEETING_TYPE",
      entityId: saved,
      sessionId: actor.sessionId,
      ipAddress: actor.ipAddress,
      metadata: { name, active },
    });
  } catch (error) {
    logError("saveMeetingTypeAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/meetings");
  return { ok: true, message: "Saved." };
}

export async function saveManagementGroupAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor("admin.meetings");
  if (!actor) return { ok: false, message: "Not found." };
  const chosen = [
    ...new Set(
      formData
        .getAll("members")
        .filter((value): value is string => typeof value === "string" && /^\d{1,10}$/.test(value))
        .map(Number),
    ),
  ].slice(0, 50);
  try {
    const active = new Set((await listPeopleFacts()).map((person) => person.id));
    if (chosen.some((id) => !active.has(id))) return { ok: false, message: "Choose active people only." };
    const before = await listManagementMembers();
    await withTransaction((connection) => replaceManagementMembers(chosen, actor.id, connection));
    await recordAudit({
      actorUserId: actor.id,
      action: "MEETING_MANAGEMENT_GROUP_SAVED",
      entityType: "MEETING_SETTINGS",
      entityId: "management",
      sessionId: actor.sessionId,
      ipAddress: actor.ipAddress,
      metadata: { before, after: chosen },
    });
  } catch (error) {
    logError("saveManagementGroupAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/meetings");
  return { ok: true, message: "Management group saved." };
}
