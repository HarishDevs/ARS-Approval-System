# Analytics Implementation Tracker (v1.12.0)

**Date:** 16 Oct 2026. **Page:** Analytics (`/users/analytics`, and `/admin/analytics` for IT), with the boards as tabs.
**Definitions:** `docs/ANALYTICS_METRIC_DICTIONARY.md` (generated) and in-app at Analytics → How these are worked out.

## Statuses

| Status | Meaning |
|---|---|
| **Implemented and verified** | Built and covered by a passing automated test, or seen on screen in the E2E run |
| **Partially implemented** | Built, with a stated limit |
| **Not implemented** | Not built |
| **Blocked** | Blocked by missing data or a dependency |
| **Not applicable** | Doesn't fit the application |

## File abbreviations

| Abbreviation | File |
|---|---|
| C | `features/analytics/CenterScreen.tsx` |
| R | `lib/db/repositories/analytics-center.repository.ts` |
| P | `server/analytics/center.ts` (pure rules) |
| M | `server/analytics/center-metrics.ts` (dictionary) |
| A | `features/analytics/AnalyticsScreen.tsx` (Approval analytics, existing) |
| X | `app/api/analytics/export/route.ts` |

## Test abbreviations

| Abbreviation | File |
|---|---|
| UT | `tests/analytics/v1120-center.test.ts` (unit) |
| IT | `tests/integration/v1120-analytics.int.test.ts` (integration) |
| E2E | `tests/e2e/v1120-analytics.spec.ts` |
| OLD | The existing approval analytics tests: `tests/analytics/*`, `tests/integration/analytics.int.test.ts`, `v160-zanalytics`, `v170-abc` |

## Remaining work: one line each

- **Effort, utilisation, dependencies and recurrence:** need new task fields (owner decision).
- **Acknowledgement deadlines:** need a deadline field on information (owner decision).
- **Total views:** need view events.
- **HOD row-level detail for tasks:** HODs see aggregates and their department; opening a task still follows the task's own access rule.
- **Forecasts:** appear once there are 12 months of history.
- **Approval financial analytics:** amounts are form-defined and not standardised by currency; per-type value analytics would need a declared amount field per type.

## Central page and shared filters

| Item | Status | Source / formula | Files | Tests | Verification | Remaining |
|---|---|---|---|---|---|---|
| One Analytics page, 9 boards as tabs (not navigation items) | Implemented and verified | `board` query parameter; unknown → Executive overview | C, A, P | UT boards; E2E "IT opens every dashboard" | Pass | — |
| Old links and saved views with approval filters open Approval analytics | Implemented and verified | approval filter keys → `board=approvals` | A | E2E "older approval links" | Pass | — |
| Scope ("Whose numbers"): own / approvals / team / department / organisation | Implemented and verified | `server/analytics/scope.ts`; new `peopleScopeSql`, task, info and recipient scopes | R | IT scope isolation; E2E requester | Pass | — |
| Date range presets: Today, Yesterday, 7/30/90 days, This/Previous month, This/Previous quarter, This/Previous FY, Custom | Implemented and verified | `server/analytics/periods.ts` (today, yesterday, previous quarter added) | periods.ts | UT periods; E2E previous quarter | Pass | — |
| Compare with the previous period / same period last year | Implemented and verified | `comparisonPeriod` | C | E2E | Pass | — |
| Filters carry over between boards; active period and dates shown in the header | Implemented and verified | `BoardTabs` carries scope, period, from, to and compare | C | E2E (period kept across all 9 tabs) | Pass | — |
| Clear filters; explicit Apply | Implemented and verified | form GET + Clear link | C | E2E Apply | Pass | — |
| Reporting time zone shown; event-date vs creation-date semantics stated | Implemented and verified | header "India time (UTC+5:30)"; footer note on dates | C | E2E `center-refreshed` | Pass | — |
| Department filter | Implemented and verified | Approval analytics has it; other boards break down by department, and HOD department scope limits all figures | A, C | OLD | Pass | — |
| Employee filter | Implemented and verified | Employee board search (name or User ID) | C, R | E2E; IT search injection | Pass | — |
| Reporting manager / HOD filter | Implemented and verified | "My team" / "My department" scopes | scope.ts | IT | Pass | — |
| Module filter | Implemented and verified | each board is one module (or cross-module, separated) | C | E2E | Pass | — |
| Record status, priority, workflow/category filters | Partially implemented | Approval analytics: status, type, step, approver, response time, age. Task and information boards show breakdowns by status, priority and type rather than filters | A, C | OLD | Pass | Filters on the task and information boards |
| Created by / Assigned to / Approved by filters | Partially implemented | Approval: approver filter. Tasks: by-assignee breakdown; scope MINE includes "created by me" | A, C | OLD, IT | Pass | Dedicated filters |
| Last refreshed time | Implemented and verified | "As of …" | C | E2E | Pass | — |
| Loading, empty and error states | Implemented and verified | Empty tables say "Nothing for this selection"; no-denominator rates show "—"; the page's error boundary has a reference | C | IT empty period | Pass | — |
| Server-side aggregation; no raw records sent to the browser | Implemented and verified | all SQL `COUNT`, `SUM`, `AVG`; duration lists capped at 20,000 rows for medians | R | IT | Pass | Pre-aggregation only if volume grows |
| Role-based access (Super Admin, Admin, HOD/manager, employee) | Implemented and verified | existing scopes; departments board only for HOD or organisation scope; export resolves the scope on the server | R, X | E2E requester; IT | Pass | — |
| Analytics rate limit | Implemented and verified | existing 40 page loads/min; exports 20/min | AnalyticsScreen, X | OLD | Pass | — |

