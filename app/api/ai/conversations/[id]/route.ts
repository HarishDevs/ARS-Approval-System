import { apiError, apiSuccess } from "@/lib/http/api-response";
import { aiAccess, messageView } from "@/server/ai/api";
import { requireApiArea } from "@/server/authorization/guards";
import { conversationMode, deleteConversation, listMessages } from "@/lib/db/repositories/ai.repository";
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await guard(true);
  const id = await idOf(params);
  if (!access || id === null) return apiError("NOT_FOUND", "Not found.", 404);
  if (!(await deleteConversation(access.session.user.id, id))) return apiError("NOT_FOUND", "Not found.", 404);
  await recordAudit({ actorUserId: access.session.user.id, action: "AI_CONVERSATION_DELETED", entityType: "AI_CONVERSATION", entityId: id, sessionId: access.session.sessionId });
  return apiSuccess({ deleted: true });
}
