# Performance test results (v1.44.0 QA pass, 2 Nov 2026)

**Where:** a local production build (`next start`, one Node process) and MySQL 8 on
the same development PC, test database only. Never against production. Absolute
numbers are for this machine; GoDaddy's will differ. Ratios and the shape of the
curve are what carry over.

## Automated budgets (QA suite)

| Test | Budget | Result |
|---|---|---|
| QA-PERF-01 key pages, median of 5 | < 1.5 s each | Pass |
| QA-PERF-02 20 people at once, no browsers | every page 200, p95 < 3 s | Pass |

## Load test (`scripts/qa/load-test.mjs`, evidence in `qa/evidence/`)

Staged virtual users, each opening a realistic mix (Home, Waiting for me, My Tasks,
My requests, Inbox, Search, Analytics, the journey API, the notifications API) with
1–3 s think time; 20 s per stage. Every user polls only requests they may see (an
earlier run counted the access check's 404s as errors; fixed in the script).

**Pool 10 (default, `load-test.json`)**

| Users | Requests | Req/s | Errors | p50 | p95 | p99 |
|---|---|---|---|---|---|---|
| 10 | 104 | 5.2 | 0% | 39 ms | 223 ms | 228 ms |
| 25 | 247 | 12.4 | 0% | 42 ms | 538 ms | 543 ms |
| 50 | 474 | 23.7 | 0% | 63 ms | 987 ms | 1.0 s |
| 100 | 828 | 41.4 | 0.85% | 436 ms | 1.8 s | 1.8 s |
| 150 | 919 | 46.0 | 2.94% | 1.7 s | 2.9 s | 3.0 s |
| 200 | 976 | 48.8 | 6.35% | 2.8 s | 3.5 s | 3.7 s |
| 250 | 1,061 | 53.1 | 19.6% | 3.7 s | 4.5 s | 4.7 s |
| 300 | 1,221 | 61.1 | 40.4% | 4.0 s | 5.5 s | 5.8 s |

**Pool 20 (`DB_POOL_SIZE=20`, `load-test-pool20.json`):** the same within noise
(100 users 0.78%, 200 users 5.65%, 300 users 33.1% errors). The limit is the single
Node process on this PC (about 45–55 page loads a second), not the pool.

## Findings

- **Up to 50 people clicking at the same moment: no errors, p95 under 1.1 s.** At 100
  the first errors appear (0.8%) and p95 is ~1.9 s.
- Above that the server sheds load on purpose: the pool's queue limit (QA-DB-01,
  500 waiting queries) and 10 s connect timeout fail a request fast instead of
  letting every request wait without bound. The errors are "Queue limit reached"
  (500), and on the two JSON APIs a 404, because those routes answer every failure
  with 404 so nothing about a record leaks (observation **QA-PERF-OBS-01**, kept by design).
- "Simultaneous" here means everyone clicking every 1–3 s. ARS's real peak (the
  9:30 sign-in burst) is far below 100 such users; there is headroom of several times.
- The journey API (polled every 10 s by each open request page) stays the cheapest
  route (p50 26–29 ms up to 50 users).

## Recommendations (owner)

1. Set `DB_POOL_SIZE` to the MySQL plan's connection limit minus a margin (10–20).
2. If ARS ever needs more than ~100 people clicking at once, the next step is more
   Node processes (GoDaddy's plan), not a bigger pool.
3. Run the optional index script once data grows (QA-DB-08).

## Not covered

Production hardware and network, CDN effects (Cloudflare), soak tests over hours,
and browser rendering under load (the load test is server-side).
