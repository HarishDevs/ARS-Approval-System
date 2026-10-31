import { healthReport } from "@/server/ops/health";

// D-246 (audit OPS-11): for a monitor that should alert on more than "the
// site answers": 503 when the database is down, the job runner is late or
// has never run, files can't be written, or the newest backup is over 26
// hours old. The body is the same as /api/health.
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await healthReport();
  return Response.json(report.body, { status: report.degraded ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
