import { cookies } from "next/headers";
import { getCurrentSession } from "@/server/auth/session";
import { redeemTryAsLink, TRY_AS_SESSION_SECONDS } from "@/server/auth/try-as";
import { getActionContext } from "@/lib/http/request-context";
import { redirectToPage } from "@/lib/http/redirect";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { logError } from "@/lib/logging/logger";

// D-185: opens a one-time Try as link in a private window. Refused where
// someone is already signed in (it never replaces a session); the link is
// signed, expires in 5 minutes and works once. The session is view-only.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const context = await getActionContext();
    const result = await redeemTryAsLink(token, { signedIn: (await getCurrentSession()) !== null, ipAddress: context.ipAddress, userAgent: context.userAgent });
    if (!result.ok) {
      const response = redirectToPage(`/try?reason=${result.reason}`);
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
    (await cookies()).set(SESSION_COOKIE_NAME, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TRY_AS_SESSION_SECONDS });
    const response = redirectToPage("/users");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    logError("try as failed", error);
    return redirectToPage("/try?reason=REFUSED");
  }
}
