import { apiError, apiSuccess } from "@/lib/http/api-response";
import { aiAccess, messageView } from "@/server/ai/api";
import { requireApiArea } from "@/server/authorization/guards";
import { conversationMode, deleteConversation, listMessages, pinConversation, renameConversation } from "@/lib/db/repositories/ai.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { ChatMode } from "@/server/ai/chat-access";

// D-172: one of the person's own conversations (another person's id: 404).
export const dynamic = "force-dynamic";

// Session, user area, AI module and page rule, then the person's chat modes now.
async function guard(change: boolean) {
  try {
    return await aiAccess(await requireApiArea("users", { change, page: "users.ai_assistant" }));
  } catch {
    return null;
  }
}

async function idOf(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  return /^\d{1,12}$/.test(id) ? Number(id) : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(false);
  const id = await idOf(params);
  if (!access || id === null) return apiError("NOT_FOUND", "Not found.", 404);
  const mode = await conversationMode(access.session.user.id, id);
  if (mode === null) return apiError("NOT_FOUND", "Not found.", 404);
  const messages = await listMessages(access.session.user.id, id);
  return apiSuccess({ id, mode, usable: access.modes.includes(mode as ChatMode), messages: messages.map(messageView) });
}

// D-182: rename or pin one of the person's own chats.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(true);
  const id = await idOf(params);
  if (!access || id === null) return apiError("NOT_FOUND", "Not found.", 404);
  const body = (await request.json().catch(() => null)) as { title?: unknown; pinned?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim() : null;
  const pinned = typeof body?.pinned === "boolean" ? body.pinned : null;
  if ((title === null && pinned === null) || (title !== null && (title.length < 1 || title.length > 200))) return apiError("VALIDATION_ERROR", "Give the chat a name of 1 to 200 characters.", 400);
  const userId = access.session.user.id;
  const done = title !== null ? await renameConversation(userId, id, title) : await pinConversation(userId, id, pinned!);
  if (!done) return apiError("NOT_FOUND", "Not found.", 404);
  await recordAudit({ actorUserId: userId, action: title !== null ? "AI_CONVERSATION_RENAMED" : pinned ? "AI_CONVERSATION_PINNED" : "AI_CONVERSATION_UNPINNED", entityType: "AI_CONVERSATION", entityId: id, sessionId: access.session.sessionId });
  return apiSuccess({ id, title, pinned });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(true);
  const id = await idOf(params);
  if (!access || id === null) return apiError("NOT_FOUND", "Not found.", 404);
  if (!(await deleteConversation(access.session.user.id, id))) return apiError("NOT_FOUND", "Not found.", 404);
  await recordAudit({ actorUserId: access.session.user.id, action: "AI_CONVERSATION_DELETED", entityType: "AI_CONVERSATION", entityId: id, sessionId: access.session.sessionId });
  return apiSuccess({ deleted: true });
}
