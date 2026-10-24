import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { RulesEditor } from "@/features/admin/RulesEditor";
import { requireArea } from "@/server/authorization/guards";
import { listAiRules } from "@/lib/db/repositories/ai-rules.repository";
import { MAX_RULES_CHARS } from "@/server/ai/assistant";

export const metadata: Metadata = { title: "AI Rules" };
export const dynamic = "force-dynamic";

// D-187 (owner): the AI "training" module. What is written here is given to
// every AI provider with each question, for all chats or for one chat.
export default async function AiRulesPage() {
  await requireArea("admin");
  const rules = await listAiRules();
  return (
    <>
      <PageHeader
        title="AI Rules"
        description="Teach Pic bot your company's terms and where things are kept, e.g. 'Dealers are Salesforce Accounts with Type = Dealer; customers are Accounts with Type = Customer'. Every AI provider follows these rules with every question. They can't override Pic bot's safety rules (read-only, people's permissions, no invented figures)."
      />
      <RulesEditor rules={rules.map((rule) => ({ scope: rule.scope, content: rule.content, updatedBy: rule.updatedBy, updatedAt: rule.updatedAt ? rule.updatedAt.toISOString() : null }))} maxChars={MAX_RULES_CHARS} />
    </>
  );
}
