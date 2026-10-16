# 01 — Application architecture

**Application:** ARS Approval Platform. Package `ars-approval-system` v1.8.0, commit `168216a`, repo `HarishDevs/ARS-Approval-System`, branch `main`.

**Purpose:** one web app at `approval.arssteels.net` for multi-level approvals of any shape. The north star is "multi-level approvals in any custom manner". Approvals can be sequential, parallel, any-one, any-N-of-M, conditional, DoA bands or hybrids, with approvers from any source, for predefined approval types and for user-built custom approvals.

**Audit date:** 16 Oct 2026. The audit was read-only: no source, configuration, database, dependency or deployed resource was changed.

## Architecture at a glance

```
Browser (React 19 server components + small client islands)
   │  HTTPS via Cloudflare (origin lock header when ORIGIN_SECRET is set)
   ▼
Next.js 15.5 App Router on GoDaddy Node.js hosting (one process, cPanel)
   middleware.ts      session-cookie gate · CSRF (Sec-Fetch-Site) · CSP nonce · signed page path
   app/               3 role spaces (/users, /admin, /superadmin) + (public) auth pages + 25 API routes
                      29 "use server" files = 93 Server Actions (all mutations)
   features/          UI components per domain (106 files)
   server/            domain services, server-only (23 modules; pure approval engine in server/engine)
   lib/db/            mysql2 pool + 43 repositories (raw parameterised SQL), transaction helper
   ▼
MySQL 8 (GoDaddy) — 64 tables after 30 additive migrations; engine state as JSON + projections
   ▲
cPanel cron ── POST /api/jobs/run every 5 min (x-job-secret) → 12 automations (outbox, deliveries,
               SLA, templates, housekeeping, delegations, backup, reports, alerts, expiry, exports, stuck)
External: Resend (email, HTTPS) · CEOITBox (WhatsApp, HTTPS + receipt webhook) · Firebase Auth (Google)
Storage:  /private/uploads (attachments), /private/backups (daily gzip dumps) on the host disk
```

## Key facts (verified)

| Area | Finding | Evidence |
|---|---|---|
| Frontend | Next.js 15.5.27 App Router, React 19.1, TypeScript 5.7, Tailwind 3.4 with ARS tokens. Every page is a Server Component, and charts are server-rendered SVG with no chart library. | `package.json`, `features/analytics/Charts.tsx` |
| Backend | The same Next.js process runs Server Actions for every mutation and route handlers for downloads, auth, jobs and the webhook. There is no separate API server. | `app/**/actions.ts`, `app/api/**/route.ts` |
| Database | MySQL 8 through `mysql2`, with no ORM. Migrations are additive SQL files tracked by filename and resumable per statement. Migrate and seed run on every `npm start`. | `scripts/database/migrate.js`, `package.json:12` |
| Engine | A pure node-graph state machine: START, END, APPROVAL (APPROVE or WORK), NOTIFY, SPLIT, JOIN, CONDITION. It supports ALL, ANY_ONE and ANY_N rules. A request's state is stored as JSON with an optimistic `state_version` lock and a row lock, plus a task projection for queues. | `server/engine/engine.ts`, `server/approvals/service.ts:546-583` |
| Authentication | Google (Firebase, no OTP) or User ID + password + WhatsApp OTP. HMAC-signed cookie plus a database session row, re-checked on every request. Users and IT Admins are signed out after 30 minutes of inactivity; the Super Admin is exempt. | `server/auth/*`, `lib/session/*` |
| Authorization | Three layers. (1) The middleware checks that a session cookie is present. (2) Role guards (`requireArea`, `requireApiArea`) run in every layout, page, action and route. (3) Record-level visibility is one SQL rule. v1.8.0 adds page access (Full, View or Hidden by person, department or everyone), keyed on an HMAC-signed request path. | `server/authorization/*`, `lib/db/repositories/visibility.ts` |
| Jobs | No worker process. A cron job calls `/api/jobs/run` every 5 minutes, and each step is claimed so that overlapping runs are mostly safe. Every step's run is recorded in `job_runs`. | `server/ops/automation.ts` |
| Notifications | One hub writes an in-app row plus email and WhatsApp deliveries. Engine events go through a transactional outbox. Failed deliveries are retried with backoff, and their payloads are stored encrypted. | `server/notifications/notify.ts`, `lib/db/repositories/outbox.repository.ts` |
| Hosting | GoDaddy Node.js hosting behind Cloudflare. The owner deploys manually ("Publish"), and CI does not deploy. | `docs/DEPLOYMENT.md` |
| Live status | `GET https://approval.arssteels.net/api/health` on 16 Oct 2026 returned `{"status":"ok","version":"1.8.0","database":"ok","jobRunner":"OK"}`. So v1.8.0 is live and the cron runner is running. | read-only GET by the auditor |

