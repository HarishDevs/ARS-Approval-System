import "server-only";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { overLimit } from "@/server/security/limits";
import { loadAiSettings, routeFor } from "@/server/ai/config";
import { chat, ProviderError } from "@/server/ai/providers";
import { friendlyError } from "@/server/ai/friendly";
import { aiGate, LimitError } from "@/server/ai/limits";
import { chatAccess } from "@/server/ai/policy";
import type { ChatPerson } from "@/server/ai/chat-access";
import { logError } from "@/lib/logging/logger";

// D-238 (owner's Asana screenshot: ✨ in the Draft task): Pico Bot writes or
// tidies a task description from its name and what was typed. Only that
// text goes to the AI provider (no business data, no lookups), under the
// same switch, access, limits and audit as the assistant. Nothing is saved:
// the person sees the text in the description and decides.
export type DraftPerson = ChatPerson & { id: number; sessionId?: string };
export type DraftResult = { ok: true; text: string } | { ok: false; message: string };

const SYSTEM = [
  "You help people at ARS Green Steel write task descriptions.",
  "Write the description for the task below in plain, short English: what to do, any steps as a '- ' list, and what done looks like.",
  "Keep every fact, name, number and date the person gave; never invent new ones. Keep any @[Name](user:id) text exactly as it is.",
  "Use only **bold**, _italic_ and '- ' or '1. ' lists for formatting. No headings, no tables, no greeting, no sign-off. At most 120 words.",
].join(" ");

export async function draftTaskDescription(person: DraftPerson, input: { title: string; description: string }, fetchImpl?: typeof fetch): Promise<DraftResult> {
  const { policy, modes } = await chatAccess(person);
  if (policy.emergencyStop) return { ok: false, message: "Pico Bot is switched off for now." };
  if (!modes.length) return { ok: false, message: "Pico Bot isn't available to you." };
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 200);
  const description = input.description.trim();
  if (!title && !description) return { ok: false, message: "Write the task's name first." };
  const settings = await loadAiSettings();
  if (title.length + description.length > settings.maxQuestionChars) return { ok: false, message: `Keep it under ${settings.maxQuestionChars} characters.` };
  if (await overLimit(`ai-draft:${person.id}`, 6)) return { ok: false, message: "You're asking very quickly. Wait a minute and try again." };
  const route = routeFor(settings, false);
  if (!route.length) return { ok: false, message: "No AI provider is set up yet. The Super Admin sets one up in AI settings." };

  let release: () => void;
  try {
    release = await aiGate.acquire(person.id, { perPerson: 2, global: 10 });
  } catch (error) {
    if (error instanceof LimitError) return { ok: false, message: error.message };
    throw error;
  }
  try {
    let lastError: ProviderError | null = null;
    for (const provider of route) {
      try {
        const answer = await chat(
          settings.configs[provider]!,
          {
            system: SYSTEM,
            turns: [{ role: "user", content: `Task name: ${title || "(none yet)"}\nWhat they wrote so far:\n${description || "(nothing yet)"}` }],
            tools: [],
            maxTokens: 600,
            timeoutMs: settings.timeoutMs,
          },
          fetchImpl,
        );
        const text = answer.text.trim().slice(0, 4000);
        if (!text) throw new ProviderError("UNAVAILABLE", "The answer was empty.", true);
        await recordAudit({ actorUserId: person.id, action: "AI_TASK_DRAFTED", entityType: "TASK", entityId: null, sessionId: person.sessionId, metadata: { provider, model: answer.model } });
        return { ok: true, text };
      } catch (error) {
        if (!(error instanceof ProviderError)) {
          logError("AI task draft failed", error, { provider });
          lastError = new ProviderError("UNAVAILABLE", "Something went wrong while writing.", true);
        } else lastError = error;
        if (!lastError.retryable) break;
      }
    }
    await recordAudit({ actorUserId: person.id, action: "AI_TASK_DRAFT_FAILED", entityType: "TASK", entityId: null, result: "FAILURE", sessionId: person.sessionId, metadata: { kind: lastError?.kind ?? "UNKNOWN" } });
    return { ok: false, message: friendlyError(lastError?.message) };
  } finally {
    release();
  }
}
