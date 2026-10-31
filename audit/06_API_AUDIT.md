# 06 API audit (SEC)

Auditor: SEC · Target: ARS-CMS v1.39.0 (commit `0473f25`; the build is v1.39.0 code per the lead, and `/api/health` says 1.38.0 because of a stale version string) · Date: 31 Oct 2026 · http://localhost:3100.

## 1. Method

- **Inventory.** Every `app/api/**/route.ts` (40 files, 44 method handlers) was read for its methods, how it authenticates and authorises, how it validates input, its rate limit and its error shape.
- **HTTP probes** (curl), where it was safe and cheap:
  - unauthenticated;
  - wrong role;
  - malformed JSON;
  - wrong content type;
  - invalid, huge and injection-like ids;
  - wrong method;
  - a 1.1 MB body.
- **Bodies.** Every error body was checked for stack traces, SQL, secrets and other people's data.
- **CORS** was checked on `/api/me/*`.
- **Server actions.** The inventory of exported actions is in `TEST_EVIDENCE/SEC/server_actions_inventory.tsv`: file:line, function, and the guard it calls. That list is summarised in §3, and its access review is in 05 (RBAC-19 to RBAC-22).
- **Evidence:**
  - `api_probes.txt` (first run; probes with sessions are void because of the DB re-seed, as the note at its top explains);
  - `api_probes_rerun.txt` (valid re-run with live sessions and before/after baselines);
  - `rbac_idor_probes.txt`;
  - `auth_signin_probes.txt`;
  - `headers_cors.txt`;
  - `rate_limit_pdf.txt`;
  - `rbac_ai_conversation_rerun.txt`.

Common error envelope: `{"success":false,"error":{"code","message","requestId"}}` (lib/http/api-response.ts:16-18). Some routes return the same shape without `requestId` (integrations, webhooks, middleware 403/404), and `keep-alive` and `status` return plain JSON.

## 2. Route inventory

