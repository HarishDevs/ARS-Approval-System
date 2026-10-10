# Analytics performance (v1.7.0, C01)

How fast the Analytics queries are, how this was measured, and the index review. The numbers below are from one real run, not estimates. They show the relative cost of each query; GoDaddy's shared MySQL will be slower in absolute terms.

## How it is measured

- **Test:** `tests/perf/analytics.perf.test.ts`.
- **Run it:** `npx vitest run --config vitest.perf.config.ts` (with the Docker MySQL up). It is not part of CI, because timings on shared runners aren't meaningful.
- **Data:**
  - 300 requests are raised through the real service, across 4 departments and 3 approvers, with a mix of approved, rejected and open.
  - They are then copied 20 times by SQL with earlier dates, giving **6,300 requests and 18,900 tasks**.
  - That is several years of ARS volume at the current rate.
- **Method:** each query runs once to warm up, then 20 times. The p50, p95 and maximum are recorded.
- **Results file:** `test-results/perf/analytics.json`.
- **Targets (the test fails above these):**
  - **p95 under 1,000 ms** for each query.
  - **p95 under 3,000 ms** for the whole dashboard (every query at once, as the page runs them).

## Results, 10 Oct 2026

- **Machine:** Windows 11 laptop, Node 24.18, MySQL 8.0.46 in Docker.
- **Scope:** organisation (the widest, so the slowest).

| Query | p50 ms (30 days) | p95 ms (30 days) | p95 ms (this financial year) |
|---|---:|---:|---:|
| KPIs | 29.0 | 33.4 | 40.0 |
| Right now | 45.1 | 48.2 | 47.1 |
| Raised and decided trend | 12.1 | 13.2 | 25.5 |
| Aging | 26.5 | 29.9 | 46.7 |
| Response-time status | 26.3 | 28.8 | 35.1 |
| By approval type | 10.4 | 11.6 | 17.8 |
| By department | 10.2 | 11.0 | 18.2 |
| Steps (where requests wait) | 47.4 | 53.9 | 53.7 |
| Approver workload | 64.0 | 67.8 | 66.0 |
| Due today / next 7 days (B03) | 18.1 | 19.4 | 18.5 |
| Quality: median, first pass, rework, withdrawal (B03) | 6.5 | 7.1 | 19.9 |
| Status mix (B05) | 6.5 | 6.7 | 15.3 |
| History: backlog, overdue, response times passed, decisions (B05) | 55.3 | 63.0 | 81.8 |
| Department × step heatmap (B05) | 20.9 | 22.2 | 21.8 |
| Filter choices (approvers, steps) (B02) | 78.7 | 92.2 | 80.5 |
| Drill-down: raised (B01) | 8.0 | 8.5 | 25.4 |
| Drill-down: waiting for approvers (B01) | 16.2 | 17.5 | 24.0 |
| KPIs with step + response-time filters (B02) | 202.8 | 215.0 | 222.9 |
| Report: request register | 20.0 | 23.2 | 77.4 |
| **Whole dashboard, every query at once** | **133.7** | **151.9** | n/a |

**Reading it:**
- Every query is well under its target.
- The slowest single query is KPIs with both the step filter and the response-time filter: about 0.2 s. Those filters add an "exists a task like this" check per request.
- The whole page's queries together take about 0.15 s at p95.

## Index review

The analytics and report queries filter by these period columns, which had no index of their own:

- `approval_requests.submitted_at`
- `approval_requests.closed_at`
- `approval_tasks.decided_at`

The drill-down and repair checks look up tasks by request and status. Migration `202610140900_v170.sql` adds these indexes:

| Index | For |
|---|---|
| `approval_requests (submitted_at)` | Raised in the period, trends, history |
| `approval_requests (closed_at)` | Approved, rejected and withdrawn in the period, quality |
| `approval_tasks (decided_at)` | Decisions in the period, response-time status |
| `approval_tasks (request_id, status)` | Drill-down lists, re-check and fix, the "exists a pending task" filters |

**Already indexed:**
- `approval_requests (status, submitted_at)`
- `approval_tasks (approver_id, status, created_at)`
- `approval_tasks (status, due_at)`
- `request_collaborators (user_id, removed_at)`

These are additive indexes only. They change no data and can stay if the app is rolled back.

## Other protections

- **Rate limits (C04):**
  - Analytics pages and the drill-down list: 40 loads a minute per person, then a "wait a minute" message.
  - The readiness check: 20 a minute per person.
  - Report downloads keep their 20 a minute.
- **Row caps:**
  - The screen, direct downloads and scheduled emails show at most 5,000 rows.
  - Background exports (C02) go up to 50,000 rows for CSV and Excel.
  - The drill-down list shows the first 500.
