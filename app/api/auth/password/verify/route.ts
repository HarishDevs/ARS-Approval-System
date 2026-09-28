import type { NextRequest } from "next/server";
import { otpVerifySchema } from "@/features/auth/schemas";
import { verifyOtp } from "@/server/auth/password-sign-in";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

// Step 2 of F-02: WhatsApp code → session.
export async function POST(request: NextRequest) {
  const parsed = otpVerifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_OTP", "Enter the code from WhatsApp.", 400);
  try {
    const result = await verifyOtp(parsed.data.challengeToken, parsed.data.code, getRequestContext(request));
    return setSignInCookies(apiSuccess({ redirectTo: result.redirectTo }), result);
  } catch (error) {
    return authErrorResponse(error, "auth/password/verify");
  }
}
