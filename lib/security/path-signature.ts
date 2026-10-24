// v1.8.0: the middleware tells the server which page a request is for (the
// page address of a Server Action is not otherwise known to it), signed with
// the server secret so it can't be faked by a request that skips the
// middleware. Works in the middleware (Edge) and in Node (Web Crypto).
export const PATH_HEADER = "x-ars-path";
export const PATH_SIGNATURE_HEADER = "x-ars-path-sig";

const encoder = new TextEncoder();

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`ars-path:${text}`)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signPath(path: string, secret: string | undefined): Promise<string | null> {
  if (!secret) return null;
  return hmac(secret, path);
}

export async function verifyPath(path: string | null, signature: string | null, secret: string | undefined): Promise<boolean> {
  if (!path || !signature || !secret || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = await hmac(secret, path);
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
}

// D-185: set by the middleware (any value a caller sent is replaced) on a
// request that may change something: a POST/PUT/PATCH/DELETE or a Server
// Action. A view-only Try as session is refused for those.
export const WRITE_HEADER = "x-ars-write";
