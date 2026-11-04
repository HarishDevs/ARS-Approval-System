"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiArea } from "@/server/authorization/guards";
import { getActionContext } from "@/lib/http/request-context";
import { deleteRequest } from "@/server/approvals/delete";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// Super Admin only (D-086). Anyone else gets "Not found."
export async function deleteRequestAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const id = String(formData.get("requestId") ?? "");
  if (!/^\d+$/.test(id)) return { ok: false, message: "Not found." };
  // From the request page itself: go to the Deleted list on the server, since
  // the page being left is now a 404.
  const next = String(formData.get("next") ?? "");
  let deletedNo: string;
  try {
    const { ipAddress } = await getActionContext();
    const result = await deleteRequest(
      { requestId: Number(id), reason: String(formData.get("reason") ?? "") },
      { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId, ipAddress },
    );
    if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors };
    revalidatePath("/superadmin/requests");
    revalidatePath("/admin");
    deletedNo = result.value.requestNo;
  } catch (error) {
    logError("deleteRequestAction failed", error);
    return { ok: false, message: "Couldn't delete. Please try again." };
  }
  // redirect() throws on purpose, so it stays outside the try/catch.
  if (next === "/superadmin/requests?tab=deleted") redirect(next);
  return { ok: true, message: `${deletedNo} deleted.`, data: { requestNo: deletedNo } };
}

// v1.49.5 (owner: "add select and Delete"): delete the ticked requests with
// one reason. Each one goes through deleteRequest (its own transaction, legal
// hold check and audit record), so one that can't be deleted doesn't stop the rest.
const BULK_DELETE_LIMIT = 100; // a "use server" file exports only actions
export async function deleteRequestsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const ids = [...new Set(formData.getAll("ids").map(String))].filter((id) => /^\d+$/.test(id)).map(Number);
  if (ids.length === 0) return { ok: false, message: "Tick at least one request." };
  if (ids.length > BULK_DELETE_LIMIT) return { ok: false, message: `Delete up to ${BULK_DELETE_LIMIT} requests at a time.` };
  const reason = String(formData.get("reason") ?? "");
  if (reason.trim().length < 5) return { ok: false, message: "Give a reason of at least 5 characters.", fieldErrors: { reason: "Give a reason of at least 5 characters." } };
  const deleted: string[] = [];
  const failed: string[] = [];
  try {
    const { ipAddress } = await getActionContext();
    for (const requestId of ids) {
      const result = await deleteRequest({ requestId, reason }, { id: session.user.id, roles: session.user.roles, sessionId: session.sessionId, ipAddress }).catch((error: unknown) => {
        logError("bulk delete: one request failed", error);
        return { ok: false as const, message: "Couldn't delete." };
      });
      if (result.ok) deleted.push(result.value.requestNo);
      else failed.push(result.message);
    }
  } catch (error) {
    logError("deleteRequestsAction failed", error);
    return { ok: false, message: "Couldn't delete. Please try again." };
  }
  if (deleted.length) {
    revalidatePath("/superadmin/requests");
    revalidatePath("/admin");
  }
  const done = `${deleted.length} request${deleted.length === 1 ? "" : "s"} deleted.`;
  if (!failed.length) return { ok: true, message: done, data: { deleted: deleted.length } };
  const why = [...new Set(failed)].join(" ");
  return { ok: deleted.length > 0, message: `${deleted.length ? `${done} ` : ""}${failed.length} couldn't be deleted: ${why}`, data: { deleted: deleted.length } };
}
