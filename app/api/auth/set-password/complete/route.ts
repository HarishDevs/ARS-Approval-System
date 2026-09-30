import type { NextRequest } from "next/server";
import { setPasswordCompleteSchema } from "@/features/auth/schemas";
import { completeSetPassword } from "@/server/auth/set-password";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

// F-04 step 2: check the code, save the password and sign in.
export async function POST(request: NextRequest) {
  const parsed = setPasswordCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_OTP", "Enter the code from WhatsApp.", 400);
  try {
    const { token, challengeToken, code, password, confirm } = parsed.data;
    const result = await completeSetPassword(token, challengeToken, code, password, confirm, getRequestContext(request));
    return setSignInCookies(apiSuccess({ redirectTo: result.redirectTo }), result);
  } catch (error) {
    return authErrorResponse(error, "auth/set-password/complete");
  }
}