Auth key: **S** = needs a live session (the middleware lets a cookie through, then the route's guard checks the session row). **Area** = the `requireApiArea` area and page key. Limit = per person or IP, per window.

| Route | Methods | Auth / authorisation | Validation | Rate limit | Errors |
|---|---|---|---|---|---|
| /api/auth/google | POST | public | zod `idToken` 20-5000 | GOOGLE 30/IP/15 min | 400/401/403/423/429, generic |
| /api/auth/password/start | POST | public | zod loginId ≤100, password ≤200 | SIGNIN 20/IP, 10/login per 15 min | 400/401/409/423/429/502 |
| /api/auth/password/verify | POST | public, challenge token | zod token 20-200, code `^\d{4,8}$` | CODE 30/IP/15 min, 5 tries per challenge | 400/401/410/429 |
| /api/auth/password/resend | POST | public, challenge token | zod | CODE; 30 s cooldown; 5 per hour | 410/429/502 |
| /api/auth/forgot/start | POST | public | zod loginId | FORGOT 10/IP, 5/login | always 200 (uniform) |
| /api/auth/forgot/complete | POST | public, challenge token | zod + password policy | CODE | 400/401 uniform |
| /api/auth/set-password/start, /complete | POST | public, link token (72 h, single use) | zod + policy | SET_PASSWORD 10/IP; CODE | 400/410/429 |
| /api/auth/logout | POST | S (no-op without one) | – | – | always 200 + clears cookie |
| /api/auth/keep-alive | POST | S | – | – | 200/401 |
| /api/auth/status | GET | public (own cookie only) | – | – | 200 |
| /api/auth/not-me | POST | public, purpose token (7 days, single use) | zod | – | 400/500 |
| /api/auth/try/[token] | GET | public, purpose token (5 min, single use); refused if signed in | HMAC verify | – | 303 |
| /api/me/notifications | GET, POST | S, users (change:false) | `parseCategory`; ids filtered to positive integers, max 100 | 120/min/person | 400/404/429 |
| /api/me/quick | GET | S, users; page `users.search` by API pattern | q length; modules and features checked | 90/min | 404/429 |
| /api/me/sign-out-everywhere | POST | S, users (change:true) | – | – | 200/404 |
| /api/attachments/[id] | GET | S, users; page `users.request`; record check `openAttachment` | `^\d+$` | download 120/min | 404 only |
| /api/files/[id] | GET | S, users; record check `loadTaskFor` / `loadInfoFor`; denial audited | `^\d{1,10}$` | download 120/min | 404 only |
| /api/requests/[id]/summary.pdf | GET | S, users; `loadRequestView` | `^\d+$` | pdf 20/min | 404/429 |
| /api/exports/[id] | GET | S, users + `canUseReports` + `canExport`; owner only | `^\d{1,10}$` | – | 403/404/500 |
| /api/reports/[key] | GET | S, users + `canUseReports` + `canExport` | key lookup | report-export 20/min | 403/404/429/500 |
| /api/analytics/export | GET | S, admin or users with page key; `featureOn('analytics')` + `canExport` | kind allow-list | report-export | 403/404/500 |
| /api/admin/records/[kind] | GET | S, admin, `admin.records` + `canExport` | KINDS allow-list | report-export | 404 |
| /api/admin/dashboards/[slug] | GET | S, admin, `admin.dashboards` | slug lookup | report-export | 404 |
| /api/admin/import/[kind] | GET | S, admin (page by path) | `isImportKind`, type template or data | – | 404 |
| /api/admin/workflows/[id]/export | GET | S, admin, `admin.workflows` | `^\d{1,10}$` | – | 400/404/500 (generic) |
| /api/superadmin/audit | GET | S, superadmin | dates `YYYY-MM-DD`, else defaults | – | 404 |
| /api/ai/chat | POST | S, users, `users.ai_assistant` + `aiAccess` (module and chat modes) | zod (mode enum, question ≤20 000, requestKey uuid) | ai-ask 6/min (default) + daily limit | 400/403/404/409/413/429/503 |
| /api/ai/conversations | GET | as above | – | – | 404 |
| /api/ai/conversations/[id] | GET, PATCH, DELETE | as above; owner-scoped queries | `^\d{1,12}$`; title 1-200 | – | 400/404 |
| /api/users/[id]/photo | GET | S, users (any signed-in person, D-230) | `^\d{1,10}$`; path kept inside the upload root | – | 404 |
| /api/integrations/google-calendar/connect | GET | S, users, `users.profile` change | – | gcal-connect | 404 |
| /api/integrations/google-calendar/callback | GET | S, users; state + nonce cookie | state checks | – | 303 |
| /api/integrations/salesforce/connect, /callback | GET | S, superadmin; PKCE + state | state | – | 303/404 |
| /api/jobs/run | POST | `x-job-secret` (SHA-256 + timingSafeEqual) | – | – | 404/500 |
| /api/webhooks/ceoitbox | POST | `x-webhook-secret` setting | body ≤256 000 chars, JSON | 600/min | 400/404/413/500 |
| /api/webhooks/google-calendar | POST | channel token | – | 1200/min | 404/429/500 |
| /api/health | GET | public | – | – | 200/503: version, db, jobRunner, storage only |

## 3. Server Action inventory (summary)

There are 168 exported actions in 42 `"use server"` files. The full list, with file:line, function and guard, is `TEST_EVIDENCE/SEC/server_actions_inventory.tsv`.

| Guard pattern | Count | Notes |
|---|---|---|
| `getAdminActor(pageKey)` (requireApiArea admin + page) | 42 | All 15 `app/admin/**/actions.ts` files; every call names its page. |
| Local `superAdmin()` or direct `requireApiArea("superadmin")` | 13 + part of 17 direct | All 11 `app/superadmin/**/actions.ts` files. |
| Local `actor()`, `me()`, `owner()`, `reportUser()`, `userForAi()` (requireApiArea users) | 96 | `app/users/**`. Record checks happen in the services (05 RBAC-22). |
| Direct `requireApiArea(...)` | 17 | – |
| **No guard** | **0** | – |

Next.js checks a Server Action's `Origin` against the host: a cross-origin action gives 500 with a digest only (server_action_origin_probe.txt). `serverActions.bodySizeLimit` is 52 MB (next.config.ts:28) to allow 5 attachments of 10 MB.

## 4. Checks

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| API-01 | Every API route without a session gives 404 (or a redirect for page-like routes) | HTTP | PASS | `/api/me/quick`, `/api/attachments/2`: 404 JSON from the middleware (auth_session_probes A3, A4). Garbage cookie: 404 (A8). |
| API-02 | Wrong role on admin and super admin APIs | HTTP | PASS | USER gets 404 on 6 admin APIs and on the super audit. IT_ADMIN gets 404 on `/api/superadmin/audit` and salesforce connect (rbac_idor_probes.txt; api_probes_rerun P22b). |
| API-03 | Malformed JSON | HTTP | PASS | Auth routes: 400 with generic codes (S1). `/api/me/notifications`: 400 `VALIDATION_ERROR` (P10). `/api/ai/chat`: 400 `VALIDATION_FAILED` (P23). |
| API-04 | Wrong content type | HTTP | PARTIAL | `text/plain` to password start gives 400 (S2). `text/plain` with a JSON body to `/api/me/notifications` is accepted (200, P40): `request.json()` ignores Content-Type. Not exploitable cross-site (see API-12 and API-13). Recommendation only. |
| API-05 | Invalid ids: letters, negative, 23 digits, `1' OR 1=1`, path traversal `..%2F` | HTTP | PASS | All 404 with the generic body, with a live session confirmed before and after (api_probes_rerun.txt second batch, P1-P9). |
| API-06 | Unknown kinds, slugs and keys on admin export APIs | HTTP | PASS | records/bogus, import type=bogus, workflows/abc, dashboards/bogus, analytics kind=bogus and reports/bogus all give 404 (P16-P21). |
| API-07 | Bad query values are defaulted, not trusted | HTTP | PASS | `/api/superadmin/audit?from=x&to=y` gives 200 CSV over the default 30-day window (P22). Date regex at route:21. |
| API-08 | Wrong HTTP method | HTTP | PASS | DELETE on attachments, PUT on notifications and GET on password start all give 405 with an empty body (P35-P37). |
| API-09 | Oversized body | HTTP | PASS | 1.1 MB JSON to password start gives 400 (zod max 200) (P38). 1.1 MB to notifications gives 400 (P39). No crash; the server answered the next requests. |
| API-10 | Machine endpoints without or with a wrong secret | HTTP | PASS | `/api/jobs/run` gives 404 for no secret and a wrong one (P31, P32). ceoitbox webhook gives 404 (P28, P29). google-calendar webhook gives 404 with an empty body (P30). |
| API-11 | No stack traces, SQL, secrets or other people's data in error bodies | HTTP | PASS | Every error body seen is the envelope with a generic message and `REQ-…` reference (all probe files). A cross-origin Server Action gives a digest only. Auth errors never reveal whether an account exists (04 AUTH-18; timing aside, SEC-01). |
| API-12 | CORS on `/api/me/*` | HTTP | PASS | OPTIONS preflight from `Origin: https://evil.example` gives 204 with no `Access-Control-Allow-*` headers. GET with an evil Origin returns no ACAO header (headers_cors.txt). middleware.ts:96-98 |
| API-13 | Cross-site and same-site (sibling subdomain) state-changing API calls | HTTP | PASS | POST `/api/me/notifications` with `Sec-Fetch-Site: cross-site` or `same-site` gives 403 `FORBIDDEN` (headers_cors.txt). `SameSite=Lax` on the session cookie is a second layer. |
| API-14 | Rate limit triggers on a signed-in costly route | HTTP | PASS | PDF summary: the 21st call in a minute gives 429 (rate_limit_pdf.txt; one earlier call counted). |
| API-15 | Rate limit on sign-in | HTTP | PASS | 04 AUTH-32 (21st attempt gives 429 with `Retry-After`). |
| API-16 | Notification ids can't touch other people's rows | HTTP + SQL | PASS | 05 RBAC-18 |
| API-17 | Owner-only AI chat API | HTTP + SQL | PASS | 05 RBAC-17 |
| API-18 | Download headers on file routes | HTTP | PASS | Attachment: `Content-Disposition: attachment`, `Content-Security-Policy: default-src 'none'; sandbox`, `nosniff` (headers_cors.txt). Inline preview only for png, jpeg, webp and pdf (attachments/files.ts:113-135). |
| API-19 | Health endpoint discloses only what it says | HTTP | PASS | `{"status","version","database","jobRunner","storage","ms"}`, no paths (P41). Version disclosure is accepted by design (D-103). |
| API-20 | Every exported Server Action has a guard | Code review (static scan) | PASS | §3, 05 RBAC-19 |
| API-21 | Google Calendar and Salesforce callbacks with forged state | HTTP | PASS | Both give 303 to the page with an error (P33, P34 re-run). No token exchange happens with an unknown state. |
| API-22 | AI chat endpoint end to end (provider answer) | – | NOT TESTED | It would call an AI provider stub or a real provider; it is outside a safe API probe. Validation and access were tested (P23, P24, P27). |

**Status counts (22 checks):** PASS 20 · PARTIAL 1 · NOT TESTED 1 · FAIL 0 · BLOCKED 0 · NOT APPLICABLE 0.

## 5. Defects

The API layer itself raised no new defect. Related defects are reported elsewhere:

- **SEC-01** (timing on `/api/auth/password/start`) is in 04.
- **SEC-02** (Super Admin page data over RSC) is in 05. It isn't an `app/api` route, but it is a data endpoint in effect.

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| – | – | – | – | No defect specific to `app/api/**` | – | – | – | – | – | – | – | – | – |

**Recommendations (not defects):**

1. Reject a non-`application/json` Content-Type on JSON POST and PATCH routes (API-04).
2. Use the same envelope, with `requestId`, on the integration, webhook and middleware errors.
3. `/api/me/notifications` POST uses `change:false`. That is fine for your own read state, but note that a VIEW-only page rule does not stop it.
