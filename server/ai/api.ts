import "server-only";
import { chatAccess } from "@/server/ai/policy";
import type { ChatMode } from "@/server/ai/chat-access";
import { friendlyError } from "@/server/ai/friendly";
import type { CurrentSession } from "@/server/auth/session";

// D-172: after each Pic bot route's own requireApiArea (session, user area,
// AI module, page rule users.ai_assistant): the person's effective chat
// modes, read now.
export async function aiAccess(session: CurrentSession): Promise<{ session: CurrentSession; modes: ChatMode[]; stopped: boolean }> {
  const { policy, modes } = await chatAccess(session.user);
  return { session, modes, stopped: policy.emergencyStop };
}

// The answer shape for the panel: plain text only (rendered as text, never
// HTML); links only to this app's own pages.
export function messageView(message: {
  id: number;
  role: "user" | "assistant";
  content: string;
  error: string | null;
  model: string | null;
  evidence: { label: string; source: string; asOf: string; links: { label: string; href: string }[] }[];
  unverified: string[];
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    error: message.error ? friendlyError(message.error) : null, // D-178: the technical reason stays for the Super Admin
    model: message.model,
    evidence: message.evidence.map((item) => ({ label: item.label, source: item.source, asOf: item.asOf, links: item.links.filter((link) => link.href.startsWith("/") && !link.href.startsWith("//")) })),
    unverified: message.unverified,
    createdAt: message.createdAt.toISOString(),
  };
}