## Architectural observations

1. **The layering is consistent and easy to follow:** app → features → server → lib/db. The engine is pure and well unit-tested, so it is the right place for the routing fixes in Phase A.
2. **The design assumes a single node:** local-disk attachments, MySQL-based rate limits and a cron-over-HTTP runner. This fits GoDaddy shared hosting and the organisation's size (hundreds of users), but it rules out horizontal scaling without changes. That is acceptable today; see the decision register (DR-15).
3. **Migrate and seed run on every boot**, with no lock and no checksum (see `05_DATABASE_AUDIT.md` M-1 to M-3). One seed has a real side effect: it re-grants Super Admin (AUD-03).
4. **The database session time zone is never pinned.** All date logic assumes UTC (AUD-04 in `06`). Confirm the production setting before anything else.
5. **Dependencies are major versions behind** (Next 16, Tailwind 4, zod 4, firebase 13), and the app depends on Next 15.5-specific workarounds (D-113). `npm audit --omit=dev` reports 0 vulnerabilities. Plan any upgrade as its own project, not during stabilisation.
6. **The planning documents have drifted:** `KNOWN_ISSUES.md`, `SECURITY_AND_AUTHORIZATION_REVIEW.md`, `GO_LIVE_READINESS_CHECKLIST.md` and `DEPLOYMENT.md` describe v1.4–v1.6. The cron blocker they list (OPS-01, "job runner NEVER") is **no longer true on live**, according to the health endpoint above.

The sections below are the detailed architecture audit: structure, dependencies, CI, tests, documentation state, code size and maintainability.

---

*Source: domain sub-audit, cross-checked by the lead auditor.*

Read-only audit of `D:\Omniroute\ARS Approval System` (package `ars-approval-system` v1.8.0), 16 Oct 2026. No files, DB or env values were touched. All paths are relative to the repo root.

---

### 1. Architecture

#### 1.1 Repository structure

| Dir | Role | .ts/.tsx files | Lines |
|---|---|---:|---:|
| `app/` | Next.js App Router: three role "spaces" `app/users`, `app/admin`, `app/superadmin`, plus `app/(public)` (login, set-password, security/not-me) and `app/api` (25 route handlers). Server Action files (`*actions.ts`) live beside pages. | 159 | 9,510 |
| `features/` | Client/UI components per domain: `admin`, `analytics`, `auth`, `help`, `requests`, `shell`, `superadmin`, `ui` (design-system primitives) | 106 | 12,756 |
| `server/` | Domain/service layer (`import "server-only"`): 23 modules — `approvals` (25 files, 3.5k lines), `engine` (pure state machine), `workflows`, `forms`, `notifications`, `integrations/{ceoitbox,resend}`, `jobs`, `ops`, `reports`, `analytics`, `authorization` (guards, policy, page-access), `auth`, `attachments`, `pdf`, `import`, `settings`, `search`, `workload`, `drafts`, `dashboards`, `demo`, `ui` | 117 | 16,895 |
| `lib/` | Infrastructure: `db/client.ts`, `db/transaction.ts`, `db/repositories/*` (43 repositories, raw SQL over mysql2), `firebase/{client,admin}.ts`, `http`, `logging`, `security` (CSP, path signature), `session` | 63 | 5,858 |
| `config/` | `environment.ts` — zod-validated env, cached, optional vars tolerant of blank values (D-045) | 1 | 59 |
| `database/` | `migrations/` (30 SQL files, timestamped, latest `202610150900_v180.sql`), `seeds/` (3: roles, WhatsApp OTP template, bootstrap Super Admin), `optional/reporting_views.sql` | 0 TS | — |
| `scripts/` | Plain Node JS (~765 lines): `database/` (migrate, seed, restore, verify-backup, check-privileges, env, release-sql-clean.py), `admin/break-glass.js`, `dev/`, `docs/build-register.mjs`, `docs/build-metrics.ts` | 1 TS | 47 |
| `types/` | Shared ambient types | 1 | 22 |
| `tests/` | Vitest unit / integration / perf, Playwright e2e / qa / origin / loaders / perf | 142 | 14,999 |
| `reference/` | Historical planning HTML/MD (Asana audit, platform plans v1–v3); not code | 0 | — |
| `storage/` | Local default for `UPLOAD_DIR`/`BACKUP_DIR` (git-ignored, `.gitignore:23`); contains `backups/` and a copy of `reference/` | 0 | — |
| `public/` | `brand/`, `icons/` (ARS asset pack) | 0 | — |
| `styles/` | Global CSS / Tailwind entry | 0 | — |
| `docs/` | ~22 top-level docs + `development/`, `qa/`, `register/`, `requirements/` | — | — |

