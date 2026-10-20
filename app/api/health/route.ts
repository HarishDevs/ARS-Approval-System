import { getDbPool } from "@/lib/db/client";
import { getRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { logError } from "@/lib/logging/logger";
import packageJson from "@/package.json";
import { after } from "next/server";
import { checkJobRunnerStopped } from "@/server/ops/alerts";
import { checkStorage } from "@/server/attachments/storage";

// Health check for an uptime monitor (audit X-09, D-103). Public and cheap:
// 200 when the app and the database answer, 503 when the database doesn't.
// Says nothing private: the version, whether the database answered, and
// whether the job runner ran in the last 15 minutes, and (v1.12.4) whether
// uploaded files can be written (never the path).
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
    // A5: after the answer is sent, tell the Super Admin if the runner stopped.
    if (jobRunner === "LATE") after(() => checkJobRunnerStopped().then(() => undefined));
  } catch (error) {
    logError("health: database check failed", error);
  }
  const storage = (await checkStorage().catch(() => ({ ok: false }))).ok ? "ok" : "failed";
  return Response.json(
    { status: database ? "ok" : "error", version: packageJson.version, database: database ? "ok" : "down", jobRunner, storage, ms: Date.now() - started },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
