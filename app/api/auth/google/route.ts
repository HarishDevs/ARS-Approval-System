import type { NextRequest } from "next/server";
import { googleSignInSchema } from "@/features/auth/schemas";
import { googleSignIn } from "@/server/auth/google-sign-in";
import { authErrorResponse, setSignInCookies } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

export async function POST(request: NextRequest) {
  const parsed = googleSignInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_INVALID_TOKEN", "Google sign-in failed. Please try again.", 400);
  try {
    const result = await googleSignIn(parsed.data.idToken, getRequestContext(request));
    return setSignInCookies(apiSuccess({ redirectTo: result.redirectTo }), result);
  } catch (error) {
    return authErrorResponse(error, "auth/google");
  }
}
