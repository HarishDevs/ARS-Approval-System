# Application Current State Audit

**Date:** 16 Oct 2026
**Purpose:** the state of the code before two of the owner's briefs. Part A covers Google Calendar two-way sync (v1.11.0). Part B covers the Analytics Center (v1.12.0).
**Basis:** a source read, not documentation.
**Earlier audit:** the full 13-report audit is in this folder (`00`–`13`).

## Shared facts

| Area | State |
|---|---|
| Framework | Next.js 15.5 App Router, React 19, TypeScript, Tailwind 3.4 (ARS tokens); npm |
| Spaces | `/users` (everyone), `/admin` (IT_ADMIN, SUPER_ADMIN), `/superadmin` (SUPER_ADMIN only) |
| Authentication | Google (Firebase) or User ID + password + WhatsApp OTP |
| Sessions | HMAC-signed cookie plus a DB row, with idle and absolute limits |
| Authorisation | Area guards and per-record checks on the server; page access (Hidden / View / Full) bound to the action since v1.10.0 |
| Database | MySQL 8 via `mysql2`; additive SQL migrations applied in filename order on start |
| Notifications | In-app notifications (category APPROVAL / TASK / INFORMATION / SYSTEM) + email (Resend) + WhatsApp (CEOITBox), through an outbox |
| Background jobs | One cron call every 5 minutes to `/api/jobs/run`, which runs `server/ops/automation.ts` steps. Each step is recorded in `job_runs`. There is no persistent worker (GoDaddy). |
| Audit | Append-only `audit_logs` (DB triggers); request timeline; module histories |
| Secrets | Provider keys AES-256-GCM encrypted in `settings` (ENCRYPTION_KEY); server secrets in GoDaddy env only |
| Hosting | GoDaddy Node.js (cPanel) behind Cloudflare; `npm start` = migrate + seed + next start |
| Tests | Vitest unit + integration (real MySQL); Playwright E2E, QA and origin configurations; GitHub Actions CI |

## Part A: Google Calendar two-way sync

### Existing implementation (before v1.11.0)
- **Calendar page:** `/users/calendar` was a needed-by calendar. It showed requests whose type has a "needed by" date field, as a month grid plus a list, for "mine and waiting on me" or "all I can see".
- **Working calendar:** `/admin/calendar` holds working days and holidays for SLA. It is not a personal calendar.
- **Missing:**
  - no Google integration, no OAuth client and no calendar tables;
  - no week or day views;
  - no personal entries.
- **Module dates available:**
  - `approval_tasks.due_at` (UTC);
  - `tasks.due_at` (UTC) and `tasks.starts_on`;
  - `info_items.effective_on` and `expires_on` (dates);
  - the needed-by form field on requests.

### Missing functionality (from the brief)
- **Super Admin:** an Integrations page; global OAuth client configuration, test, enable/disable, health, logs, failed syncs with retry, connected users with revoke, and the audit history.
- **Per person:** an OAuth connection, calendar choice, Sync now, conflict review, reauthorisation.
- **Sync:** two-way sync with sync tokens, push notifications and channel renewal, reconciliation, a deletion policy and conflict handling.
- **Calendar UI:** month, week and day views, source and sync indicators, filters.

### Reusable components
- **Encryption:** `lib/security/encryption.ts` (AES-GCM) for the client secret and tokens.
- **Job runner:** a new automation step `calendar`; `alertSuperAdmin` for failures that use up every retry.
- **Rate limits:** `hitRateLimit` / `server/security/limits.ts`.
- **Audit:** `recordAudit`, `listAuditForEntity`.
- **Calendar data:** `monthGrid`, `parseMonth`, `loadNeededBy`.
- **UI:** `PageHeader`, `Card`, `Badge`, `useActionForm`, `ConfirmDialog`.
- **Guards:** `requireArea` / `requireApiArea` with page keys.

### Required schema changes
Migration `202610170900_v1110_google_calendar.sql` is additive. It adds seven tables:

| Table | Holds |
|---|---|
| `gcal_settings` | One row; the client secret encrypted |
| `gcal_connections` | One per person; tokens encrypted; sync token; watch channel |
| `calendar_items` | Personal entries |
| `gcal_links` | The durable mapping, with unique constraints per record and per Google event |
| `gcal_jobs` | Retry state and dead-letter |
| `gcal_conflicts` | Conflicts for review |
| `gcal_oauth_states` | Single-use OAuth states |

### Security risks considered
- **Token theft:**
  - tokens are encrypted at rest, server-only, and never in a URL, the browser or a log;
  - only a hash of the channel token is kept.
