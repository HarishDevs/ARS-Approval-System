# Implementation report: v1.6.0 (unified master prompt)

**Date:** 10 Oct 2026
**Repository:** HarishDevs/ARS-Approval-System, `main`, tag `v1.6.0`
**Prompt:** `docs/requirements/UNIFIED_MASTER_PROMPT.md` (supplements the earlier master prompt)

> **Production deployment did not occur.** All work was done locally and pushed to GitHub. The live site at approval.arssteels.net still runs what the owner last published (v1.4.0 at the time of writing). No production database, migration, backup, setting or account was touched, no destructive operation was run, and approval by email or WhatsApp reply stays disabled.

## 1. Executive summary

v1.6.0 extends the platform without replacing it. The node-graph engine, the locking service, visibility rules, notifications and audit are all reused unchanged. On top of them it adds:

- **Requesting.** A modern UI kit and dark mode; smart forms (conditional fields, calculated fields, line items); submission readiness with duplicate and budget checks; templates and profile autofill.
- **Approving.** Recall, questions, consultations and delegation of one task; amendments after approval.
- **Running the platform.** Workflow reliability tools (stuck detection with a reconciliation check, an automation inventory with run history, safe resend); version compare, restore and a migration assistant; configuration promotion; legal holds with a retention dry run; feature switches.
- **Measuring.** Role-based analytics, eleven reports (plus a department scorecard), CSV/XLSX/PDF exports, saved views, scheduled reports and alert rules.

Every one of the 1,857 atomic requirements is classified in the register: **1,287 Implemented, 504 Yet to do, 66 Not feasible**. "Yet to do" items are not hidden. They are mostly breadth beyond the core: additional chart types, extra filters, loading and partial-data states, per-report metadata, and several monitoring and performance measurements.

## 2. Audit findings and architecture

- `docs/APPLICATION_CURRENT_STATE_AUDIT.md` covers the application; `docs/ANALYTICS_CURRENT_STATE_AUDIT.md` covers the analytics inventory and data dictionary.
- **Stack:** Next.js 15 App Router (server components and Server Actions), React 19, TypeScript, Tailwind tokens, MySQL 8 with additive SQL migrations, Vitest and Playwright (with axe).
- **Architecture decisions** are recorded as D-113 to D-126 in DEVELOPMENT-MEMORY.md. Each new feature is a server module (`server/approvals/*`, `server/analytics/*`, `server/reports/*`, `server/ops/*`, `server/workflows/*`) behind server-rendered pages. There is no separate JSON API except downloads (D-123).

## 3. Status register

- `docs/IMPLEMENTATION_STATUS_REGISTER.md` is generated from `docs/register/status.json` by `node scripts/docs/build-register.mjs`.
- Each row has a status plus its evidence and test, or its remaining action. Not feasible rows also carry a blocker, a prerequisite and an alternative.

## 4. Counts

| Part | Implemented | Yet to do |
|---|---|---|
| Master prompt rows (M) | 50 | 4 |
| Addendum A (analytics) | 782 | 403 |
| Addendum B (reliability, governance) | 67 | 45 |
| FN1 readiness | 44 | 1 |
| FN2 stuck detection | 28 | 10 |
| FN3 duplicates | 34 | 3 |
| FN4 autofill | 25 | 2 |
| FN5 amendments | 33 | 1 |
| FN6 scorecards | 26 | 6 |
| FN7 migration | 33 | 0 |
| FN8 safe replay | 21 | 3 |
| FN9 promotion | 30 | 4 |
| FN10 retention / legal hold | 34 | 6 |
| FN11 failed-automation recovery | 80 | 16 |
| **All rows, including the Not feasible table** | **1,287** | **504** (+ **66 Not feasible**) |

## 5. Not feasible (66 rows)

Every Not feasible row is listed separately, with its evidence, reason, dependency/owner and alternative, in the register's Not feasible table. They fall into these groups:

| Group | Reason (evidence) | Owner / prerequisite | Safe alternative |
|---|---|---|---|
| Plant / business unit | No plant attribute on users, departments or requests (schema checked) | The owner defines plants and maps departments | Department everywhere |
| Cost centre | No cost-centre attribute | A cost-centre master and mapping | A form field per type |
| Priority, capacity | Not modelled | Business rules | — |
| ERP and integrations | Only email/WhatsApp providers exist | An integration and API access | Not applicable until one exists |
| APM, database, storage, deployment and availability telemetry | Not instrumented on GoDaddy shared hosting | Hosting monitoring | Job runs, logs with request ids, `/api/health` |
| Request-level due date | No such field; only step response times | A request SLA policy or a mandatory *needed-by* field | Step response times (working hours) |
| Confirmed duplicates | Only warnings and overrides are recorded | A "mark as duplicate" process | Possible duplicates submitted anyway |
| Delay reasons | Not recorded | A delay-reason field | Where requests wait; turnaround by step |
| SLA exclusions | None recorded | An exclusion rule | Holds pause the clock |
| Analytics refresh pipeline | Figures are live queries (none needed) | Only if analytics are materialized | "As of" time |

