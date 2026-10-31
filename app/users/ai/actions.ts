"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { featureOn } from "@/server/settings/features";
import { askAssistant } from "@/server/ai/assistant";
import { draftTaskDescription } from "@/server/ai/task-draft";
import { decide } from "@/server/ai/proposals";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// D-169 (AI module branch): the assistant and proposal decisions. Each checks
// the session, the AI module and the page's access rule on the server.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

async function userForAi(page: string) {
  try {
    const session = await requireApiArea("users", { change: true, page });
    return (await featureOn("ai", session.user)) ? session : null;
  } catch {
    return null;
  }
}

export async function askAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await userForAi("users.ai_assistant");
  if (!session) return NOT_FOUND;
  const raw = formData.get("conversationId");
  const conversationId = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  try {
    const result = await askAssistant(
      {
        id: session.user.id,
        roles: session.user.roles,
        modules: session.user.modules,
        chatModes: session.user.chatModes,
        salesforceScope: session.user.salesforceScope,
        name: session.user.name,
        email: session.user.email,
        sessionId: session.sessionId,
      },
      {
        conversationId,
        mode: (String(formData.get("mode") ?? "") || null) as never,
        question: String(formData.get("question") ?? ""),
        requestKey: typeof formData.get("requestKey") === "string" ? String(formData.get("requestKey")) : null,
      },
    );
    revalidatePath("/users/ai", "layout");
    if (!result.ok) return { ok: false, message: result.message, data: result.conversationId ? { conversationId: result.conversationId } : undefined };
    return { ok: true, data: { conversationId: result.conversationId } };
  } catch (error) {
    logError("askAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// D-238: the Draft task's sparkle. Pico Bot's switch and access, its own limits.
export async function draftTaskTextAction(input: { title: string; description: string }): Promise<ActionResult & { text?: string }> {
  const session = await userForAi("users.ai_assistant");
  if (!session) return NOT_FOUND;
  try {
    const result = await draftTaskDescription(
      { id: session.user.id, roles: session.user.roles, modules: session.user.modules, chatModes: session.user.chatModes, salesforceScope: session.user.salesforceScope, sessionId: session.sessionId },
      { title: String(input?.title ?? ""), description: String(input?.description ?? "") },
    );
    return result.ok ? { ok: true, message: "Pico Bot wrote a description. Check it before you create the task.", text: result.text } : { ok: false, message: result.message };
  } catch (error) {
    logError("draftTaskTextAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function decideProposalAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await userForAi("users.ai_insights");
  if (!session) return NOT_FOUND;
  const id = Number(formData.get("proposalId"));
  const version = Number(formData.get("version"));
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : formData.get("decision") === "REJECTED" ? "REJECTED" : null;
  const contentHash = String(formData.get("contentHash") ?? "");
  if (!Number.isInteger(id) || !Number.isInteger(version) || !decision || !/^[0-9a-f]{64}$/.test(contentHash)) return NOT_FOUND;
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 500) || null;
  try {
    const result = await decide({ id: session.user.id, roles: session.user.roles, sessionId: session.sessionId }, { proposalId: id, version, contentHash, decision, note });
    revalidatePath("/users/ai/insights");
    return result.ok ? { ok: true, message: decision === "APPROVED" ? "Approved. Nothing is carried out automatically: act on it yourself." : "Rejected." } : { ok: false, message: result.message };
  } catch (error) {
    logError("decideProposalAction failed", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