- **OAuth CSRF and login fixation:**
  - the state is random and single-use, expires after 10 minutes, and is bound to the person;
  - a nonce cookie ties it to the browser.
- **Over-sharing:**
  - event titles carry the reference only by default (no amounts, no form content), and events are private;
  - only the person's own work is synced.
- **Cross-user access:**
  - every query is keyed by the session's user;
  - personal entries open only for their owner;
  - Super Admin set-up gives no access to anyone's calendar.
- **Business integrity:** no sync path calls an approval, task or information action.
- **Webhook forgery:** the channel id, resource id and token hash must all match, and the endpoint is rate-limited.

### Implementation plan (as built)
1. Migration, configuration rules, Google client (fetch).
2. Repository.
3. Sync engine (pull, then push).
4. Jobs in the automation runner.
5. OAuth routes and webhook.
6. Super Admin page.
7. Profile tab.
8. Calendar views and entries.
9. Tests with a mocked Google; docs.

### Existing functionality that must not break
- The needed-by calendar: the `?month=` and `show=all` links are kept.
- Approval routing, DoA, delegation, tasks, information and notifications are untouched: the sync only reads them.
- The job runner's other steps.
- Page access: `/users/calendar` stays under `users.calendar`, and `/users/profile/calendar` under `users.profile`.

## Part B: Analytics Center (v1.12.0)

### Existing implementation (before v1.12.0)
- **Approval analytics:** `/users/analytics` and `/admin/analytics`, one shared screen (`features/analytics/AnalyticsScreen.tsx`). It covers:
  - KPIs with a comparison period;
  - scopes (own, approvals, team, department, organisation), enforced on the server (`server/analytics/scope.ts`);
  - periods in India time;
  - response-time status, aging, by type / department / step / approver, a department × step heatmap, backlog and overdue trends;
  - drill-down lists, saved views, a metric dictionary (`server/analytics/metrics.ts` → `docs/ANALYTICS_METRIC_DICTIONARY.md`), and a rate limit.
- **Elsewhere:** reports (17 + 4 module reports, CSV/XLSX/PDF, schedules, alerts) and admin dashboards (utilisation, approvers, departments, raisers).
- **Missing:**
  - no task or information analytics (v1.9.0 added only registers and reports);
  - no executive, employee, SLA-across-modules, trends or data-quality boards.

### Data available, and the gaps
| Module | Recorded | Not recorded |
|---|---|---|
| Approvals | `submitted_at`, `closed_at`, status, round; task `created_at`, `due_at` (working hours, moved by holds), `decided_at`, `decided_by`; timeline events; amendments; submission checks (duplicates, budget) | Request priority; a standard amount and currency across types; draft abandonment |
| Tasks | `created_at`, `due_at`, `starts_on`, `completed_at`, `cancelled_at`, status (OPEN, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED), priority, type; `task_events` (START, BLOCK, UNBLOCK, COMPLETE, REOPEN, CANCEL, REASSIGN, EDIT with due changes, COMMENT) | Effort and time logs; dependencies; recurrence; project; due date at the time of completion (only the current one) |
| Information | `created_at`, `published_at`, `withdrawn_at`, `effective_on`, `expires_on`, status, `ack_required`, priority, type; recipients fixed at publishing with `read_at` (first open) and `acknowledged_at`; notifications linked by `entity_type` / `entity_id`; delivery status per channel | Acknowledgement deadline; view counts beyond the first; the recipient group a person came through; email delivery receipts |
| People | department, reporting manager, roles, active | Department history (attribution uses the department now) |

### Reusable components
- **Analytics core:** scopes, periods and comparison, `share` / `median` / `percentile`.
- **UI:** `KpiCard`, `LineChart` (with a table view), `BarList`, `StackedBar`, `Heatmap`.
- **Metrics and exports:** the metric registry and its doc generator; the CSV writer (formula-guarded); `canExport`; the rate limiter; `recordAudit`.

### Schema changes
- **None.** Every metric is computed from existing columns. Gaps are shown as unavailable rather than filled with substitutes.
- **One new setting:** `analytics.aging_days` (configurable age buckets).

### Security considerations
- Every query is filtered by the viewer's scope on the server.
- **Exports:** resolve the scope again on the server, need the Can export permission, are rate-limited and audited.
- **Information titles:** in the "lowest acknowledgement" list they are shown only to the sender or IT.
- **Departments board:** only for heads of department (their departments) and IT.
- **No cross-user caching:** figures are computed per request.

### Must not break
- Approval analytics, its drill-down list, saved views (older views with approval filters still open the Approval board), the reports, the dashboards and the glossary.
