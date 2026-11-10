import "server-only";
import { headers } from "next/headers";
import { safeNextPath } from "@/lib/http/safe-next";
import { NEXT_HEADER } from "@/lib/security/path-signature";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession, sessionEndReason, type CurrentSession } from "@/server/auth/session";
import { evaluateAreaAccess } from "@/server/authorization/policy";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { AppArea } from "@/types/auth";
import { checkPageAccess, checkPageKey, requestPage } from "@/server/authorization/page-access";
import { alertBreakGlassAction } from "@/server/auth/break-glass-alert";

export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

// Layer 2 for pages/layouts. No session → sign-in page. Signed in without
// the role → a plain 404, so /admin and /superadmin don't even confirm they
// exist (D-016). Every denial is audited.
export async function requireArea(area: AppArea): Promise<CurrentSession> {
  const session = await getCurrentSession();
  const result = evaluateAreaAccess(session?.user ?? null, area);
  if (result.allowed && session) {
    // v1.8.0: the page itself may be hidden from this person (Super Admin's
    // page access). v1.50.3 (owner): it says so on a "You don't have access"
    // screen (a page, never a record, so nothing private is confirmed).
    const page = await checkPageAccess(session.user, false);
    if (page.ok) return session;
    await recordAudit({ actorUserId: session.user.id, action: "PAGE_ACCESS_DENIED", entityType: "PAGE", entityId: page.pageKey ?? "unknown", result: "FAILURE", sessionId: session.sessionId, metadata: { reason: page.reason } });
    if (area === "users" || area === "admin") redirect(`/${area}/no-access?${new URLSearchParams({ ...(page.pageKey ? { page: page.pageKey } : {}), why: page.reason })}`);
    notFound();
  }
  if (!session) {
    // v1.12.1 (D-158): a session that ended shows why, with a way back in.
    const reason = await sessionEndReason().catch(() => null);
    // D-250: return to the page asked for (checked again after sign-in).
    const next = encodeURIComponent(safeNextPath((await headers()).get(NEXT_HEADER), `/${area}`));
    redirect(reason ? `/signed-out?reason=${reason}&next=${next}` : `/login?next=${next}`);
  }
  await recordAudit({
    actorUserId: session.user.id,
    action: "AREA_ACCESS_DENIED",
    entityType: "ROUTE",
    entityId: area,
    result: "FAILURE",
    sessionId: session.sessionId,
    metadata: { reason: result.allowed ? null : result.reason },
  });
  notFound();
}

// Same check for API route handlers and Server Actions: throws, and the
// caller maps it to a generic "not found" answer. v1.8.0: a Server Action
// (or an API call marked `change`) also needs Full access to its page; a
// view-only page can be read but not changed.
// G-3 (v1.10.0): `page` names the page the action belongs to; its rule is
// checked as well as the rule of the address it was posted from.
export async function requireApiArea(area: AppArea, options: { change?: boolean; page?: string } = {}): Promise<CurrentSession> {
  const session = await getCurrentSession();
  const result = evaluateAreaAccess(session?.user ?? null, area);
  if (result.allowed && session) {
    const change = options.change ?? (await requestPage()).isAction;
    const byPath = await checkPageAccess(session.user, change);
    const page = byPath.ok && options.page ? await checkPageKey(session.user, options.page, change) : byPath;
    if (page.ok) {
      // D-246 (audit FI-D06): what the break-glass account changes is audited and alerted (never blocks).
      if (change && session.user.isBreakGlass) void alertBreakGlassAction(session, (await requestPage()).page?.key ?? area);
      return session;
    }
    await recordAudit({ actorUserId: session.user.id, action: "PAGE_ACCESS_DENIED", entityType: "PAGE", entityId: page.pageKey ?? "unknown", result: "FAILURE", sessionId: session.sessionId, metadata: { reason: page.reason, change } });
    throw new ForbiddenError();
  }
  if (session) {
    await recordAudit({
      actorUserId: session.user.id,
      action: "API_ACCESS_DENIED",
      entityType: "ROUTE",
      entityId: area,
      result: "FAILURE",
      sessionId: session.sessionId,
    });
  }
  throw new ForbiddenError();
}