Root living files: `CLAUDE.md`, `DEVELOPMENT-MEMORY.md` (1,057 lines), `PLAN-CHECKLIST.md` (1,013), `FLOWS.md` (1,148), `README.md`.

#### 1.2 Layering conventions
`app/*` (pages, layouts, route handlers, Server Actions) → `features/*` (React UI, client components) → `server/*` (domain services; `server-only`) → `lib/db/repositories/*` (SQL) → `lib/db/client.ts` (mysql2 pool) / `lib/db/transaction.ts`.
- Engine is pure (`server/engine/engine.ts`); persistence wraps it in one transaction with row lock + `state_version` (D-050, M4-01).
- Authorization in 3 layers (comment in `middleware.ts`, P1-30a): (1) middleware only checks a session cookie; (2) server-side role checks in every layout/page/route/action (`server/authorization/guards.ts`, `policy.ts`); (3) per-record visibility (`lib/db/repositories/visibility.ts`, D-057). v1.8.0 adds **page access** (`server/authorization/page-access.ts`, `pages.ts`, `page-access.repository.ts`) using an HMAC-signed path header set in middleware (`lib/security/path-signature.ts`).
- Mutations are Server Actions (D-048); 29 files with `"use server"`.

#### 1.3 Dependencies (`package.json`, all pinned exactly)
Runtime: next 15.5.27, react/react-dom 19.1.0, typescript 5.7.3 (in `dependencies`), mysql2 3.24.3, zod 3.24.1, firebase 11.1.0 (client), firebase-admin 14.5.0, pdf-lib 1.17.1, lucide-react 0.469.0, clsx 2.1.1, tailwind-merge 2.6.0, server-only 0.0.1.
Dev: vitest 5.0.3 + @vitest/coverage-v8, vite 7.3.7, @vitejs/plugin-react 5.2.0, jsdom 25, @playwright/test 1.63.0, @axe-core/playwright 4.13, eslint 9.39.5 + eslint-config-next 15.5.27, tailwindcss 3.4.17, postcss 8.5.28, autoprefixer.
**Overrides:** `next → postcss 8.5.28`, `@firebase/firestore → @grpc/grpc-js 1.14.6`, global `postcss-selector-parser 7.1.6` (security patches, D-093). `engines.node >=20`; `.nvmrc` = 22; CI uses Node 22.

#### 1.4 Runtime config
- `next.config.ts`: `poweredByHeader:false`, no prod source maps, lint/typecheck errors fail the build, Server Action body limit and `middlewareClientMaxBodySize` 52 MB (attachments, D-072), global security headers (COOP `same-origin-allow-popups` for Firebase popup, nosniff, XFO DENY, HSTS, Permissions-Policy, Referrer-Policy). Firebase **public** web config is hard-coded as a build-time fallback because GoDaddy injects env only at runtime (by design; not a secret, but note it ties the build to the Power BI Firebase project, D-038).
- `middleware.ts`: origin lock via `ORIGIN_SECRET` + Cloudflare-added `x-ars-origin` header (constant-time compare, D-102); `Sec-Fetch-Site` CSRF check for unsafe `/api/*` (except `/api/jobs/`, `/api/webhooks/`); per-request CSP nonce (`lib/security/csp.ts`, D-051); cookie presence gate with redirect to `/login?next=`; request id from `CF-Ray`; signed page-path header for page access. Matcher covers everything except static assets — every page is dynamic.
- `config/environment.ts`: zod schema; required DB_*, SESSION_SECRET (≥32), ENCRYPTION_KEY; optional Firebase admin, JOB_RUNNER_SECRET (≥24), ORIGIN_SECRET (≥24), UPLOAD_DIR, BACKUP_DIR, BACKUP_KEEP_DAYS. Provider keys (CEOITBox, Resend) are **not** env vars — stored encrypted in DB settings via Super Admin UI.

#### 1.5 Environment variables (names only, from `.env.example`)
`NODE_ENV, APP_BASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY, JOB_RUNNER_SECRET, ORIGIN_SECRET, UPLOAD_DIR, BACKUP_DIR, BACKUP_KEEP_DAYS, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY` (17). `NEXT_PUBLIC_FIREBASE_*` are read in `next.config.ts` but not listed in `.env.example` (they fall back to hard-coded values).

