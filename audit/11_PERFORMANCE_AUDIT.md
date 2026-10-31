# 11 — Performance audit

**Method.**
- The project's own load test (`tests/perf/load.spec.ts`) was run against the audit server: the v1.39.0 production build on this machine, with the throw-away MySQL 8 database in Docker. The run used a scratch Playwright config that reuses the running server and changes nothing in the project.
- Single-user server times came from the page sweep: in-page `fetch`, one request each.
- Bundle sizes came from the `next build` output.
- Nothing was run against production.

## Results

| ID | Measure | Target | Result | Status | Evidence |
|---|---|---|---|---|---|
| PF-01 | 50 concurrent users × 8 rounds (2,800 requests: Home, Waiting for me, My requests, Inbox via the old address, Profile, a request page, health) | No errors; p95 < 2 s (GL-03, D-105) | 0 errors; p50 1,254 ms; **p95 1,708 ms**; p99 1,862 ms; max 1,965 ms; 41 req/s | PASS (narrow margin) | `TEST_EVIDENCE/AUTO/perf-load.json`, `perf-load.txt` |
| PF-02 | Slowest page under load | < 2 s p95 | Home (`/users`): p95 1,862 ms, max 1,965 ms; My requests: p95 1,812 ms | PASS (close to the limit) | `perf-load.json` byPage |
| PF-03 | Health endpoint under load | — | p95 314 ms | PASS | `perf-load.json` |
| PF-04 | Single-user server response, 30 user pages | — | 49–135 ms per HTML response (Home 135 ms, Inbox 105 ms, most 55–95 ms) | PASS | Sweep JSON (session log) |
| PF-05 | JavaScript first load | Reasonable for an intranet app | Shared 103 kB; largest pages: task page 182 kB, project page 179 kB, My Tasks 175 kB (from `next build`) | PASS | Build output |
| PF-06 | Build time | — | About 7.5 min on this machine (slower than earlier runs) | Information only (see OPS) | Session log |
| PF-07 | Database query plans, slow queries, N+1 | — | Reviewed by the DB auditor | See `07_DATABASE_DATA_INTEGRITY_AUDIT.md` | — |
| PF-08 | Stress, spike and soak testing | — | Not run: the owner's machine only; no staging available | NOT TESTED | — |
| PF-09 | Production response times | — | No production access | BLOCKED | — |
| PF-10 | Upload/download speed, background job duration, memory and CPU | — | Not measured | NOT TESTED | — |

## Observations

- **The margin under load is thin.** A single request takes about 0.1 s, but with 50 people at once the p50 rises to 1.25 s and Home reaches a p95 of 1.86 s against the 2 s budget. This happens on a developer laptop that runs the database, the app and 50 browser contexts together, so the absolute numbers are pessimistic. Even so, the latest Home page now renders the approvals *and* the task sections (D-236), and it is the slowest page.
- **Recommendation (risk, not a defect):**
  - Re-run PF-01 on the GoDaddy production plan before go-live.
  - Consider streaming Home's task sections, or caching the per-person counts.

## Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PF-R01 | Home | Load under concurrency | Performance (risk) | Home's p95 is 93% of the 2 s budget at 50 concurrent users | Comfortable margin | p95 1,862 ms | Low | P2 | `npx playwright test -c playwright.perf.config.ts` | `perf-load.json` | Home renders approvals and tasks for each person; all on one server | Measure on production hosting; stream or cache the task sections if needed | Open (risk) |
