import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { countUnreadByCategory, listInbox, markAllReadReturningIds, markRead } from "@/lib/db/repositories/collab.repository";
import { appPath, parseCategory, type NotificationCategory } from "@/server/notifications/categories";
import { LIMITS, overLimit, tooManyResponse } from "@/server/security/limits";
import { apiError } from "@/lib/http/api-response";
import { logError } from "@/lib/logging/logger";

// v1.9.0 (owner, D-146): the bell's dropdown. GET = the latest 10 of the
// signed-in person (optionally one module) and the unread counts; POST =
// mark some, or all, as read. Only ever the caller's own notifications:
// user_id comes from the session, never from the request.
const NO_STORE = { "Cache-Control": "no-store, private" };

export async function GET(request: NextRequest) {
  try {
    // Reading your own notifications never changes a page, so it isn't a "change".
    const session = await requireApiArea("users", { change: false });
    if (await overLimit(`notifications:${session.user.id}`, LIMITS.notifications)) return tooManyResponse();
    const category: NotificationCategory | null = parseCategory(request.nextUrl.searchParams.get("type"));
    const [items, unread] = await Promise.all([listInbox(session.user.id, 10, undefined, undefined, category), countUnreadByCategory(session.user.id)]);
    return Response.json(
      {
        items: items.map((item) => ({ id: item.id, title: item.title, message: item.message.slice(0, 200), category: item.category, createdAt: item.createdAt.toISOString(), read: item.read, path: appPath(item.deepLink) })),
        unread: { ALL: Object.values(unread).reduce((sum, count) => sum + count, 0), ...unread },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("notifications dropdown failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiArea("users", { change: false });
    if (await overLimit(`notifications:${session.user.id}`, LIMITS.notifications)) return tooManyResponse();
    const body = (await request.json().catch(() => null)) as { action?: unknown; ids?: unknown } | null;
    if (body?.action === "read-all") {
      const ids = await markAllReadReturningIds(session.user.id);
      return Response.json({ ok: true, changed: ids.length }, { headers: NO_STORE });
    }
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, 100) : [];
    if (body?.action !== "read" || ids.length === 0) return apiError("VALIDATION_ERROR", "Nothing to mark.", 400);
    return Response.json({ ok: true, changed: await markRead(session.user.id, ids) }, { headers: NO_STORE });
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("notifications mark read failed", error);
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
