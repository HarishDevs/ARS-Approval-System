import "server-only";
import { NextResponse } from "next/server";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { logError } from "@/lib/logging/logger";

// SEC-04 (v1.10.0): per-person limits on costly signed-in routes (PDF
// summary, quick search, notification list, file downloads) and on the
// webhook. Counted in the database (rate_limit_hits), so every app process
// shares one count. Far above normal use; a stuck key or a script is slowed.
// A failing count never blocks anyone (the route's own checks still apply).
export const LIMITS = {
  pdf: 20,
  quick: 90,
  notifications: 120,
  download: 120,
  webhook: 600,
} as const;

export async function overLimit(bucket: string, perMinute: number): Promise<boolean> {
  try {
    return (await hitRateLimit(bucket, 60)) > perMinute;
  } catch (error) {
    logError("rate limit check failed", error);
    return false;
  }
}

// The answer when over the limit: 429 with Retry-After, same envelope as
// every API error.
export function tooManyResponse(message = "Too many requests. Wait a minute and try again."): NextResponse {
  return NextResponse.json({ success: false, error: { code: "RATE_LIMITED", message } }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
}
