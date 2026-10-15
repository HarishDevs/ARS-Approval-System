import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession, type CurrentSession } from "@/server/auth/session";
import { evaluateAreaAccess } from "@/server/authorization/policy";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { AppArea } from "@/types/auth";
import { checkPageAccess, requestPage } from "@/server/authorization/page-access";

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
    // page access). Same plain 404 as a page that doesn't exist.
    const page = await checkPageAccess(session.user, false);
    if (page.ok) return session;
    await recordAudit({ actorUserId: session.user.id, action: "PAGE_ACCESS_DENIED", entityType: "PAGE", entityId: page.pageKey ?? "unknown", result: "FAILURE", sessionId: session.sessionId, metadata: { reason: page.reason } });
    notFound();
  }
  if (!session) redirect(`/login?next=/${area}`);
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
export async function requireApiArea(area: AppArea, options: { change?: boolean } = {}): Promise<CurrentSession> {
  const session = await getCurrentSession();
  const result = evaluateAreaAccess(session?.user ?? null, area);
  if (result.allowed && session) {
    const change = options.change ?? (await requestPage()).isAction;
    const page = await checkPageAccess(session.user, change);
    if (page.ok) return session;
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
