import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { listAuditForExport, recordAudit } from "@/lib/db/repositories/audit.repository";
import { indiaToday } from "@/lib/db/repositories/collab.repository";
import { CSV_MIME, toCsv } from "@/server/import/csv";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// S8-02 audit log export (P1-57): Super Admin only, CSV, at most 50,000 rows
// between two dates (default: the last 30 days). The export is itself audited.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiArea("superadmin");
    const query = request.nextUrl.searchParams;
    const today = await indiaToday();
    const to = DATE.test(query.get("to") ?? "") ? query.get("to")! : today;
    const from = DATE.test(query.get("from") ?? "") ? query.get("from")! : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    const action = /^[A-Z_]{1,80}$/.test(query.get("action") ?? "") ? query.get("action")! : undefined;
    const rows = await listAuditForExport({ action, from, to }, MAX_ROWS);
    await recordAudit({ actorUserId: session.user.id, action: "AUDIT_EXPORTED", entityType: "AUDIT_LOG", sessionId: session.sessionId, metadata: { from, to, action: action ?? null, rows: rows.length } });
    const body = toCsv(
      ["When (India time)", "Who", "Action", "Entity", "Entity id", "Result", "IP address", "Details"],
      rows.map((row) => [formatIndiaTime(row.occurredAt), row.actorName ?? "System", row.action, row.entityType, row.entityId, row.result, row.ipAddress, row.metadata ? JSON.stringify(row.metadata) : ""]),
    );
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CSV_MIME,
        "Content-Disposition": `attachment; filename="ars-audit-${from}-to-${to}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("audit export failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