#### 1.6 File storage
Attachments on local disk under `UPLOAD_DIR` (default `./storage/uploads`), random names + sha256 (D-072), streamed through an access-checked route `app/api/attachments/[id]` with its own sandbox CSP. On GoDaddy the container (`/app`) is ephemeral; only Private Storage `/private` persists → `UPLOAD_DIR=/private/uploads`, backups `/private/backups` (D-128; `docs/DEPLOYMENT.md` Part C, lines 105–107, 471–472). Single-node disk storage: no object store, no replication.

#### 1.7 Notifications, messaging, background jobs
- **Hub:** `server/notifications/notify.ts` — one call per event writes an in-app row plus per-channel deliveries (email + WhatsApp), honours user opt-outs (`preferences.ts`), never throws, returns a per-channel summary (D-008, D-052, D-110). Templates in `templates.ts` / `template-registry.ts`; WhatsApp template authoring on the CEOITBox API (`template-authoring.ts`, D-076). Delivery receipts via webhook `app/api/webhooks/ceoitbox`.
- **Providers:** WhatsApp = CEOITBox (`server/integrations/ceoitbox/client.ts`, shared number/API key/daily limit with the Power BI site, D-036, rate-limited in MySQL); Email = Resend HTTP API (`server/integrations/resend/client.ts`), sender `no_reply@approval.arssteels.net` (D-091).
- **Jobs:** no worker process. cPanel cron POSTs `/api/jobs/run` every 5 min with `x-job-secret` (timing-safe hash compare; 404 otherwise) → `server/ops/automation.ts runAutomations()` runs 12 automations independently and records each: `outbox, deliveries, sla, templates, housekeeping, delegations, backup, reports, alerts, expiry, exports, stuck`; heartbeat row (D-094); Super Admin alerted on failure. `/api/health` (public) exposes version/db/job-runner state (D-103).
- **Auth:** Google via Firebase (client popup + admin token verify) or User ID + password (scrypt) + WhatsApp OTP (D-025, D-043); DB-backed sessions; inactivity sign-out (D-142).

#### 1.8 Deployment model
GoDaddy Node.js Hosting deploys from GitHub `main` (manual "Publish" in the GoDaddy console), behind Cloudflare. `npm start` = `migrate.js && seed.js && next start` — migrations and idempotent seeds run on every boot. Hosted MySQL 8 on GoDaddy. Backups: in-app job writes to `/private/backups`; restore via `scripts/database/restore.js`. Rollback: feature switches → workflow version restore → redeploy older tag → DB restore (`docs/BACKUP_RESTORE_AND_ROLLBACK.md`). Local dev: `docker-compose.yml` (mysql:8.0). **Deploy is not automated** from CI.

---

### 2. CI/CD (`.github/workflows/ci.yml`)
Triggers: push / PR to `main`; `permissions: contents: read`; concurrency cancels in-progress runs.

| Job | Steps |
|---|---|
| `checks` (20 min) | `npm ci` → `npm audit --omit=dev --audit-level=moderate` → lint → typecheck → `npm test` (Vitest unit) → `npm run build` |
| `integration` (20 min) | MySQL 8.0 service → `npm run test:integration` (recreates `ars_approvals_test`, runs real migrations+seeds, includes backup/restore drill) |
| `e2e` (30 min) | MySQL 8.0 service → Playwright chromium → `test:e2e` (production build on :3100) → `playwright.qa.config.ts` → `playwright.origin.config.ts` (ORIGIN_SECRET lock); uploads report on failure |

No secrets used (throw-away values). **No deploy job, no coverage step, no caching of Playwright browsers, no scheduled/nightly run; perf and loader suites are excluded from CI** (D-089, `vitest.perf.config.ts` comment).

Recent runs (`gh run list --limit 5`):

| Run | Commit | Result | Duration |
|---|---|---|---|
| 38729337703 | v1.8.0 approved lists / custom approval set-up | success | 7m15s |
| 38217752972 | v1.7.2 Collaborating screen | success | 9m31s |
| 38050853587 | v1.7.1 nav tidy-up | success | 8m59s |
| 38048465947 | v1.7.0 lists B and C | success | 8m31s |
| 38041512866 | v1.7.0 list A | **failure** (fixed by next push) | 8m22s |

---

### 3. Tests

