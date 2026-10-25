import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// D-193 (owner): AI Analytics for the IT team. Read-only figures about how
// Pico Bot is used, from ai_messages and ai_conversations, for one period
// given as UTC instants [from, to). A question is a user message; an answer
// is an assistant message without an error; a failure has one. Dates and
// hours are India time.
const INDIA_DATE = "DATE(DATE_ADD(m.created_at, INTERVAL 330 MINUTE))";
export type Range = { from: Date; to: Date };

export interface AiTotals {
  questions: number;
  answers: number;
  failures: number;
  askers: number;
  conversations: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
  p90LatencyMs: number | null;
  withData: number; // answers that used company data
  calculated: number; // answers with figures Pico Bot calculated
}

export async function aiTotals(range: Range, db: Queryable = getDbPool()): Promise<AiTotals> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT
       SUM(m.role = 'user') AS questions,
       SUM(m.role = 'assistant' AND m.error IS NULL) AS answers,
       SUM(m.role = 'assistant' AND m.error IS NOT NULL) AS failures,
       COUNT(DISTINCT CASE WHEN m.role = 'user' THEN c.owner_user_id END) AS askers,
       COALESCE(SUM(m.input_tokens), 0) AS input_tokens,
       COALESCE(SUM(m.output_tokens), 0) AS output_tokens,
       AVG(CASE WHEN m.role = 'assistant' AND m.error IS NULL THEN m.latency_ms END) AS avg_latency,
       SUM(m.role = 'assistant' AND m.error IS NULL AND JSON_LENGTH(COALESCE(m.evidence_json, JSON_ARRAY())) > 0) AS with_data,
       SUM(m.role = 'assistant' AND m.error IS NULL AND JSON_LENGTH(COALESCE(m.unverified_json, JSON_ARRAY())) > 0) AS calculated
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE m.created_at >= ? AND m.created_at < ?`,
    [range.from, range.to],
  );
  const [[conversations]] = await db.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM ai_conversations WHERE created_at >= ? AND created_at < ?", [range.from, range.to]);
  // 90th percentile answer time: the value 90% of answers are faster than.
  const [latencies] = await db.query<RowDataPacket[]>(
    "SELECT m.latency_ms FROM ai_messages m WHERE m.role = 'assistant' AND m.error IS NULL AND m.latency_ms IS NOT NULL AND m.created_at >= ? AND m.created_at < ? ORDER BY m.latency_ms LIMIT 50000",
    [range.from, range.to],
  );
  const p90 = latencies.length ? Number(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9))]!.latency_ms) : null;
  const n = (value: unknown) => Number(value ?? 0);
  return {
    questions: n(row?.questions),
    answers: n(row?.answers),
    failures: n(row?.failures),
    askers: n(row?.askers),
    conversations: n(conversations?.total),
    inputTokens: n(row?.input_tokens),
    outputTokens: n(row?.output_tokens),
    avgLatencyMs: row?.avg_latency === null || row?.avg_latency === undefined ? null : Math.round(Number(row.avg_latency)),
    p90LatencyMs: p90,
    withData: n(row?.with_data),
    calculated: n(row?.calculated),
  };
}

// People who may use AI now (the AI module ticked, or the Super Admin), active.
export async function aiEnabledPeople(db: Queryable = getDbPool()): Promise<number> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM users u
     WHERE u.active = TRUE AND u.is_break_glass = FALSE AND u.is_demo = FALSE
       AND (FIND_IN_SET('AI', u.module_access) > 0 OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'SUPER_ADMIN'))`,
  );
  return Number(row?.total ?? 0);
}

// Per India day: questions, answers, failures.
export async function aiDaily(range: Range, db: Queryable = getDbPool()): Promise<{ day: string; questions: number; answers: number; failures: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(${INDIA_DATE}, '%Y-%m-%d') AS day, SUM(m.role = 'user') AS questions,
            SUM(m.role = 'assistant' AND m.error IS NULL) AS answers, SUM(m.role = 'assistant' AND m.error IS NOT NULL) AS failures
     FROM ai_messages m WHERE m.created_at >= ? AND m.created_at < ? GROUP BY day ORDER BY day`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ day: String(row.day), questions: Number(row.questions), answers: Number(row.answers), failures: Number(row.failures) }));
}

// Questions by the chat they were asked in.
export async function aiByMode(range: Range, db: Queryable = getDbPool()): Promise<{ mode: string; questions: number; people: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.mode, COUNT(*) AS questions, COUNT(DISTINCT c.owner_user_id) AS people
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
     WHERE m.role = 'user' AND m.created_at >= ? AND m.created_at < ? GROUP BY c.mode ORDER BY questions DESC`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ mode: String(row.mode), questions: Number(row.questions), people: Number(row.people) }));
}

export interface ProviderRow {
  provider: string;
  model: string;
  answers: number;
  failures: number;
  avgLatencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
}

