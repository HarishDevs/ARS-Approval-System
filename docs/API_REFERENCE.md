# API reference: ARS-CMS route handlers

| | |
|---|---|
| Applies to | **Applies to v1.39.0 (31 Oct 2026)** |
| Source | Every `app/api/**/route.ts` file (39 routes at this version) |
| Fixes | Audit defect OPS-17 ("39 API routes have no reference") |
| Keep up to date | **Refresh this list at every release.** Run a search for `app/api/**/route.ts`, compare with the summary table, and update the version line above. |

## What these routes are for

The pages do almost all their work through **Server Actions** (`"use server"` files), not through this API. The route handlers below cover what a Server Action can't:

- **Sign-in steps** (Google, User ID + password + WhatsApp code, set and forgot password), sign-out and session status.
- **Downloads**: attachments, task and information files, the request PDF summary, CSV/XLSX/PDF exports, profile photos.
- **Small JSON feeds** for the page shell: the notification bell, the command palette, Pic bot chats.
- **OAuth** start and callback for Google Calendar and Salesforce.
- **Machine calls**: the cron job runner, the CEOITBox and Google Calendar webhooks, and the health check.

There is no public, versioned API for other systems. Nothing here is meant to be called by hand except `/api/health` and the cron call to `/api/jobs/run`.

## How auth works

Three layers. Security never depends on layer 1 alone.

**Layer 1: `middleware.ts`** (every request)
- Paths under `/api/auth`, `/api/jobs`, `/api/health` and `/api/webhooks` are public. Any other `/api/...` path without the `ars_session` cookie gets `404 {"success":false,"error":{"code":"NOT_FOUND"}}`. It only checks the cookie is present.
- `POST/PUT/PATCH/DELETE` to `/api/...` (except `/api/jobs/` and `/api/webhooks/`) with `Sec-Fetch-Site: cross-site` or `same-site` gets `403 FORBIDDEN` (audit P-07).
- `OPTIONS` to `/api/...` gets `204` with no CORS headers, so no other site can call the API from a browser.
- With `ORIGIN_SECRET` set, any request without the matching `x-ars-origin` header (added by Cloudflare) gets `403`.
- Sets `x-request-id`, a signed page-path header (for page access rules) and `Cache-Control: private, no-store` on API answers.

**Layer 2: `requireApiArea(area, { change?, page? })`** in `server/authorization/guards.ts`
- Loads the session with `getCurrentSession()` (`server/auth/session.ts`): the `ars_session` cookie is an HMAC-SHA256 signed token (`lib/session/token.ts`, `SESSION_SECRET`), and the session row must be live, not idle past the limit, and the person active and not locked.
- Checks the role for the area with `evaluateAreaAccess` (`server/authorization/policy.ts`): `users` = USER, IT_ADMIN or SUPER_ADMIN; `admin` = IT_ADMIN or SUPER_ADMIN; `superadmin` = SUPER_ADMIN only.
- Checks page access (`server/authorization/page-access.ts`): the page rule for the address, and the named `page` key if given. `change: true` needs Full access (a view-only page can be read, not changed). Module rules are checked here too.
- On any failure it audits (`API_ACCESS_DENIED` or `PAGE_ACCESS_DENIED`) and throws `ForbiddenError`. Each route maps that to the same plain `404 Not found`, so protected routes don't confirm they exist.

**Layer 3: per record.** Download and view routes then check the person may see that record (for example `openAttachment`, `loadRequestView`, `loadTaskFor`, `loadInfoFor`). A refusal is again a plain 404.

