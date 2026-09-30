import type { NextRequest } from "next/server";
import { setPasswordStartSchema } from "@/features/auth/schemas";
import { startSetPassword } from "@/server/auth/set-password";
import { authErrorResponse } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";

// F-04 step 1: check the link and the new password, then send a WhatsApp code.
export async function POST(request: NextRequest) {
  const parsed = setPasswordStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("AUTH_LINK_INVALID", "This link has expired or was already used. Ask IT for a new one.", 400);
  try {
    return apiSuccess(await startSetPassword(parsed.data.token, parsed.data.password, parsed.data.confirm, getRequestContext(request)));
  } catch (error) {
    return authErrorResponse(error, "auth/set-password/start");
  }
}
