# 09 — Integration audit (prefix DB)

| | |
|---|---|
| Target | ARS-CMS v1.39.0 code. The commit is `0473f25`. The build on :3100 reports "1.38.0" only because it read the version string before `package.json` was bumped (confirmed by the lead). |
| Evidence folder | `audit/TEST_EVIDENCE/DB/` |

## 1. Method

1. **Code review of every outbound integration and webhook.** For each one I reviewed credentials, timeouts, retries, idempotency, rate limits, failure isolation and logging. This covers:
   - the clients in `server/integrations/*`;
   - `server/notifications/notify.ts`;
   - `server/jobs/retry-deliveries.ts`;
   - `lib/db/repositories/{outbox,jobs,whatsapp,notifications}.repository.ts`;
   - the AI providers (`server/ai/providers.ts`, `assistant.ts`);
   - the Salesforce connector (`server/ai/connectors/salesforce-auth.ts`);
   - Google Calendar (`server/calendar/*`, `server/integrations/google-calendar/client.ts`);
   - Firebase (`lib/firebase/admin.ts`, `server/auth/google-sign-in.ts`);
   - the scheduled reports (`server/reports/schedules.ts`);
   - `app/api/webhooks/*` and `app/api/jobs/run`.
2. **How the review was done.** A read-only helper agent first swept the files and returned file:line notes. I then re-read the cited code myself for **every defect listed below** before accepting it. Points I could not verify myself are marked "not verified".
3. **Live checks over HTTP**, against `localhost:3100` only. These were: webhooks and the job endpoint without credentials or with wrong ones, and `/api/health` (`12_webhook_and_job_endpoint_http.txt`, `07_session_db_backed_http.txt`).
4. **Database evidence.** I counted delivery outcomes in `notification_deliveries` and `notification_outbox` (`04_…`, `10_…`). These counts are snapshots of a shared test database that other suites were resetting during the audit.
5. **Unit tests.** `tests/notifications` and `tests/jobs` ran green as part of the 342-test run (`06_…`).
6. **Live provider tests.** All of them are **BLOCKED**. This environment has no provider credentials (Resend, CEOITBox, Firebase service account, Google OAuth client, AI keys, Salesforce connected app), and the audit rules forbid real sends.

## 2. Checks

### 2.1 Resend (email)

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-RS-01 | Missing key: a clear, non-retryable failure, and the business record is untouched | database plus code | PASS | See note A |
| I-RS-02 | Invalid or expired key (401) and invalid address (422) are told apart | code | PARTIAL | Every non-OK response becomes `EMAIL_REQUEST_FAILED`, which is retryable (`resend/client.ts:64-66`). A revoked key is therefore retried until the limit, and a bad address is retried for nothing |
| I-RS-03 | Timeout on the request and the body read | code | PASS (code review) | `AbortController`, 15 s, covering `fetch` and `json()` (`resend/client.ts:38-63`) |
| I-RS-04 | Retries, idempotency, rate limits | code | PARTIAL | Retried by the runner (see 2.7). No `Idempotency-Key` header, and no handling of 429 or Retry-After. See DB-014 |
| I-RS-05 | Failure isolation | code plus database | PASS | `notify()` never throws (`notify.ts:20-23`), and every send happens after the commit |
| I-RS-06 | Logging without secrets | code | PASS (code review) | The key is sent only in the header. Provider error bodies are redacted (masked emails and phone numbers, 600-character cap, `lib/logging/logger.ts:34-53`). FAILED payloads are sealed and cleared after 7 days |
| I-RS-07 | Live send | — | BLOCKED | No API key in this environment, and real sends are not allowed |

**A. Missing key (I-RS-01).**
- 554 deliveries in the database are `FAILED / EMAIL_NOT_CONFIGURED` while their requests completed normally (`10_…`).
- `resend/client.ts:36` raises the error; it is not in the retryable list.

### 2.2 CEOITBox (WhatsApp sends and OTP)

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-WA-01 | Missing, invalid (401) or blocked key: a clear error, not retried | code | PASS (code review) | `ceoitbox/client.ts:65` NOT_CONFIGURED, `:96` UNAUTHORIZED, `:102-106` a 200 response carrying an error becomes BLOCKED. The database shows `SKIPPED / NO_WHATSAPP_NUMBER` and `TEMPLATE_NOT_CONFIGURED` handled without errors (`10_…`) |
| I-WA-02 | Timeout | code | **FAIL** (Low) | DB-010: the timer is cleared before the body is read |
| I-WA-03 | Provider rate limit (HTTP 429) | code | **FAIL** (Low) | DB-008: 429 is treated as a permanent rejection |
| I-WA-04 | Local throttle | code | **FAIL** (Low) | DB-011: not atomic, and one bucket is shared by OTP and bulk sends |
| I-WA-05 | Retry count matches the setting | code | **FAIL** (Low) | DB-009 |
| I-WA-06 | Failure isolation; OTP failure handling | code | PASS (code review) | See note B |
| I-WA-07 | Logging without secrets | code | PASS (code review) | See note C |
| I-WA-08 | Delivery-receipt webhook authentication | HTTP plus code | PASS | See note D |
| I-WA-09 | Live send and OTP | — | BLOCKED | No CEOITBox key or number |

