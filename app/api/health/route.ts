import { healthReport } from "@/server/ops/health";

// Health check for an uptime monitor (audit X-09, D-103). Public and cheap:
// 200 when the app and the database answer, 503 when the database doesn't.
// Says nothing private: the version, whether the database answered, and
// whether the job runner ran in the last 15 minutes, and (v1.12.4) whether
// uploaded files can be written (never the path).
// D-246 (audit OPS-11): also the newest backup's age and "degraded" when the
// runner is late, the backup is over a day old, or files can't be written.
// /api/health/deep answers 503 then, for a monitor that should alert.
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await healthReport();
  return Response.json(report.body, { status: report.database ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
