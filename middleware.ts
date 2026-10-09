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
const PUBLIC_PREFIXES = ["/login", "/set-password", "/forgot-password", "/security", "/api/auth", "/api/jobs", "/api/health", "/api/webhooks", "/_next", "/brand", "/favicon.ico", "/icon.svg"];

const CSP_OPTIONS = {
  dev: process.env.NODE_ENV !== "production",
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "power-bi-dashboard-3b29f.firebaseapp.com",
};

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Same length and same characters, without stopping at the first difference.
function sameSecret(given: string | null, expected: string): boolean {
  if (given === null || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Called by machines, not browsers: the cron job and the provider webhook.
const MACHINE_APIS = ["/api/jobs/", "/api/webhooks/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Audit P-01 (D-102): with ORIGIN_SECRET set, only requests that came
  // through Cloudflare (a Transform Rule adds the x-ars-origin header) are
  // served; anything sent straight to the GoDaddy origin is refused, so
  // nobody can bypass Cloudflare or fake CF-Connecting-IP. Unset = off.
  const originSecret = process.env.ORIGIN_SECRET;
  if (originSecret && !sameSecret(request.headers.get("x-ars-origin"), originSecret)) {
    return new NextResponse("Direct access is not allowed.", { status: 403 });
  }

  // Audit P-07: a state-changing API call must come from this site's own
  // pages. Browsers say where a request comes from (Sec-Fetch-Site); another
  // site, even a sibling *.arssteels.net, is refused. Server Actions have
  // Next's own origin check.
  if (UNSAFE_METHODS.has(request.method) && pathname.startsWith("/api/") && !MACHINE_APIS.some((prefix) => pathname.startsWith(prefix))) {
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Not allowed." } }, { status: 403 });
    }
  }

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
