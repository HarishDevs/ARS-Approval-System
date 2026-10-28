"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { setUserSetting } from "@/lib/db/repositories/user-settings.repository";
import { parseWorkspaceView, VIEW_LABEL, WORKSPACE_VIEW_SETTING } from "@/server/ui/workspace-view";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// D-210: saves the person's workspace view (Compact or Classic) on their account.
export async function saveWorkspaceViewAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return { ok: false, message: "Not found." };
  }
  const view = parseWorkspaceView(String(formData.get("view") ?? ""));
  try {
    await setUserSetting(session.user.id, WORKSPACE_VIEW_SETTING, view);
  } catch (error) {
    logError("saveWorkspaceViewAction failed", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `${VIEW_LABEL[view]} view saved.`, data: { view } };
}
