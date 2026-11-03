import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { currentDataWorkbook, templateWorkbook } from "@/server/import/service";
import { isImportKind } from "@/server/import/kinds";
import { XLSX_MIME } from "@/server/import/xlsx";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getRequestContext } from "@/lib/http/request-context";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// Import downloads (S10-04, F-59): ?type=template (header row only) or
// ?type=data (the current records in the same columns). v1.49.1: Excel
// workbooks (owner). Admin space only;
// anything else gets the same plain 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const session = await requireApiArea("admin");
    const { kind } = await params;
    const type = request.nextUrl.searchParams.get("type");
    if (!isImportKind(kind) || (type !== "template" && type !== "data")) return apiError("NOT_FOUND", "Not found.", 404);
    const today = new Date().toISOString().slice(0, 10);
    const body = type === "template" ? templateWorkbook(kind) : await currentDataWorkbook(kind);
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
    const name = type === "template" ? `ars-${kind}-template.xlsx` : `ars-${kind}-${today}.xlsx`;
    return new Response(new Blob([body], { type: XLSX_MIME }), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
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
