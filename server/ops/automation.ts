import "server-only";
import crypto from "node:crypto";
import { runDeliveryRetries, runHousekeeping } from "@/server/jobs/retry-deliveries";
import { runSlaChecks } from "@/server/jobs/sla";
import { auditDelegationDates } from "@/server/jobs/delegations";
import { runOutbox } from "@/server/approvals/service";
import { pruneOutbox } from "@/lib/db/repositories/outbox.repository";
import { closeAbandonedRuns, finishJobRun, pruneJobRuns, startJobRun, summariseJobs, type JobSummary } from "@/lib/db/repositories/job-runs.repository";
import { explainBackupError, runDailyBackup } from "@/server/ops/backup";
import { runDailyTemplateSync } from "@/server/notifications/template-registry";
import { countByReason, findStuckRequests } from "@/server/ops/stuck";
import { evaluateAlerts, runDueSchedules } from "@/server/reports/schedules";
import { logError } from "@/lib/logging/logger";
import { runExpiryNotices } from "@/server/approvals/expiry";
import { runExportJobs } from "@/server/reports/background";
import { runModuleReminders } from "@/server/modules/jobs";

// Automation inventory (unified prompt FN11, Addendum B). Every background
// job the platform runs, what it does, how it is retried and how IT
// recovers it. The job runner runs each step on its own: one failing step
// is recorded and the others still run.
export interface Automation {
  key: string;
  name: string;
  what: string;
  trigger: string;
  everyMinutes: number; // how often it is expected to succeed
  retry: string;
  idempotency: string;
  onFailure: string;
  recovery: string;
  owner: string; // who acts when it fails
}