**B. Isolation and OTP (I-WA-06).**
- Sends happen after the commit.
- An OTP send failure raises `AUTH_OTP_DELIVERY_FAILED`, which is audited (`server/auth/otp-flow.ts:58-82`).

**C. Logging (I-WA-07).**
- The OTP code appears only in the template variables. It is not in the audit metadata or in the delivery payload (`otp-flow.ts:80-84`).
- A failed payload is sealed (`notify.ts:196`).
- Not verified: whether CEOITBox echoes request fields back in its error bodies.

**D. Receipt webhook (I-WA-08).**
- No secret gives **HTTP 404**, and a wrong secret gives **HTTP 404** (`12_…`).
- The SHA-256 of both values is compared with `timingSafeEqual` (`app/api/webhooks/ceoitbox/route.ts:12-23`). Rate limiting happens after authentication, and the body is capped at 256,000 characters.
- Replays are harmless because a receipt only moves a delivery's status forward.

### 2.3 Firebase / Google sign-in

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-FB-01 | Token verification: signature, revocation, verified email, `google.com` provider; only users created by an admin | code | PASS (code review) | `lib/firebase/admin.ts:52` `verifyIdToken(idToken, true)`; `server/auth/google-sign-in.ts:57-64`; linking requires `firebase_uid IS NULL` (`users.repository.ts:113`) |
| I-FB-02 | Missing service-account environment variables | code | PASS (code review) | An explicit error (`admin.ts:30-31`); the user sees "Google sign-in failed". Environment variable names: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| I-FB-03 | Timeout on the verification network calls | code | PARTIAL | No app-level timeout; it relies on firebase-admin's defaults (not verified) |
| I-FB-04 | Rate limit | code | PASS (code review) | `enforceRateLimit("GOOGLE")` (`app/api/auth/google/route.ts:14`) |
| I-FB-05 | Live sign-in | — | BLOCKED | No service account or Google account in this environment |

### 2.4 Google Calendar

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-GC-01 | OAuth state is single-use, hashed and bound to a nonce cookie; scope checked; tokens encrypted | code | PASS (code review) | `server/calendar/service.ts:253-302` |
| I-GC-02 | Expired access token refreshed; a refused refresh means re-authorisation (only on an AUTH or BAD_REQUEST answer) | code; integration cited | PASS (code review) | `server/calendar/sync.ts:104-136`; `tests/integration/v1110-calendar.int.test.ts:314` (not re-executed) |
| I-GC-03 | Timeouts | code | PASS (code review) | `AbortSignal.timeout(15000)` on every call (`google-calendar/client.ts:9, 43`) |
| I-GC-04 | Retries: backoff with jitter capped at 6 h; DEAD after the maximum, with an alert; pending jobs deduplicated; 409 becomes a patch | code; integration cited | PASS (code review) | See note E |
| I-GC-05 | Failure isolation | code | PASS (code review) | Sync runs only from the job; it never changes business records (`sync.ts:49`) |
| I-GC-06 | Push webhook authentication | HTTP plus code | PASS | See note F |
| I-GC-07 | Webhook rate limit applied before authentication | code | PARTIAL | See note G |
| I-GC-08 | Live sync | — | BLOCKED | No OAuth client |

**E. Retries (I-GC-04).**
- Code: `gcal.repository.ts:405-487`, `server/calendar/jobs.ts:77-85`.
- Integration: `v1110-calendar.int.test.ts` "a temporary Google error is retried later with backoff" (not re-executed).

**F. Push webhook (I-GC-06).**
- A bogus channel gives **HTTP 404** (`12_…`).
- The channel, the resource and the token hash are all checked in constant time (`service.ts:466-474`).

**G. Rate limit before authentication (I-GC-07).**
- `overLimit("webhook:google-calendar", 1200)` runs before `handleNotification` (`app/api/webhooks/google-calendar/route.ts:13-14`).
- Unauthenticated traffic can therefore use up the bucket and cause genuine pushes to be refused. The scheduled sync reconciles anyway.
- This is a risk, not a defect.

