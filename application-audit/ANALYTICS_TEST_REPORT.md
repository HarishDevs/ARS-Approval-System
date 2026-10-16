# Analytics Test Report (v1.12.0)

**Date:** 16 Oct 2026
**Environment:** local Windows; MySQL 8 in Docker (`ars_approvals_test`, rebuilt from the migrations for each run); production Next.js build for E2E. GitHub Actions CI runs the same suites on push.
**Data:** all test data is created by the tests. Nothing is fabricated in the app.

## Results

| Suite | Result |
|---|---|
| Typecheck, lint | Clean |
| Unit (all) | 559 passed |
| Unit, analytics: `tests/analytics/*` (new `v1120-center.test.ts`: 13) | 44 passed |
| Integration (all, MySQL 8) | 233 passed |
| Integration, new: `tests/integration/v1120-analytics.int.test.ts` | 9 passed |
| E2E (all, production build) | 114 passed, 0 failed (after the fixes below; the run before them had 2 failures, both fixed) |
| E2E, new: `tests/e2e/v1120-analytics.spec.ts` | 4 passed |
| QA config / origin config | 27 passed / 1 passed |

## Brief §15 acceptance tests and where they're covered

| Requirement | Test | Result |
|---|---|---|
| Filters update every KPI and chart | E2E: period applied, kept across all 9 tabs, header shows the period | Pass |
| Date filters use the correct date fields | IT: tasks by `created_at` / `completed_at` / `cancelled_at`; information by `published_at`; an empty period returns zeros and unavailable rates | Pass |
| Previous-period comparisons use equivalent ranges | Existing `tests/analytics/periods` + UT previous quarter / yesterday | Pass |
| Empty results cause no calculation errors | IT empty period (rates null, medians null); UT `rate(0,0)` | Pass |
| Pagination and sorting | IT employees sort `tasks_open`; E2E search + sort; sort keys allow-listed | Pass |
| Exports match the active filters | E2E CSV carries the scope; export route resolves scope, period and search like the page | Pass |
| Unauthorised users can't reach restricted analytics | E2E: a requester gets only their own row; Department board refused; hand-made export with an organisation scope → 404 or own scope only | Pass |
| No cached results leaking across roles | Figures are computed per request (no cache) | By design |
| Parallel approvers don't inflate request counts | IT: a three-approver parallel step → 1 request raised, 1 open | Pass |
| Cancelled / withdrawn handled per definition | IT: task completion rate excludes cancelled (50%); cancellation rate 20%; approval rate excludes withdrawn | Pass |
| SLA uses valid timestamps | Approval SLA uses `due_at` / `decided_at` (existing OLD tests); IT SLA empty period → null, not 0% | Pass |
| Missing completion times give no false on-time rates | IT: on-time counts only tasks with `completed_at` and `due_at`; "completed without a completion time" is a data-quality check | Pass |
| Reopened tasks counted per rule | Counted from `task_events` REOPEN in the period | Code-verified; not separately asserted |
| Recurring tasks distinguished | Not applicable: tasks don't repeat (stated on screen) | n/a |
| Overdue from due date + status | IT: one open task past due → overdue 1; completed late is not overdue | Pass |
| Completion rate denominator | IT (cohort, cancelled excluded) | Pass |
| Acknowledgement rate uses eligible recipients | IT: 2 eligible (the sender isn't a recipient), 1 acknowledged → 50% | Pass |
| Viewing, delivery and acknowledgement distinct | IT: opened 2 of 2 (100%) while acknowledged 1 of 2 (50%) | Pass |
| Withdrawn and expired not treated as acknowledged | Metric definitions; Data quality "expired still waiting" | Code-verified |
| Duplicate recipients don't inflate counts | Primary key (info_id, user_id) makes duplicates impossible | By schema |
| No loading all records into the browser | All aggregation in SQL; the page receives totals and top-N lists | Code-verified |
| Bounded queries | Top-N `LIMIT`s; duration lists capped at 20,000 rows; employee pages of 25 | Code-verified |
| Exports enforce the same permissions | E2E; export uses `requireApiArea` + `canExport` + server-side scope | Pass |
| Cross-department / cross-user access fails safely | IT scope isolation (another person's own and team scope see 0; the HOD sees their department) | Pass |
| Usable on mobile | E2E five-viewport check includes `?board=tasks` and `?board=employees` (wide tables scroll inside their card) | Pass |
| Accessibility | Existing axe test (RA-03) on the analytics pages, light and dark | Pass (after the fix below) |

## Defects found by these tests, and fixed

1. **Reserved SQL alias.** `over` is a reserved word in MySQL 8, so the overdue-age query failed. Renamed.
2. **Duplicate metric name.** "Overdue tasks" existed for approval tasks and for Task Management tasks. Renamed the latter to "Tasks overdue", and added a uniqueness test.
3. **Glossary not keyboard-scrollable.** The wider glossary table scrolls sideways but couldn't be reached by keyboard (axe `scrollable-region-focusable`). The region is now focusable and labelled.
4. **Wrong test expectation.** The sender isn't a recipient of their own information, so the integration test's denominator was wrong (the app was right).
5. **Old tests on the default view.** Two older E2E tests expected Approval analytics as the default page. They now open `?board=approvals`. Older links with approval filters keep opening it automatically.

## Not tested, or limited

- **No real production data:** volume and performance at scale weren't measured. Query plans should be reviewed once there are thousands of tasks; indexes exist on the status, date and assignee columns used.
- **Forecasts:** tested with synthetic series (UT). They won't appear on live until 12 months of history exist.
