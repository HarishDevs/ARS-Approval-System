import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";

// Layer 1 of 3 (P1-30a): only checks that a session cookie is present.
// Roles and the session row are checked on the server in every layout,
// page, route handler and action (layer 2), and per record (layer 3).
// Security never depends on this file alone.
const PUBLIC_PREFIXES = ["/login", "/security", "/api/auth", "/api/jobs", "/_next", "/brand", "/favicon.ico", "/icon.svg"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix + "?"))) {
    return NextResponse.next();
  }
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
