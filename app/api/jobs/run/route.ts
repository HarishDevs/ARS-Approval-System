import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnv } from "@/config/environment";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { recordRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { runAutomations } from "@/server/ops/automation";
import { logError, logInfo } from "@/lib/logging/logger";
import { alertSuperAdmin } from "@/server/ops/alerts";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-id";

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
  const reference = request.headers.get(REQUEST_ID_HEADER);
  try {
    // Each automation runs and is recorded on its own (FN11): one failing
    // step no longer stops the rest.
    const report = await runAutomations({ runRef: reference, trigger: "CRON" });
    // #14: the Super Admin hears about failures (once a day per kind).
    if (report.failed.includes("backup")) await alertSuperAdmin("BACKUP_FAILED", reference);
    if (report.failed.some((key) => key !== "backup")) await alertSuperAdmin("JOB_RUNNER_FAILED", reference);
    await recordRunnerHeartbeat();
    logInfo("job runner finished", { runRef: report.runRef, failed: report.failed });
    return apiSuccess(report);
  } catch (error) {
    logError("job runner failed", error);
    await alertSuperAdmin("JOB_RUNNER_FAILED", reference);
    return apiError("SYSTEM_ERROR", "Job run failed.", 500);
  }
}
