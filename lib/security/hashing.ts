import "server-only";
import crypto from "node:crypto";
import { getEnv } from "@/config/environment";

// Keyed hashes (HMAC-SHA256 with SESSION_SECRET) for short secrets such as
// OTP codes, challenge tokens and device keys. A keyed hash defeats
// rainbow tables on small keyspaces; nothing is ever stored in plaintext.
export function keyedHash(value: string): string {
  return crypto.createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
