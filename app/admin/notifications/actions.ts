"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { audienceIsEmpty, audienceSchema, broadcastSchema, previewAudience, sendBroadcast } from "@/server/notifications/broadcast";
import { getActionContext } from "@/lib/http/request-context";
import { overLimit } from "@/server/security/limits";
import { logError } from "@/lib/logging/logger";

// D-252: Admin → Notifications. IT Admin and Super Admin only (the admin
// area), checked here on the server for every call.

export async function previewBroadcastAction(raw: unknown): Promise<{ ok: boolean; people?: number; devices?: number; message?: string }> {
  try {
    await requireApiArea("admin", { change: false });
  } catch {
    return { ok: false, message: "Not found." };
  }
  const parsed = audienceSchema.safeParse(raw);
  if (!parsed.success || audienceIsEmpty(parsed.data)) return { ok: false, message: "Choose who it goes to." };
  return { ok: true, ...(await previewAudience(parsed.data)) };
}

export async function sendBroadcastAction(raw: unknown): Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string> }> {
  let session;
  try {
    session = await requireApiArea("admin");
  } catch {
    return { ok: false, message: "Not found." };
  }
  // A slip of the finger mustn't send the same notice to everyone twice.
  if (await overLimit(`broadcast:${session.user.id}`, 5)) return { ok: false, message: "You've sent 5 in the last minute. Wait a minute before sending another." };
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, message: "Some values need attention.", fieldErrors };
  }
  if (audienceIsEmpty(parsed.data.audience)) return { ok: false, message: "Choose who it goes to.", fieldErrors: { audience: "Choose who it goes to." } };
  try {
    const { ipAddress } = await getActionContext();
    const result = await sendBroadcast(parsed.data, { id: session.user.id, sessionId: session.sessionId, ipAddress });
    revalidatePath("/admin/notifications");
    return { ok: true, message: `Sent to ${result.recipients} ${result.recipients === 1 ? "person" : "people"}. It's in their Inbox now; devices get it within a minute.` };
  } catch (error) {
    if ((error as Error).message === "NO_RECIPIENTS") return { ok: false, message: "Nobody active matches that audience." };
    logError("sendBroadcastAction failed", error);
    return { ok: false, message: "Couldn't send. Please try again." };
  }
}
