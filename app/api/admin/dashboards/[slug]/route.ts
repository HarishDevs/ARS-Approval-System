import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { dashboardCsv } from "@/server/dashboards/export";
import { parseDashboardFilter } from "@/server/dashboards/filters";
import { indiaToday } from "@/lib/db/repositories/collab.repository";
import { CSV_MIME } from "@/server/import/csv";
import { apiError } from "@/lib/http/api-response";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { overLimit, tooManyResponse } from "@/server/security/limits";
import { logError } from "@/lib/logging/logger";

// CSV download of an admin dashboard (F-74). Admin space only; anything else
// gets the same plain 404. v1.10.0 (SEC-12, audit DEF-05): audited and
// limited like report downloads, and bound to the Dashboards page rule.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await requireApiArea("admin", { page: "admin.dashboards" });
    if (await overLimit(`report-export:${session.user.id}`, 20)) return tooManyResponse("Too many downloads. Wait a minute and try again.");
    const { slug } = await params;
    const filter = parseDashboardFilter(Object.fromEntries(request.nextUrl.searchParams), await indiaToday());
    const body = await dashboardCsv(slug, filter);
    if (body === null) return apiError("NOT_FOUND", "Not found.", 404);
    await recordAudit({ actorUserId: session.user.id, action: "DASHBOARD_EXPORTED", entityType: "DASHBOARD", entityId: slug, sessionId: session.sessionId, metadata: { from: filter.from, to: filter.to } });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CSV_MIME,
        "Content-Disposition": `attachment; filename="ars-${slug}-${filter.from}-to-${filter.to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("dashboard download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