#### 3.1 Configs
- `vitest.config.ts` — unit, node env, `tests/**/*.test.{ts,tsx}` minus integration/e2e/perf; v8 coverage configured (text/html) but **no thresholds** and coverage is not run in CI.
- `vitest.integration.config.ts` — `tests/integration/**/*.int.test.ts`, real MySQL, serial files, global setup.
- `vitest.perf.config.ts` — `tests/perf/**/*.perf.test.ts` (not in CI).
- `playwright.config.ts` (e2e, 1 worker, prod build), `playwright.qa.config.ts`, `playwright.origin.config.ts`, `playwright.loaders.config.ts` (outside CI), `playwright.perf.config.ts`.

#### 3.2 Inventory (files / test cases, lexical count of `it(`/`test(`)
| Suite | Files | Cases |
|---|---:|---:|
| Unit (20 dirs: approvals 13/80, workflows 8/79, engine 4/62, auth 4/40, analytics 4/31, notifications 4/30, security 5/20, import 1/19, admin 1/13, ui 4/11, qa 2/8, attachments 1/8, settings 1/7, demo 1/7, jobs 1/5, drafts/help/pdf 1/3 each, config/ops 1/2 each) | 59 | ~433 |
| Integration `*.int.test.ts` | 39 | ~188 |
| E2E `tests/e2e/*.spec.ts` (in CI) | 29 | ~92 |
| QA e2e `tests/qa-e2e/app.spec.ts` (in CI) | 1 | ~27 |
| Origin lock (in CI) | 1 | 1 |
| Loader QA `tests/qa-loaders` (not in CI) | 2 | ~45 |
| Perf (`analytics.perf.test.ts`, `load.spec.ts`; not in CI) | 2 | 3 |
| **Total** | **133 test files** (+ helpers) | **~790** |

UI guard tests: `tests/ui/loading-guard.test.ts` (enforces D-113 loading.tsx allow-list), `guard-action.test.ts`, `confirm-bar.test.ts`, `queue-and-shortcuts.test.ts`. Security: CSP, client IP, log redaction, safe-next redirect.

Note: test files are named by release/session (`session4..12`, `v140`, `v160-*`, `v170-*`, `v180*`) rather than by module, which makes module coverage hard to read.

