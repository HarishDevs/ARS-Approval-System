import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { buildCsp, createNonce } from "@/lib/security/csp";

// Layer 1 of 3 (P1-30a): only checks that a session cookie is present.
// Roles and the session row are checked on the server in every layout,
// page, route handler and action (layer 2), and per record (layer 3).
// Security never depends on this file alone.
//
// It also sets the per-request Content-Security-Policy nonce (P1-34a).
// Next.js reads the nonce from the request's CSP header and adds it to its
// own scripts, so every page is rendered per request (root layout is dynamic).
const PUBLIC_PREFIXES = ["/login", "/set-password", "/forgot-password", "/security", "/api/auth", "/api/jobs", "/_next", "/brand", "/favicon.ico", "/icon.svg"];

const CSP_OPTIONS = {
  dev: process.env.NODE_ENV !== "production",
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "power-bi-dashboard-3b29f.firebaseapp.com",
};

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  const csp = buildCsp(nonce, CSP_OPTIONS);

  if (!isPublic(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static files and prefetches (they carry no HTML to protect).
    {
      source: "/((?!_next/static|_next/image|favicon.ico|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
