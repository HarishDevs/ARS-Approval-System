import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { currentDataCsv, templateCsv } from "@/server/import/service";
import { isImportKind } from "@/server/import/kinds";
import { CSV_MIME } from "@/server/import/csv";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getRequestContext } from "@/lib/http/request-context";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// Import downloads (S10-04, F-59): ?type=template (header row only) or
// ?type=data (the current records in the same columns). Admin space only;
// anything else gets the same plain 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const session = await requireApiArea("admin");
    const { kind } = await params;
    const type = request.nextUrl.searchParams.get("type");
    if (!isImportKind(kind) || (type !== "template" && type !== "data")) return apiError("NOT_FOUND", "Not found.", 404);
    const today = new Date().toISOString().slice(0, 10);
    const body = type === "template" ? templateCsv(kind) : await currentDataCsv(kind);
    if (type === "data") {
      // A copy of the people list leaves the app: keep a record of it.
      await recordAudit({
        actorUserId: session.user.id,
        action: "IMPORT_DATA_DOWNLOADED",
        entityType: "IMPORT",
        entityId: kind,
        sessionId: session.sessionId,
        ipAddress: getRequestContext(request).ipAddress,
      });
    }
    const name = type === "template" ? `ars-${kind}-template.csv` : `ars-${kind}-${today}.csv`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CSV_MIME,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("import download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