**Other gates**
- **Sign-in routes** are public but rate-limited by `enforceRateLimit` (`server/auth/rate-limit.ts`), counted per IP and, where given, per User ID.
- **Signed-in costly routes** use `overLimit` / `tooManyResponse` (`server/security/limits.ts`): `429 RATE_LIMITED` with `Retry-After: 60`.
- **Downloads** also check `canExport` / `canUseReports` / `featureOn` (`server/settings/features.ts`).
- **Job runner**: header `x-job-secret` must match the `JOB_RUNNER_SECRET` env var (compared by hash in constant time).
- **CEOITBox webhook**: header `x-webhook-secret` must match the encrypted setting `whatsapp.webhook_secret` (Super Admin → WhatsApp).
- **Google Calendar webhook**: `x-goog-channel-id`, `x-goog-resource-id` and `x-goog-channel-token` must match a live calendar connection.

**Answer shape.** Most JSON routes use `apiSuccess` / `apiError` (`lib/http/api-response.ts`):
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": { "code", "message", "requestId" } }`. Messages are generic; no stack traces or SQL.

Routes that answer differently are noted below.

## Summary

| Path | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/google` | POST | Public, rate-limited | Sign in with a Firebase Google ID token |
| `/api/auth/password/start` | POST | Public, rate-limited | User ID + password check, send WhatsApp code |
| `/api/auth/password/resend` | POST | Public, rate-limited | Resend the WhatsApp sign-in code |
| `/api/auth/password/verify` | POST | Public, rate-limited | Check the code and start a session |
| `/api/auth/set-password/start` | POST | Public, rate-limited, set-password link token | Check link and new password, send code |
| `/api/auth/set-password/complete` | POST | Public, rate-limited, link + challenge | Check code, save password, sign in |
| `/api/auth/forgot/start` | POST | Public, rate-limited | Forgot password: send code |
| `/api/auth/forgot/complete` | POST | Public, rate-limited, challenge | Check code, save password, sign in |
| `/api/auth/logout` | POST | Session if present | Sign out this browser |
| `/api/auth/not-me` | POST | Public, signed alert token | "This wasn't me" from a new-login alert |
| `/api/auth/status` | GET | Public (reads own cookie) | Is this browser signed in; idle time left; build |
| `/api/auth/keep-alive` | POST | Live session | "Stay signed in" |
| `/api/auth/try/[token]` | GET | Public, one-time signed token | Open a view-only "Try as" session |
| `/api/me/notifications` | GET, POST | `requireApiArea("users")` | Bell dropdown; mark read |
| `/api/me/quick` | GET | `requireApiArea("users")` | Command palette search / recent items |
| `/api/me/sign-out-everywhere` | POST | `requireApiArea("users", change)` | End all of the person's sessions |
| `/api/users/[id]/photo` | GET | `requireApiArea("users")` | A person's profile photo |
| `/api/attachments/[id]` | GET | `requireApiArea("users")` + record check | Download or preview a request attachment |
| `/api/files/[id]` | GET | `requireApiArea("users")` + record check | Download or preview a task/information file |
| `/api/requests/[id]/summary.pdf` | GET | `requireApiArea("users")` + record check | PDF summary of a request |
| `/api/exports/[id]` | GET | `requireApiArea("users")` + reports + export permission, owner only | Download a background export |
| `/api/reports/[key]` | GET | `requireApiArea("users")` + reports + export permission | Export a catalogue report (CSV/XLSX/PDF) |
| `/api/analytics/export` | GET | `requireApiArea("users"` or `"admin")` + analytics + export permission | CSV of an analytics board |
| `/api/admin/dashboards/[slug]` | GET | `requireApiArea("admin", page admin.dashboards)` | CSV of an admin dashboard |
| `/api/admin/import/[kind]` | GET | `requireApiArea("admin")` | Import template or current data as CSV |
| `/api/admin/records/[kind]` | GET | `requireApiArea("admin", page admin.records)` + export permission | CSV of an Admin register |
| `/api/admin/workflows/[id]/export` | GET | `requireApiArea("admin", page admin.workflows)` | Approval type configuration as JSON |
| `/api/superadmin/audit` | GET | `requireApiArea("superadmin")` | Audit log CSV export |
| `/api/ai/chat` | POST | `requireApiArea("users", change, page users.ai_assistant)` + `aiAccess` | Ask Pic bot a question |
| `/api/ai/conversations` | GET | `requireApiArea("users", page users.ai_assistant)` + `aiAccess` | List own chats and usable modes |
| `/api/ai/conversations/[id]` | GET, PATCH, DELETE | As above (`change` for PATCH/DELETE) | Read, rename/pin, delete one own chat |
| `/api/integrations/google-calendar/connect` | GET | `requireApiArea("users", change, page users.profile)` | Start Google Calendar OAuth |
| `/api/integrations/google-calendar/callback` | GET | `requireApiArea("users")` + state + nonce cookie | Google Calendar OAuth return |
| `/api/integrations/salesforce/connect` | GET | `requireApiArea("superadmin")` | Start Salesforce OAuth (PKCE) |
| `/api/integrations/salesforce/callback` | GET | `requireApiArea("superadmin")` + state | Salesforce OAuth return |
| `/api/jobs/run` | POST | `x-job-secret` header | Cron entry point: run all automations |
| `/api/webhooks/ceoitbox` | POST | `x-webhook-secret` header | WhatsApp delivery/read receipts |
| `/api/webhooks/google-calendar` | POST | Google channel headers | Calendar change notification |
| `/api/health` | GET | Public | Uptime check: 200 while the app and database answer; also `jobRunner`, `storage`, `backupAgeHours`, `degraded` |
| `/api/health/deep` | GET | Public | Alerting check (D-246): 503 when `degraded` (job runner late, backup over 26 h old, files can't be written, database down) |
| `/robots.txt`, `/sitemap.xml` | GET | Public | Crawlers: only `/`, `/privacy` and `/terms` (D-246) |

---

## Sign-in and session (`/api/auth/...`)

All public (middleware), all `POST` with a JSON body unless stated. Bodies are checked with the zod schemas in `features/auth/schemas.ts`. Failures from the sign-in services come back through `authErrorResponse` (`server/auth/http.ts`) with the status from `AUTH_ERROR_STATUS` (`server/auth/errors.ts`):

| Code | Status |
|---|---|
| `AUTH_INVALID_CREDENTIALS`, `AUTH_INVALID_TOKEN`, `AUTH_INVALID_OTP` | 401 |
| `AUTH_NOT_ALLOWED` | 403 |
| `AUTH_NO_WHATSAPP` | 409 |
| `AUTH_CHALLENGE_EXPIRED`, `AUTH_LINK_INVALID` | 410 |
| `AUTH_ACCOUNT_LOCKED` | 423 |
| `AUTH_OTP_COOLDOWN`, `AUTH_OTP_RATE_LIMITED`, `AUTH_OTP_LOCKED`, `AUTH_RATE_LIMITED` | 429 (with `Retry-After` where set) |
| `AUTH_PASSWORD_MISMATCH`, `AUTH_PASSWORD_POLICY` | 400 |
| `AUTH_OTP_DELIVERY_FAILED` | 502 |
| anything else | 500 `SYSTEM_ERROR` |

Rate limits (`server/auth/rate-limit.ts`): SIGNIN 20/IP and 10/User ID per 15 min; CODE 30/IP per 15 min; FORGOT 10/IP per 15 min and 5/User ID per hour; SET_PASSWORD 10/IP per 15 min; GOOGLE 30/IP per 15 min.

A successful sign-in (`google`, `password/verify`, `set-password/complete`, `forgot/complete`) answers `200 { success: true, data: { redirectTo } }` and sets the `ars_session` cookie (HttpOnly, SameSite=Lax, Secure in production), plus a device cookie on a new device.

Where a step sends a WhatsApp code, the answer is `200 { success: true, data: { challengeToken, maskedNumber, expiresInSeconds, resendAfterSeconds } }`.

### POST `/api/auth/google`
- Body: `{ idToken }` (string, 20–5000). Bad body: `400 AUTH_INVALID_TOKEN`.
- Verifies the Firebase ID token and signs in an admin-created, active user. No OTP.

### POST `/api/auth/password/start`
- Body: `{ loginId (1–100), password (1–200) }`. Bad body: `400 AUTH_INVALID_CREDENTIALS` with the generic "user ID or password is incorrect" message.
- Checks the password, then sends the WhatsApp code. Returns the challenge shape above.

### POST `/api/auth/password/resend`
- Body: `{ challengeToken (20–200) }`. Bad body: `400 AUTH_CHALLENGE_EXPIRED`.
- Returns a fresh challenge shape.

### POST `/api/auth/password/verify`
- Body: `{ challengeToken, code }` (code 4–8 digits). Bad body: `400 AUTH_INVALID_OTP`.
- Returns `{ redirectTo }` and sets the session cookie.

### POST `/api/auth/set-password/start`
- Body: `{ token, password, confirm }` (token = the set-password link token). Bad body: `400 AUTH_LINK_INVALID`.
- Checks the link and the new password, sends a WhatsApp code. Returns the challenge shape.

### POST `/api/auth/set-password/complete`
- Body: `{ token, challengeToken, code, password, confirm }`. Bad body: `400 AUTH_INVALID_OTP`.
- Saves the password and signs in. Returns `{ redirectTo }` and sets the session cookie.

### POST `/api/auth/forgot/start`
- Body: `{ loginId }`. Bad body: `400 VALIDATION_FAILED`.
- Same answer whether or not the User ID exists: `200 { challengeToken, expiresInSeconds }`.

### POST `/api/auth/forgot/complete`
- Body: `{ challengeToken, code, password, confirm }`. Bad body: `400 AUTH_INVALID_OTP`.
- Saves the password and signs in. Returns `{ redirectTo }` and sets the session cookie.

### POST `/api/auth/logout`
- No body. If a session exists it is revoked and audited (`LOGOUT`); errors are logged, not shown.
- Always `200 { redirectTo: "/login" }` and clears the session cookie.

### POST `/api/auth/not-me`
- Body: `{ token }` (20–2000), from the confirm page opened by the new-login alert link. The link itself changes nothing.
- `200 { secured: true }` and clears the session cookie; `400 INVALID_LINK` for a bad or expired token; `500 SYSTEM_ERROR`.

### GET `/api/auth/status`
- No input. Doesn't count as activity and says nothing about who.
- Always `200` (not the usual envelope): `{ signedIn, idleSecondsLeft (number or null), reason (null, or why this browser's session ended: idle, signed_out, revoked, expired, deactivated, locked, unknown), build }`.

### POST `/api/auth/keep-alive`
- No input. Counts as activity for a live session.
- `200 { signedIn: true }` or `401 { signedIn: false }` (not the usual envelope).

### GET `/api/auth/try/[token]`
- `token`: a one-time, signed "Try as" link (D-185), valid 5 minutes, single use. Refused where someone is already signed in in this browser.
- Success: sets a view-only session cookie and redirects to `/users`. Refusal: redirects to `/try?reason=...` (`REFUSED` on an unexpected error). `Referrer-Policy: no-referrer`.

---

## The signed-in person (`/api/me/...`, `/api/users/...`)

### GET, POST `/api/me/notifications`
- Auth: `requireApiArea("users", { change: false })`; 120 calls a minute per person. Only the caller's own notifications.
- GET query: `type` (optional notification category). Answer (no envelope): `{ items: [{ id, title, message (first 200 chars), category, createdAt, read, path }] (latest 10), unread: { ALL, ...per category } }`.
- POST body: `{ action: "read-all" }` or `{ action: "read", ids: number[] }` (up to 100). Answer: `{ ok: true, changed }`. Nothing to mark: `400 VALIDATION_ERROR`.
- Denied or failed: `404`; over limit: `429`.

### GET `/api/me/quick`
- Auth: `requireApiArea("users")`; 90 calls a minute per person.
- Query: `q` (trimmed, up to 100 chars). Under 2 characters returns recently viewed requests.
- Answer (no envelope): `{ kind: "search" | "recent", items: [{ id, requestNo, title, status }] (up to 8), tasks, projects, people: [{ id, name, email, detail, photo }], information: [{ id, infoNo, title }] (up to 6) }`. Tasks/projects and information only when the person has the module and the feature is on. Access uses the same rules as search and the record pages.

### POST `/api/me/sign-out-everywhere`
- Auth: `requireApiArea("users", { change: true })`.
- Ends every session of the person, audited. `200 { redirectTo: "/login" }` and clears the cookie; otherwise `404`.

### GET `/api/users/[id]/photo`
- Auth: `requireApiArea("users")` (anyone signed in). `id`: up to 10 digits.
- Returns the image bytes (active people only), `Cache-Control: private, max-age=86400`. Anything else: `404`.

---

## Downloads

All answer a file with `Content-Disposition: attachment` (or `inline` where noted), `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. Any refusal is a plain `404` unless stated.

### GET `/api/attachments/[id]`
- Auth: `requireApiArea("users")`, then `openAttachment` checks the person may see the request. 120 downloads a minute per person.
- Query: `inline=1` shows an image or PDF in the browser; other types still download. Middleware leaves this route's own sandbox CSP in place.
- `200` file bytes; `404`; `429`.

### GET `/api/files/[id]`
- Auth: `requireApiArea("users")`, then `loadTaskFor` / `loadInfoFor` (same rule as the task or information page). 120 downloads a minute. Denials are audited (`RECORD_FILE_ACCESS_DENIED`).
- Query: `inline=1` as above.
- `200` file bytes; `404`; `429`.

### GET `/api/requests/[id]/summary.pdf`
- Auth: `requireApiArea("users")`, then `loadRequestView` (same check as the request page). 20 a minute per person. Audited (`REQUEST_SUMMARY_DOWNLOADED`).
- `200 application/pdf` with `Content-Security-Policy: default-src 'none'; sandbox`; `404`; `429`.

### GET `/api/exports/[id]`
- Auth: `requireApiArea("users")`, then `canUseReports` (IT_ADMIN or SUPER_ADMIN, Reports feature on) and `canExport`. Owner only, while kept (7 days). Audited (`EXPORT_DOWNLOADED`).
- `200` file (format from the stored export); `403 FORBIDDEN` without the export permission; `404` (also "no longer kept"); `500 SYSTEM_ERROR`.

### GET `/api/reports/[key]`
- Auth: `requireApiArea("users")`, then `canUseReports` and `canExport`. 20 exports a minute (`429 RATE_LIMITED`, no `Retry-After` here). Scoped to the person on the server. Audited (`REPORT_EXPORTED`: key, format, rows; never the data).
- Query: `format` = `csv` (default), `xlsx` or `pdf`; the report's own filters are passed through `cleanQuery`.
- `200` file; `403`; `404` (unknown report); `500 SYSTEM_ERROR`.

### GET `/api/analytics/export`
- Auth: `requireApiArea("users", page users.analytics)`, or with `base=admin` `requireApiArea("admin", page admin.analytics)`; then `featureOn("analytics")` and `canExport`. 20 a minute. Audited (`ANALYTICS_EXPORTED`).
- Query: `kind` = `employees` | `departments` | `monthly` (required); `scope`, `period`, `from`, `to`; for employees `q` (person search, up to 60 chars) and `sort`. The scope is resolved on the server, so editing the link can't widen it.
- `200` CSV with a header block (board, scope, period, filters, generated by/at); `403`; `404`; `429`; `500 SYSTEM_ERROR`.

---

## Admin (`/api/admin/...`)

### GET `/api/admin/dashboards/[slug]`
- Auth: `requireApiArea("admin", { page: "admin.dashboards" })`. 20 a minute. Audited (`DASHBOARD_EXPORTED`).
- Query: dashboard filters (date range etc., read by `parseDashboardFilter`).
- `200` CSV `ars-<slug>-<from>-to-<to>.csv`; `404` (unknown slug or denied); `429`.

### GET `/api/admin/import/[kind]`
- Auth: `requireApiArea("admin")` (no page key).
- `kind`: an import kind (`isImportKind`). Query: `type` = `template` (header row only) or `data` (current records, audited as `IMPORT_DATA_DOWNLOADED`).
- `200` CSV; `404` for anything else.

### GET `/api/admin/records/[kind]`
- Auth: `requireApiArea("admin", { page: "admin.records" })` and `canExport`. 20 a minute. Audited (`RECORDS_EXPORTED`).
- `kind`: `requests` | `tasks` | `information`. Query: the register's filters (`readRecordFilter`).
- `200` CSV with a UTF-8 byte-order mark (for Excel); header `X-Rows-Truncated: 1` when cut short; `404`; `429`.

### GET `/api/admin/workflows/[id]/export`
- Auth: `requireApiArea("admin", { page: "admin.workflows" })`. Audited inside `exportApprovalType` (`WORKFLOW_EXPORTED`).
- `id`: up to 10 digits (approval type). Exports the live version.
- `200` JSON file `approval-type-<code>-v<n>.json`; `400 VALIDATION` when the workflow points at inactive or missing items; `404`; `500 SYSTEM_ERROR`.

---

## Super Admin (`/api/superadmin/...`)

### GET `/api/superadmin/audit`
- Auth: `requireApiArea("superadmin")`. The export is itself audited (`AUDIT_EXPORTED`).
- Query: `from`, `to` (`YYYY-MM-DD`; default the last 30 days, India time), `action` (optional, `A–Z` and `_`).
- `200` CSV, at most 50,000 rows; `404`.

---

## Pic bot (`/api/ai/...`)

All three use `requireApiArea("users", { change, page: "users.ai_assistant" })` and then `aiAccess` (`server/ai/api.ts`), which reads the person's chat modes now. Who is asking always comes from the session, never the body. Denied: `404`.

### POST `/api/ai/chat`
- Body (zod): `{ conversationId: number | null, mode?: "GENERAL" | "APPROVAL" | "TASK" | "INFORMATION" | "SALESFORCE" | "COMBINED" | null, question: string (≤ 20,000), requestKey: uuid }`. Bad body or a mode not allowed: `400 VALIDATION_FAILED`.
- The browser can cancel the request; the provider call is then aborted.
- Success: `200 { success: true, data: { conversationId, duplicate, messages } }`.
- Refused by the assistant: `{ success: false, error: { code, message }, data: { conversationId, messages } }` with status by code: `EMPTY` 400, `NO_ACCESS`/`MODE_DENIED`/`MODE_REVOKED` 403, `NOT_FOUND` 404, `LEGACY`/`IN_PROGRESS` 409, `TOO_LONG` 413, `RATE_LIMITED`/`DAILY_LIMIT`/`PERSON_BUSY` 429 (`Retry-After: 60`), `CANCELLED` 499, `STOPPED`/`SERVER_BUSY`/`NO_PROVIDER` 503, other 502. Unexpected error: `500 FAILED`.

### GET `/api/ai/conversations`
- Returns `{ stopped, modes: [{ mode, label }], conversations: [{ id, title, mode, updatedAt, usable }] }` (latest 30, own only).

### GET, PATCH, DELETE `/api/ai/conversations/[id]`
- `id`: up to 12 digits; another person's chat is `404`.
- GET: `{ id, mode, usable, messages }`.
- PATCH body: `{ title?: string (1–200) }` or `{ pinned?: boolean }`. Bad: `400 VALIDATION_ERROR`. Answer `{ id, title, pinned }`. Audited.
- DELETE: `{ deleted: true }`. Audited.

---

## Integrations (OAuth)

These answer with redirects. Denied: `404` JSON.

### GET `/api/integrations/google-calendar/connect`
- Auth: `requireApiArea("users", { change: true, page: "users.profile" })`. 10 a minute per person.
- Success: `303` to Google's consent screen, with a nonce cookie (HttpOnly, path `/api/integrations/google-calendar`, 10 minutes). Over limit or not set up: redirect to `/users/profile/calendar?error=LIMIT` or `?error=UNAVAILABLE`.

### GET `/api/integrations/google-calendar/callback`
- Auth: `requireApiArea("users", { change: false })`. Query from Google: `code`, `state`, `error`. The state must be the person's, unused, unexpired and match the nonce cookie. Tokens are stored encrypted on the server.
- Redirect to `/users/profile/calendar?connected=1` or `?error=<reason>`; clears the nonce cookie; `Referrer-Policy: no-referrer`.

### GET `/api/integrations/salesforce/connect`
- Auth: `requireApiArea("superadmin")`. Starts OAuth 2.0 with PKCE; the state is tied to this Super Admin for 10 minutes. Audited.
- `303` to Salesforce; not set up: redirect to `/superadmin/salesforce?salesforce=CONFIG`; error: `?salesforce=ERROR`.

### GET `/api/integrations/salesforce/callback`
- Auth: `requireApiArea("superadmin")`. Query: `code`, `state`, `error`. Code exchanged with the PKCE verifier; tokens stored encrypted. Audited (connected or failed).
- Redirect to `/superadmin/salesforce?salesforce=CONNECTED` or `?salesforce=<reason>`; `Referrer-Policy: no-referrer`.

---

## Jobs, webhooks and health

These are called by machines. The middleware's cross-site check doesn't apply to `/api/jobs/` and `/api/webhooks/`. A wrong or missing secret looks like a missing route (`404`).

### POST `/api/jobs/run`
- Auth: header `x-job-secret` equal to the `JOB_RUNNER_SECRET` env var (never put the value in a file in the repository). Unset secret: always `404`. cPanel cron calls it every 5 minutes (see `docs/DEPLOYMENT.md`, Part I).
- No body. Runs each automation separately (one failure doesn't stop the rest), records the runner heartbeat, and alerts the Super Admin on failures.
- `200 { success: true, data: <run report: runRef, failed, ...> }`; `500 SYSTEM_ERROR`. The full report shape comes from `runAutomations` (`server/ops/automation.ts`) and isn't listed here.

### POST `/api/webhooks/ceoitbox`
- Auth: header `x-webhook-secret` equal to the setting `whatsapp.webhook_secret`. 600 calls a minute in total.
- Body: CEOITBox receipt JSON (read by `parseReceipts`), up to 256,000 characters. Receipts only move a delivery forward (SENT → DELIVERED → READ).
- `200 { success: true, data: { receipts, updated } }`; `400 INVALID` (not JSON); `404`; `413 TOO_LARGE`; `429`; `500`.

### POST `/api/webhooks/google-calendar`
- Auth: Google's channel headers (`x-goog-channel-id`, `x-goog-resource-id`, `x-goog-channel-token`, `x-goog-resource-state`) must match a live connection; the token is compared by hash. 1,200 a minute.
- No body (a notification is only a signal). Queues one sync.
- Empty answers: `200`, `404` (unknown channel), `429`, `500` (Google retries).

### GET `/api/health`
- Public, cheap, says nothing private. For an uptime monitor.
- `200` when the database answers, `503` when it doesn't. Body (no envelope): `{ status: "ok" | "error", version, database: "ok" | "down", jobRunner: "OK" | "LATE" | "NEVER" | "UNKNOWN", storage: "ok" | "failed", ms }`. `LATE` means no run in the last 15 minutes and also alerts the Super Admin after the answer is sent.

---

## Not covered or not verified

- Exact query fields for report, dashboard and records filters live in `server/reports/run.ts` (`cleanQuery`), `server/dashboards/filters.ts` and `server/records/filters.ts`; only the route-level fields are listed here.
- The full `jobs/run` report shape and the CEOITBox receipt body format were not traced.
- Which modules the page rules need (for example for Pic bot) is decided in `server/authorization/page-access.ts` and the page catalogue, not in the routes.
