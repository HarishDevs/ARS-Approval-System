# Automation inventory and recovery

Applies to v1.39.0 (31 Oct 2026).

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

Applies to v1.40.0 (1 Nov 2026): **17 automations**, all in `AUTOMATIONS` in `server/ops/automation.ts`, run in this order by `runAutomations()`. Every one runs on the same cron call (`POST /api/jobs/run`, every 5 minutes); `server/jobs/` holds the code for three of them (`sla`, `deliveries` and `housekeeping`, `delegations`), the rest live with their module. There is no other scheduled entry point. If this table and the Automation page ever differ, the page is right; update this table.

| Key | Automation | Trigger | Retry | Idempotency | On failure | Recovery | Owner |
|---|---|---|---|---|---|---|---|
| outbox | Send queued messages | Every run; also right after each action | Up to 5 tries per message, then waits for IT | Each message is claimed before sending; sent messages are never sent again | Stays unsent; listed under Messages not sent and on Needs attention | **Resend** (fresh tries, never a second send) | Super Admin (providers); IT team (affected requests) |
| deliveries | Retry failed deliveries | Every run | Backs off between tries, up to the limit | Deliveries are leased before retry; sent ones are never retried | Stays FAILED in the delivery log | **Retry now** on Deliveries | Super Admin |
| sla | Reminders and escalations (built-in) | Every run | The next run picks up anything missed | Each reminder or escalation level is recorded once per task (`task_reminders`) | Recorded; the next run tries again | Run now | IT team |
| templates | WhatsApp template status sync | Daily, inside the run | Next day's run | Read and store only | Templates keep their last status | **Sync now** on Templates | Super Admin |
| housekeeping | Housekeeping: expired drafts, rate limits, old payloads, old sent queue rows, job history over 90 days, abandoned runs | Every run | Next run continues | Deletes only data past its retention | Data kept a little longer; nothing lost | None needed | Super Admin |
| delegations | Delegation start and end audit | Every run | Next run | Each start and end recorded once | Delegations still apply by date | None needed | IT team |
| backup | Daily backup | Daily, inside the run | Each run tries until today's backup exists | At most one a day; never overwrites | Super Admin alerted (once a day) | **Back up now** (Super Admin home) | Super Admin |
| reports | Scheduled reports (v1.7.0) | Every run (reports due since the last run) | A failed delivery is retried at its next slot; three failures in a row pause the schedule | Each slot is claimed once (unique schedule + due time) | Shown in the schedule's run history under Reports | Fix the cause (usually email settings), then switch the schedule on again | The report's owner; Super Admin for email |
| alerts | Alert rules (v1.7.0) | Every run | Next run checks again | Each firing is claimed on the rule; at most once per cool-down while over the line | Recorded; checked again next run | None needed | Each rule's owner |
| expiry | Approval expiry notices (v1.7.0) | Every run | Next run | Each request claimed before its notice | Recorded; next run | None needed | IT team |
| rules | Reminder and escalation rules (v1.27.0, Admin → Reminders & escalations) | Every run | A failed send is logged; the run carries on | One send per rule, record, stage and repeat, claimed first | Recorded; other steps still run | Fix the rule or recipient; due sends go next run | IT team |
| modules | Task and information reminders (v1.9.0) | Every run | Next run | Each reminder claimed (per task, kind and due time; per recipient) | Recorded; next run | None needed | IT team |
| calendar | Google Calendar two-way sync (v1.11.0) | Every run, only when the integration is enabled | Exponential backoff with jitter up to the set limit; then marked failed for review | Fixed Google event id and stored version per record; one sync per connection at a time | Shown on the Google Calendar page; Super Admin alerted when retries run out | **Retry**, or **Full resync** for one person | Super Admin |
| ai | AI module upkeep (v1.15.0): expire proposals after 7 days, remove old conversations, copy Salesforce data read-only at most hourly | Every run; the Salesforce copy only when the last is an hour old | Next run; a failed Salesforce object keeps its last good copy | Single statements; Salesforce records stored by their own Id | Recorded; AI → Data Sources shows each object's last run and error | AI settings → **Sync now** after fixing the cause | Super Admin |
| exports | Background exports (v1.7.0); export files removed after 7 days | Every run, and right after each request | A run that died is re-queued after 30 min | Each export claimed (queued → running) | Shown as failed on Reports | Ask again | Each export's owner |
| hodWeekly | Weekly HOD report (D-247; off until the Super Admin switches it on) | Every run; sends from Monday 09:00 IST, once a week | A failed department is recorded FAILED for that week; the next week sends again | One claim per department and week (`hod_report_runs`), plus a one-per-week email key | Recorded with the failed count | Fix email settings or the HOD's address | Super Admin; IT |
| stuck | Stuck-request scan | Every run | Next run | Read-only | Needs attention still works | None needed | IT team |

**Event-driven, not scheduled (so not in the table):**

- Delivery receipts: CEOITBox calls `POST /api/webhooks/ceoitbox` (DELIVERED, READ).
- Google Calendar change notifications: Google calls `POST /api/webhooks/google-calendar`; the `calendar` step then processes them.
- File uploads are processed during the request; there is no background file job.
- Imports run synchronously and show a result page.

**Gaps (register: Yet to do):**

- Imports have no background run or recovery of their own; a failed import is simply run again.
- `/api/health` reports the runner heartbeat only (OK within 15 minutes, LATE, NEVER), not each job or the age of the last backup (audit OPS-11).

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
