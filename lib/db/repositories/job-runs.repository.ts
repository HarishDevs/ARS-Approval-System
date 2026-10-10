import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";

// Job-run history (unified prompt FN11, Addendum B monitoring). One row per
// automation step per runner call. Counts only: no message content, no
// personal data, no secrets.
export interface JobRun {
  id: number;
  runRef: string;
  jobKey: string;
  trigger: "CRON" | "MANUAL";
  startedAt: Date;
  finishedAt: Date | null;
  status: "RUNNING" | "OK" | "FAILED";
  counts: Record<string, number | string>;
  errorCode: string | null;
}

type Row = RowDataPacket & { id: number; run_ref: string; job_key: string; trigger_kind: "CRON" | "MANUAL"; started_at: Date; finished_at: Date | null; status: JobRun["status"]; counts_json: unknown; error_code: string | null };

const toRun = (row: Row): JobRun => ({
  id: row.id,
  runRef: row.run_ref,
  jobKey: row.job_key,
  trigger: row.trigger_kind,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status,
  counts: (typeof row.counts_json === "string" ? JSON.parse(row.counts_json) : (row.counts_json ?? {})) as Record<string, number | string>,
  errorCode: row.error_code,
});

export async function startJobRun(input: { runRef: string; jobKey: string; trigger: "CRON" | "MANUAL" }, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO job_runs (run_ref, job_key, trigger_kind) VALUES (?, ?, ?)", [input.runRef.slice(0, 64), input.jobKey, input.trigger]);
  return result.insertId;
}

export async function finishJobRun(id: number, outcome: { status: "OK" | "FAILED"; counts?: Record<string, number | string>; errorCode?: string | null }, db: Queryable = getDbPool()): Promise<void> {
  await db.query<ResultSetHeader>("UPDATE job_runs SET finished_at = CURRENT_TIMESTAMP(3), status = ?, counts_json = ?, error_code = ? WHERE id = ?", [
    outcome.status,
    outcome.counts ? JSON.stringify(outcome.counts) : null,
    outcome.errorCode ? outcome.errorCode.slice(0, 200) : null,
    id,
  ]);
}

export async function listJobRuns(input: { jobKey?: string; limit?: number } = {}, db: Queryable = getDbPool()): Promise<JobRun[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const [rows] = await db.query<Row[]>(
    `SELECT id, run_ref, job_key, trigger_kind, started_at, finished_at, status, counts_json, error_code FROM job_runs${input.jobKey ? " WHERE job_key = ?" : ""} ORDER BY id DESC LIMIT ?`,
    input.jobKey ? [input.jobKey, limit] : [limit],
  );
  return rows.map(toRun);
}

export interface JobSummary {
  jobKey: string;
  lastRun: JobRun | null;
  lastOkAt: Date | null;
  failures24h: number;
  runs24h: number;
}

// The latest run, the latest good run and 24-hour counts for every job key.
export async function summariseJobs(jobKeys: readonly string[], db: Queryable = getDbPool()): Promise<Map<string, JobSummary>> {
  const out = new Map<string, JobSummary>(jobKeys.map((key) => [key, { jobKey: key, lastRun: null, lastOkAt: null, failures24h: 0, runs24h: 0 }]));
  if (!jobKeys.length) return out;
  const [latest] = await db.query<Row[]>(
    `SELECT j.id, j.run_ref, j.job_key, j.trigger_kind, j.started_at, j.finished_at, j.status, j.counts_json, j.error_code
     FROM job_runs j JOIN (SELECT job_key, MAX(id) AS id FROM job_runs WHERE job_key IN (?) GROUP BY job_key) m ON m.id = j.id`,
    [jobKeys],
  );
  for (const row of latest) out.get(row.job_key)!.lastRun = toRun(row);
  const [ok] = await db.query<(RowDataPacket & { job_key: string; at: Date })[]>("SELECT job_key, MAX(finished_at) AS at FROM job_runs WHERE status = 'OK' AND job_key IN (?) GROUP BY job_key", [jobKeys]);
  for (const row of ok) out.get(row.job_key)!.lastOkAt = row.at;
  const [day] = await db.query<(RowDataPacket & { job_key: string; runs: number; failures: number })[]>(
    `SELECT job_key, COUNT(*) AS runs, SUM(status = 'FAILED') AS failures FROM job_runs
     WHERE job_key IN (?) AND started_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY) GROUP BY job_key`,
    [jobKeys],
  );
  for (const row of day) Object.assign(out.get(row.job_key)!, { runs24h: Number(row.runs), failures24h: Number(row.failures ?? 0) });
  return out;
}

// A step left RUNNING for over an hour died with the process; close it as
// failed so it shows up instead of looking busy for ever.
export async function closeAbandonedRuns(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "UPDATE job_runs SET status = 'FAILED', finished_at = CURRENT_TIMESTAMP(3), error_code = 'ABANDONED: the run never finished' WHERE status = 'RUNNING' AND started_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 HOUR)",
  );
  return result.affectedRows;
}

export async function pruneJobRuns(db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("DELETE FROM job_runs WHERE started_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 90 DAY) LIMIT 5000");
  return result.affectedRows;
}
