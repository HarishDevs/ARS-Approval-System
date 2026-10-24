import { apiError, apiSuccess } from "@/lib/http/api-response";
import { aiAccess } from "@/server/ai/api";
import { requireApiArea } from "@/server/authorization/guards";
import { listConversations } from "@/lib/db/repositories/ai.repository";
import { MODE_LABEL, offerOrder, type ChatMode } from "@/server/ai/chat-access";

// D-172: the person's own conversations and the chat modes they may use now.
export const dynamic = "force-dynamic";

// Session, user area, AI module and page rule, then the person's chat modes now.
async function guard(change: boolean) {
  try {
    return await aiAccess(await requireApiArea("users", { change, page: "users.ai_assistant" }));
  } catch {
    return null;
  }
}

export async function GET() {
  const access = await guard(false);
  if (!access) return apiError("NOT_FOUND", "Not found.", 404);
  const conversations = await listConversations(access.session.user.id, 30);
  return apiSuccess({
    stopped: access.stopped,
    modes: offerOrder(access.modes).map((mode) => ({ mode, label: MODE_LABEL[mode] })),
    conversations: conversations.map((item) => ({ id: item.id, title: item.title, mode: item.mode, updatedAt: item.updatedAt.toISOString(), usable: access.modes.includes(item.mode as ChatMode) })),
  });
}
