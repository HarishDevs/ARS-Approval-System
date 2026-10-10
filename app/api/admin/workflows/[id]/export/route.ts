import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { exportApprovalType } from "@/server/workflows/promotion";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// FN9: download an approval type's configuration (live version) as a file
// to import in another environment. IT team only; audited.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireApiArea("admin");
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) return apiError("NOT_FOUND", "Not found.", 404);
  try {
    const pkg = await exportApprovalType(Number(id), { id: session.user.id, roles: session.user.roles });
    if (!pkg) return apiError("NOT_FOUND", "Not found.", 404);
    return new Response(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="approval-type-${pkg.type.code.toLowerCase()}-v${pkg.version.versionNo}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logError("approval type export failed", error);
    return apiError("VALIDATION", error instanceof Error ? error.message : "The export failed.", 400);
  }
}
