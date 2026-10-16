import { NextResponse, type NextRequest } from "next/server";
import { requireApiArea } from "@/server/authorization/guards";
import { finishConnect, NONCE_COOKIE } from "@/server/calendar/service";
import { logError } from "@/lib/logging/logger";

// v1.11.0: Google sends the person back here after consent. The state must
// be theirs, unused and unexpired, and match this browser's nonce cookie.
// Tokens are exchanged and stored encrypted on the server only; nothing
// secret goes into the address or the page.
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiArea("users", { change: false });
    const query = request.nextUrl.searchParams;
    const result = await finishConnect(
      { id: session.user.id, sessionId: session.sessionId },
      { code: query.get("code"), state: query.get("state"), error: query.get("error") },
      request.cookies.get(NONCE_COOKIE)?.value ?? null,
    );
    const target = new URL(result.ok ? "/users/profile/calendar?connected=1" : `/users/profile/calendar?error=${result.error}`, request.url);
    const response = NextResponse.redirect(target, 303);
    response.cookies.set(NONCE_COOKIE, "", { path: "/api/integrations/google-calendar", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer"); // the one-time code never travels further
    return response;
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("calendar connect callback failed", error);
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
}
