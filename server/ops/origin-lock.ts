import "server-only";

// Q-021 (owner, 2 Nov 2026): the Super Admin home shows whether the origin
// lock (ORIGIN_SECRET, audit P-01 / D-102) is on. Read the same way as the
// middleware that enforces it. Only on/off; the value is never returned.
// It stays optional: startup never fails because it is missing.
export function originLockOn(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ORIGIN_SECRET);
}
