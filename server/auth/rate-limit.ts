import "server-only";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { AuthError } from "@/server/auth/errors";
import type { RequestContext } from "@/types/auth";

// Rate limits for sign-in and codes (F-09, P1-21, D-059). Applied in the
// route handlers before the service runs. Counted whether or not the
// account exists, so the limit itself reveals nothing.
export type LimitedAction = "SIGNIN" | "CODE" | "FORGOT" | "SET_PASSWORD" | "GOOGLE";

interface Rule {
  scope: "ip" | "login";
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES: Record<LimitedAction, Rule[]> = {
  SIGNIN: [
    { scope: "ip", limit: 20, windowSeconds: 900 },
    { scope: "login", limit: 10, windowSeconds: 900 },
  ],
  CODE: [{ scope: "ip", limit: 30, windowSeconds: 900 }],
  FORGOT: [
    { scope: "ip", limit: 10, windowSeconds: 900 },
    { scope: "login", limit: 5, windowSeconds: 3600 },
  ],
  SET_PASSWORD: [{ scope: "ip", limit: 10, windowSeconds: 900 }],
  GOOGLE: [{ scope: "ip", limit: 30, windowSeconds: 900 }],
};

// v1.50.0 (security review): one bucket for one mobile number however it is
// typed (spaces, dashes, +91), and for a User ID or email in any case.
export function limitKey(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  const digits = value.replace(/[\s()+-]/g, "");
  if (!/^\d{10,15}$/.test(digits)) return value;
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

export function bucketsFor(action: LimitedAction, context: Pick<RequestContext, "ipAddress">, loginId?: string): { bucket: string; rule: Rule }[] {
  return RATE_RULES[action]
    .filter((rule) => rule.scope === "ip" || loginId)
    .map((rule) => ({
      rule,
      bucket: `${action.toLowerCase()}:${rule.scope}:${rule.scope === "ip" ? (context.ipAddress ?? "unknown") : limitKey(loginId!)}`,
    }));
}

export async function enforceRateLimit(
  action: LimitedAction,
  context: Pick<RequestContext, "ipAddress">,
  loginId?: string,
  hit: (bucket: string, windowSeconds: number) => Promise<number> = hitRateLimit,
): Promise<void> {
  for (const { bucket, rule } of bucketsFor(action, context, loginId)) {
    const count = await hit(bucket, rule.windowSeconds);
    if (count > rule.limit) {
      throw new AuthError("AUTH_RATE_LIMITED", "Too many attempts. Try again in a few minutes.", Math.min(rule.windowSeconds, 900));
    }
  }
}
