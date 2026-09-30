import type { NextRequest } from "next/server";
import { otpResendSchema } from "@/features/auth/schemas";
import { resendOtp } from "@/server/auth/password-sign-in";
import { authErrorResponse } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";

export async function POST(request: NextRequest) {
  const parsed = otpResendSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_CHALLENGE_EXPIRED", "This code has expired. Please sign in again.", 400);
  try {
    const context = getRequestContext(request);
    await enforceRateLimit("CODE", context);
    return apiSuccess(await resendOtp(parsed.data.challengeToken, context));
  } catch (error) {
    return authErrorResponse(error, "auth/password/resend");
  }
}
