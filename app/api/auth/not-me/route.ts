import type { NextRequest } from "next/server";
import { notMeSchema } from "@/features/auth/schemas";
import { reportNotMe } from "@/server/auth/session";
import { clearSessionCookie } from "@/server/auth/http";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getRequestContext } from "@/lib/http/request-context";
import { logError } from "@/lib/logging/logger";

// POST only, from the confirm page (F-05). The link in the alert opens that
// page; it never changes anything by itself.
export async function POST(request: NextRequest) {
  const parsed = notMeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_LINK", "This link is not valid. Contact IT.", 400);
  try {
    const result = await reportNotMe(parsed.data.token, getRequestContext(request).ipAddress);
    if (result === "INVALID_LINK") return apiError("INVALID_LINK", "This link is not valid or has expired. Contact IT.", 400);
    return clearSessionCookie(apiSuccess({ secured: true }));
  } catch (error) {
    logError("auth/not-me failed", error);
    return apiError("SYSTEM_ERROR", "Something went wrong. Contact IT (itadmin@arssteels.co.in).", 500);
  }
}
