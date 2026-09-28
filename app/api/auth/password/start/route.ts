import type { NextRequest } from "next/server";
import { passwordStartSchema } from "@/features/auth/schemas";
import { startPasswordSignIn } from "@/server/auth/password-sign-in";
import { authErrorResponse } from "@/server/auth/http";
import { GENERIC_SIGN_IN_FAILED } from "@/server/auth/errors";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

// Step 1 of F-02: password check, then the WhatsApp code is sent.
export async function POST(request: NextRequest) {
  const parsed = passwordStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_CREDENTIALS", GENERIC_SIGN_IN_FAILED, 400);
  try {
    const challenge = await startPasswordSignIn(parsed.data.loginId, parsed.data.password, getRequestContext(request));
    return apiSuccess(challenge);
  } catch (error) {
    return authErrorResponse(error, "auth/password/start");
  }
}
