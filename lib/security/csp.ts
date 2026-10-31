// Content-Security-Policy (P1-34a, D-051). Pure, so it is unit-tested and
// usable from middleware (Edge runtime: no Node imports here).
//   - Scripts only with this request's nonce ('strict-dynamic' lets Next.js
//     and Firebase load their own chunks from those).
//   - Google sign-in needs the Firebase auth domain (popup + hidden iframe)
//     and Google's token endpoints (D-038).
//   - No framing by anyone (frame-ancestors 'none'), no plugins, forms post
//     only to this site.
export interface CspOptions {
  dev: boolean;
  firebaseAuthDomain: string;
}

export function buildCsp(nonce: string, options: CspOptions): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://apis.google.com"];
  // React dev tooling needs eval; never in production.
  if (options.dev) scriptSrc.push("'unsafe-eval'");
  const connectSrc = [
    "'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
  ];
  if (options.dev) connectSrc.push("ws:", "wss:");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // Next.js and next/font inject inline <style>; styles can't run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    // D-251: the service worker (/sw.js) is this site's own file; 'strict-dynamic'
    // above would otherwise refuse it. Manifest likewise.
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": [`https://${options.firebaseAuthDomain}`, "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!options.dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
