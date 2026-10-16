import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { findRecordFile, readRecordFile } from "@/server/modules/files";
import { loadTaskFor } from "@/server/modules/tasks";
import { loadInfoFor } from "@/server/modules/information";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { downloadHeaders, inlineHeaders, previewKind } from "@/server/attachments/files";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// v1.9.0: files of tasks and information. Signed in, and allowed to see the
// record (the same rule as its page); anything else is the same plain 404.
// Denials are audited.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiArea("users");
    const { id } = await params;
    if (!/^\d{1,10}$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
    const file = await findRecordFile(Number(id));
    if (!file) return apiError("NOT_FOUND", "Not found.", 404);
    const viewer = { id: session.user.id, roles: session.user.roles };
    const allowed = file.entityType === "TASK" ? await loadTaskFor(file.entityId, viewer) : await loadInfoFor(file.entityId, viewer);
    if (!allowed) {
      await recordAudit({ actorUserId: session.user.id, action: "RECORD_FILE_ACCESS_DENIED", entityType: "RECORD_FILE", entityId: file.id, result: "FAILURE", sessionId: session.sessionId });
      return apiError("NOT_FOUND", "Not found.", 404);
    }
    const bytes = await readRecordFile(file);
    if (!bytes) return apiError("NOT_FOUND", "Not found.", 404);
    const inline = request.nextUrl.searchParams.get("inline") === "1" && previewKind(file.contentType) !== null;
    const headers = inline ? inlineHeaders(file.name, file.contentType, bytes.length) : downloadHeaders(file.name, file.contentType, bytes.length);
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("record file download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
