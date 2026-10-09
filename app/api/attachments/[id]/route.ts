import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { openAttachment } from "@/server/attachments/service";
import { downloadHeaders, inlineHeaders, previewKind } from "@/server/attachments/files";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// Attachment download (F-18, D-072): signed in, and allowed to see the
// request; anything else is the same plain 404. A download by default;
// ?inline=1 shows an image or PDF in the browser (RD-02), and only those
// types: anything else is still a download.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiArea("users");
    const { id } = await params;
    if (!/^\d+$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
    const file = await openAttachment(Number(id), { id: session.user.id, roles: session.user.roles });
    if (!file) return apiError("NOT_FOUND", "Not found.", 404);
    const inline = request.nextUrl.searchParams.get("inline") === "1" && previewKind(file.record.contentType) !== null;
    const headers = inline ? inlineHeaders(file.record.name, file.record.contentType, file.bytes.length) : downloadHeaders(file.record.name, file.record.contentType, file.bytes.length);
    return new Response(new Uint8Array(file.bytes), { status: 200, headers });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("attachment download failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
