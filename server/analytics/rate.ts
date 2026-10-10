import "server-only";
import { hitRateLimit } from "@/lib/db/repositories/jobs.repository";
import { logError } from "@/lib/logging/logger";

// v1.7.0 (C04): Analytics pages run many queries; a burst of reloads (a
// stuck key, a script) is slowed down per person. 40 page loads a minute
// is far above normal use. A rate-limit failure never blocks the page.
export const ANALYTICS_PER_MINUTE = 40;

export async function guardAnalyticsRate(userId: number): Promise<boolean> {
  try {
    return (await hitRateLimit(`analytics:${userId}`, 60)) > ANALYTICS_PER_MINUTE;
  } catch (error) {
    logError("analytics rate limit check failed", error);
    return false;
  }
}