## 6. Yet to do (504 rows)

Each row has its exact remaining action in the register. The main themes are:

1. **Analytics breadth (about 400 rows).** These are mostly specific chart types:
   - funnel, Sankey, heatmaps, box plots and control charts;
   - day-of-week and calendar charts;
   - financial value charts.
   
   Also outstanding:
   - more filters (status, approver, stage, SLA status, aging bucket and others);
   - drill-down from every card or chart, carrying filters;
   - loading, partial-data and stale states;
   - calendar-month and year-on-year comparisons; organisational peer comparisons;
   - per-report metadata (date field, detail level, sensitivity);
   - performance measurements against the targets;
   - saved-view sharing and defaults; editing schedules; execution vs delivery failure; quiet hours.
2. **Remaining v1.6.0 items:** watchers; the needed-by calendar; builder sections and preview; approval expiry (`validityDays` is stored but not yet enforced); bulk reassignment (BJ-08).
3. **Reliability:**
   - automatic recovery of inconsistent workflow states (detection is done);
   - re-evaluating expired delegations;
   - a missed-cron alert (BD-02);
   - backup verification automation;
   - an RTO/RPO decision (owner).
4. **Governance:**
   - retention execution, which waits for the owner's approved policy;
   - field-level masking (S-02);
   - separate export and schedule permissions (S-03, an owner decision);
   - audits for pausing schedules and alerts.
5. **Small items in FN1–FN11:**
   - mobile E2E for the readiness and template journeys;
   - requester and department as duplicate match dimensions;
   - generated-column uniqueness for must-be-unique identifiers;
   - an autofill "refresh from profile" button;
   - amendment drafts;
   - a timeout/crash case in the retry tests.

## 7. Reused without modification

- Workflow engine (`server/engine`)
- Locking service and outbox
- Visibility rule (`visibleToSql`)
- Notification pipeline and delivery retries
- Working calendar and SLA due times
- Audit log
- Formula-guarded CSV writer
- pdf-lib request summary
- Settings store (new groups only)
- Admin dashboards and Insights (kept as they are)

## 8. Defects corrected

- **V6-D01 to D07 (KNOWN_ISSUES):**
  - route `loading.tsx` turning 404s into 200s and blocking refreshes;
  - a search visibility gap;
  - middleware overwriting the attachment sandbox CSP;
  - ErrorSummary stealing focus;
  - and others.
- **Found and fixed during this work:**
  - a double-click submit making two requests under the new type lock;
  - line items lost from templates, resubmit and "raise again";
  - the new-request form not remounting when started from a template;
  - migrated requests missing state entries for new steps (an engine crash on the next decision);
  - `last_value` being a MySQL reserved word in a migration.
- **CI:** the QA suite's QA-FILE-01 had failed on every push since the RD-02 file-preview change. The test picked the new "open in a new tab" preview link instead of the download link. The app behaviour was right; the test now checks both links.

## 9. Built or completed

| Area | Highlights | Decisions |
|---|---|---|
| UI | UI kit, dark mode, palette, shortcuts, bottom nav, toasts/Undo, error summary, timeline, file preview, resubmission diff | Phases 1–5 |
| Approvals | Recall, questions, consultation, single-task delegation, links/follow-ups | Phase 6a |
| Smart forms | Show-if / required-if rules, CALC formulas, line items in paise, sections | D-114 |
| Readiness | Readiness checker, duplicates, budgets | D-115, D-116 |
| Autofill | Templates, raise again, profile autofill | D-117 |
| Reliability | Needs attention (stuck + reconciliation), Automation (inventory, history, run now, resend) | D-118 |
| Amendments | Amendments after approval | D-120 |
| Versions | Compare, restore, migration assistant | D-121 |
| Analytics | Semantics, periods, scopes, metric dictionary, KPI cards, charts | D-122 |
| Reports | 12 reports, CSV/XLSX/PDF exports, saved views, scheduled reports, alert rules | D-123 |
| Switches | Feature switches | D-124 |
| Promotion | Configuration export/import | D-125 |
| Governance | Legal holds, retention dry run | D-126 |

## 10. Files and modules

