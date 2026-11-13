import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/http/request-context";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { logInfo } from "@/lib/logging/logger";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";

// v1.54.6 (Google sign-in fix): the browser reports why the Google popup
// failed (a Firebase error code such as auth/popup-blocked), so failures that
// never reach /api/auth/google are visible in the server log. Only a code
// matching the Firebase pattern is kept; nothing personal, no token. Same-site
// only (the middleware refuses other sites); 30 reports per IP per 15 minutes.
const CODE = /^auth\/[a-z0-9-]{1,60}$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" && CODE.test(body.code) ? body.code : "unknown";
  const context = getRequestContext(request);
  const count = await hitRateLimit(`google-client:${context.ipAddress ?? "unknown"}`, 900).catch(() => 0);
  if (count <= 30) {
    logInfo("auth.google", {
      requestId: request.headers.get(REQUEST_ID_HEADER),
      stage: "BROWSER_POPUP",
      outcome: "FAILED",
      reason: code,
      host: (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").slice(0, 100),
      userAgent: (context.userAgent ?? "").slice(0, 160),
    });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
