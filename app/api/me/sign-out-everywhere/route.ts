import type { NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { signOutEverywhere } from "@/server/auth/session";
import { clearSessionCookie } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiArea("users");
    await signOutEverywhere(session.user.id, session.user.id, "USER_SIGN_OUT_EVERYWHERE", getRequestContext(request).ipAddress);
    return clearSessionCookie(apiSuccess({ redirectTo: "/login" }));
  } catch {
    return apiError("NOT_FOUND", "Not found.", 404);
  }
}
