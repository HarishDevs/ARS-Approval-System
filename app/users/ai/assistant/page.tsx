import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { requireAiPage } from "@/features/ai/guard";
import { ProviderNotice } from "@/features/ai/AiParts";
import { AssistantForm } from "@/features/ai/AssistantForm";
import { listMessages, ownsConversation, questionsToday, type AiMessage } from "@/lib/db/repositories/ai.repository";
import { loadAiSettings, routeFor } from "@/server/ai/config";
import { chatAccess } from "@/server/ai/policy";
import { MODE_LABEL } from "@/server/ai/chat-access";
import { PROVIDER_LABEL, type ProviderCode } from "@/server/ai/providers";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): the assistant. Answers come from approved tools
// only; each shows the data it used (evidence, source, time read) and flags
// any figure that wasn't in that data. The conversation is the person's own:
// another person's id simply shows nothing.
export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { user } = await requireAiPage();
  const raw = (await searchParams).c;
  const requested = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const conversationId = requested !== null && (await ownsConversation(user.id, requested)) ? requested : null;
  const [settings, messages, used, chat] = await Promise.all([loadAiSettings(), conversationId ? listMessages(user.id, conversationId) : Promise.resolve([]), questionsToday(user.id), chatAccess(user)]);
  const route = routeFor(settings, false);
  const enabled = route.length > 0 && chat.modes.length > 0;
  const modeOptions = chat.modes.map((mode) => ({ mode, label: MODE_LABEL[mode] }));
  const dataRoute = routeFor(settings, true);

  return (
    <>
      <PageHeader title="AI Assistant" description="Ask about your approvals, requests, tasks and information in plain words. Answers show the data they used.">
        {conversationId !== null && (
          <Link href="/users/ai/assistant" className="btn-secondary btn-compact">
            New conversation
          </Link>
        )}
      </PageHeader>
      <div className="max-w-3xl space-y-4">
        {requested !== null && conversationId === null && (
          <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600">
            That conversation isn&apos;t available.
          </p>
        )}
        {!enabled ? (
          <ProviderNotice isSuperAdmin={user.roles.includes("SUPER_ADMIN")} />
        ) : (
          <p className="text-label text-ink-muted" data-testid="ai-route">
            Answered by {PROVIDER_LABEL[route[0] as ProviderCode]}
            {route[1] ? `, or ${PROVIDER_LABEL[route[1] as ProviderCode]} if it is unavailable` : ""}.{" "}
            {dataRoute.length ? "It can read your own ARS data." : "No provider is approved for business data yet, so it can't read ARS data."} {used} of {settings.dailyQuestions} questions used today.
          </p>
        )}
        <ol className="space-y-3" data-testid="ai-messages">
          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}
        </ol>
        {route.length > 0 && chat.modes.length === 0 && <p className="text-label text-ink-muted">No Pic bot chat mode is available to you. Ask IT.</p>}
        <AssistantForm conversationId={conversationId} enabled={enabled} maxChars={settings.maxQuestionChars} modes={modeOptions} />
        <p className="text-caption text-ink-muted">
          Numbers come from the data, never from the AI&apos;s guess; any figure it couldn&apos;t find in the data is flagged. It can&apos;t approve, send or change anything.
        </p>
      </div>
    </>
  );
}

function MessageItem({ message }: { message: AiMessage }) {
  if (message.role === "user") {
    return (
      <li className="ml-auto max-w-[85%] rounded-lg bg-primary-50 px-4 py-3 text-primary-700">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="mt-1 text-caption opacity-80">{formatIndiaTime(message.createdAt)}</p>
      </li>
    );
  }
  if (message.error) {
    return (
      <li role="alert" className="max-w-[85%] rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-label text-danger-600">
        {message.error}
      </li>
    );
  }
  return (
    <li className="card max-w-[95%] px-4 py-3" data-testid="ai-answer">
      <p className="whitespace-pre-wrap break-words">{message.content}</p>
      {message.unverified.length > 0 && (
        <p role="note" className="mt-2 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600" data-testid="ai-unverified">
          Check these figures: {message.unverified.join(", ")}. They weren&apos;t in the data the assistant read.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
        {message.evidence.length ? <Badge tone="success">Based on {message.evidence.length} data source{message.evidence.length === 1 ? "" : "s"}</Badge> : <Badge tone="neutral">No ARS data used</Badge>}
        <span>
          {message.provider ? PROVIDER_LABEL[message.provider as ProviderCode] ?? message.provider : ""} · {message.model} · {formatIndiaTime(message.createdAt)}
        </span>
      </div>
      {message.evidence.length > 0 && (
        <details className="mt-2 text-label">
          <summary className="cursor-pointer text-ink-muted">Evidence</summary>
          <ul className="mt-2 space-y-2">
            {message.evidence.map((item, index) => (
              <li key={index} className="rounded-md border border-line px-3 py-2">
                <p className="font-medium">{item.label}</p>
                <p className="text-caption text-ink-muted">
                  {item.source} · read {formatIndiaTime(new Date(item.asOf))}
                </p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-caption">{JSON.stringify(item.result, null, 2)}</pre>
                {item.links.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-2">
                    {item.links.map((link) => (
                      <Link key={link.href} href={link.href} className="link text-caption">
                        {link.label}
                      </Link>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
