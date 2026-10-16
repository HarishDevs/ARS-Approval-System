import "server-only";
import {
  activeConnectionIds,
  channelsToRenew,
  claimJob,
  connectionById,
  dueJobIds,
  enqueueJob,
  failJob,
  finishJob,
  recoverStuckJobs,
  updateConnection,
  type JobRow,
} from "@/lib/db/repositories/gcal.repository";
import { backoffSeconds } from "@/server/calendar/events";
import { loadIntegration, renewChannel, syncConnection, SyncStop } from "@/server/calendar/sync";
import { GoogleApiError } from "@/server/integrations/google-calendar/client";
import { alertSuperAdmin } from "@/server/ops/alerts";
import { logError } from "@/lib/logging/logger";

// v1.11.0 (D-154): calendar work runs from the existing 5-minute job runner
// (GoDaddy has no always-on worker), never inside a page request:
//   - a reconciliation sync for each connection not synced within the set
//     interval (catches missed push notifications);
//   - watch channels renewed a day before they expire;
//   - waiting jobs processed within a time budget, one per connection at a
//     time, retried with backoff and jitter up to the limit, then DEAD.
const BUDGET_MS = 25_000;
const MAX_JOBS = 25;

export async function runCalendarStep(now: () => number = Date.now): Promise<Record<string, number>> {
  const { settings, active } = await loadIntegration();
  if (!active) return { skipped: 1 };
  const recovered = await recoverStuckJobs();
  let scheduled = 0;
  for (const id of await activeConnectionIds(settings.config.intervalMinutes)) {
    await enqueueJob({ connectionId: id, kind: "SYNC", reason: "SCHEDULE" });
    scheduled += 1;
  }
  let renewals = 0;
  for (const id of await channelsToRenew()) {
    await enqueueJob({ connectionId: id, kind: "RENEW_CHANNEL", reason: "SCHEDULE" });
    renewals += 1;
  }
  const processed = await processDueJobs({ budgetMs: BUDGET_MS, maxJobs: MAX_JOBS, now });
  return { recovered, scheduled, renewals, ...processed };
}

export async function processDueJobs(options: { budgetMs: number; maxJobs: number; connectionId?: number; now?: () => number }): Promise<{ done: number; retried: number; failed: number; dead: number }> {
  const clock = options.now ?? Date.now;
  const started = clock();
  const counts = { done: 0, retried: 0, failed: 0, dead: 0 };
  for (const id of await dueJobIds(options.maxJobs, options.connectionId)) {
    if (clock() - started > options.budgetMs) break;
    const job = await claimJob(id);
    if (!job) continue; // another runner took it
    const outcome = await runJob(job);
    counts[outcome] += 1;
  }
  return counts;
}

async function runJob(job: JobRow): Promise<"done" | "retried" | "failed" | "dead"> {
  const { settings } = await loadIntegration();
  try {
    if (job.kind === "RENEW_CHANNEL") {
      await finishJob(job.id, await renewChannel(job.connectionId));
      return "done";
    }
    const result = await syncConnection(job.connectionId, { full: job.kind === "FULL_RESYNC" });
    await finishJob(job.id, { ...result });
    // More than one run's worth of work: carry on next time.
    if (result.more) await enqueueJob({ connectionId: job.connectionId, kind: "SYNC", reason: "CONTINUE", delaySeconds: 60 });
    return "done";
  } catch (error) {
    const category = error instanceof GoogleApiError ? error.category : error instanceof SyncStop ? error.category : "INTERNAL";
    const retryable = error instanceof GoogleApiError ? error.transient : category === "LOCKED" || category === "INTERNAL";
    const detail = error instanceof GoogleApiError ? `Google answered ${error.status || "nothing"} (${error.reason}).` : error instanceof SyncStop ? error.message : "Unexpected error; details are in the server log.";
    if (category === "INTERNAL") logError("calendar job failed", error, { jobId: job.id });
    if (category === "API_DISABLED") await updateConnection(job.connectionId, { lastError: "The Google Calendar API isn't enabled for the app's Google Cloud project.", lastErrorAt: new Date() });
    const state = await failJob(job, { category, detail, retryable, retryMax: settings.config.retryMax, backoffSeconds: category === "LOCKED" ? 60 : backoffSeconds(job.attempts) });
    if (state === "DEAD" && settings.config.alertOnFailure) {
      const connection = await connectionById(job.connectionId);
      await alertSuperAdmin("CALENDAR_SYNC_FAILED", connection ? `connection ${connection.id}, job ${job.id}` : `job ${job.id}`);
    }
    return state === "RETRY" ? "retried" : state === "DEAD" ? "dead" : "failed";
  }
}
