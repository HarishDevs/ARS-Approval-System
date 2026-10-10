# Analytics current-state audit

Unified prompt Addendum A §2.

- **Before v1.6.0** analytics consisted of four admin dashboards (`/admin/dashboards/*`, F-74), the management Insights page (`/admin/insights`, F-70), Workload (`/admin/workload`, F-91) and the dashboards' CSV export.
- **v1.6.0** adds:
  - role analytics (`/users/analytics`);
  - the metric dictionary;
  - reports with CSV, XLSX and PDF exports;
  - saved views, scheduled reports and alert rules.
- Definitions are in `docs/ANALYTICS_METRIC_DICTIONARY.md` and `server/analytics/semantics.ts`. Gaps are in `docs/ANALYTICS_LIMITATIONS_AND_DATA_GAPS.md`.

## §1 Inventory

| # | Area | What exists (evidence) |
|---|---|---|
| A2.1-01 | Frontend | Next.js 15 App Router (server components, Server Actions), React 19, Tailwind with CSS-variable tokens (`styles/globals.css`, light and dark), UI kit in `features/ui/*`, app shell `features/shell/*`. Analytics building blocks: `features/analytics/Charts.tsx` (KPI card, line chart, bar list, stacked bar; SVG, every chart has a table view). |
| A2.1-02 | Backend | Server Actions and route handlers under `app/`. Services: `server/approvals/service.ts` (engine calls, locking, events, outbox), `server/analytics/*`, `server/reports/*`. Background work runs through the cron job runner `/api/jobs/run` → `server/ops/automation.ts`. |
| A2.1-03 | Database | MySQL 8 (`mysql2`). Migrations are additive SQL in `database/migrations`, applied once each by filename (`scripts/database/migrate.js`). Writes happen in transactions (`lib/db/transaction.ts`): request rows are locked FOR UPDATE with a `state_version` check. Relevant indexes: `idx_approval_requests_status (status, submitted_at)`, `idx_approval_tasks_queue (approver_id, status, created_at)`, `idx_approval_tasks_due (status, due_at)`. |
| A2.1-04 | Identity and organisation | Users, roles (`user_roles`), departments with `hod_user_id`, users' `department_id` and `reporting_manager_id`, designations with an approver flag. Areas: `/users`, `/admin` (IT_ADMIN), `/superadmin`; every check is on the server (`server/authorization/guards.ts`). Analytics scopes are built from these (`server/analytics/scope.ts`). |
| A2.1-05 | Records | `approval_requests` (form data, engine state JSON, status, submitted/closed), `approval_tasks`, `approval_events` (append-only timeline), `request_comments`, `request_attachments`, `audit_logs` (append-only), `consultations`, `request_revisions`, `request_links`, `request_amendments`, `request_submission_checks`. |
| A2.1-06 | Workflow patterns | A node graph (`server/engine`): sequential steps; parallel split/join with ALL / ANY_ONE / ANY_N completion; any-one and any-N approver groups at a step (completion rules); conditions with ordered branches and a default; FYI (notify) and work steps; skip rules. Any-one and any-N steps close the unneeded tasks as NOT_REQUIRED, so they are not counted as pending. |
| A2.1-07 | DoA, versions, escalation | DoA matrix per approval type (F-58), workflow versions (draft/published/archived; running requests keep their version; FN7 migration), escalation levels after 2×, 3× and 4× the response time (F-82, `general.escalation_levels`). |
| A2.1-08 | SLA | A per-step response time (`slaHours`). The due time is in working hours using the working calendar and holidays (`server/workflows/calendar.ts`), and time on hold shifts due times on (D-100). Due soon is at 75 %. There is no request-level SLA and no SLA exclusions. |
| A2.1-09 | Existing analytics components | Admin dashboards (utilisation, departments, approvers, raisers) with CSV (`server/dashboards/export.ts`, formula-guarded `toCsv`); Insights; Workload; search with saved views (`saved_views`, v1.5.0); notification list. |
| A2.1-10 | Notifications | In-app (`notifications`), email (Resend) and WhatsApp (CEOITBox templates). Each delivery is tracked in `notification_deliveries` (status, attempts, provider reference, receipts); messages are queued in `notification_outbox`. |
| A2.1-11 | Jobs | cPanel cron every 5 minutes → `/api/jobs/run` (secret header). Steps run and are recorded one by one in `job_runs`. Idempotency: outbox claims, delivery leases, `task_reminders`, report-run slot claims, alert-firing claims (`docs/AUTOMATION_INVENTORY_AND_RECOVERY.md`). |
| A2.1-12 | ERP and integrations | None. The only external services are email and WhatsApp providers. There is no authoritative transaction amount or status from outside the platform. |
| A2.1-13 | Observability and recovery | Structured logs with request ids (CF-Ray or a UUID), Super Admin alerts for failed jobs and backups, `/api/health`, append-only audit log, sign-in history, daily backups with a restore drill (`docs/DEPLOYMENT.md` Part P). |
| A2.1-14 | Tests and deployment | Vitest unit tests, integration tests on a throwaway MySQL database (`tests/integration`), Playwright E2E with axe (`tests/e2e`), and a QA suite. CI on GitHub. Deployment is GoDaddy Node hosting; the owner publishes (`docs/development/GO_LIVE_CHECKLIST.md`). |

