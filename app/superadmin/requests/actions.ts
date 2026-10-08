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
