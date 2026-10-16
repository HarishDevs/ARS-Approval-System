"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { adminFullResync, adminRetryJob, disconnect, resolveConflict, saveConfiguration, setIntegrationEnabled, setMaintenance, testConfiguration } from "@/server/calendar/service";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// v1.11.0: Super Admin → Integrations → Google Calendar. Super Admin only;
// every service call checks the role again and audits the change.
const PAGE = "/superadmin/integrations/google-calendar";

async function superAdmin() {
  try {
    const session = await requireApiArea("superadmin");
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId };
  } catch {
    return null;
  }
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const flag = (formData: FormData, name: string) => formData.get(name) === "on";
const int = (formData: FormData, name: string) => Number.parseInt(text(formData, name), 10);
const id = (value: string) => (/^\d{1,10}$/.test(value) ? Number(value) : null);

export async function saveCalendarConfigAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return { ok: false, message: "Not found." };
  try {
    const result = await saveConfiguration(actor, {
      clientId: text(formData, "clientId"),
      clientSecret: text(formData, "clientSecret"),
      config: {
        allowConnections: flag(formData, "allowConnections"),
        allowCalendarChoice: flag(formData, "allowCalendarChoice"),
        calendarPolicy: text(formData, "calendarPolicy") as never,
        direction: text(formData, "direction") as never,
        modules: { approvalDue: flag(formData, "approvalDue"), neededBy: flag(formData, "neededBy"), taskDue: flag(formData, "taskDue"), infoEvents: flag(formData, "infoEvents"), personal: flag(formData, "personal") },
        privacy: text(formData, "privacy") as never,
        titleTemplate: text(formData, "titleTemplate"),
        descriptionTemplate: text(formData, "descriptionTemplate"),
        timezone: text(formData, "timezone"),
        intervalMinutes: int(formData, "intervalMinutes"),
        retryMax: int(formData, "retryMax"),
        conflictPolicy: text(formData, "conflictPolicy") as never,
        arsDeletion: text(formData, "arsDeletion") as never,
        googleDeletion: text(formData, "googleDeletion") as never,
        importWindowDays: int(formData, "importWindowDays"),
        alertOnFailure: flag(formData, "alertOnFailure"),
      },
    });
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath(PAGE);
    return { ok: true, message: result.value.secretChanged ? "Saved. The new client secret is stored encrypted. Test the set-up again." : "Saved. Changes apply from the next sync." };
  } catch (error) {
    logError("saveCalendarConfigAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
}

export async function calendarCommandAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return { ok: false, message: "Not found." };
  const command = text(formData, "command");
  try {
    let message = "Done.";
    if (command === "test") {
      const result = await testConfiguration(actor);
      if (!result.ok) return { ok: false, message: result.message };
      message = result.value.ok ? "Every check passed. You can enable the integration." : `Some checks failed: ${result.value.checks.filter((check) => !check.ok).map((check) => check.message).join(" ")}`;
      revalidatePath(PAGE);
      return { ok: result.value.ok, message };
    }
    if (command === "enable" || command === "disable") {
      const result = await setIntegrationEnabled(actor, command === "enable");
      if (!result.ok) {
        revalidatePath(PAGE);
        return { ok: false, message: result.message };
      }
      message = command === "enable" ? "Enabled. People can now connect their Google Calendar from their profile." : "Disabled. Syncing has stopped; connections are kept.";
    } else if (command === "maintenance-on" || command === "maintenance-off") {
      const result = await setMaintenance(actor, command === "maintenance-on");
      if (!result.ok) return { ok: false, message: result.message };
      message = command === "maintenance-on" ? "Maintenance mode on: syncing is paused." : "Maintenance mode off: syncing resumes.";
    } else if (command === "retry" || command === "retry-all") {
      const jobId = id(text(formData, "jobId"));
      if (command === "retry" && jobId === null) return { ok: false, message: "Not found." };
      const result = await adminRetryJob(actor, command === "retry-all" ? "ALL" : jobId!);
      if (!result.ok) return { ok: false, message: result.message };
      message = result.value.queued ? `Queued ${result.value.queued} sync(s) to run again.` : "Nothing to retry.";
    } else if (command === "revoke" || command === "resync") {
      const connectionId = id(text(formData, "connectionId"));
      if (connectionId === null) return { ok: false, message: "Not found." };
      const result = command === "revoke" ? await disconnect(actor, connectionId, { removeEvents: false, revokedByAdmin: true }) : await adminFullResync(actor, connectionId);
      if (!result.ok) return { ok: false, message: result.message };
      message = command === "revoke" ? "Connection revoked. Their tokens are deleted; they can connect again if allowed." : "A full resync is queued.";
    } else if (command === "resolve") {
      const conflictId = id(text(formData, "conflictId"));
      const resolution = text(formData, "resolution");
      if (conflictId === null || !["KEEP_ARS", "KEEP_GOOGLE", "DISMISSED"].includes(resolution)) return { ok: false, message: "Not found." };
      const result = await resolveConflict(actor, conflictId, resolution as "KEEP_ARS");
      if (!result.ok) return { ok: false, message: result.message };
      message = "Resolved.";
    } else return { ok: false, message: "Not found." };
    revalidatePath(PAGE);
    return { ok: true, message };
  } catch (error) {
    logError("calendarCommandAction failed", error, { command });
    return { ok: false, message: "Couldn't do that. Please try again." };
  }
}
