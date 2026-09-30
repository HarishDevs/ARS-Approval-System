"use server";

import { revalidatePath } from "next/cache";
import { getAdminActor, parseId } from "@/server/admin/actor";
import { addGroupMember, insertGroup, removeGroupMember, updateGroup } from "@/lib/db/repositories/groups.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { withTransaction } from "@/lib/db/transaction";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Approver groups (S3-06). Changes apply to steps that start from now on;
// open tasks keep the approvers they were given.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function saveGroupAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const id = parseId(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 150) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Enter a name." } };
  if (id === null && !/^[A-Z0-9_-]{2,50}$/.test(code)) return { ok: false, message: "Check the highlighted fields.", fieldErrors: { code: "Letters, numbers, dash or underscore." } };
  try {
    await withTransaction(async (connection) => {
      if (id === null) {
        const newId = await insertGroup({ code, name, createdBy: actor.id }, connection);
        await recordAudit({ actorUserId: actor.id, action: "GROUP_CREATED", entityType: "GROUP", entityId: newId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { code, name } }, connection);
      } else {
        const active = formData.get("active") === "on";
        await updateGroup(id, { name, active }, connection);
        await recordAudit({ actorUserId: actor.id, action: "GROUP_UPDATED", entityType: "GROUP", entityId: id, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { name, active } }, connection);
      }
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") return { ok: false, message: "Check the highlighted fields.", fieldErrors: { code: "This code is already used." } };
    logError("saveGroupAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/groups");
  return { ok: true, message: "Saved." };
}

export async function groupMemberAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await getAdminActor();
  if (!actor) return NOT_FOUND;
  const groupId = parseId(formData.get("groupId"));
  const userId = parseId(formData.get("userId"));
  const command = formData.get("command");
  if (groupId === null || userId === null || (command !== "add" && command !== "remove")) return { ok: false, message: "Choose a person." };
  try {
    await withTransaction(async (connection) => {
      if (command === "add") await addGroupMember(groupId, userId, actor.id, connection);
      else await removeGroupMember(groupId, userId, connection);
      await recordAudit(
        { actorUserId: actor.id, action: command === "add" ? "GROUP_MEMBER_ADDED" : "GROUP_MEMBER_REMOVED", entityType: "GROUP", entityId: groupId, sessionId: actor.sessionId, ipAddress: actor.ipAddress, metadata: { userId } },
        connection,
      );
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "ER_NO_REFERENCED_ROW_2") return { ok: false, message: "That person or group no longer exists." };
    logError("groupMemberAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/admin/groups");
  return { ok: true, message: command === "add" ? "Added." : "Removed." };
}
