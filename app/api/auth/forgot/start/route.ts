import type { NextRequest } from "next/server";
import { forgotStartSchema } from "@/features/auth/schemas";
import { startForgotPassword } from "@/server/auth/set-password";
import { authErrorResponse } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { enforceRateLimit } from "@/server/auth/rate-limit";

// F-04 forgot password, step 1. The answer is the same whether or not the
// User ID exists.
export async function POST(request: NextRequest) {
  const parsed = forgotStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_FAILED", "Enter your User ID.", 400);
  try {
    const context = getRequestContext(request);
    await enforceRateLimit("FORGOT", context, parsed.data.loginId);
    return apiSuccess(await startForgotPassword(parsed.data.loginId, context));
  } catch (error) {
    return authErrorResponse(error, "auth/forgot/start");
  }
}
