import { NextResponse } from "next/server";
import { redirectToPage } from "@/lib/http/redirect";
import { requireApiArea } from "@/server/authorization/guards";
import { NONCE_COOKIE, startConnect } from "@/server/calendar/service";
import { overLimit } from "@/server/security/limits";
import { logError } from "@/lib/logging/logger";

// v1.11.0: "Connect Google Account". Starts Google's consent screen for the
// signed-in person with a single-use state, bound to a nonce cookie in this
// browser (CSRF protection for the callback).
export async function GET() {
  // Relative: behind the host's proxy request.url is localhost (D-165).
  const back = (query: string) => redirectToPage(`/users/profile/calendar?${query}`);
  try {
    const session = await requireApiArea("users", { change: true, page: "users.profile" });
    if (await overLimit(`gcal-connect:${session.user.id}`, 10)) return back("error=LIMIT");
    const started = await startConnect({ id: session.user.id, email: session.user.email });
    if (!started.ok) return back("error=UNAVAILABLE");
    const response = NextResponse.redirect(started.value.url, 303);
    response.cookies.set(NONCE_COOKIE, started.value.nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // sent on Google's top-level redirect back
      path: "/api/integrations/google-calendar",
      maxAge: 600,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if ((error as Error)?.name !== "ForbiddenError") logError("calendar connect start failed", error);
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }
}
