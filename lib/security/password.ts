import "server-only";
import crypto from "node:crypto";

// Password hashing with Node's built-in scrypt (D-043): no native module,
// so the GoDaddy build can't break on it. Format:
//   scrypt$N$r$p$saltBase64$hashBase64
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 10;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Used so an unknown user ID costs the same time as a wrong password
// (no timing difference that reveals which user IDs exist).
let dummyHash: string | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await hashPassword("not-a-real-password-for-timing-only");
  await verifyPassword(password, dummyHash);
}

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: string };

export function checkPasswordPolicy(password: string, minLength: number = MIN_PASSWORD_LENGTH): PasswordPolicyResult {
  if (password.length < minLength) return { ok: false, reason: `Use at least ${minLength} characters.` };
  if (password.length > 200) return { ok: false, reason: "Use at most 200 characters." };
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, reason: "Use both letters and numbers." };
  }
  return { ok: true };
}
