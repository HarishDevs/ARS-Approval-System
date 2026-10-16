import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { searchRequests } from "@/lib/db/repositories/search.repository";
import { listRecent } from "@/lib/db/repositories/recent.repository";
import { parseSearchFilters } from "@/server/search/filters";
import { STATUS_WORD } from "@/features/ui/labels";
import { LIMITS, overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// WS-03/04 command palette data: requests matching the typed text (two or
// more characters), or the recently viewed ones. Access is the same SQL
// rule as search and the request page; knowing a number shows nothing more.
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiArea("users");
    if (await overLimit(`quick:${session.user.id}`, LIMITS.quick)) return tooManyResponse();
    const viewer = { id: session.user.id, isAdmin: session.user.roles.includes("IT_ADMIN") || session.user.roles.includes("SUPER_ADMIN") };
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const items =
      q.length >= 2
        ? (await searchRequests(viewer, { ...parseSearchFilters({ q }), page: 1 })).items.slice(0, 8).map((item) => ({ id: item.id, requestNo: item.requestNo, title: item.title, status: STATUS_WORD[item.status] ?? item.status }))
        : (await listRecent(viewer, 8)).map((item) => ({ id: item.id, requestNo: item.requestNo, title: item.title, status: STATUS_WORD[item.status] ?? item.status }));
    return Response.json({ kind: q.length >= 2 ? "search" : "recent", items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("quick search failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
