# Automation inventory and recovery

Unified prompt FN2, FN8, FN11 and Addendum B (monitoring). The live version of this table is **Super Admin → Automation** (`/superadmin/automation`), built from `server/ops/automation.ts`. That page also shows each job's health, its last run, its 24-hour failures and its run history.

## How automations run

- **One entry point.** cPanel cron calls `POST /api/jobs/run` every 5 minutes with the `x-job-secret` header. A wrong or missing secret gets a 404.
- **Each step runs on its own.** `runAutomations()` runs every automation in turn. A failing step is recorded and the remaining steps still run (before v1.6.0 one failure stopped the whole run).
- **Every step is recorded** in `job_runs`:
  - run reference (the request's `x-request-id`, shared by the steps of one call);
  - job key;
  - trigger (CRON / MANUAL);
  - start and finish times;
  - status;
  - counts (numbers only);
  - a short error (name and message, no payloads).
  
  Rows are kept for 90 days. A step left `RUNNING` for over an hour is closed as `FAILED` ("ABANDONED").
- **Health (missed-run detection).**

  | Health | Meaning |
  |---|---|
  | OK | Ran successfully within the expected interval. |
  | LATE | No good run within 3 intervals (at least 20 minutes). |
  | FAILING | The latest run failed. |
  | NEVER | No record of any run. |

  The page also warns when the runner heartbeat is older than 15 minutes.
- **Alerts.** A failed backup, or any other failed step, alerts the Super Admin by email and WhatsApp, at most once a day per kind (`server/ops/alerts.ts`).

## Inventory

| Key | Automation | Trigger | Retry | Idempotency | On failure | Recovery | Owner |
|---|---|---|---|---|---|---|---|
| outbox | Send queued messages | Every run; also right after each action | Up to 5 tries per message, then waits for IT | Each message is claimed before sending; sent messages are never sent again | Stays unsent; listed under Messages not sent and on Needs attention | **Resend** (fresh tries, never a second send) | Super Admin (providers); IT team (affected requests) |
| deliveries | Retry failed deliveries | Every run | Backs off between tries, up to the limit | Deliveries are leased before retry; sent ones are never retried | Stays FAILED in the delivery log | **Retry now** on Deliveries | Super Admin |
| sla | Reminders and escalations | Every run | The next run picks up anything missed | Each reminder or escalation level is recorded once per task (`task_reminders`) | Recorded; the next run tries again | Run now | IT team |
| templates | WhatsApp template status sync | Daily | Next day's run | Read and store only | Templates keep their last status | Sync now on Templates | Super Admin |
| housekeeping | Housekeeping (drafts, rate limits, payloads, old queue rows, job history) | Every run | Next run continues | Deletes only data past its retention | Data kept a little longer; nothing lost | None needed | Super Admin |
| delegations | Delegation start and end audit | Every run | Next run | Each start and end recorded once | Delegations still apply by date | None needed | IT team |
| backup | Daily backup | Daily | Each run tries until today's backup exists | At most one a day; never overwrites | Super Admin alerted | Back up now (Super Admin home) | Super Admin |
| expiry | Approval expiry notices (v1.7.0) | Every run | Next run | Each request claimed before its notice | Recorded; next run | None needed | IT team |
| exports | Background exports (v1.7.0) | Every run, and right after each request | A run that died is re-queued after 30 min | Each export claimed (queued → running) | Shown as failed on Reports | Ask again | Each export's owner |
| stuck | Stuck-request scan | Every run | Next run | Read-only | Needs attention still works | None needed | IT team |

**Not automated, so not in the inventory:**

- File uploads are processed during the request; there is no background file job.
- Imports run synchronously and show a result page.
- There is no ERP or other business integration.

**Gaps (register: Yet to do):**

- Provider delivery-receipt webhooks.
- Imports and exports with their own recovery.
- Scheduled reports, once they are built.

## Stuck-request detection (FN2)

`server/ops/stuck.ts`, shown on **IT → Needs attention** (`/admin/attention`). Detection is read-only. Each finding is fixed through an existing audited action, or hidden for 1–30 days with a reason (`stuck_snoozes`, audited as `STUCK_SNOOZED`).

| Reason | Detected when | What to do |
|---|---|---|
| A step nobody can act on | The engine marked a step `BLOCKED` (nobody eligible, or no path matches) | Open the request: give the step to someone, or skip it (D-098) |
| Waiting on someone who is inactive | A pending task's holder is inactive and has no active delegate | Hand over their tasks (Users → the person) |
| No activity for a long time | In progress or on hold, with no event for `general.stuck_idle_days` (default 7) | Check with the approver |
| Sent back, not resubmitted | Changes required for longer than the same limit | Ask the requester to resubmit or withdraw |
| Messages not sent | Outbox rows the sender gave up on, or more than 30 minutes late | **Resend messages** |

A healthy pending request is never listed. This is covered by `tests/integration/reliability.int.test.ts`.

## Safe retry rules (FN8, FN11)

1. **Messages only, never decisions.** Retry and resend touch messages only. No recovery action can repeat or change an approval decision.
2. **Resend is guarded.** It releases an outbox row only when all of these hold:
   - it is unsent;
   - it is not being sent right now (no claim in the last 10 minutes);
   - its request isn't deleted.
   
   Sending then claims the row again, so two resends at once can't both send it.
3. **Server-side authorization.** Every action checks on the server:
   - Run now: Super Admin;
   - Resend on Automation: Super Admin;
   - Resend on Needs attention: IT team;
   - Snooze: IT team.
   
   Everyone else gets "Not found." or a 404.
4. **Every manual action is audited:**
   - `JOBS_RUN_MANUALLY` (with the run reference);
   - `OUTBOX_RESENT`;
   - `DELIVERY_RETRIED`;
   - `STUCK_SNOOZED`.
5. **Automatic retries are bounded:**
   - outbox: 5 tries;
   - deliveries: backoff and a limit.
   
   When tries run out, the item shows as "gave up" and needs manual action.
6. **Nothing sensitive is stored.** No message text, recipient or secret appears in `job_runs` or on these screens; only event types, counts and request numbers.

## Recovery runbook

| Symptom | Where it shows | Action |
|---|---|---|
| Runner heartbeat over 15 minutes | Automation banner; `/api/health` | Check the cPanel cron entry and that its `JOB_RUNNER_SECRET` matches the GoDaddy env var (KNOWN_ISSUES OPS-01) |
| A job is FAILING | Automation | Read the error and the run reference; find the reference in the server log; fix the cause; **Run now** |
| Messages not sent | Automation; Needs attention | Check provider settings (Super Admin → Providers), then **Resend** |
| Backup failed | Alert; Automation | Check disk space and the backup folder; **Back up now** |
