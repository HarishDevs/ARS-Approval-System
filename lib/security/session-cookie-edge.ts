// D-244 (audit OPS-20): the middleware's quick look at the session cookie
// for the admin areas: correctly signed and not expired (the same HMAC as
// lib/session/token.ts, here with Web Crypto so it runs in the Edge
// middleware). It is only an early filter: the server still checks the
// session row, the user and the role on every request.
const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sessionCookieLooksValid(token: string | undefined | null, secret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!token || !secret) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`session:${encoded}`))));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (diff !== 0) return false;
  try {
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" && payload.exp >= nowSeconds;
  } catch {
    return false;
  }
}
