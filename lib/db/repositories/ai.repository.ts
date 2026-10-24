import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-169 (AI module branch): conversations, answers, proposals and sync runs.
// A conversation is only ever read together with its owner's id, so nobody
// can open another person's by changing an id.
export interface AiConversation {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface AiEvidence {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  source: string;
  asOf: string;
  result: unknown;
  links: { label: string; href: string }[];
}

export interface AiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  error: string | null;
  evidence: AiEvidence[];
  unverified: string[];
  createdAt: Date;
}

const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

export async function createConversation(ownerId: number, title: string, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO ai_conversations (owner_user_id, title) VALUES (?, ?)", [ownerId, title.slice(0, 200)]);
  return result.insertId;
}

export async function ownsConversation(ownerId: number, conversationId: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT 1 FROM ai_conversations WHERE id = ? AND owner_user_id = ? LIMIT 1", [conversationId, ownerId]);
  return rows.length > 0;
}

export async function listConversations(ownerId: number, limit = 50, db: Queryable = getDbPool()): Promise<AiConversation[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.title, c.created_at, c.updated_at, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count
     FROM ai_conversations c WHERE c.owner_user_id = ? ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`,
    [ownerId, limit],
  );
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, messageCount: Number(row.message_count) }));
}

// Only the owner's: another person's id gives an empty list.
export async function listMessages(ownerId: number, conversationId: number, db: Queryable = getDbPool()): Promise<AiMessage[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT m.* FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id AND c.owner_user_id = ?
     WHERE m.conversation_id = ? ORDER BY m.id`,
    [ownerId, conversationId],
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    latencyMs: row.latency_ms,
    error: row.error,
    evidence: json<AiEvidence[]>(row.evidence_json, []),
    unverified: json<string[]>(row.unverified_json, []),
    createdAt: row.created_at,
  }));
}

export async function addMessage(
  conversationId: number,
  message: { role: "user" | "assistant"; content: string; provider?: string | null; model?: string | null; inputTokens?: number | null; outputTokens?: number | null; latencyMs?: number | null; error?: string | null; evidence?: AiEvidence[]; unverified?: string[] },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO ai_messages (conversation_id, role, content, provider, model, input_tokens, output_tokens, latency_ms, error, evidence_json, unverified_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      conversationId,
      message.role,
      message.content,
      message.provider ?? null,
      message.model ?? null,
      message.inputTokens ?? null,
      message.outputTokens ?? null,
      message.latencyMs ?? null,
      message.error ? message.error.slice(0, 300) : null,
      message.evidence?.length ? JSON.stringify(message.evidence) : null,
      message.unverified?.length ? JSON.stringify(message.unverified) : null,
    ],
  );
  await db.query("UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [conversationId]);
  return result.insertId;
}

// Questions this person asked today (the daily limit).
export async function questionsToday(ownerId: number, db: Queryable = getDbPool()): Promise<number> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE c.owner_user_id = ? AND m.role = 'user' AND m.created_at >= CURRENT_DATE`,
    [ownerId],
  );
  return Number(row?.n ?? 0);
}

// Usage for the Super Admin: answers, tokens and failures per provider over a period.
export async function usageByProvider(days: number, db: Queryable = getDbPool()): Promise<{ provider: string; answers: number; failures: number; inputTokens: number; outputTokens: number; people: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(m.provider, 'none') AS provider, SUM(m.error IS NULL) AS answers, SUM(m.error IS NOT NULL) AS failures,
            COALESCE(SUM(m.input_tokens), 0) AS input_tokens, COALESCE(SUM(m.output_tokens), 0) AS output_tokens, COUNT(DISTINCT c.owner_user_id) AS people
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE m.role = 'assistant' AND m.created_at >= CURRENT_TIMESTAMP - INTERVAL ? DAY
     GROUP BY COALESCE(m.provider, 'none') ORDER BY answers DESC`,
    [days],
  );
  return rows.map((row) => ({ provider: row.provider, answers: Number(row.answers), failures: Number(row.failures), inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), people: Number(row.people) }));
}

// ---- Proposals (Phase 7) ----
export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export interface AiProposal {
  id: number;
  conversationId: number | null;
  requestedBy: number;
  requestedByName: string;
  approverUserId: number | null;
  approverName: string | null;
  kind: "REMINDER" | "FOLLOW_UP" | "REVIEW" | "OTHER";
  title: string;
  details: string;
  evidence: AiEvidence[];
  contentHash: string;
  version: number;
  status: ProposalStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  expiresAt: Date;
  expired: boolean;
  createdAt: Date;
}

const PROPOSAL_SELECT = `
  SELECT p.*, rq.name AS requested_by_name, ap.name AS approver_name, dc.name AS decided_by_name, p.expires_at <= CURRENT_TIMESTAMP AS is_expired
  FROM ai_proposals p
  JOIN users rq ON rq.id = p.requested_by
  LEFT JOIN users ap ON ap.id = p.approver_user_id
  LEFT JOIN users dc ON dc.id = p.decided_by`;

function toProposal(row: RowDataPacket): AiProposal {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    approverUserId: row.approver_user_id,
    approverName: row.approver_name,
    kind: row.kind,
    title: row.title,
    details: row.details,
    evidence: json<AiEvidence[]>(row.evidence_json, []),
    contentHash: row.content_hash,
    version: row.version,
    status: row.status,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    expiresAt: row.expires_at,
    expired: Number(row.is_expired) === 1,
    createdAt: row.created_at,
  };
}

