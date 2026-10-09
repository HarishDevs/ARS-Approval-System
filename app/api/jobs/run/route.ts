import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnv } from "@/config/environment";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { runDeliveryRetries, runHousekeeping } from "@/server/jobs/retry-deliveries";
import { runSlaChecks } from "@/server/jobs/sla";
import { runOutbox } from "@/server/approvals/service";
import { pruneOutbox } from "@/lib/db/repositories/outbox.repository";
import { recordRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { runDailyTemplateSync } from "@/server/notifications/template-registry";
import { logError, logInfo } from "@/lib/logging/logger";

// Cron entry point (F-41, D-058). cPanel cron, every 5 minutes:
//   curl -s -X POST -H "x-job-secret: $JOB_RUNNER_SECRET" https://approval.arssteels.net/api/jobs/run
// Without the right secret (or with none configured) it looks like any
// missing route.
function secretMatches(given: string | null): boolean {
  const expected = getEnv().JOB_RUNNER_SECRET;
  if (!expected || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-job-secret"))) return apiError("NOT_FOUND", "Not found.", 404);
  try {
    const outbox = await runOutbox();
    const retries = await runDeliveryRetries();
    const sla = await runSlaChecks();
    const templates = await runDailyTemplateSync();
    const housekeeping = { ...(await runHousekeeping()), outboxPruned: await pruneOutbox() };
    await recordRunnerHeartbeat();
    logInfo("job runner finished", { ...outbox, ...retries, ...sla, ...templates, ...housekeeping });
    return apiSuccess({ outbox, retries, sla, templates, housekeeping });
  } catch (error) {
    logError("job runner failed", error);
    return apiError("SYSTEM_ERROR", "Job run failed.", 500);
  }
}
