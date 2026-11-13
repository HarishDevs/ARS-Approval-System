import type { NextRequest } from "next/server";
import { googleSignInSchema } from "@/features/auth/schemas";
import { googleSignIn } from "@/server/auth/google-sign-in";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { AuthError } from "@/server/auth/errors";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { logInfo } from "@/lib/logging/logger";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";

// F-01: the browser sends the Google ID token from the Firebase popup; the
// server verifies it and signs the person in. v1.54.6 (Google sign-in fix):
// one structured log line per attempt (the middleware's request id, stage,
// outcome, reason code, host, duration; never the token or the email).
export async function POST(request: NextRequest) {
  const started = Date.now();
  const requestId = request.headers.get(REQUEST_ID_HEADER);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").slice(0, 100);
  const log = (outcome: "SIGNED_IN" | "REFUSED" | "BAD_REQUEST" | "ERROR", status: number, reason?: string) =>
    logInfo("auth.google", { requestId, stage: "SERVER_VERIFY", outcome, status, reason: reason ?? null, host, durationMs: Date.now() - started });
  const parsed = googleSignInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    log("BAD_REQUEST", 400, "NO_TOKEN");
    return apiError("AUTH_INVALID_TOKEN", "Google sign-in failed. Please try again.", 400);
  }
  try {
    const context = getRequestContext(request);
    await enforceRateLimit("GOOGLE", context);
    const result = await googleSignIn(parsed.data.idToken, context);
    log("SIGNED_IN", 200);
    return setSignInCookies(apiSuccess({ redirectTo: result.redirectTo }), result);
  } catch (error) {
    const response = authErrorResponse(error, "auth/google");
    log(error instanceof AuthError ? "REFUSED" : "ERROR", response.status, error instanceof AuthError ? (error.reason ?? error.code) : "SYSTEM_ERROR");
    return response;
  }
}
