import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { requireAiPage } from "@/features/ai/guard";
import { listConversations } from "@/lib/db/repositories/ai.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Activity History" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): the person's own conversations, newest first.
// Only theirs: the owner is part of the query. Kept as long as the AI
// retention setting allows.
export default async function AiHistoryPage() {
  const { user } = await requireAiPage();
  const conversations = await listConversations(user.id);
  return (
    <>
      <PageHeader title="AI Activity History" description="Your own AI conversations. Nobody else can open them." />
      {conversations.length === 0 ? (
        <EmptyState title="No conversations yet" body="Your questions and answers are listed here, visible to you only." action={<Link href="/users/ai/assistant" className="btn-primary btn-compact">Ask the assistant</Link>} />
      ) : (
        <ul className="card divide-y divide-line" data-testid="ai-history">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
              <Link href={`/users/ai/assistant?c=${conversation.id}`} className="link min-w-0 break-words font-medium">
                {conversation.title}
              </Link>
              <span className="text-caption text-ink-muted">
                {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} · {formatIndiaTime(conversation.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