### 2.5 AI providers (Claude, OpenAI, Grok, DeepSeek, Groq, Gemini, NVIDIA)

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-AI-01 | Missing key: the provider is left out; 401/403 becomes `KEY_REFUSED`, which is not retried and not passed to the fallback provider | code; unit | PASS | `server/ai/providers.ts:114`; `tests/ai/ai-engine.test.ts` "errors say what happened, never the key; a refused key isn't retried elsewhere" (suite not re-run by me) |
| I-AI-02 | Timeout on every attempt, combined with the user's Stop | code | PASS (code review) | `providers.ts:196` `AbortSignal.any([AbortSignal.timeout(...), signal])` |
| I-AI-03 | Bounded retries and rate limits | code | PASS (code review) | See note H |
| I-AI-04 | Duplicate questions | code | PASS (code review) | The unique request key gives `IN_PROGRESS` for a double submit (`assistant.ts:~189-194`) |
| I-AI-05 | Logging without secrets | code | PASS (code review) | `redactSecrets` masks key prefixes, Bearer tokens and long runs (`providers.ts:93-99`) |
| I-AI-06 | Live calls | — | BLOCKED | No provider keys |

**H. Retries and rate limits (I-AI-03).**
- Up to 3 attempts. A 429 is waited out only when the provider says how long (at most 20 s), and a 5xx gets a short backoff (`providers.ts:213-226`).
- Local limits apply per person and in total (`server/ai/limits.ts`).
- Documentation nit: the comment at `:181` says "Never more than two attempts", but the code allows 3.

### 2.6 Salesforce

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-SF-01 | OAuth uses PKCE and single-use state bound to the Super Admin; tokens encrypted; host restricted to salesforce.com / force.com | code | PASS (code review) | `server/ai/connectors/salesforce-auth.ts:69-98` |
| I-SF-02 | Timeouts | code | PASS (code review) | 20 s for the token exchange and refresh, 15 s for identity and revoke, 30 s for data (`:93-182`) |
| I-SF-03 | Expired token: refreshed once, then retried | code | PASS (code review) | `:150-153` |
| I-SF-04 | A temporary outage during refresh does not force a manual reconnect | code | **FAIL** (Low) | DB-012 |
| I-SF-05 | Live | — | BLOCKED | No connected app |

### 2.7 Notification outbox and retry runner

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-OB-01 | Messages are queued in the same transaction as the business change and sent after the commit | code; integration cited | PASS (code review) | See note I |
| I-OB-02 | Each outbox row is claimed before sending; stale claims are reclaimed after 10 minutes; at most 5 attempts | code | PASS (code review) | `outbox.repository.ts:20-48` |
| I-OB-03 | Deliveries are leased with `FOR UPDATE SKIP LOCKED` | code; integration cited | PASS (code review) | `jobs.repository.ts:35-54`; `tests/integration/jobs.int.test.ts:35` "…never the same row twice at once" (not re-executed) |
| I-OB-04 | No duplicate sends ("sent messages are never sent again") | code | **FAIL** (Low) | DB-014: delivery is at-least-once |
| I-OB-05 | Unsent backlog in this environment | database | PASS | 0 unsent outbox rows older than 10 minutes, and 0 claimed-but-unsent (`04_…`, `10_…`) |
| I-OB-06 | Retry backoff matches the setting | code | **FAIL** (Low) | DB-009 |
| I-OB-07 | Scheduled report emails to several recipients | code | **FAIL** (Low) | DB-013 |

**I. Queue then send (I-OB-01).**
- Code: `server/approvals/service.ts:578, 590, 619`, and `withTransaction` (`lib/db/transaction.ts`).
- Integration: `tests/integration/session8.int.test.ts` "every message of an action is recorded with it and sent after the commit" and `:122` "messages left unsent by a crash are sent by the job runner, once" (not re-executed).

### 2.8 Webhooks and the job endpoint

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| I-WH-01 | `POST /api/webhooks/ceoitbox` without a secret or with a wrong one | HTTP | PASS | HTTP 404 `{"code":"NOT_FOUND"}` both times (`12_…`) |
| I-WH-02 | `POST /api/webhooks/google-calendar` with an unknown channel | HTTP | PASS | HTTP 404 (`12_…`) |
| I-WH-03 | `POST /api/jobs/run` without a secret or with a wrong one | HTTP | PASS | HTTP 404 both times (`12_…`). The SHA-256 of both values is compared in constant time (`route.ts:15-21`) |
| I-WH-04 | Webhook delivery with a valid secret (receipt moves a delivery forward) | — | NOT TESTED | No webhook secret is configured in the test settings. Covered by `tests/e2e/v140-api.spec.ts:50-58` (not re-executed) |

