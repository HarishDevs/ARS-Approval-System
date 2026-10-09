import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// RD-03 what was submitted in each round. Written inside the same
// transaction as the submit / resubmit; never changed afterwards.
export async function insertRevision(requestId: number, round: number, title: string, fields: Record<string, unknown>, userId: number, db: Queryable = getDbPool()): Promise<void> {
  // IGNORE: a round is recorded once (a request from before v1.6.0 gets its
  // earlier round filled in from the last submitted values on its first resubmit).
  await db.query("INSERT IGNORE INTO request_revisions (request_id, round, title, fields_json, created_by) VALUES (?, ?, ?, ?, ?)", [requestId, round, title, JSON.stringify(fields ?? {}), userId]);
}

export interface Revision {
  round: number;
  title: string;
  fields: Record<string, unknown>;
  createdAt: Date;
}

export async function listRevisions(requestId: number, db: Queryable = getDbPool()): Promise<Revision[]> {
  const [rows] = await db.query<(RowDataPacket & { round: number; title: string; fields_json: Record<string, unknown> | string; created_at: Date })[]>(
    "SELECT round, title, fields_json, created_at FROM request_revisions WHERE request_id = ? ORDER BY round",
    [requestId],
  );
  return rows.map((row) => ({ round: row.round, title: row.title, fields: typeof row.fields_json === "string" ? JSON.parse(row.fields_json) : row.fields_json, createdAt: row.created_at }));
}
