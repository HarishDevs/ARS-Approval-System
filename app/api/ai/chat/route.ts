import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { aiAccess, messageView } from "@/server/ai/api";
import { requireApiArea } from "@/server/authorization/guards";
import { askAssistant } from "@/server/ai/assistant";
import { listMessages } from "@/lib/db/repositories/ai.repository";
import { CHAT_MODES, type ChatMode } from "@/server/ai/chat-access";
import { logError } from "@/lib/logging/logger";

// D-172: ask Pic bot a question (the floating panel). The browser can cancel
// (Stop, or closing the panel), and the provider request is then aborted too.
// Who is asking, their modes and the conversation's owner all come from the
// server session, never from the request body.
export const dynamic = "force-dynamic";

// Session, user area, AI module and page rule, then the person's chat modes now.
async function guard(change: boolean) {
  try {
    return await aiAccess(await requireApiArea("users", { change, page: "users.ai_assistant" }));
  } catch {
    return null;
  }
}

const schema = z.object({
  conversationId: z.number().int().positive().nullable(),
  mode: z.enum(["GENERAL", "APPROVAL", "TASK", "INFORMATION", "SALESFORCE", "COMBINED"]).nullable().optional(),
  question: z.string().max(20_000),
  requestKey: z.string().uuid(),
});

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  NO_ACCESS: 403,
  MODE_DENIED: 403,
  MODE_REVOKED: 403,
  LEGACY: 409,
  STOPPED: 503,
  RATE_LIMITED: 429,
  DAILY_LIMIT: 429,
  PERSON_BUSY: 429,
  SERVER_BUSY: 503,
  IN_PROGRESS: 409,
  NO_PROVIDER: 503,
  TOO_LONG: 413,
  EMPTY: 400,
  CANCELLED: 499,
};

export async function POST(request: NextRequest) {
  const access = await guard(true);
  if (!access) return apiError("NOT_FOUND", "Not found.", 404);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_FAILED", "That request wasn't valid.", 400);
  const user = access.session.user;
  const mode = (parsed.data.mode ?? null) as ChatMode | null;
  if (mode !== null && !CHAT_MODES.includes(mode)) return apiError("VALIDATION_FAILED", "That request wasn't valid.", 400);
  try {
    const result = await askAssistant(
      { id: user.id, roles: user.roles, modules: user.modules, chatModes: user.chatModes, salesforceScope: user.salesforceScope, name: user.name, email: user.email, sessionId: access.session.sessionId },
      { conversationId: parsed.data.conversationId, mode, question: parsed.data.question, requestKey: parsed.data.requestKey, signal: request.signal },
    );
    const conversationId = result.conversationId ?? null;
    const messages = conversationId ? (await listMessages(user.id, conversationId)).map(messageView) : [];
    if (!result.ok) {
      const status = STATUS[result.code ?? ""] ?? 502;
      return Response.json(
        { success: false, error: { code: result.code ?? "FAILED", message: result.message }, data: { conversationId, messages } },
        { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "60" } : {}) } },
      );
    }
    return apiSuccess({ conversationId, duplicate: Boolean(result.duplicate), messages });
  } catch (error) {
    logError("Pico Bot chat failed", error);
    return apiError("FAILED", "Something went wrong. Please try again.", 500);
  }
}
