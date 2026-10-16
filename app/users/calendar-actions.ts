"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { chooseCalendar, createPersonalItem, deletePersonalItem, disconnect, editPersonalItem, resolveConflict, syncNow } from "@/server/calendar/service";
import { connectionByUser } from "@/lib/db/repositories/gcal.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.11.0: the person's own calendar connection and entries. Everything is
// about the signed-in person only: ids from the form are checked against
// them on the server.
const PROFILE = "/users/profile/calendar";

async function me(page: string) {
  try {
    const session = await requireApiArea("users", { page });
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId };
  } catch {
    return null;
  }
}

const id = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);

export async function connectionCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await me("users.profile");
  if (!actor) return { ok: false, message: "Not found." };
  const command = String(formData.get("command") ?? "");
  try {
    if (command === "sync") {
      const result = await syncNow(actor);
      if (!result.ok) return { ok: false, message: result.message };
      revalidatePath(PROFILE);
      return { ok: true, message: "Sync started. Refresh in a moment to see the result." };
    }
    if (command === "calendar") {
      const result = await chooseCalendar(actor, String(formData.get("calendarId") ?? ""));
      if (!result.ok) return { ok: false, message: result.message };
      revalidatePath(PROFILE);
      return { ok: true, message: "Calendar chosen. A full sync is queued." };
    }
    if (command === "disconnect") {
      const connection = await connectionByUser(actor.id);
      if (!connection) return { ok: false, message: "Not connected." };
      const result = await disconnect(actor, connection.id, { removeEvents: formData.get("removeEvents") === "on", revokedByAdmin: false });
      if (!result.ok) return { ok: false, message: result.message };
      revalidatePath(PROFILE);
      return { ok: true, message: result.value.removed ? `Disconnected. ${result.value.removed} ARS event(s) removed from your Google Calendar.` : "Disconnected. Your Google access is revoked." };
    }
    if (command === "resolve") {
      const conflictId = id(formData.get("conflictId"));
      const resolution = String(formData.get("resolution") ?? "");
      if (conflictId === null || !["KEEP_ARS", "KEEP_GOOGLE", "DISMISSED"].includes(resolution)) return { ok: false, message: "Not found." };
      const result = await resolveConflict(actor, conflictId, resolution as "KEEP_ARS");
      if (!result.ok) return { ok: false, message: result.message };
      revalidatePath(PROFILE);
      return { ok: true, message: "Resolved. The choice syncs shortly." };
    }
    return { ok: false, message: "Not found." };
  } catch (error) {
    logError("connectionCommandAction failed", error, { command });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}

function itemInput(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    allDay: formData.get("allDay") === "on",
    date: String(formData.get("date") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    start: String(formData.get("start") ?? ""),
    end: String(formData.get("end") ?? ""),
  };
}

export async function saveCalendarItemAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await me("users.calendar");
  if (!actor) return { ok: false, message: "Not found." };
  const itemId = id(formData.get("itemId"));
  try {
    const result = itemId === null ? await createPersonalItem(actor, itemInput(formData)) : await editPersonalItem(actor, itemId, itemInput(formData));
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: "fieldErrors" in result ? result.fieldErrors : undefined };
  } catch (error) {
    logError("saveCalendarItemAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/users/calendar");
  if (itemId !== null) redirect(`/users/calendar?date=${encodeURIComponent(String(formData.get("date") ?? ""))}&view=day`);
  return { ok: true, message: "Added to your calendar." };
}

export async function deleteCalendarItemAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await me("users.calendar");
  const itemId = id(formData.get("itemId"));
  if (!actor || itemId === null) return { ok: false, message: "Not found." };
  try {
    const result = await deletePersonalItem(actor, itemId);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    logError("deleteCalendarItemAction failed", error);
    return { ok: false, message: "Couldn't delete. Please try again." };
  }
  revalidatePath("/users/calendar");
  redirect("/users/calendar");
}
