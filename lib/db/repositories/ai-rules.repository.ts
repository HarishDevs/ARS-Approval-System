import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-187: the AI Rules documents, one per chat (ALL = every chat).
export const RULE_SCOPES = ["ALL", "GENERAL", "APPROVAL", "TASK", "INFORMATION", "SALESFORCE", "COMBINED"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export interface AiRule {
  scope: RuleScope;
  content: string;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export async function listAiRules(db: Queryable = getDbPool()): Promise<AiRule[]> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT r.chat_mode, r.content, r.updated_at, u.name FROM ai_rules r LEFT JOIN users u ON u.id = r.updated_by");
  return rows.filter((row) => (RULE_SCOPES as readonly string[]).includes(row.chat_mode)).map((row) => ({ scope: row.chat_mode as RuleScope, content: String(row.content), updatedBy: row.name ?? null, updatedAt: row.updated_at ?? null }));
}

export async function rulesFor(scopes: readonly RuleScope[], db: Queryable = getDbPool()): Promise<Partial<Record<RuleScope, string>>> {
  if (!scopes.length) return {};
  const [rows] = await db.query<RowDataPacket[]>("SELECT chat_mode, content FROM ai_rules WHERE chat_mode IN (?)", [scopes]);
  return Object.fromEntries(rows.map((row) => [row.chat_mode, String(row.content)]));
}

export async function saveAiRule(scope: RuleScope, content: string, userId: number, db: Queryable = getDbPool()): Promise<string | null> {
  const [before] = await db.query<RowDataPacket[]>("SELECT content FROM ai_rules WHERE chat_mode = ?", [scope]);
  await db.query("INSERT INTO ai_rules (chat_mode, content, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)", [scope, content, userId]);
  return before[0] ? String(before[0].content) : null;
}
