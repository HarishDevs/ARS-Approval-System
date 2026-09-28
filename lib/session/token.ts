import "server-only";
import crypto from "node:crypto";
import { getEnv } from "@/config/environment";
import { SESSION_TTL_SECONDS } from "@/lib/session/constants";

// HMAC-signed session cookie (tamper-evident). The cookie only proves which
// session row it belongs to; every request also checks that row is not
// revoked or expired and re-reads the user and roles (D-043, P1-16).
export interface SessionTokenPayload {
  sid: string;
  uid: number;
  iat: number;
  exp: number;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(`session:${data}`).digest("base64url");
}

export function createSessionToken(sessionId: string, userId: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload: SessionTokenPayload = { sid: sessionId, uid: userId, iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionTokenPayload;
    if (typeof payload.sid !== "string" || typeof payload.uid !== "number" || payload.exp < nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

// Signed single-purpose link token, e.g. the "This wasn't me" link in a
// new-login alert (P1-19). Carries the user and session, expires, and can't
// be used for any other purpose.
export interface PurposeTokenPayload {
  p: string;
  uid: number;
  sid: string | null;
  exp: number;
}

function signPurpose(data: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(`purpose:${data}`).digest("base64url");
}

export function createPurposeToken(
  purpose: string,
  userId: number,
  sessionId: string | null,
  ttlSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload: PurposeTokenPayload = { p: purpose, uid: userId, sid: sessionId, exp: nowSeconds + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPurpose(encoded)}`;
}

export function verifyPurposeToken(
  token: string | null | undefined,
  purpose: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): PurposeTokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(signPurpose(encoded));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PurposeTokenPayload;
    if (payload.p !== purpose || typeof payload.uid !== "number" || payload.exp < nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

// Device cookie: a random key plus a signature, so a forged value is
// ignored (it would just be treated as a new device).
function signDevice(key: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(`device:${key}`).digest("base64url");
}

export function createDeviceCookieValue(): { cookieValue: string; deviceKey: string } {
  const deviceKey = crypto.randomBytes(24).toString("base64url");
  return { cookieValue: `${deviceKey}.${signDevice(deviceKey)}`, deviceKey };
}

export function readDeviceKey(cookieValue: string | undefined | null): string | null {
  if (!cookieValue) return null;
  const [key, signature] = cookieValue.split(".");
  if (!key || !signature) return null;
  const expected = Buffer.from(signDevice(key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return key;
}