export const AUTOMATIONS: readonly Automation[] = [
  {
    key: "outbox",
    name: "Send queued messages",
    what: "Sends email and WhatsApp messages queued with each approval action that weren't sent straight away.",
    trigger: "Every job run (cron, 5 minutes); also right after each action.",
    everyMinutes: 5,
    retry: "Up to 5 tries per message; after that it waits for IT.",
    idempotency: "Each message is claimed before sending, so only one sender sends it; sent messages are never sent again.",
    onFailure: "The message stays unsent and is listed under Messages not sent.",
    recovery: "Resend (gives the message fresh tries; never sends one already sent).",
    owner: "Super Admin (providers); IT team for the affected requests",
  },
  {
    key: "deliveries",
    name: "Retry failed deliveries",
    what: "Retries email and WhatsApp deliveries the provider refused or timed out.",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "Backs off between tries; stops after the configured limit.",
    idempotency: "Each delivery is leased before a retry; a sent delivery is never retried.",
    onFailure: "The delivery stays FAILED in the delivery log.",
    recovery: "Retry now on Deliveries.",
    owner: "Super Admin",
  },
  {
    key: "sla",
    name: "Reminders and escalations",
    what: "Sends due-soon notes, reminders for late tasks and escalations to managers.",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run picks up anything missed.",
    idempotency: "Each reminder and escalation level is recorded once per task (task_reminders), so it is never sent twice.",
    onFailure: "Recorded here; the next run tries again.",
    recovery: "Run the jobs now, or wait for the next run.",
    owner: "IT team",
  },
  {
    key: "templates",
    name: "WhatsApp template status sync",
    what: "Checks the approval status of WhatsApp templates with the provider once a day.",
    trigger: "Daily, inside the job run.",
    everyMinutes: 24 * 60,
    retry: "Tried again on the next day's run.",
    idempotency: "Only reads statuses and stores them.",
    onFailure: "Recorded here; templates keep their last known status.",
    recovery: "Sync now on Templates.",
    owner: "Super Admin",
  },
  {
    key: "housekeeping",
    name: "Housekeeping",
    what: "Clears expired drafts, rate-limit records, old message payloads, old sent queue rows and job history over 90 days.",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run continues.",
    idempotency: "Deletes only what is past its retention; running twice deletes nothing more.",
    onFailure: "Recorded here; nothing is lost, data is just kept a little longer.",
    recovery: "None needed.",
    owner: "Super Admin",
  },
  {
    key: "delegations",
    name: "Delegation start and end",
    what: "Records in the audit log when planned delegations start and end.",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run picks up anything missed.",
    idempotency: "Each start and end is recorded once.",
    onFailure: "Recorded here; delegations still apply by date.",
    recovery: "None needed.",
    owner: "IT team",
  },
  {
    key: "backup",
    name: "Daily backup",
    what: "Makes the daily database backup and keeps the configured number of days.",
    trigger: "Daily, inside the job run.",
    everyMinutes: 24 * 60,
    retry: "Each run tries again until today's backup exists.",
    idempotency: "Makes at most one backup a day; never overwrites an existing backup.",
    onFailure: "The Super Admin is alerted (once a day).",
    recovery: "Back up now on the Super Admin home page.",
    owner: "Super Admin",
  },
  {
    key: "reports",
    name: "Scheduled reports",
    what: "Emails each scheduled report when it is due, with the owner's current permissions.",
    trigger: "Every job run (reports due since the last run).",
    everyMinutes: 5,
    retry: "A failed delivery is retried at its next slot; three failures in a row pause the schedule.",
    idempotency: "Each slot is claimed once (unique schedule + due time), so a report is never sent twice for the same slot.",
    onFailure: "Recorded in the schedule's run history; the owner sees it under Reports.",
    recovery: "Fix the cause (usually email settings), then switch the schedule on again.",
    owner: "The report's owner; Super Admin for email settings",
  },
  {
    key: "alerts",
    name: "Alert rules",
    what: "Checks people's alert rules and tells them (inbox and email) when a number crosses their line.",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run checks again.",
    idempotency: "Each firing is claimed on the rule before sending; a rule fires at most once per cool-down while over the line.",
    onFailure: "Recorded here; the rule is checked again next run.",
    recovery: "None needed.",
    owner: "Each rule's owner",
  },
  {
    key: "expiry",
    name: "Approval expiry notices",
    what: "Tells requesters 7 days before an approval stops being valid (types with \"approval valid for\" days).",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run picks up anything missed.",
    idempotency: "Each request is claimed before its notice is queued, so it is told once.",
    onFailure: "Recorded here; the next run tries again.",
    recovery: "None needed.",
    owner: "IT team",
  },
  {
    key: "modules",
    name: "Task and information reminders",
    what: "Reminds assignees before a task is due, tells the assignee and creator once when it is overdue, and reminds people who haven't acknowledged information (as each type is set up).",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run picks up anything missed.",
    idempotency: "Each reminder is claimed before it is queued (per task, kind and due time; per recipient), so it is sent once.",
    onFailure: "Recorded here; the next run tries again.",
    recovery: "None needed.",
    owner: "IT team",
  },
  {
    key: "exports",
    name: "Background exports",
    what: "Makes large report exports people asked for, and removes export files after 7 days.",
    trigger: "Every job run (and straight after each request).",
    everyMinutes: 5,
    retry: "A failed export is marked failed with the reason; the person asks again. A run that died is put back in the queue after 30 minutes.",
    idempotency: "Each export is claimed (queued → running) before it is made, so it is made once.",
    onFailure: "The export shows as failed on Reports; the next run carries on with the rest.",
    recovery: "The person asks for the export again.",
    owner: "Each export's owner; Super Admin for storage",
  },
  {
    key: "stuck",
    name: "Stuck-request scan",
    what: "Counts open requests that need IT (blocked steps, inactive approvers, no activity, unsent messages).",
    trigger: "Every job run.",
    everyMinutes: 5,
    retry: "The next run scans again.",
    idempotency: "Read-only.",
    onFailure: "Recorded here; the Needs attention page still works.",
    recovery: "None needed.",
    owner: "IT team (Needs attention)",
  },
];

type StepResult = Record<string, number | string>;

