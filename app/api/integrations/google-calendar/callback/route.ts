import { NextResponse, type NextRequest } from "next/server";
import { redirectToPage } from "@/lib/http/redirect";
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
    // Relative: behind the host's proxy request.url is localhost (D-165).
    const response = redirectToPage(result.ok ? "/users/profile/calendar?connected=1" : `/users/profile/calendar?error=${result.error}`);
    response.headers.append("Set-Cookie", `${NONCE_COOKIE}=; Path=/api/integrations/google-calendar; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    response.headers.set("Referrer-Policy", "no-referrer"); // the one-time code never travels further
    return response;
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("calendar connect callback failed", error);
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
}
