import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { dashboardCsv } from "@/server/dashboards/export";
import { parseDashboardFilter } from "@/server/dashboards/filters";
import { indiaToday } from "@/lib/db/repositories/collab.repository";
import { CSV_MIME } from "@/server/import/csv";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// CSV download of an admin dashboard (F-74). Admin space only; anything else
// gets the same plain 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await requireApiArea("admin");
    const { slug } = await params;
    const filter = parseDashboardFilter(Object.fromEntries(request.nextUrl.searchParams), await indiaToday());
    const body = await dashboardCsv(slug, filter);
    if (body === null) return apiError("NOT_FOUND", "Not found.", 404);
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
