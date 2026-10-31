import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { loadRequestRoad } from "@/server/approvals/road-view";
import { overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// D-253: the road of one request, for the request page's live updates (it
// asks every 20 seconds while visible). Same record check as the page; a
// request the caller may not see is a plain 404.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiArea("users", { change: false });
    if (await overLimit(`progress:${session.user.id}`, 60)) return tooManyResponse();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return apiError("NOT_FOUND", "Not found.", 404);
    const loaded = await loadRequestRoad(id, { id: session.user.id, roles: session.user.roles });
    if (!loaded) return apiError("NOT_FOUND", "Not found.", 404);
    return Response.json(loaded, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("request progress failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