**New:**
- **Server modules:** `server/approvals/{readiness,autofill,amendments,consult}.ts`; `server/analytics/{semantics,periods,scope,metrics}.ts`; `server/reports/{catalogue,run,export,schedule-time,schedules}.ts`; `server/ops/{automation,stuck,governance}.ts`; `server/workflows/{type-settings,version-diff,migration-plan,migration,promotion}.ts`; `server/settings/features.ts`.
- **Repositories:** analytics, checks, budgets, templates, job-runs, analytics-views.
- **Pages:**
  - `/users/analytics` and `/users/analytics/metrics`; `/users/reports` and `/users/reports/[key]`; `/users/requests/[id]/amend`;
  - `/admin/attention`, `/admin/budgets`, `/admin/workflows/import`, `/admin/workflows/[id]/compare`, `/admin/workflows/[id]/migrate`;
  - `/superadmin/automation`, `/superadmin/retention`.
- **Routes:** `/api/reports/[key]`, `/api/admin/workflows/[id]/export`.

**Changed:**
- The submit path in `server/approvals/service.ts`;
- RequestForm, the request page, the workflow page, the job runner route, settings definitions and the layouts.

## 11. API and database changes

- **Routes:** two download routes (§10). Everything else uses Server Actions with server-side checks.
- **Database:** six additive migrations (listed in `docs/BACKUP_RESTORE_AND_ROLLBACK.md` §3). Nothing was dropped, renamed or backfilled.
- **Settings:**
  - `general.budget_policy`, `general.stuck_idle_days`;
  - `features.*`;
  - `retention.*`.

## 12. Security and authorization

`docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` lists every new surface with its server-side check and test. No critical or high-severity issue was found. The open findings are S-01 to S-07: rate limits on read pages, field-level masking, export permission, checksum authenticity, emailed report data, the missed-cron alert, and pause audits.

## 13. Metrics and data gaps

- **Definitions:** `docs/ANALYTICS_METRIC_DICTIONARY.md` (25 metrics, generated from code and kept in step by a unit test).
- **Gaps:** `docs/ANALYTICS_LIMITATIONS_AND_DATA_GAPS.md`.
- **Test matrix:** `docs/ANALYTICS_TEST_MATRIX.md`.
- **Key rules:**
  - pending is not overdue;
  - requests and tasks are never added together;
  - SLA uses working-hour due times;
  - aging uses calendar time;
  - India time throughout.

## 14. Tests (actual results, final run, 10 Oct 2026)

| Suite | Result |
|---|---|
| Lint (eslint) and type-check (tsc) | Clean |
| Unit (Vitest) | **389 passed / 389** |
| Integration on MySQL 8 (Vitest) | **146 passed / 146**, three runs in a row |
| E2E (Playwright, with axe in light and dark) | **73 passed / 73** |
| QA suite (`playwright.qa.config.ts`) | **27 passed / 27**, after the QA-FILE-01 test fix (§8) |
| Origin check (`playwright.origin.config.ts`) | **1 passed / 1** |

- **Not run:** load tests at production volume, an external penetration test, and live email delivery (no provider key in test environments; the failure path is tested).
- **CI:** the v1.6.0 pushes before the QA-FILE-01 fix failed only that QA test. The release commit must be confirmed green on GitHub (go-live 1.1).

## 15. Performance and known limits

- **Not measured:** no p95 measurements were taken against the Addendum A targets (register A21-01 to 06).
- **Built-in protections:**
  - every analytics query is aggregated in SQL;
  - date ranges are capped at two years;
  - reports are capped at 5,000 rows and downloads at 20 a minute;
  - nothing is cached, so no cross-user leakage is possible.
- **Known limits:**
  - KPIs come from several reads, not one snapshot;
  - the migration dry run loads requests one by one (at most 500);
  - the dataviz palette validator wasn't available, so charts rely on dash, marker and pattern encoding plus table views.

## 16. Automation and recovery

`docs/AUTOMATION_INVENTORY_AND_RECOVERY.md` covers the ten automations and their retry, idempotency and recovery. That's the original eight plus scheduled reports and alert rules. It also covers stuck detection and the safe-retry rules.

## 17. Backup, migration and rollback

`docs/BACKUP_RESTORE_AND_ROLLBACK.md`. Use the lightest lever first:
1. Feature switches.
2. Restore a workflow version.
3. Redeploy `v1.5.0`.
4. Restore the database.

## 18. Deployment checklist and outstanding approvals

`docs/GO_LIVE_READINESS_CHECKLIST.md`.

**Owner items:**
- the cron secret (blocking for anything scheduled);
- a backup before publishing;
- the first feature-switch settings;
- retention durations;
- the budget policy and budgets;
- per-type submission checks;
- RTO/RPO targets;
- export permissions (S-03).

## 19. Confirmation

No production deployment, production migration, destructive operation, backup overwrite, mass record change or credential entry took place. Nothing was published to GoDaddy. Publishing v1.6.0 is the owner's decision.