## Executive overview

| Item | Status | Source / formula | Files | Tests | Verification | Remaining |
|---|---|---|---|---|---|---|
| Requests created (raised), pending (open), completed | Implemented and verified | `approval_requests.submitted_at`, `status`, `closed_at` | R `approvalSummary` | IT parallel step | Pass | — |
| Approval completion rate | Implemented and verified | cohort: raised in period → approved or rejected ÷ raised (not withdrawn) | R, M | IT (0% with one open) | Pass | — |
| Average approval turnaround | Implemented and verified | AVG(closed − submitted), closed in period | R | IT | Pass | — |
| Overdue approvals (requests with an overdue task) | Implemented and verified | DISTINCT request, PENDING task with `due_at` < now | R | IT | Pass | — |
| Tasks created, open, completed, completion rate, overdue | Implemented and verified | `tasks.created_at`, `status`, `completed_at`, `due_at`; rate excludes cancelled | R `taskSummary` | IT | Pass | — |
| Information published, awaiting acknowledgement, acknowledgement rate | Implemented and verified | `info_items.published_at`; `info_recipients.acknowledged_at`; denominator = eligible recipients | R `infoSummary` | IT (sender excluded; open ≠ ack) | Pass | — |
| Overdue acknowledgements | Blocked | no acknowledgement-deadline field | M (Unavailable) | E2E (shown as not available) | Pass | Add a deadline field (owner decision) |
| Active contributors | Implemented and verified | DISTINCT actor across the six actions | R | E2E (card renders) | Pass | — |
| Comparison with the previous equivalent period | Implemented and verified | KpiCard `previous` | C | E2E | Pass | — |
| Monthly activity trend (12 months) | Implemented and verified | `monthlyActivity` | R, C | E2E | Pass | — |
| Workload distribution / open backlog by module | Implemented and verified | BarList "Open work now, by module" | C | E2E | Pass | — |
| Overdue workload by module | Implemented and verified | BarList "Overdue now" | C | E2E | Pass | — |
| Department workload comparison | Implemented and verified | `departmentRows`, separate module columns | R, C | IT departments | Pass | — |
| Completion and acknowledgement trends | Implemented and verified | Trends board (12-month completion chart and table) | C | E2E | Pass | — |
| Employee and department summaries (by permission) | Implemented and verified | Employee and Department boards | C | E2E, IT | Pass | — |
| Highest-risk areas; change in backlog vs previous period | Partially implemented | Alerts (completion drop, lateness rise, unusual department load, low acknowledgement); period comparison table | P, C | UT alerts | Pass | Backlog *history* needs daily snapshots (not stored); approval backlog-over-time exists on Approval analytics |
| Executive alerts with explainable thresholds | Implemented and verified | `ALERT_RULES`; each alert shows its rule | P | UT | Pass | Thresholds are constants, not settings |
| SLA breach increase alert | Implemented and verified | "past due in the period" rise ≥ 25% and ≥ 5 | P | UT | Pass | — |

