"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { getActionContext } from "@/lib/http/request-context";
import { loadDemoData, retireDemoStaff, startDemoSession } from "@/server/demo/service";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/session/constants";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// /superadmin/demo (S6-02a, F-57, D-071). Super Admin only.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

async function superAdmin() {
  try {
    const session = await requireApiArea("superadmin");
    return { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId };
  } catch {
    return null;
  }
}

export async function loadDemoAction(): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  try {
    const report = await loadDemoData(actor);
    revalidatePath("/superadmin/demo");
    const made = [
      report.people && `${report.people} people`,
      report.departments && `${report.departments} departments`,
      report.designations && `${report.designations} designations`,
      report.groups && `${report.groups} groups`,
      report.workflows.length && `${report.workflows.length} approval types`,
    ].filter(Boolean);
    const message = made.length ? `Loaded ${made.join(", ")}.` : "Everything was already loaded; nothing changed.";
    if (report.problems.length) return { ok: false, message: `${message} Needs attention: ${report.problems.join(" ")}` };
    return { ok: true, message };
  } catch (error) {
    logError("loadDemoAction failed", error);
    return { ok: false, message: "Couldn't load the demo data. Please try again." };
  }
}

export async function retireDemoAction(): Promise<ActionResult> {
  const actor = await superAdmin();
  if (!actor) return NOT_FOUND;
  try {
    const result = await retireDemoStaff(actor);
    revalidatePath("/superadmin/demo");
    const pending = result.pendingTasks ? ` ${result.pendingTasks} pending approval(s) were with them and are now blocked; IT has to hand them over.` : "";
    return { ok: true, message: `${result.retired} demo people made inactive.${pending}` };
  } catch (error) {
    logError("retireDemoAction failed", error);
    return { ok: false, message: "Couldn't retire the demo staff. Please try again." };
  }
}

export async function tryAsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const actor = await superAdmin();
  const raw = formData.get("userId");
  const userId = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  if (!actor || userId === null) return NOT_FOUND;
  try {
    const context = await getActionContext();
    const result = await startDemoSession(userId, { ...actor, ipAddress: context.ipAddress, userAgent: context.userAgent });
    if (!result.ok) return { ok: false, message: result.message };
    (await cookies()).set(SESSION_COOKIE_NAME, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  } catch (error) {
    logError("tryAsAction failed", error);
    return { ok: false, message: "Couldn't switch. Please try again." };
  }
  redirect("/users");
}