const STEPS: Record<string, () => Promise<StepResult>> = {
  outbox: () => runOutbox(),
  deliveries: async () => ({ ...(await runDeliveryRetries()) }) as StepResult,
  sla: () => runSlaChecks(),
  templates: () => runDailyTemplateSync(),
  housekeeping: async () => ({ ...(await runHousekeeping()), outboxPruned: await pruneOutbox(), jobRunsPruned: await pruneJobRuns(), abandonedRunsClosed: await closeAbandonedRuns() }),
  delegations: () => auditDelegationDates(),
  backup: () => runDailyBackup(),
  reports: async () => ({ ...(await runDueSchedules()) }),
  alerts: async () => ({ ...(await evaluateAlerts()) }),
  expiry: async () => ({ ...(await runExpiryNotices()) }),
  modules: async () => ({ ...(await runModuleReminders()) }),
  exports: async () => ({ ...(await runExportJobs()) }),
  stuck: async () => {
    const counts = countByReason(await findStuckRequests());
    return { ...counts };
  },
};

export interface RunReport {
  runRef: string;
  steps: Record<string, { status: "OK" | "FAILED"; counts?: StepResult }>;
  failed: string[];
}

// Runs every step, recording each one. Errors are summarised by name and
// message only (no payloads); details stay in the server log.
export async function runAutomations(input: { runRef?: string | null; trigger?: "CRON" | "MANUAL"; only?: readonly string[] } = {}): Promise<RunReport> {
  const runRef = input.runRef || crypto.randomUUID();
  const report: RunReport = { runRef, steps: {}, failed: [] };
  for (const automation of AUTOMATIONS) {
    if (input.only && !input.only.includes(automation.key)) continue;
    let runId: number | null = null;
    try {
      runId = await startJobRun({ runRef, jobKey: automation.key, trigger: input.trigger ?? "CRON" });
    } catch (error) {
      logError("automation: couldn't record the run", error, { job: automation.key });
    }
    try {
      const counts = await STEPS[automation.key]!();
      // backup "FAILED" is reported as a value, not thrown.
      const failed = counts.backup === "FAILED";
      report.steps[automation.key] = { status: failed ? "FAILED" : "OK", counts };
      if (failed) report.failed.push(automation.key);
      if (runId) await finishJobRun(runId, { status: failed ? "FAILED" : "OK", counts, errorCode: failed ? "BACKUP_FAILED" : null });
    } catch (error) {
      logError("automation step failed", error, { job: automation.key, runRef });
      report.steps[automation.key] = { status: "FAILED" };
      report.failed.push(automation.key);
      const summary = automation.key === "backup" ? explainBackupError(error) : error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
      if (runId) await finishJobRun(runId, { status: "FAILED", errorCode: summary }).catch(() => undefined);
    }
  }
  return report;
}

export type AutomationHealth = "OK" | "LATE" | "FAILING" | "NEVER";

// Missed-run detection: an automation is LATE when its last good run is
// older than three of its intervals (at least 20 minutes), FAILING when its
// latest run failed, NEVER when it has no record.
export function healthOf(automation: Automation, summary: JobSummary | undefined, now = new Date()): AutomationHealth {
  if (!summary?.lastRun) return "NEVER";
  if (summary.lastRun.status === "FAILED") return "FAILING";
  const limitMinutes = Math.max(automation.everyMinutes * 3, 20);
  const okAt = summary.lastOkAt ?? null;
  if (!okAt || now.getTime() - okAt.getTime() > limitMinutes * 60_000) return "LATE";
  return "OK";
}

export async function loadAutomationBoard(): Promise<{ automation: Automation; summary: JobSummary | undefined; health: AutomationHealth }[]> {
  const summaries = await summariseJobs(AUTOMATIONS.map((automation) => automation.key));
  return AUTOMATIONS.map((automation) => {
    const summary = summaries.get(automation.key);
    return { automation, summary, health: healthOf(automation, summary) };
  });
}
