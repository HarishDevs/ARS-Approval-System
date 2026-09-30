import type { NextRequest } from "next/server";
import { forgotCompleteSchema } from "@/features/auth/schemas";
import { completeForgotPassword } from "@/server/auth/set-password";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";

// F-04 forgot password, step 2: code + new password, then signed in.
export async function POST(request: NextRequest) {
  const parsed = forgotCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_OTP", "Enter the code from WhatsApp.", 400);
  try {
    const context = getRequestContext(request);
    await enforceRateLimit("CODE", context);
    const { challengeToken, code, password, confirm } = parsed.data;
    const result = await completeForgotPassword(challengeToken, code, password, confirm, context);
    return setSignInCookies(apiSuccess({ redirectTo: result.redirectTo }), result);
  } catch (error) {
    return authErrorResponse(error, "auth/forgot/complete");
  }
}