#### 3.3 Coverage per module (test files importing the module)
| Module | Size | Test files | Assessment |
|---|---|---:|---|
| engine (`server/engine`) | 6 files / 1.6k | 24 | Strong |
| approvals/requests (`server/approvals`, `server/requests`) | 26 / 4.0k | 49 + 4 | Strong |
| workflows / forms | 11 / 1.9k | 22 / 16 | Strong |
| auth (`server/auth`, `lib/session`, `lib/firebase`) | 10 / 1.1k | 6 (+40 unit cases, otp.int, sessions.int) | Adequate; Firebase admin path only 1 test |
| admin (`server/admin`, `features/admin` 22 files) | 5 / 590 | 4 / 1 | Rules unit-tested; UI only via e2e |
| superadmin (`app/superadmin`, `features/superadmin` 10 files) | — | 0 direct | **Weak** — e2e only |
| analytics | 7 / 536 | 5 (+ analytics.int, perf) | Adequate |
| reports | 6 / 1.4k | 6 | Moderate for size |
| notifications | 7 / 1.3k | 8 | Adequate |
| jobs (`server/jobs`) / ops | 3 / 340; 7 / 882 | 6 / 8 | Moderate (jobs unit = 5 cases) |
| integrations (CEOITBox, Resend) | 2 / 271 | 3 | **Weak** — no contract tests vs provider |
| import (CSV master data) | 4 / 919 | 2 | **Weak** for size |
| pdf | 1 / 167 | 1 (3 cases) | Weak |
| page access (v1.8.0) | authorization/* 4 / 263 | 3 (`v180-rules`, `v180.int`, `v180.spec`) | Thin; new security-relevant feature |
| `server/ui` | 1 / 14 | 0 | Trivial |
| `features/*` overall (106 files) | 12.8k lines | ~5 importing tests | **UI components essentially only e2e-covered** |

Repositories with **no direct test import** (may be covered indirectly through services): `admin-users, approvers, consult, groups, import, lookups, organisation, preferences, settings, user-flags, user-settings, visibility` (visibility is exercised via search.int per KNOWN_ISSUES V6-D05).

---

### 4. Documentation and planning state

#### 4.1 Implementation status register
`docs/IMPLEMENTATION_STATUS_REGISTER.md` (generated by `scripts/docs/build-register.mjs` from `docs/requirements/UNIFIED_MASTER_PROMPT.md` + `docs/register/status.json`):
**1,857 requirements — 1,326 Implemented (71%), 465 Yet to do (25%), 66 Not feasible (4%).**
`docs/register/status.json` has 1,923 keys (1,326 / 531 / 66) — the extra 66 "Yet to do" come from 169 wildcard group keys such as `A3.1-*`, `A4.1-*` (section-level defaults), so the JSON count must not be read as a separate total.

Yet-to-do concentration by register section: Addendum A analytics (sections 5–6 KPI catalogue and analytics ~200 rows), reports/filters/exports (10–14, ~70), alerts (15, ~20), testing (22, ~37), FN functions 1–11 (~60), cross-functional/global acceptance (15–16, 23). Action column: 219 rows say just "Not built", 34 "Not yet assessed".

**Yet to do — themes (heuristic keyword clustering of 465 rows):**
| # | Theme | ≈Count | Examples |
|---|---|---:|---|
| 1 | Additional KPI cards per role | ~60 | A5.1-02 Draft Requests, A5.1-14/15 Due today / within 7 days, A5.2-13/14 Delegated to/by me, A5.4-04 Users by role |
| 2 | Advanced charts & visualisations | ~55 | A6.1-04 stacked trends, A6.1-09 hour heatmap, A6.3-09 box plot, A6.7-05 cohort, A6.7-08 Gantt |
| 3 | Reports, exports, scheduling, report metadata | ~50 | A10.2-05 My decision history, A4.3-12 scheduled reports ops, AExportrequi-03 filters+timestamp on export |
| 4 | Automation/ops reliability & monitoring | ~45 | M1.1-25 enterprise reliability, A6.6-02/03 failures/retries by category, FN11 recovery-button placement rows |
| 5 | Turnaround / SLA / aging / bottleneck analytics | ~45 | A6.3-04 stage duration, A6.3-08 longest-running, A7.6-09 age since hand-over, A3.2-03 due today/7 days |
| 6 | Governance: retention, legal hold, promotion, audit, SoD | ~30 | M4-09 change records, A3.4-12 retention/legal-hold reporting, FN9 promotion scope, FN10 retention |
| 7 | Alerts & notification analytics | ~25 | A4.1-09 my delivery status, A5.2-31 failed deliveries for my tasks, 15.1 alert catalogue |
| 8 | Filters, saved views, drill-down, comparisons | ~30 | ARequiredfil-* (17), ASavedviews-05, A9.1-04/06/07 FY and YoY comparisons, A9.2 org comparisons |
| 9 | Financial/budget value analytics | ~17 | A5.1-28/29 value submitted/approved, A6.5-01 requested vs approved, A6.5-11/12 threshold proximity |
| 10 | Test, performance & UI-state requirements | ~35 | A22.1–22.6 unit/API/e2e/perf/security tests, A18.5-02 avoid N+1, A19.2-01 loading states, A21 perf |
| — | Data-model gaps that block KPIs ("no X state") | (within above) | A5.1-21 / A5.3-33 no "requires amendment" state, consultations not counted (A5.2-12, A7.1-07), M4-15 feature flags |

**Not feasible (66) — themes (from `blocker` field):**
| Theme | Count | IDs (examples) |
|---|---:|---|
| No ERP/external business integration / no transaction amounts | ~34 | A6.5-15..17, A10.3-24, A3.4-07, A5.4-21/22, FN4-6.1-08, FN11-13.x, A22.2-14 |
| No APM / DB / storage / deployment / availability telemetry on GoDaddy | ~16 | A5.4-23..26, A6.6-20..22, A10.4-11/12/15/21, A3.4-08/15, A4.4-06 |
| Missing data attributes: plant/BU, cost centre, priority, capacity | ~11 | ARequiredfil-07/13, A9.2-07, A5.2-24, A6.4-12/13, FN4-6.1-03/04, FN5-7.1-16 |
| No analytics refresh pipeline (live queries only) | 3 | A15.1-18, A6.6-23, A18.3-07 |
| Not recorded: request due date, delay reasons, SLA exclusions, confirmed duplicates | 4 | A7.2-01, A6.3-17, A7.3-10, A5.3-30 |

#### 4.2 `PLAN-CHECKLIST.md` — 414 checked, 18 unchecked
- Feature carry-overs: U-09 (watchers, calendar, builder sections/preview, expiry, bulk reassign — mostly since delivered in v1.7.0 per register; item is stale), V160-08, V160-09 (route standardisation, perf, security review, full tests).
- Ops: L15-09 re-check `/admin/import` and `/superadmin/audit` for #418.
- Business data from owner: P0-31 staff master, P0-32 departments, P0-33 request-type list, P0-34 first-release templates/approvers.
- Templates to build: P3-40..P3-43 (HR/Admin/Recruitment, Finance Internal, Price Realisation, IT/Plant/ASP/Branding/Training/Sumit).
- Go-live: P1-38 / GL-05 rotate keys & remove dev access, GL-01 UAT per template, GL-04 backup/restore drill on live, GL-07 pilot, P8-04 switch off Asana forms.

#### 4.3 `docs/KNOWN_ISSUES.md` (header says v1.6.0) — open items
- V6-D01 P3 blank screen on most page loads (few loading states; 16 `loading.tsx` now exist, intentionally limited by D-113).
- V6-D02 P3 single root-level error boundary replaces the whole space (now 4 `error.tsx`: root + 3 spaces — may be partially resolved; not updated).
- V6-D03 P3 mark-all-read reloads page, no undo.
- V6-D04 P3 hex colours outside tokens.
- OPS-01 (P1 in the doc): live `/api/health` showed job runner NEVER. **Resolved on live:** `GET /api/health` on 16 Oct 2026 returned `jobRunner: OK`. The document needs updating (AUD-29).
- TD-01 dev-only `braces` advisories (Tailwind 3 / ESLint), TD-02 PDF uses Latin-1 Helvetica (no Unicode/₹ glyph risk).
- BD-1..BD-10 business decisions (BD-6, BD-7 deferred).

#### 4.4 `docs/GO_LIVE_READINESS_CHECKLIST.md` (header v1.6.0; uses tables, no checkboxes — 0 ticked)
All steps outstanding by design (owner/IT actions): 1.1 CI green on tag, 1.2 backup before publish, 1.3 read rollback levers, 1.4 feature-switch defaults; 2.1–2.3 publish & verify migrations; 3.1–3.3 fix cron secret (done on live: `/api/health` reports `jobRunner: OK` on 16 Oct 2026); 4.1–4.9 live smoke test; 5.1–5.6 owner decisions (retention durations, over-budget WARN/BLOCK, budgets, per-type amendments/duplicate checks, RTO/RPO, separate export permission S-03); 6 rollback. Verdict section states: no production-volume load test, no external pen test (S-01..S-07 in `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md`).
A second, older `docs/development/GO_LIVE_CHECKLIST.md` (v1.5.0) duplicates it.

#### 4.5 `DEVELOPMENT-MEMORY.md` — decisions that constrain future work (142 decisions, D-000..D-142)
- D-000 north star; D-001 one configurable engine (no per-department copies); D-013 no Asana data import.
- D-003/D-016/D-039 Super Admin-only configuration & backend visibility; D-012 / D-061 append-only audit log and comments (DB triggers).
- D-004 no self sign-up; D-005/D-006/D-025 per-user sign-in method, Google without OTP, password + **WhatsApp-only** OTP; D-032 no step-up OTP.
- **D-019 approvals are never granted from inside WhatsApp (or email) — link + sign-in required.**
- D-020 approver auth checked server-side against the signed-in user; D-057 three-layer record visibility; D-141 page access.
- D-008/D-052/D-110 central notify hub, email + WhatsApp + in-app, never throws.
- D-010/D-027/D-028 GoDaddy Node hosting + stack mirrors Power BI site (Next 15, React 19, Tailwind 3, zod, MySQL); D-029/D-036 CEOITBox shared number & quota; D-037/D-091 Resend; D-038 shared Firebase project.
- D-034/D-079 one app, one address `approval.arssteels.net`, role-based spaces; D-081/D-092 Cloudflare in front (CF-Connecting-IP only); D-102 origin lock.
- D-050 engine state JSON + `state_version` transaction lock; D-017 state model; D-055 form belongs to workflow version.
- D-058/D-094/D-130 cron-driven job runner, heartbeat; D-072/D-128 attachments & backups on `/private`.
- D-113 `loading.tsx` only on read-only list pages (Next 15.5 bug).
- D-124 feature switches ON/OFF/IT_ONLY; D-137 reports for IT only.
- D-018 no shared accounts; D-026/D-040/D-060 anyone can build custom approvals and pick anyone as approver (safety rules apply); D-078 same person may approve multiple levels.
- D-089 loader QA suite deliberately outside CI; D-105 tooling/advisories accepted.

---

### 5. Code size metrics
| Metric | Count |
|---|---:|
| TS/TSX files (app+features+server+lib+config+scripts+types) | 448 files, ~45,150 lines |
| Test TS files | 142 files, ~15,000 lines |
| Pages (`page.tsx`) | 74 |
| API route handlers (`route.ts`) | 25 |
| Server Action files (`"use server"`) | 29 |
| Repositories (`lib/db/repositories`) | 43 |
| SQL migrations | 30 (+3 seeds, 1 optional views file) |
| `loading.tsx` / `error.tsx` | 16 / 4 |

---

### 6. Maintainability

#### 6.1 Dependency / upgrade risks (latest on npm registry, 16 Oct 2026)
| Package | Pinned | Latest | Risk |
|---|---|---|---|
| next | 15.5.27 | 16.4.2 | Major behind. Project depends on 15.5-specific behaviour (D-113 loading/notFound workaround, `experimental.serverActions`, `middlewareClientMaxBodySize`, Playwright 1.63 pairing D-070). Next 16 migration (middleware→proxy rename, caching changes) is non-trivial; 15.x security backports will end. |
| react / react-dom | 19.1.0 | 19.3.1 | Minor; `@types/react` 19.0.2 lags runtime. |
| firebase (client) | 11.1.0 | 13.0.0 | Two majors behind; only used for Google popup sign-in. Client + admin both shipped; client SDK pulls Firestore/grpc transitively (hence the `@grpc/grpc-js` override) though only Auth is used. |
| firebase-admin | 14.5.0 | 14.5.0 | Current. |
| tailwindcss | 3.4.17 | 4.3.3 | Major behind; source of TD-01 `braces` advisories; v4 is a config rewrite. |
| zod | 3.24.1 | 4.6.7 | Major behind; used widely for validation. |
| typescript | 5.7.3 | 7.0.2 | Two majors; also listed under runtime `dependencies` (needed for GoDaddy build). |
| eslint | 9.39.5 | 10.12.0 | Major behind; eslint-config-next tied to Next 15. |
| lucide-react | 0.469.0 | 1.57.0 | Pre-1.0 pin; icon renames on upgrade. |
| tailwind-merge | 2.6.0 | 3.7.0 | Tied to Tailwind 4. |
| mysql2 / vitest / playwright | 3.24.3 / 5.0.3 / 1.63.0 | 3.24.6 / 5.0.5 / 1.64.1 | Patch-level only. |
The three `overrides` pin transitive packages for advisories; they must be revisited on every Next/Firebase bump or they can silently pin old versions.

#### 6.2 Dead-code candidates
- `features/ui/Menu.tsx` — not imported anywhere (scan of `@/` and relative imports).
- (`server/ui/` is a 14-line theme helper — `THEMES`, `parseTheme`, `themeAttribute` — and is referenced; not dead, just untested.)
- `server/demo/` (499 lines) + `/superadmin/demo` — demo-data loader (D-071) meant as interim until the staff list arrives; candidate for removal/feature-flag after go-live.
- `reference/` and the duplicate `storage/reference/` — historical planning docs inside the deployable repo.
- `docs/development/GO_LIVE_CHECKLIST.md` (v1.5.0) superseded by `docs/GO_LIVE_READINESS_CHECKLIST.md`.
- (`test-results/` and `tsconfig.tsbuildinfo` are in the working tree but confirmed git-ignored.)
- Unreferenced-file scan (heuristic: no `@/` or relative import found) covered `server/`, `lib/`, `features/`, `config/`, `types/`; the completed scan found only `features/ui/Menu.tsx`.

#### 6.3 TODO / FIXME / HACK
**None** in `app, features, server, lib, config, middleware.ts, scripts, tests, types`. Lint suppressions: 8 total — 5 `@next/next/no-img-element` (static SVG logos / private attachment stream; justified) and 3 `react-hooks/exhaustive-deps` (`features/admin/FormFieldsEditor.tsx:157`, `features/admin/WorkflowBuilder.tsx:107`, `features/requests/CustomApprovalForm.tsx:64`) worth reviewing. No `@ts-ignore`/`@ts-expect-error`.

#### 6.4 Other observations
- **Doc version drift:** `docs/DEPLOYMENT.md` says v1.4.0, `KNOWN_ISSUES.md` and `GO_LIVE_READINESS_CHECKLIST.md` say v1.6.0, app is v1.8.0 (`docs/RELEASE-NOTES.md` current). DEPLOYMENT B1 still says "35 tables / 15 migrations" (now 30 migrations).
- **Migrations on every boot** (`npm start`) is simple but means a bad migration takes the app down at start with no separate gate; rollback relies on manual DB restore.
- **Single-instance assumptions:** local-disk attachments, MySQL-based rate limiting and cron-over-HTTP job runner — fine for GoDaddy single node, blocks horizontal scaling.
- **Tests organised by release/session** rather than module; consider a module-oriented index or coverage thresholds in CI to track the weak areas in §3.3.
- **Former operational blocker, now resolved:** the docs still list OPS-01 (cron secret) as open, but the live health endpoint reports `jobRunner: OK` (16 Oct 2026).