export async function aiByProvider(range: Range, db: Queryable = getDbPool()): Promise<ProviderRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(m.provider, '-') AS provider, COALESCE(m.model, '-') AS model,
            SUM(m.error IS NULL) AS answers, SUM(m.error IS NOT NULL) AS failures,
            AVG(CASE WHEN m.error IS NULL THEN m.latency_ms END) AS avg_latency,
            COALESCE(SUM(m.input_tokens), 0) AS input_tokens, COALESCE(SUM(m.output_tokens), 0) AS output_tokens
     FROM ai_messages m WHERE m.role = 'assistant' AND m.created_at >= ? AND m.created_at < ?
     GROUP BY provider, model ORDER BY answers DESC`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ provider: String(row.provider), model: String(row.model), answers: Number(row.answers), failures: Number(row.failures), avgLatencyMs: row.avg_latency === null ? null : Math.round(Number(row.avg_latency)), inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens) }));
}

export interface PersonRow {
  userId: number;
  name: string;
  department: string | null;
  questions: number;
  conversations: number;
  failures: number;
  tokens: number;
  lastAt: Date | null;
}

export async function aiByPerson(range: Range, limit = 25, db: Queryable = getDbPool()): Promise<PersonRow[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.name, d.name AS department, SUM(m.role = 'user') AS questions, COUNT(DISTINCT c.id) AS conversations,
            SUM(m.role = 'assistant' AND m.error IS NOT NULL) AS failures,
            COALESCE(SUM(m.input_tokens), 0) + COALESCE(SUM(m.output_tokens), 0) AS tokens, MAX(m.created_at) AS last_at
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id JOIN users u ON u.id = c.owner_user_id LEFT JOIN departments d ON d.id = u.department_id
     WHERE m.created_at >= ? AND m.created_at < ? GROUP BY u.id, u.name, d.name ORDER BY questions DESC, last_at DESC LIMIT ?`,
    [range.from, range.to, limit],
  );
  return rows.map((row) => ({ userId: Number(row.id), name: String(row.name), department: row.department ?? null, questions: Number(row.questions), conversations: Number(row.conversations), failures: Number(row.failures), tokens: Number(row.tokens), lastAt: row.last_at ?? null }));
}

export async function aiByDepartment(range: Range, db: Queryable = getDbPool()): Promise<{ department: string; questions: number; people: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COALESCE(d.name, 'No department') AS department, COUNT(*) AS questions, COUNT(DISTINCT u.id) AS people
     FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id JOIN users u ON u.id = c.owner_user_id LEFT JOIN departments d ON d.id = u.department_id
     WHERE m.role = 'user' AND m.created_at >= ? AND m.created_at < ? GROUP BY department ORDER BY questions DESC LIMIT 20`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ department: String(row.department), questions: Number(row.questions), people: Number(row.people) }));
}

// When people ask: India weekday (0 = Monday) × hour.
export async function aiWeekHours(range: Range, db: Queryable = getDbPool()): Promise<{ weekday: number; hour: number; questions: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT WEEKDAY(DATE_ADD(m.created_at, INTERVAL 330 MINUTE)) AS weekday, HOUR(DATE_ADD(m.created_at, INTERVAL 330 MINUTE)) AS hour, COUNT(*) AS questions
     FROM ai_messages m WHERE m.role = 'user' AND m.created_at >= ? AND m.created_at < ? GROUP BY weekday, hour`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ weekday: Number(row.weekday), hour: Number(row.hour), questions: Number(row.questions) }));
}

// Which data lookups answers used (tool names in the evidence).
export async function aiTools(range: Range, db: Queryable = getDbPool()): Promise<{ tool: string; uses: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT t.tool, COUNT(*) AS uses
     FROM ai_messages m, JSON_TABLE(COALESCE(m.evidence_json, JSON_ARRAY()), '$[*]' COLUMNS (tool VARCHAR(80) PATH '$.tool')) AS t
     WHERE m.role = 'assistant' AND m.error IS NULL AND m.created_at >= ? AND m.created_at < ? AND t.tool IS NOT NULL
     GROUP BY t.tool ORDER BY uses DESC`,
    [range.from, range.to],
  );
  return rows.map((row) => ({ tool: String(row.tool), uses: Number(row.uses) }));
}

// The failure reasons as stored (technical; grouped on the page).
export async function aiFailureReasons(range: Range, db: Queryable = getDbPool()): Promise<{ error: string; count: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT m.error, COUNT(*) AS count FROM ai_messages m WHERE m.role = 'assistant' AND m.error IS NOT NULL AND m.created_at >= ? AND m.created_at < ? GROUP BY m.error ORDER BY count DESC LIMIT 200",
    [range.from, range.to],
  );
  return rows.map((row) => ({ error: String(row.error), count: Number(row.count) }));
}

// Person-days on which someone used up the daily question limit.
export async function aiLimitDays(range: Range, dailyLimit: number, db: Queryable = getDbPool()): Promise<{ personDays: number; people: number }> {
  const [[row]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS person_days, COUNT(DISTINCT owner) AS people FROM (
       SELECT c.owner_user_id AS owner, ${INDIA_DATE} AS day, COUNT(*) AS questions
       FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
       WHERE m.role = 'user' AND m.created_at >= ? AND m.created_at < ? GROUP BY owner, day HAVING questions >= ?
     ) AS full_days`,
    [range.from, range.to, dailyLimit],
  );
  return { personDays: Number(row?.person_days ?? 0), people: Number(row?.people ?? 0) };
}