### Status counts (09)

| Status | Count |
|---|---|
| PASS | 32 |
| PARTIAL | 4 |
| FAIL | 8 |
| NOT TESTED | 1 |
| BLOCKED | 6 |
| NOT APPLICABLE | 0 |
| **Total** | **51** |

Two FAIL rows point to the same defect: I-WA-05 and I-OB-06 are both DB-009.

The counts by section:

| Section | PASS | PARTIAL | FAIL | NOT TESTED | BLOCKED |
|---|---|---|---|---|---|
| Resend (2.1) | 4 | 2 | — | — | 1 |
| CEOITBox (2.2) | 4 | — | 4 | — | 1 |
| Firebase (2.3) | 3 | 1 | — | — | 1 |
| Google Calendar (2.4) | 6 | 1 | — | — | 1 |
| AI providers (2.5) | 5 | — | — | — | 1 |
| Salesforce (2.6) | 3 | — | 1 | — | 1 |
| Outbox and runner (2.7) | 4 | — | 3 | — | — |
| Webhooks and job endpoint (2.8) | 3 | — | — | 1 | — |

## 3. Risks and recommendations (not defects)

- **R-I-1.** Resend: tell apart 401/403 (key problem, alert the Super Admin, don't retry) and 422 (bad address, don't retry) from 5xx and timeouts.
- **R-I-2.** Google Calendar webhook: authenticate before counting the rate limit, or use a separate bucket per channel.
- **R-I-3.** Sends happen inside the user's own request after the commit. With many recipients, latency adds up (up to 15 s for email plus 10 s for WhatsApp per recipient). Consider handing large fan-outs to the job runner.
- **R-I-4.** A WhatsApp `failed` receipt is ignored (`server/notifications/receipts.ts:16-18`). A message accepted and then failed by Meta still shows as SENT.
- **R-I-5.** `sendTemplateMessage` returns the provider body without validating it (`ceoitbox/client.ts:122`). A missing `waMessageId` stores a null reference, so receipts can never match.
- **R-I-6.** Firebase: wrap `verifyIdToken` in a bounded timeout.
- **R-I-7.** The outbox `payload_json` keeps message text and links in plain JSON for 30 days after sending (`outbox.repository.ts:12, 61-68`). Delivery payloads, by contrast, are sealed.