## Approval analytics

The existing Approval analytics screen (v1.6–v1.8, with its own tests) is the Approval board.

| Item | Status | Notes |
|---|---|---|
| 4.1 Volume and status: raised, approved, rejected, withdrawn, sent back, amendments, open, pending, overdue, due today/week, approval/withdrawal/rework/first-pass rates | Implemented and verified | OLD; "returned for correction" = sent back |
| Requests cancelled vs withdrawn | Implemented and verified | Withdrawn = requester; deleted = Super Admin, never counted |
| Requests reopened | Partially implemented | Reopening is audited (v1.10.0) but not yet a KPI |
| Charts: raised/decided over time, status mix, by type, by department, by approver, backlog and overdue trend | Implemented and verified | OLD |
| Approval volume by priority | Not applicable | Approval requests have no priority field |
| 4.2 Turnaround and SLA: average and median cycle, task decision time, decided in time, breaches, overdue, approaching, response-time status, backlog age | Implemented and verified | OLD; the SLA board adds by department and by step |
| 90th percentile approval duration | Partially implemented | Percentile helper exists; the approval board shows average and median |
| Time to first decision; average time per step | Partially implemented | Per step: "Where requests wait (by step)" with average decision hours; first decision not separate |
| 4.3 Approver performance: decisions, average decision, pending and overdue by approver, delegations | Implemented and verified | OLD approver load; delegated decisions are recorded on the audit and timeline |
| 4.4 Workflow and step: by type, by step, bottlenecks, heatmap department × step | Implemented and verified | OLD |
| Conditional branch distribution; parallel completion time; workflow config changes over time | Not implemented | Branch events exist on the timeline; not yet aggregated |
| 4.5 Requester analytics: by employee (Employee board) and by department | Implemented and verified | C |
| Drafts abandoned | Not implemented | Drafts are deleted, not tracked |
| 4.6 Backlog and aging: age since raised, at the current step, by department × step | Implemented and verified | OLD (fixed buckets; task and information buckets are configurable) |
| 4.7 Financial analytics | Not implemented | No standard amount or currency field across types (forms are type-defined). Per-type value would need a declared amount field. Never mix currencies. |
| 4.8 Exceptions: stuck requests, inactive approvers, overrides, budget warnings, data quality | Implemented and verified | OLD + Data quality board |

## Task analytics

| Item | Status | Source / formula | Tests |
|---|---|---|---|
| Created, completed, cancelled (period); not started, in progress, blocked (now) | Implemented and verified | `tasks.status`, `created_at`, `completed_at`, `cancelled_at` | IT |
| Completion rate (excludes cancelled), cancellation rate | Implemented and verified | cohort of tasks created in the period | IT (50%, 20%) |
| Overdue, due today, due within 7 days, without a due date | Implemented and verified | `due_at` vs now (India date for today) | IT |
| Without an assignee | Not applicable | `assignee_id` is NOT NULL; stated on screen | — |
| On hold | Not applicable | Tasks have no on-hold status (Blocked is shown) | — |
| Reopened, postponed, reassigned | Implemented and verified | `task_events` REOPEN, EDIT with `dueChanged` later, REASSIGN | E2E renders; source verified in code |
| Time to complete: average, median, p90 (10+ only) | Implemented and verified | `completed_at` − `created_at` | IT, UT |
| Completed by the due date, late, average days late | Partially implemented | `completed_at` ≤ `due_at` (the due date now) | IT (1 on time, 1 late) |
| Created and completed trend | Implemented and verified | daily (≤ 62 days) or monthly | E2E |
| Status, priority, type, department and assignee breakdowns | Implemented and verified | GROUP BY | E2E |
| Project / workstream | Not applicable | Tasks have no project field | — |
| Backlog aging (configurable), overdue by days past due, oldest open | Implemented and verified | setting `analytics.aging_days` | IT, UT |
| Blocked count and time blocked | Implemented and verified | last BLOCK event | E2E |
| No recent activity; repeatedly postponed per task | Partially implemented | Postponements counted in the period; a per-task list isn't built | — |
| At-risk tasks | Partially implemented | Due within 7 days and overdue are shown; no combined "at risk" rule | — |
| Employee task analytics | Implemented and verified | Employee board | IT |
| Department / HOD task analytics | Implemented and verified | Department board; by-department breakdown | IT |
| Effort, time logs, utilisation | Blocked | not recorded (stated on screen) | E2E text |
| Dependencies | Blocked | not supported (stated on screen) | — |
| Recurring tasks | Not applicable | tasks don't repeat | — |
| Task data quality | Implemented and verified | Data quality board (no due date, done without a time, inactive assignee, no department) | IT |

