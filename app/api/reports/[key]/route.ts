import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { cleanQuery, runReport } from "@/server/reports/run";
import { CONTENT_TYPE, exportReport, fileName, type ExportFormat } from "@/server/reports/export";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { apiError } from "@/lib/http/api-response";
import { canExport, canUseReports } from "@/server/settings/features";
import { logError } from "@/lib/logging/logger";

// Report export (Addendum A §10, D-123): CSV, XLSX or PDF of a catalogue
// report, scoped to the signed-in person on the server. Audited (key,
// format, rows; never the data). 20 exports a minute per person.
const FORMATS = new Set<ExportFormat>(["csv", "xlsx", "pdf"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  if (!(await canUseReports(session.user))) return apiError("NOT_FOUND", "Not found.", 404); // v1.7.1: IT and Super Admin only
  // A9: downloads may be limited to the "Can export" role.
  if (!(await canExport(session.user))) return apiError("FORBIDDEN", "Downloads are limited to people with the Can export permission. Ask IT.", 403);
  try {
    const { key } = await params;
    const search = Object.fromEntries(request.nextUrl.searchParams);
    const format = (FORMATS.has(search.format as ExportFormat) ? search.format : "csv") as ExportFormat;
    if ((await hitRateLimit(`report-export:${session.user.id}`, 60)) > 20) return apiError("RATE_LIMITED", "Too many downloads. Wait a minute and try again.", 429);
    const viewer = { id: session.user.id, roles: session.user.roles };
    const now = new Date();
    const ran = await runReport(key, cleanQuery(search), viewer, now);
    if (!ran) return apiError("NOT_FOUND", "Not found.", 404);
    const body = await exportReport(format, ran.result, {
      title: ran.report.name,
      scopeLabel: ran.scope.label,
      periodLabel: ran.report.usesPeriod ? `${ran.filter.period.label} (${ran.filter.period.from} to ${ran.filter.period.to})` : null,
      generatedAt: now,
      generatedBy: session.user.name,
    });
    await recordAudit({ actorUserId: session.user.id, action: "REPORT_EXPORTED", entityType: "REPORT", entityId: key, sessionId: session.sessionId, metadata: { format, scope: ran.scope.kind, rows: ran.result.rows.length, truncated: ran.result.truncated } });
    return new Response(typeof body === "string" ? body : Buffer.from(body), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[format],
        "Content-Disposition": `attachment; filename="${fileName(key, format, now)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("report export failed", error);
    return apiError("SYSTEM_ERROR", "The report couldn't be made. Please try again.", 500);
  }
}
