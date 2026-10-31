# 12 — Reliability audit (prefix DB)

| | |
|---|---|
| Target | ARS-CMS v1.39.0 code on `http://localhost:3100`. `/api/health` reports "1.38.0" only because the version string was read before `package.json` was bumped (confirmed by the lead; see note RL-10). |
| Evidence folder | `audit/TEST_EVIDENCE/DB/` |

## 1. Method

- **Code review** of:
  - the database pool and transactions (`lib/db/client.ts`, `lib/db/transaction.ts`);
  - the health route (`app/api/health/route.ts`);
  - the job runner (`app/api/jobs/run/route.ts`, `server/ops/automation.ts`);
  - notifications (`server/notifications/notify.ts`) and the outbox;
  - attachments (`server/attachments/service.ts`, `storage.ts`);
  - sessions (`lib/db/repositories/sessions.repository.ts`);
  - backups (`server/ops/backup.ts`).
- **HTTP**, on `localhost:3100` only:
  - `GET /api/health`;
  - sessions: a valid DB-backed session, against an HMAC-valid cookie whose session row doesn't exist (`07_session_db_backed_http.txt`), re-run after the E2E_* users were recreated;
  - the webhook and job endpoints (`12_…`).
- **Database:** read-only delivery, outbox and job_runs counts (`04_…`, `10_…`, `13_…`). These are snapshots of a shared database that other suites were changing.
- **Not done:** I did not stop the database or the server, and did not cut the network. This audit's rules forbid it. Those scenarios are assessed from code and existing tests, and marked accordingly.

## 2. Checks

| ID | Scenario | Method | Status | Evidence |
|---|---|---|---|---|
| RL-01 | Database unavailable: health reports it | code | PASS (code review) | `SELECT 1` fails, so the route answers 503 `{"database":"down"}` (`app/api/health/route.ts:16-35`). Not executed live: stopping MySQL is not allowed |
| RL-02 | Database unavailable or slow: request handling | code | PARTIAL | See note A |
| RL-03 | Integration down (email or WhatsApp): business records unaffected | code plus database | PASS | See note B |
| RL-04 | Failed background job: the other steps still run; recorded; alert | code; integration cited | PASS (code review) | `automation.ts:265-291` (try/catch per step, `job_runs` FAILED with "name: message", capped at 500 characters); `route.ts:30-33` alerts the Super Admin; `tests/integration/reliability.int.test.ts:122` (not re-executed) |
| RL-05 | Failed email: recorded and retried | code plus database | PARTIAL | See note C |
| RL-06 | Upload failure: no half-saved records | code | PASS (code review) | See note D |
| RL-07 | Interrupted request or double submit | schema plus code; integration cited | PASS | See note E |
| RL-08 | Concurrent modification | code; integration cited | PARTIAL | Approvals: FOR UPDATE plus `state_version`, "one wins" (`approvals.int.test.ts:173`, not re-executed). Tasks and info items: `row_version`. Projects: last-writer-wins (DB-001) |
| RL-09 | Server restart: sessions survive because they live in the database | HTTP plus code | PASS | See note F |
| RL-10 | Health endpoint content and status | HTTP | PASS | See note G |
| RL-11 | Job runner health signal | HTTP plus code | PASS | `jobRunner` reads the heartbeat: "NEVER" with no cron here, then "OK" after the test suites called the runner (`07_…` and `12_…` times). A late runner triggers a Super Admin alert after the response is sent (`health/route.ts:24-26`) |
| RL-12 | Overlapping job runs | code | PARTIAL | No run-level lock; per-item claims only (08 J-04) |
| RL-13 | Messages lost or duplicated across a crash | code; integration cited | PARTIAL | See note H |
| RL-14 | Partial multi-step writes outside a transaction | code | PARTIAL | `quickAddForMany` (DB-007), AI retention (DB-003), the next recurring task (08 T-03) |
| RL-15 | Migrations on start with concurrent starts | code | PARTIAL | No lock; files not idempotent (DB-002) |
| RL-16 | Backup run failure | code | PASS (code review) | See note I |
| RL-17 | Restore drill | — | NOT TESTED | Needs a new database and a restore (07 DB-C18). Covered by `tests/integration/backup.int.test.ts:44` (not re-executed) |
| RL-18 | Live database outage, network loss or server restart | — | NOT TESTED | Not allowed by the audit rules (no stopping or restarting) |

### Notes on the checks

**A. Database slow or unavailable (RL-02).**
- The pool has `connectionLimit: 10`, `waitForConnections: true`, no `queueLimit` and no per-query timeout (`lib/db/client.ts:14-23`).
- If the database is down, connecting fails after mysql2's default `connectTimeout` (10 s), and the routes return their error pages.
- If the database hangs (for example a lock wait), each stuck query holds a connection until `innodb_lock_wait_timeout`, by default 50 s. With 10 such queries every request waits in an unbounded queue.
- `withTransaction`'s `rollback()` can throw on a dead connection and hide the original error (`transaction.ts:16-17`).
- This is a risk, not a demonstrated defect.

**B. Integration down (RL-03).**
- `notify()` never throws (`notify.ts:20-23`), and sends happen after the commit (`lib/db/transaction.ts:5-7`, `service.ts:590, 627`).
- The database shows 554 email deliveries `FAILED / EMAIL_NOT_CONFIGURED` and 449 WhatsApp deliveries SKIPPED, while the requests were created and decided normally (`10_…`).

