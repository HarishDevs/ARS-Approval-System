import "server-only";
import { after } from "next/server";
import { getDbPool } from "@/lib/db/client";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { logError } from "@/lib/logging/logger";
import packageJson from "@/package.json";
import { checkJobRunnerStopped } from "@/server/ops/alerts";
import { checkStorage } from "@/server/attachments/storage";
import { backupStatus } from "@/server/ops/backup";

// The health checks' report (/api/health and /api/health/deep, D-103, D-246).
const BACKUP_MAX_AGE_HOURS = 26;

export async function healthReport() {
  const started = Date.now();
  let database = false;
  let jobRunner: "OK" | "LATE" | "NEVER" | "UNKNOWN" = "UNKNOWN";
  // QA-DB-02 (v1.42.1, audit T-1/Q-020): minutes between the database's own
  // clock (used by column defaults) and UTC (what the app writes). Anything but
  // 0 means some times are stored in two clocks; the owner checks it on live.
  let dbClockOffsetMinutes: number | null = null;
  try {
    const [[clock]] = await getDbPool().query<import("mysql2/promise").RowDataPacket[]>("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_minutes");
    dbClockOffsetMinutes = Number(clock?.offset_minutes ?? 0);
    database = true;
    const heartbeat = await getRunnerHeartbeat();
    jobRunner = heartbeat === null ? "NEVER" : heartbeat.minutesAgo <= 15 ? "OK" : "LATE";
    // A5: after the answer is sent, tell the Super Admin if the runner stopped.
    if (jobRunner === "LATE") after(() => checkJobRunnerStopped().then(() => undefined));
  } catch (error) {
    logError("health: database check failed", error);
  }
  const storage = (await checkStorage().catch(() => ({ ok: false }))).ok ? "ok" : "failed";
  let backupAgeHours: number | null = null;
  try {
    const latest = backupStatus().latest;
    backupAgeHours = latest ? Math.round(((Date.now() - latest.at.getTime()) / 3_600_000) * 10) / 10 : null;
  } catch (error) {
    logError("health: backup check failed", error);
  }
  const degraded = !database || jobRunner !== "OK" || storage !== "ok" || backupAgeHours === null || backupAgeHours > BACKUP_MAX_AGE_HOURS;
  return {
    body: { status: database ? "ok" : "error", version: packageJson.version, database: database ? "ok" : "down", dbClockOffsetMinutes, jobRunner, storage, backupAgeHours, degraded, ms: Date.now() - started },
    database,
    degraded,
  };
}

