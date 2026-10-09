import { getDbPool } from "@/lib/db/client";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { logError } from "@/lib/logging/logger";
import packageJson from "@/package.json";

// Health check for an uptime monitor (audit X-09, D-103). Public and cheap:
// 200 when the app and the database answer, 503 when the database doesn't.
// Says nothing private: the version, whether the database answered, and
// whether the job runner ran in the last 15 minutes.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database = false;
  let jobRunner: "OK" | "LATE" | "NEVER" | "UNKNOWN" = "UNKNOWN";
  try {
    await getDbPool().query("SELECT 1");
    database = true;
    const heartbeat = await getRunnerHeartbeat();
    jobRunner = heartbeat === null ? "NEVER" : heartbeat.minutesAgo <= 15 ? "OK" : "LATE";
  } catch (error) {
    logError("health: database check failed", error);
  }
  return Response.json(
    { status: database ? "ok" : "error", version: packageJson.version, database: database ? "ok" : "down", jobRunner, ms: Date.now() - started },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