export async function insertProposal(
  input: { conversationId: number | null; requestedBy: number; approverUserId: number | null; kind: AiProposal["kind"]; title: string; details: string; evidence: AiEvidence[]; contentHash: string; validDays: number },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO ai_proposals (conversation_id, requested_by, approver_user_id, kind, title, details, evidence_json, content_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + INTERVAL ? DAY)`,
    [input.conversationId, input.requestedBy, input.approverUserId, input.kind, input.title, input.details, JSON.stringify(input.evidence), input.contentHash, input.validDays],
  );
  return result.insertId;
}

export async function findProposal(id: number, db: Queryable = getDbPool(), lock = false): Promise<AiProposal | null> {
  const [rows] = await db.query<RowDataPacket[]>(`${PROPOSAL_SELECT} WHERE p.id = ?${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] ? toProposal(rows[0]) : null;
}

export async function listProposalsRequestedBy(userId: number, db: Queryable = getDbPool()): Promise<AiProposal[]> {
  const [rows] = await db.query<RowDataPacket[]>(`${PROPOSAL_SELECT} WHERE p.requested_by = ? ORDER BY p.id DESC LIMIT 50`, [userId]);
  return rows.map(toProposal);
}

// Waiting for this person's decision: they are the named approver, or (as an
// IT Admin) no approver is named. Never their own proposals.
export async function listProposalsToDecide(userId: number, isItAdmin: boolean, db: Queryable = getDbPool()): Promise<AiProposal[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `${PROPOSAL_SELECT} WHERE p.status = 'PENDING' AND p.requested_by <> ? AND (p.approver_user_id = ?${isItAdmin ? " OR p.approver_user_id IS NULL" : ""}) ORDER BY p.id DESC LIMIT 50`,
    [userId, userId],
  );
  return rows.map(toProposal);
}

export async function decideProposal(
  id: number,
  input: { status: "APPROVED" | "REJECTED" | "EXPIRED"; decidedBy: number | null; note: string | null; expectedVersion: number },
  db: Queryable,
): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE ai_proposals SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_note = ?, version = version + 1
     WHERE id = ? AND status = 'PENDING' AND version = ?`,
    [input.status, input.decidedBy, input.note, id, input.expectedVersion],
  );
  return result.affectedRows === 1;
}

export async function reportingManagerOf(userId: number, db: Queryable = getDbPool()): Promise<number | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT m.id FROM users u JOIN users m ON m.id = u.reporting_manager_id AND m.active = TRUE WHERE u.id = ? LIMIT 1",
    [userId],
  );
  return rows[0]?.id ?? null;
}

// ---- Sync runs (Phase 6) ----
export interface SyncRun {
  id: number;
  sourceKey: string;
  dataset: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  rowsFetched: number;
  checkpointOut: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export async function startSyncRun(sourceKey: string, dataset: string, checkpointIn: string | null, startedBy: number | null, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO ai_sync_runs (source_key, dataset, status, checkpoint_in, started_by) VALUES (?, ?, 'RUNNING', ?, ?)", [sourceKey, dataset, checkpointIn, startedBy]);
  return result.insertId;
}

export async function finishSyncRun(id: number, outcome: { status: "SUCCEEDED" | "FAILED"; rowsFetched: number; checkpointOut: string | null; error: string | null }, db: Queryable = getDbPool()): Promise<void> {
  await db.query("UPDATE ai_sync_runs SET status = ?, rows_fetched = ?, checkpoint_out = ?, error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", [outcome.status, outcome.rowsFetched, outcome.checkpointOut, outcome.error?.slice(0, 300) ?? null, id]);
}

// The checkpoint to continue from: the last SUCCESSFUL run's (a failed run never moves it).
export async function lastGoodCheckpoint(sourceKey: string, dataset: string, db: Queryable = getDbPool()): Promise<string | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT checkpoint_out FROM ai_sync_runs WHERE source_key = ? AND dataset = ? AND status = 'SUCCEEDED' ORDER BY id DESC LIMIT 1", [sourceKey, dataset]);
  return rows[0]?.checkpoint_out ?? null;
}

export async function latestRuns(sourceKey: string, db: Queryable = getDbPool()): Promise<SyncRun[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT r.* FROM ai_sync_runs r JOIN (SELECT dataset, MAX(id) AS id FROM ai_sync_runs WHERE source_key = ? GROUP BY dataset) last ON last.id = r.id ORDER BY r.dataset`,
    [sourceKey],
  );
  return rows.map((row) => ({ id: row.id, sourceKey: row.source_key, dataset: row.dataset, status: row.status, rowsFetched: row.rows_fetched, checkpointOut: row.checkpoint_out, error: row.error, startedAt: row.started_at, finishedAt: row.finished_at }));
}

export async function lastSuccess(sourceKey: string, db: Queryable = getDbPool()): Promise<Date | null> {
  const [rows] = await db.query<RowDataPacket[]>("SELECT MAX(finished_at) AS at FROM ai_sync_runs WHERE source_key = ? AND status = 'SUCCEEDED'", [sourceKey]);
  return rows[0]?.at ?? null;
}

// Upsert by the source's own id: a repeated or overlapping page never duplicates.
export async function upsertSourceRecords(sourceKey: string, dataset: string, records: { id: string; modifiedAt: string | null; data: Record<string, unknown> }[], db: Queryable = getDbPool()): Promise<void> {
  if (!records.length) return;
  const values = records.map((record) => [sourceKey, dataset, record.id, record.modifiedAt ? new Date(record.modifiedAt) : null, JSON.stringify(record.data)]);
  await db.query(
    `INSERT INTO ai_source_records (source_key, dataset, record_id, modified_at, data_json) VALUES ?
     ON DUPLICATE KEY UPDATE modified_at = VALUES(modified_at), data_json = VALUES(data_json)`,
    [values],
  );
}
