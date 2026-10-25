import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAiPage } from "@/features/ai/guard";
import { ProviderNotice } from "@/features/ai/AiParts";
import { AssistantForm } from "@/features/ai/AssistantForm";
import { CopyAnswer } from "@/features/ai/CopyAnswer";
import { RichAnswer } from "@/features/ai/RichAnswer";
import { Hint } from "@/features/ui/Hint";
import { listMessages, ownsConversation, questionsToday, type AiMessage } from "@/lib/db/repositories/ai.repository";
import { loadAiSettings, routeFor } from "@/server/ai/config";
import { chatAccess } from "@/server/ai/policy";
import { MODE_LABEL, offerOrder, type ChatMode } from "@/server/ai/chat-access";
import { PROVIDER_LABEL, type ProviderCode } from "@/server/ai/providers";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { friendlyError } from "@/server/ai/friendly";

export const metadata: Metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

// D-169, D-178, D-180: the assistant as a conversation, like a chat app (the
// person's chats are in the sidebar's AI Assistant group).
// Answers come from approved tools only. The technical detail (sources,
// provider, time read, any figure Pic bot calculated) sits in a hover hint.
// The conversation is the person's own: another person's id shows nothing.
const SUGGESTIONS: Partial<Record<ChatMode, string[]>> = {
  APPROVAL: ["What needs my attention today?", "Which approvals have waited longest?"],
  TASK: ["Which of my tasks are overdue?", "Summarise my week's tasks"],
  INFORMATION: ["What's unread in my inbox?"],
  SALESFORCE: ["Give me a sales dashboard for this quarter", "How are our opportunities split by stage?"],
  GENERAL: ["Draft a polite follow-up email"],
};

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { user } = await requireAiPage();
  const raw = (await searchParams).c;
  const requested = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const conversationId = requested !== null && (await ownsConversation(user.id, requested)) ? requested : null;
  const [settings, messages, used, chat] = await Promise.all([loadAiSettings(), conversationId ? listMessages(user.id, conversationId) : Promise.resolve([]), questionsToday(user.id), chatAccess(user)]);
  const route = routeFor(settings, false);
  const enabled = route.length > 0 && chat.modes.length > 0;
  const modeOptions = offerOrder(chat.modes).map((mode) => ({ mode, label: MODE_LABEL[mode] }));
  const suggestions = offerOrder(chat.modes).flatMap((mode) => SUGGESTIONS[mode] ?? []).slice(0, 4);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const about = enabled
    ? `Answered by ${PROVIDER_LABEL[route[0] as ProviderCode]}${route[1] ? ` (or ${PROVIDER_LABEL[route[1] as ProviderCode]})` : ""}. Figures come from your data; Pico Bot can't approve, send or change anything.`
    : "";

  const remaining = Math.max(0, settings.dailyQuestions - used);
  const providerName = route[0] ? PROVIDER_LABEL[route[0] as ProviderCode] : null;
  const initials = firstName.slice(0, 1).toUpperCase() + (user.name.split(" ")[1]?.slice(0, 1).toUpperCase() ?? "");

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col" aria-label="AI Assistant">
      <h1 className="sr-only">AI Assistant</h1>
      {/* D-180 (owner's sketch): new chat, the day's limit and the connection, in one strip. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-label" data-testid="ai-strip">
        <Link href="/users/ai/assistant" className="btn-secondary btn-compact">
          <Plus aria-hidden="true" className="h-4 w-4" /> New chat
        </Link>
        {enabled && (
          <span className="inline-flex items-center gap-3 rounded-full border border-line px-3 py-1.5" title="Questions you can ask today; the limit resets at midnight" data-testid="ai-limit">
            <span className="text-ink-muted">AI limit</span>
            <span>
              Used <strong className="tabular-nums">{used}</strong>
            </span>
            <span>
              Remaining <strong className="tabular-nums">{remaining}</strong>
            </span>
            <span>
              Total <strong className="tabular-nums">{settings.dailyQuestions}</strong>
            </span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5" data-testid="ai-connection">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${enabled ? "bg-success-solid" : "bg-ink-faint"}`} />
          {enabled ? `Connected${providerName ? ` · ${providerName}` : ""}` : "Not connected"}
          {chat.policy.salesforceConnected && chat.modes.includes("SALESFORCE") ? " · Salesforce" : ""}
          {about && <Hint text={about} align="end" />}
        </span>
      </div>

      {requested !== null && conversationId === null && (
        <p role="alert" className="mb-4 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
          That conversation isn&apos;t available.
        </p>
      )}
      {!enabled && (route.length === 0 ? <ProviderNotice isSuperAdmin={user.roles.includes("SUPER_ADMIN")} /> : <p className="text-label text-ink-muted">No Pico Bot chat is available to you. Ask IT.</p>)}

      {enabled && messages.length === 0 && conversationId === null && (
        <div className="py-10 text-center">
          <p className="text-[1.5rem] font-semibold text-ink">Hi {firstName}, what would you like to know?</p>
        </div>
      )}

      <ol className="mb-4 space-y-6" data-testid="ai-messages">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} initials={initials} />
        ))}
      </ol>
      {/* Keyed by the conversation: a new chat starts a fresh form, so an earlier
          answer can't send the person back to the chat they left (Bug 1). */}
      <AssistantForm key={conversationId ?? "new"} conversationId={conversationId} enabled={enabled} maxChars={settings.maxQuestionChars} modes={modeOptions} suggestions={suggestions} />
    </section>
  );
}

function aboutAnswer(message: AiMessage): string {
  const sources = [...new Set(message.evidence.map((item) => item.source))];
  const read = message.evidence[0] ? formatIndiaTime(new Date(message.evidence[0].asOf)) : formatIndiaTime(message.createdAt);
  const parts = [sources.length ? `From ${sources.join(" and ")}, read ${read}.` : `Answered ${read}, without company data.`];
  if (message.provider) parts.push(`Answered by ${PROVIDER_LABEL[message.provider as ProviderCode] ?? message.provider}.`);
  if (message.unverified.length) parts.push(`Calculated by Pico Bot, not read directly: ${message.unverified.join(", ")}.`);
  return parts.join(" ");
}

function MessageItem({ message, initials }: { message: AiMessage; initials: string }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end gap-3">
        <p className="w-fit max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-primary-50 px-4 py-2.5 text-primary-700" title={formatIndiaTime(message.createdAt)}>
          {message.content}
        </p>
        <span aria-hidden="true" className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-solid text-caption font-semibold text-white">
          {initials}
        </span>
      </li>
    );
  }
  if (message.error) {
    return (
      <li role="alert" className="text-label text-danger-600">
        {friendlyError(message.error)}
      </li>
    );
  }
  return (
    <li className="flex gap-3" data-testid="ai-answer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/pic-bot.jpg" alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <RichAnswer text={message.content} />
        <div className="mt-1.5 flex items-center gap-1">
          <CopyAnswer text={message.content} />
          <Hint text={aboutAnswer(message)} align="start" />
        </div>
      </div>
    </li>
  );
}