**C. Failed email (RL-05).**
- A failed send is recorded with `failure_code` and a sealed payload, and retried by the runner.
- But the retry count is off by one (DB-009); a 401 or 422 from Resend is retried pointlessly (09 I-RS-02); and a 429 from CEOITBox is not retried (DB-008).

**D. Upload failure (RL-06).**
- Files are written inside the request transaction and unlinked if anything fails (`server/attachments/service.ts:86-122`; the same pattern in `server/modules/files.ts:37-48`).
- The storage check feeds `/api/health` `storage` and the alert `FILE_STORAGE_FAILED` (`storage.ts:51-71`). Health showed `"storage":"ok"`.

**E. Interrupted request or double submit (RL-07).**
- The unique key `uq_approval_requests_submission (requester_id, submission_key)` and `uq_tasks_submission` exist (`02_…`).
- `submitRequest` returns the earlier request for a repeated key (`service.ts:484-487, 530-538, 584-587`).
- Messages left unsent by a crash are picked up by the outbox job: `tests/integration/session8.int.test.ts:122` (not re-executed).

**F. Server restart and sessions (RL-09).**
- Sessions are rows in `user_sessions` (`sessions.repository.ts:60-122`), and the signed cookie only names a session id.
- The server-side lookup was proven over HTTP after the E2E users were recreated:
  - a cookie with a real session row (E2E_REQ) gives **HTTP 200**;
  - a cookie with the same HMAC secret but a session id that has no row gives **HTTP 404 NOT_FOUND**;
  - no cookie gives HTTP 404 (`07_…`).
- Nothing about a session lives in process memory, so a restart keeps sessions. The restart itself was not performed (forbidden).

**G. Health endpoint (RL-10).**
- `GET /api/health` gives HTTP 200 `{"status":"ok","version":"1.38.0","database":"ok","jobRunner":…,"storage":"ok","ms":4-7}` with `Cache-Control: no-store`. It exposes no private data (`07_…`, and the curl output in the session log).
- **Observation OBS-DB-1 (not a defect):** the version string comes from `package.json` as it was at build time. The build (`.next/BUILD_ID` dated 22:25:49 IST) predates the v1.39.0 commit (22:43:47 IST). The lead confirms the build holds the v1.39.0 code, and only one doc file changed afterwards.
- **Recommendation:** add the git SHA or build time to the health output, so the deployed build can be traced exactly.

**H. Messages across a crash (RL-13).**
- Nothing is lost: the outbox row is written with the change, and the job runner resends it (`session8.int.test.ts:122`).
- Duplicates are possible (DB-014).

**I. Backup failure (RL-16).**
- The dump goes to `.part` and is then renamed. Old files are deleted only after success.
- A failure is reported as FAILED and alerted once a day (`backup.ts:146-166`; `route.ts:30`; `explainBackupError` gives a plain-language reason without secrets).

### Status counts (12)

| Status | Count |
|---|---|
| PASS | 9 |
| PARTIAL | 7 |
| FAIL | 0 |
| NOT TESTED | 2 |
| BLOCKED | 0 |
| NOT APPLICABLE | 0 |
| **Total** | **18** |

- **PASS (9):** RL-01, 03, 04, 06, 07, 09, 10, 11 and 16.
- **PARTIAL (7):** RL-02, 05, 08, 12, 13, 14 and 15.
- **NOT TESTED (2):** RL-17 and 18.

## 3. Risks and recommendations (not defects)

- **R-RL-1. Bound the database pool.** Set `connectTimeout`, a `queueLimit` (or a wait timeout) and a query timeout. mysql2 supports `timeout` per query. Return a clear "busy, try again" instead of hanging.
- **R-RL-2. Overlapping job runs.** Add a run-level `GET_LOCK` for the job runner and for the migrator (DB-002).
- **R-RL-3. Recurring tasks.** Make the creation of the next occurrence transactional with the completion, or recoverable by a sweep (08 T-03).
- **R-RL-4. Traceability.** Add the build SHA to `/api/health` (OBS-DB-1).
- **R-RL-5. Bounded network calls.** Bound every outbound call, including the CEOITBox body read (DB-010) and Firebase verification (09 I-FB-03).

## 4. Defects

This report adds no new defect IDs. The reliability-relevant defects are recorded where they belong, and listed here for traceability:

| Defect ID | Report | Severity | One line |
|---|---|---|---|
| DB-001 | 07 | Low | Project details are saved last-writer-wins (`row_version` never compared) |
| DB-002 | 07 | Low | The migration runner has no lock, the files aren't idempotent, and it runs on every start |
| DB-003 | 07 | Low | AI conversation retention ignores legal holds and isn't transactional |
| DB-007 | 08 | Low | The multi-assignee ad hoc task isn't atomic; a partial result is reported as success |
| DB-009 | 09 | Low | The retry count is off by one, and a limit of 0 still retries once |
| DB-010 | 09 | Low | The CEOITBox body read has no timeout |
| DB-014 | 09 | Low | At-least-once message delivery, against the "never sent again" claim; no provider idempotency keys |