## 4. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DB-008 | Integrations | CEOITBox send | Rate limits / retry | An HTTP 429 from CEOITBox is classed as `CEOITBOX_REJECTED`, which is permanent, so a throttled WhatsApp message is never retried. | 429 is retryable, honouring Retry-After. | Every 4xx except 401 maps to REJECTED. REJECTED is not in `RETRYABLE` (retry runner) or `isRetryable` (notify). | Low | P2 | A unit test with a fake fetch returning 429: the delivery ends FAILED with no `next_retry_at`. Not run live: no key. | `server/integrations/ceoitbox/client.ts:96-99`; `server/jobs/retry-deliveries.ts:31`; `server/notifications/notify.ts:~80-82` (code review) | 4xx is treated as a client error without the 429 exception. | Map 429 to `CEOITBOX_RATE_LIMITED` (already retryable) and read Retry-After. | Open |
| DB-009 | Notifications | Retry runner | Configuration / retry | The setting "Retries for a failed send" (`whatsapp.retry_limit`, default 3) gives one retry fewer than configured, and 0 does not switch retries off. The same setting governs email. | N retries for a limit of N; none for 0. | `notify` always schedules the first retry (120 s, `attempt_count = 1`). The runner then calls `nextRetryMinutes(attemptCount+1, limit)`, which stops when `retriesDone+1 >= limit`. Limit 3 gives 2 retries; limit 0 gives 1. The unit test asserts `nextRetryMinutes(1,0) = null`, which is a call that never happens. | Low | P3 | Follow the code: the first failure schedules a retry at +2 min with attempt 1. The runner fails, giving `nextRetryMinutes(2,3) = 4`. The runner fails again, giving `nextRetryMinutes(3,3) = null`. That is 2 retries. | `server/notifications/notify.ts:51, 155, 197`; `server/jobs/retry-deliveries.ts:25-29, 82`; `server/settings/definitions.ts:81`; `tests/jobs/retry-rate-limit.test.ts:9-14` | The send attempt count and the retry count are mixed up between `notify` and the runner. | Pass `delivery.attemptCount` (not +1), or treat `retriesDone = attemptCount`. Have `notify` honour a limit of 0. Add a test across both stages. | Open |
| DB-010 | Integrations | CEOITBox client | Timeout | The abort timer is cleared in `finally` before `response.text()`. A provider that sends headers and then stalls the body hangs the send, and with it the user's request or the cron step, with no limit. | The timeout covers the body read (as for Resend and Google). | `clearTimeout(timer)` at `:86`, then `await response.text()` at `:89` with no signal. | Low | P3 | A fake server sends headers and never ends the body: `sendTemplateMessage` never returns. Not run (no network fixtures in this audit). | `server/integrations/ceoitbox/client.ts:70-89` (code review) | The timer scope ends too early. | Clear the timer after the body is read, or use `AbortSignal.timeout` on fetch, which also governs the body stream. | Open |
| DB-011 | Integrations | WhatsApp local throttle | Concurrency / availability | The per-minute limit is DELETE, then COUNT, then INSERT on the pool, with no lock, so concurrent senders can exceed it. It is also one global bucket shared by sign-in OTPs and bulk notifications, so a notification burst can make OTP sends fail with "try again". | An atomic check, with OTP given priority or its own budget. | `tryConsumeWhatsAppRateLimit` runs three separate statements. OTP and notify both call it. | Low | P2 | Code review. Concurrency: N parallel sends at limit-1 all pass the COUNT. Starvation: after 60 queued notifications in a minute, an OTP request is refused. | `lib/db/repositories/whatsapp.repository.ts:47-56`; `server/auth/otp-flow.ts:76-82`; `server/auth/password-sign-in.ts:50-54` | A simple sliding-window design. | Use a `GET_LOCK`/transaction or an atomic counter row, and reserve capacity for OTP or exempt it. | Open |
| DB-012 | AI module | Salesforce token refresh | Error handling | Any non-OK answer to a token refresh (including 5xx and 429) marks the connection `NEEDS_REAUTH`, so a brief Salesforce outage forces a Super Admin to reconnect by hand. | Only `invalid_grant` or 400/401 need re-authorisation; 5xx and 429 are temporary. | `if (!response.ok \|\| !body.access_token) await markNeedsReauth(...)`. Only a network exception is treated as temporary. | Low | P3 | A fake token endpoint returns 503: the connection status becomes NEEDS_REAUTH. Not run (no connected app). | `server/ai/connectors/salesforce-auth.ts:120-133` (code review); compare `server/calendar/sync.ts:128` | The error is not classified. | Re-authorise only on `error === "invalid_grant"` or 400/401; otherwise throw `SalesforceUnavailable` and retry later. | Open |
| DB-013 | Reports | Scheduled reports, several recipients | Failure isolation | Recipients are emailed one by one with no try/catch per recipient. One failure (for example a Resend 429 or a bad address) skips every later recipient and marks the whole run FAILED, although earlier recipients already got it. | A failure for one recipient is recorded, and the others still receive the report. | The loop over `audience` calls `sendEmail` directly; the first throw jumps to the outer `catch`, which runs `finish("FAILED")`. | Low | P3 | A schedule with 3 recipients where the 2nd address is rejected: only the 1st gets the email, and the run shows FAILED. | `server/reports/schedules.ts:219-249` (code review) | No per-item isolation in the loop. | Wrap each send; record a partial result such as "sent to 2 of 3". | Open |
| DB-014 | Notifications | Outbox and retry runner | Idempotency | Delivery is at-least-once, but the operations board says sent messages are "never sent again". A crash, or a failed database update after a successful provider send, makes the message go again. The runner can also mark a delivered message FAILED. | Exactly-once where possible: provider idempotency keys, and the board describing the real guarantee. | Outbox: if `notify` succeeds but `markOutboxSent` fails or the process dies, the claim expires after 10 minutes and the row is sent again (in-app, email and WhatsApp). Runner: if `markSent` throws after a send, it is caught and `markFailed(UNEXPECTED_ERROR)` runs. There is no `Idempotency-Key` for Resend, and retries omit `userMessageId` for CEOITBox. | Low | P2 | Code review. Simulate by making `markOutboxSent` throw once after a successful `notify`: the job runner re-sends the row 10 minutes later. | `server/ops/automation.ts:46`; `server/approvals/service.ts:402-422`; `lib/db/repositories/outbox.repository.ts:20-48`; `server/jobs/retry-deliveries.ts:73-84`; `server/integrations/resend/client.ts:42-56` | The DB write and the provider call can't be atomic, and no provider-side deduplication is used. | Send `Idempotency-Key: ars-outbox-<id>` to Resend and keep `userMessageId` on retries. Handle a `markSent` failure separately from a send failure. Correct the board text. | Open |
