import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { pickRequestId, REQUEST_ID_HEADER } from "@/lib/logging/request-id";
import { PATH_HEADER, PATH_SIGNATURE_HEADER, signPath, WRITE_HEADER, NEXT_HEADER } from "@/lib/security/path-signature";
import { sessionCookieLooksValid } from "@/lib/security/session-cookie-edge";

// Layer 1 of 3 (P1-30a): only checks that a session cookie is present.
// Roles and the session row are checked on the server in every layout,
// page, route handler and action (layer 2), and per record (layer 3).
// Security never depends on this file alone.
//
// It also sets the per-request Content-Security-Policy nonce (P1-34a).
// Next.js reads the nonce from the request's CSP header and adds it to its
// own scripts, so every page is rendered per request (root layout is dynamic).
// v1.12.2: "/" (the public home page), "/privacy" and "/terms" are public (Google OAuth verification).
const PUBLIC_PREFIXES = ["/", "/try", "/privacy", "/terms", "/login", "/signed-out", "/set-password", "/forgot-password", "/security", "/api/auth", "/api/jobs", "/api/health", "/api/webhooks", "/api/push/resubscribe", "/sw.js", "/offline.html", "/_next", "/brand", "/animations", "/icons", "/manifest.webmanifest", "/favicon.ico", "/icon.svg", "/robots.txt", "/sitemap.xml"];
// QA-SEC-02 (v1.42.1): GET routes that store something (OAuth connect and callback).
const WRITING_GETS = ["/api/integrations/"];

const CSP_OPTIONS = {
  dev: process.env.NODE_ENV !== "production",
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "power-bi-dashboard-3b29f.firebaseapp.com",
};

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const STATIC_PREFIXES = ["/_next/", "/brand/", "/icons/"];
const STATIC_FILES = new Set(["/manifest.webmanifest", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/robots.txt"]);
function isStaticAsset(pathname: string): boolean {
  return STATIC_FILES.has(pathname) || STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Same length and same characters, without stopping at the first difference.
function sameSecret(given: string | null, expected: string): boolean {
  if (given === null || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Routes that send files set their own, stricter policy (a sandbox for
// attachments and the PDF summary, RD-02); the page policy mustn't replace it.
const FILE_ROUTE = /^\/api\/(attachments\/\d+|requests\/\d+\/summary\.pdf)$/;
// Called by machines, not browsers: the cron job and the provider webhook.
const MACHINE_APIS = ["/api/jobs/", "/api/webhooks/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // #14: one id per request (Cloudflare's CF-Ray when present, else new).
  // A caller's own x-request-id is not trusted.
  const requestId = pickRequestId(request.headers.get("cf-ray"));

  // Audit P-01 (D-102): with ORIGIN_SECRET set, only requests that came
  // through Cloudflare (a Transform Rule adds the x-ars-origin header) are
  // served; anything sent straight to the GoDaddy origin is refused, so
  // nobody can bypass Cloudflare or fake CF-Connecting-IP. Unset = off.
  const originSecret = process.env.ORIGIN_SECRET;
  if (originSecret && !sameSecret(request.headers.get("x-ars-origin"), originSecret)) {
    return new NextResponse("Direct access is not allowed.", { status: 403 });
  }

  // D-196 (owner): the app moved from approval.arssteels.net to arssteels.net.
  // With LEGACY_HOSTS set (e.g. "approval.arssteels.net"), a visit to a former
  // address goes to the same page on APP_BASE_URL, so old links in emails,
  // WhatsApp and bookmarks keep working. Machine calls (the job runner,
  // provider webhooks) and OAuth callbacks are still served there, so nothing
  // breaks while their settings are moved. Unset = off.
  const legacy = (process.env.LEGACY_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  if (legacy.includes(host) && process.env.APP_BASE_URL && !MACHINE_APIS.some((prefix) => pathname.startsWith(prefix)) && !pathname.startsWith("/api/integrations/")) {
    const target = new URL(`${pathname}${request.nextUrl.search}`, process.env.APP_BASE_URL);
    if (target.host.toLowerCase() !== host) return NextResponse.redirect(target, 308);
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

  // SEC-08 (v1.10.0): plain-HTTP visits are sent to HTTPS. Cloudflare says
  // which scheme the visitor used (CF-Visitor); the hop to GoDaddy is
  // separate, so X-Forwarded-Proto there isn't the visitor's.
  if (process.env.NODE_ENV === "production" && /"scheme"\s*:\s*"http"/.test(request.headers.get("cf-visitor") ?? "")) {
    const secure = request.nextUrl.clone();
    secure.protocol = "https:";
    secure.port = "";
    return NextResponse.redirect(secure, 308);
  }

  // SEC-07 (v1.10.0): no other site may call the API from a browser. A
  // preflight gets no Access-Control-Allow-* headers, so the browser stops
  // there; the app's own pages are same-origin and never send one.
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204, headers: { Allow: "GET, POST, HEAD", Vary: "Origin", "Cache-Control": "no-store" } });
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, CSP_OPTIONS);

  if (!isPublic(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    const loginUrl = new URL("/login", request.url);
    // D-250: back to the exact page after sign-in (e.g. a notification's record).
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  // D-244 (audit OPS-20): for the admin areas, a cookie that isn't a valid,
  // unexpired session is sent on here, before anything renders, so the
  // answer carries no page (not even the area's title).
  if (/^\/(admin|superadmin)(\/|$)/.test(pathname) && !(await sessionCookieLooksValid(request.cookies.get(SESSION_COOKIE_NAME)?.value, process.env.SESSION_SECRET))) {
    const signedOut = new URL("/signed-out", request.url);
    signedOut.searchParams.set("reason", "unknown");
    signedOut.searchParams.set("next", pathname);
    return NextResponse.redirect(signedOut);
  }

  const requestHeaders = new Headers(request.headers);
  // v1.8.0 page access: which page this request is for (a Server Action
  // posts to its page's address), signed so it can't be faked. Any value a
  // caller sent is replaced.
  requestHeaders.delete(PATH_HEADER);
  requestHeaders.delete(PATH_SIGNATURE_HEADER);
  const signature = await signPath(pathname, process.env.SESSION_SECRET);
  if (signature) {
    requestHeaders.set(PATH_HEADER, pathname);
    requestHeaders.set(PATH_SIGNATURE_HEADER, signature);
  }
  // D-185: marks a request that may change something (see WRITE_HEADER).
  requestHeaders.delete(WRITE_HEADER);
  requestHeaders.set(NEXT_HEADER, `${pathname}${request.nextUrl.search}`.slice(0, 500));
  // QA-SEC-02 (v1.42.1): the integrations' connect and callback steps are
  // GETs that store a connection, so a view-only Try as session can't use them.
  if (UNSAFE_METHODS.has(request.method) || request.headers.has("next-action") || WRITING_GETS.some((prefix) => pathname.startsWith(prefix))) requestHeaders.set(WRITE_HEADER, "1");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!FILE_ROUTE.test(pathname)) response.headers.set("Content-Security-Policy", csp);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  // SEC-18 (v1.10.0): signed-in pages and API answers are never kept by
  // Cloudflare or a shared cache. Static files and the public brand assets
  // keep their own caching.
  if (!isStaticAsset(pathname)) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  matcher: [
    // Skip static files. v1.8.0: prefetches go through too, so every page
    // request carries the signed page address (page access).
    { source: "/((?!_next/static|_next/image|favicon.ico|brand/).*)" },
  ],
};
