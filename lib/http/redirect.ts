// v1.12.6 (D-165): a redirect to one of this app's own pages, as a relative
// address. Behind GoDaddy's proxy a route handler's request.url is the
// internal http://localhost:<port>, so new URL(path, request.url) sent people
// to localhost after Google's consent screen. The browser resolves a relative
// Location against the address it actually used.
export function redirectToPage(path: string, status: 303 | 307 = 303): Response {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("redirectToPage takes a path on this site.");
  return new Response(null, { status, headers: { Location: path, "Cache-Control": "no-store" } });
}