## §2 Data dictionary: what the data can and can't support

| # | Data | Where | Reliable for analytics? |
|---|---|---|---|
| A2.2-01 | Request id and type | `approval_requests.request_no`; type via `workflow_versions.workflow_id` → `workflow_definitions` (kind PREDEFINED/CUSTOM) | Yes |
| A2.2-02 | Requester, department, plant | `requester_id` → `users.department_id` | Department: yes, the raiser's **current** department (history isn't kept). Plant/business unit: **not recorded** (Not feasible). |
| A2.2-03 | Timestamps | `submitted_at`, `closed_at` (approved, rejected, withdrawn), `deleted_at`; drafts in `request_drafts.updated_at` | Yes. Withdrawn = status CANCELLED. Creation of a draft isn't a submission. |
| A2.2-04 | Status and history | `approval_requests.status`; every transition is in `approval_events` (append-only) | Yes |
| A2.2-05 | Workflow, version, stage | `workflow_version_id`; stage = engine node id (`approval_tasks.node_id`, `node_label`, `state_json.nodes`) | Yes |
| A2.2-06 | Assignment and decisions | `approval_tasks`: `approver_id`, `created_at` (assigned), `decided_at`, `decided_by`, `on_behalf_of`; hand-overs in `approval_events` (TASK_REASSIGNED) | Yes |
| A2.2-07 | Parallel groups | Engine definition (split/join, completion rule) plus tasks per node and round | Yes. Requests and tasks are counted separately. |
| A2.2-08 | Due dates, SLA, calendar, pauses | `approval_tasks.due_at`, `escalate_at`; `holidays`; holds in events (PUT_ON_HOLD, RESUMED) | Step-level only. No request-level due date. A required-by date exists only if the form has a *needed by* field. |
| A2.2-09 | Amount and budget | Form data (the DoA amount field); `request_submission_checks` (budget state, committed); `budgets` | Amount: yes, for types with an amount field. Currency is INR only. There is no authoritative external amount and no actual spend. |
| A2.2-10 | Comments, questions, resubmissions, amendments | `request_comments`; events INFO_REQUESTED/INFO_ANSWERED; `request_revisions`; `request_amendments` | Yes |
| A2.2-11 | Delegation, reassignment, absence, escalation | `delegations`; TASK_REASSIGNED events; `task_reminders` (levels) | Yes |
| A2.2-12 | Automation history | `job_runs` (v1.6.0), `notification_outbox`, `report_runs` | Yes, from v1.6.0 onwards (no earlier history). |
| A2.2-13 | Notifications | `notifications`, `notification_deliveries` (attempts, status, receipts) | Yes |
| A2.2-14 | Integration references | None (no integrations) | Not applicable |
| A2.2-15 | Duplicate signals | `request_submission_checks.result_json` (warnings) and `override_reason` | Warnings and overrides: yes, from v1.6.0. **Confirmed duplicates are not recorded.** |
| A2.2-16 | User activity, access, roles | `login_logs`, `user_sessions`, `audit_logs` (role changes), `recent_views` | Yes |
| A2.2-17 | Configuration and migration | `audit_logs` (WORKFLOW_*), `workflow_versions`, `workflow_migrations`, `workflow_migration_items` | Yes. There is no config promotion yet (FN9, Yet to do). |
| A2.2-18 | Scheduled reports | `report_schedules`, `report_runs` | Yes, from v1.6.0 |
| A2.2-19 | Backup and monitoring | Backup files and audit entries; the `/api/health` runner heartbeat | Backups: yes. There is no infrastructure monitoring data (APM, DB metrics). |

## §3 What analytics existed, and what v1.6.0 changes

- **Admin dashboards and Insights.** These count requests by the period they were *raised* and their *current* status (a cohort view).
- **v1.6.0 role analytics.** These count outcomes by the period they were *closed* and decisions by *decision date*. Both views are valid; the metric dictionary states which is which. The admin dashboards are kept as they are.
- **Scope.** The admin pages remain IT-only. `/users/analytics` gives every person their own scopes (their requests, their approvals, their team, their department) and gives IT the organisation.
