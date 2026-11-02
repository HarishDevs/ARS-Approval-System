import type { NextRequest } from "next/server";
import { passwordStartSchema } from "@/features/auth/schemas";
import { startPasswordSignIn } from "@/server/auth/password-sign-in";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { GENERIC_SIGN_IN_FAILED } from "@/server/auth/errors";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";

// Step 1 of F-02: password check, then the WhatsApp code is sent.
// Q-015: the break-glass account inside its window is signed in here.
export async function POST(request: NextRequest) {
  const parsed = passwordStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED, 400);
  try {
    const context = getRequestContext(request);
    await enforceRateLimit("SIGNIN", context, parsed.data.loginId);
    const started = await startPasswordSignIn(parsed.data.loginId, parsed.data.password, context);
    if ("signedIn" in started) return setSignInCookies(apiSuccess({ redirectTo: started.signedIn.redirectTo }), started.signedIn);
    return apiSuccess(started);
  } catch (error) {
    return authErrorResponse(error, "auth/password/start");
  }
}
