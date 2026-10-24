import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { EmptyState } from "@/features/ui/Display";
import { listAllConversations } from "@/lib/db/repositories/ai.repository";
import { MODE_LABEL, type ChatMode } from "@/server/ai/chat-access";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Activity History" };
export const dynamic = "force-dynamic";

// D-180 (owner): everyone's AI conversations, newest first, for the Super
// Admin (layout). Titles and counts only; the messages stay their owner's.
export default async function AiActivityHistoryPage() {
  const conversations = await listAllConversations(200);
  return (
    <>
      <PageHeader title="AI Activity History" description="Everyone's Pic bot conversations, newest first: who, what about, when. The messages themselves stay private to each person." />
      {conversations.length === 0 ? (
        <EmptyState title="No conversations yet" body="Conversations appear here once people use Pic bot." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="ai-history">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Conversation</th>
                <th scope="col">Chat</th>
                <th scope="col">Messages</th>
                <th scope="col">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => (
                <tr key={conversation.id}>
                  <td className="font-medium">{conversation.ownerName}</td>
                  <td className="max-w-md break-words">{conversation.title}</td>
                  <td className="text-label">{MODE_LABEL[conversation.mode as ChatMode] ?? "Earlier version"}</td>
                  <td>{conversation.messageCount}</td>
                  <td className="text-label text-ink-muted">{formatIndiaTime(conversation.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
