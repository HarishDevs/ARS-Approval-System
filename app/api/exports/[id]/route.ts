import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { openExport } from "@/server/reports/background";
import { CONTENT_TYPE } from "@/server/reports/export";
import { canExport } from "@/server/settings/features";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// v1.7.0 (C02): download a background export. Its owner only, while it is
// kept (7 days), and only with the download permission now. Audited.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireApiArea("users");
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  try {
    const { id } = await params;
    if (!/^\d{1,10}$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
    if (!(await canExport(session.user))) return apiError("FORBIDDEN", "Downloads are limited to people with the Can export permission. Ask IT.", 403);
    const file = await openExport(Number(id), session.user.id);
    if (!file) return apiError("NOT_FOUND", "Not found, or no longer kept.", 404);
    await recordAudit({ actorUserId: session.user.id, action: "EXPORT_DOWNLOADED", entityType: "EXPORT", entityId: id, sessionId: session.sessionId });
    return new Response(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[file.format],
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("export download failed", error);
    return apiError("SYSTEM_ERROR", "The file couldn't be read. Please try again.", 500);
  }
}
