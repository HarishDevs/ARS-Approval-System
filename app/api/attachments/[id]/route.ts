import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { openAttachment } from "@/server/attachments/service";
import { downloadHeaders } from "@/server/attachments/files";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// Attachment download (F-18, D-072): signed in, and allowed to see the
// request; anything else is the same plain 404. Always a download.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiArea("users");
    const { id } = await params;
    if (!/^\d+$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
    const file = await openAttachment(Number(id), { id: session.user.id, roles: session.user.roles });
    if (!file) return apiError("NOT_FOUND", "Not found.", 404);
    return new Response(new Uint8Array(file.bytes), { status: 200, headers: downloadHeaders(file.record.name, file.record.contentType, file.bytes.length) });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("attachment download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