## Information analytics

| Item | Status | Source / formula | Tests |
|---|---|---|---|
| Created, published, withdrawn (period); drafts, scheduled, active, expired, archived (now) | Implemented and verified | status, `effective_on`, `expires_on` | E2E |
| Requiring acknowledgement; acknowledged, pending, rate (eligible recipients) | Implemented and verified | `info_recipients` | IT |
| Average and median time to acknowledge | Implemented and verified | `acknowledged_at` − `published_at` | IT |
| Time to reach 50/75/90/100% | Not implemented | — | — |
| Rate by type, department (recipient), sender; lowest-rate records | Implemented and verified | GROUP BY; titles only for the sender or IT | IT |
| Rate by recipient group | Not implemented | Groups are resolved at publishing; no group snapshot is kept | — |
| Pending by age (configurable) | Implemented and verified | `published_at` | E2E |
| Overdue by days; deadline compliance | Blocked | no deadline field | E2E text |
| Distribution: recipients per record, delivery by channel (sent, delivered, failed) | Partially implemented | `notification_deliveries` via `notifications.entity_*`; email has no delivery receipt | E2E table |
| Readership: opened in ARS (first open) | Partially implemented | `info_recipients.read_at` | IT |
| Total and repeat views | Blocked | not recorded | — |
| Publisher analytics | Implemented and verified | by sender | E2E |
| Draft-to-publication time | Not implemented | `created_at` and `published_at` exist; not yet shown | — |
| Lifecycle checks: bad dates, expired but still awaiting, no recipients | Implemented and verified | Data quality board | IT |

## Employee, department, SLA, trends and quality

| Item | Status | Tests |
|---|---|---|
| Employee board: per person, modules in separate columns, never one score | Implemented and verified | IT, E2E |
| Employee board: search, sort (allow-listed), pagination (25 per page) | Implemented and verified | IT (injection-safe search), E2E |
| Department board: per department, attribution rules stated | Implemented and verified | IT, E2E |
| Department board: denied for own / team scope | Implemented and verified | IT, E2E |
| SLA board: approvals in time, breaches, overdue now, by department, by step | Implemented and verified | IT (empty), E2E |
| SLA board: tasks on time by priority | Implemented and verified | E2E |
| SLA board: information deadline compliance | Blocked | — |
| Trends: period-on-period table; 12-month chart and table | Implemented and verified | E2E |
| Trends: 24-month CSV | Implemented and verified | E2E (export route) |
| Same period last year | Implemented and verified | E2E (compare) |
| Forecasts | Partially implemented | UT. Linear, 12 complete months needed, range shown; hidden until then |
| Data quality board (14 checks, with where to fix each) | Implemented and verified | IT |

## Exports

| Item | Status | Notes |
|---|---|---|
| CSV: employees, departments, 24 months | Implemented and verified | Same scope, period and search; header lines give board, scope, period, filters, generated time and where the definitions are. Permission `canExport`; rate limit; audited ANALYTICS_EXPORTED; formula-guarded cells. |
| Excel | Not implemented | Approval reports already export xlsx; the Center exports CSV |
| Scheduled reports | Partially implemented | The existing scheduled reports cover approval reports; Center boards aren't schedulable yet |
