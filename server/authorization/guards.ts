import "server-only";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession, type CurrentSession } from "@/server/auth/session";
import { evaluateAreaAccess } from "@/server/authorization/policy";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import type { AppArea } from "@/types/auth";

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
  if (result.allowed && session) return session;
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
// caller maps it to a generic "not found" answer.
export async function requireApiArea(area: AppArea): Promise<CurrentSession> {
  const session = await getCurrentSession();
  const result = evaluateAreaAccess(session?.user ?? null, area);
  if (result.allowed && session) return session;
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
