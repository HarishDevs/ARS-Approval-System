import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { canExport } from "@/server/settings/features";
import { exportRecords } from "@/lib/db/repositories/records.repository";
import { readRecordFilter, type RecordKind } from "@/server/records/filters";
import { columnsFor, type RecordColumn } from "@/server/records/columns";
import { CSV_MIME, toCsv } from "@/server/import/csv";
import { apiError } from "@/lib/http/api-response";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { overLimit, tooManyResponse } from "@/server/security/limits";
import { logError } from "@/lib/logging/logger";

// D-191: CSV download of an Admin register with its filters (opens in
// Excel). Admin space and the Records page rule; limited, audited, and
// subject to the "Can export" setting like every other download.
const KINDS: readonly RecordKind[] = ["requests", "tasks", "information"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const session = await requireApiArea("admin", { page: "admin.records" });
    const { kind } = await params;
    if (!(KINDS as readonly string[]).includes(kind) || !(await canExport(session.user))) return apiError("NOT_FOUND", "Not found.", 404);
    if (await overLimit(`report-export:${session.user.id}`, 20)) return tooManyResponse("Too many downloads. Wait a minute and try again.");
    const filter = readRecordFilter(kind as RecordKind, Object.fromEntries(request.nextUrl.searchParams));
    const { rows, truncated } = await exportRecords(kind as RecordKind, filter);
    const columns = columnsFor(kind as RecordKind) as RecordColumn<(typeof rows)[number]>[];
    // A byte-order mark, so Excel opens the file as UTF-8 (names, ₹).
    const body = `\uFEFF${toCsv(columns.map((column) => column.label), rows.map((row) => columns.map((column) => column.value(row))))}`;
    await recordAudit({ actorUserId: session.user.id, action: "RECORDS_EXPORTED", entityType: "RECORDS", entityId: kind, sessionId: session.sessionId, metadata: { rows: rows.length, truncated } });
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": CSV_MIME,
        "Content-Disposition": `attachment; filename="ars-${kind}-${day}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(truncated ? { "X-Rows-Truncated": "1" } : {}),
      },
    });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("records download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
