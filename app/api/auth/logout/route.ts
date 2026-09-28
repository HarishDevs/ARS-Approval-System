import type { NextRequest } from "next/server";
import { getCurrentSession, signOut } from "@/server/auth/session";
import { clearSessionCookie } from "@/server/auth/http";
import { apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { logError } from "@/lib/logging/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (session) await signOut(session.sessionId, session.user.id, getRequestContext(request).ipAddress);
  } catch (error) {
    logError("auth/logout failed", error);
  }
  return clearSessionCookie(apiSuccess({ redirectTo: "/login" }));
}
