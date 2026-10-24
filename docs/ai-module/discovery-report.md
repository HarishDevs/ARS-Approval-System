# Phase 1: discovery report

**Project:** ARS Intelligence Platform (`ars-intelligence-platform`), the independent AI module.
**Date:** 24 Oct 2026.
**Method:** read-only inspection of the existing ARS Approval Platform repository, its architecture and audit documents, the local workstation and the public health endpoint. Nothing in the existing application, its database, its hosting or any business system was changed or connected to.

---

## 1. The existing application (read-only reference)

| Area | What exists today | Evidence |
|---|---|---|
| Location | `D:\Omniroute\ARS Approval System`, git repository `HarishDevs/ARS-Approval-System`, branch `main`. Latest tagged version v1.14.0 (commit `64457b8`); what is live depends on the owner's last Publish. | `package.json`, `git log` |
| Purpose | Multi-level approvals in any custom manner, plus Tasks and Information (v1.9.0), a calendar with Google Calendar sync (v1.11.0) and an Analytics Center (v1.12.0). | `DEVELOPMENT-MEMORY.md`, `FLOWS.md` |
| Framework | Next.js 15.5 App Router, React 19.1, TypeScript 5.7, Tailwind 3.4 with ARS design tokens. Server Components; Server Actions for every change; 25+ route handlers. No separate API server. | `application-audit/01_APPLICATION_ARCHITECTURE.md` |
| Package manager | npm, exact pins, `package-lock.json`. Node 22 in CI and on the host. | `package.json`, `.nvmrc` |
| Routing | Three role spaces: `/users` (everyone), `/admin` (IT Admin), `/superadmin` (Super Admin), plus public pages (`/login`, `/signed-out`, `/privacy`, `/terms`). | `app/` |
| Database | MySQL 8 through `mysql2`, raw parameterised SQL in about 45 repositories, no ORM. Additive SQL migrations run on every start. About 70 tables. | `database/migrations`, `lib/db/repositories` |
| Authentication | (a) Google through Firebase Authentication. The project is `power-bi-dashboard-3b29f`, shared with the Power BI site; there is no OTP. (b) User ID + password (scrypt) + a WhatsApp OTP through CEOITBox. Sessions use an HMAC-signed cookie plus a database session row checked on every request. Everyone is signed out after 30 minutes without activity. | `server/auth/*`, `lib/session/*`, D-025, D-158 |
| User schema | `users` (login_id, name, email, whatsapp_number, department, designation, reporting manager, sign_in_method GOOGLE/PASSWORD, firebase_uid, password hash, lock fields, active, break-glass) + `user_roles` → `roles`. | migration `202609281201_create_users_and_roles.sql` |
| Roles | `USER` (everyone), `IT_ADMIN` (/admin), `SUPER_ADMIN` (/superadmin), `EXPORTER` ("Can export"). Only admins create users; users are deactivated, never deleted. | `database/seeds/001_roles.sql`, `types/auth.ts` |
| Permission checks | Layer 1: middleware checks only that a session cookie is present. Layer 2: `requireArea` / `requireApiArea` role guards in every layout, page, action and route. Layer 3: a per-record visibility SQL rule. Plus **page access**: Full, View or Hidden per page, by person, department or everyone, keyed on an HMAC-signed request path. | `server/authorization/*`, `middleware.ts` |
| Module concept | **There is no per-user module permission.** Approval, Task and Information are groups in the user sidebar; whether someone sees a page is decided by role and page-access rules, not by a module grant. | `features/shell/AppShell.tsx`, `server/authorization/pages.ts` |
| Sidebar | Collapsible groups (`SideNav` with `collapsible`): Overview → **My Approvals ▾ / Tasks ▾ / Information ▾** → Search, Calendar, Analytics. Each group has an icon and a chevron; the open or closed state is remembered in `localStorage` (`ars.nav.groups`); the group holding the current page opens by itself. Width `w-sidebar`, ARS tokens. | `features/shell/SideNav.tsx`, `features/shell/nav-icons.tsx` |
| User management | `/admin/users` (list, search, status filter), `/admin/users/new`, `/admin/users/[id]` (form, status, account actions: Re-invite, Reset password, Unlock, Sign out everywhere, Deactivate; handover; delegations). Rules: only the Super Admin changes Super Admins and the break-glass account; nobody removes their own admin role or deactivates themselves; every change is audited. | `app/admin/users/*`, `server/admin/user-rules.ts` |
| Audit | Append-only `audit_logs` (actor, action, entity, metadata JSON, IP, session). | `lib/db/repositories/audit.repository.ts` |
| Jobs | No worker. cPanel cron calls `POST /api/jobs/run` every 5 minutes with a secret header. | `server/ops/automation.ts` |
| Hosting | **GoDaddy Node.js Hosting** (the "Deploy your Node.js app" product; preview addresses on `*.airoapp.ai`), built from GitHub `main` with `npm run build`, started with `npm start`. Hosted MySQL provisioned with the app. Private Storage at `/private` (the container is otherwise wiped on redeploy). Behind **Cloudflare** (DNS, TLS, origin-lock header). Publishing is manual by the owner. | `docs/DEPLOYMENT.md` Parts B–E |
| Reporting access already designed | `database/optional/reporting_views.sql`: two read-only views (`reporting_requests`, `reporting_tasks`), meant for a MySQL user with SELECT on those views only (for Power BI). Optional and run by hand. | that file |
| Power BI | A separate Next.js project, `D:\PBI New\ars-steels-bi` ("ARS Steels BI"), shares the Firebase project and the CEOITBox WhatsApp account. It is reference only, and its `.env.local` was **not** opened. | directory listing, project rules |
| Brand assets | `D:\Omniroute\assets` (tokens, icons, logo, screens), used by both ARS apps. | `assets/README.md` |
| Live health | `https://approval.arssteels.net/api/health` returned `status: ok`, database, job runner and storage all OK (checked 20 Oct 2026). | read-only GET |

## 2. The workstation (for development)

| Tool | Version | Use |
|---|---|---|
| Node.js / npm | 24.18 / 11.17 | Web app |
| Python | 3.14.6 | AI engine (FastAPI). The engine targets Python 3.12+ |
| uv | 0.12.6 | Python packages and lockfile |
| Docker Desktop | 29.6 | Local PostgreSQL; the existing app's MySQL containers are left alone |
| Ollama | installed, **not running** | Local model path. It has to be started and models pulled before the local model can be measured |
| git / gh | 2.54 / 2.96 | Separate repository |
| psql, mysql clients | not installed | Not needed; database work runs through containers and code |

## 3. Proposed integration boundaries

```
                         (unchanged)                                  (new, independent)
 approval.arssteels.net ─────────────┐            intelligence.arssteels.net (proposed, needs DNS approval)
 Next.js on GoDaddy Node.js Hosting  │            Web: Next.js (AI module UI + user/module management)
 MySQL (GoDaddy hosted)              │                    │ HTTPS + service token + signed user context
                                     │                    ▼
                                     │            AI engine: Python FastAPI (orchestration, tools, routing,
                                     │                       connectors, proposals, audit)
                                     │                    │                 │
                                     │                    ▼                 ▼
                                     │            PostgreSQL (AI metadata)  Ollama (internal only) / approved hosted model
                                     │
 Optional, later, approved only: ────┘  read-only MySQL user with SELECT on reporting views (no writes, no raw tables)
 Salesforce (OAuth 2.0 integration user, read-only)      Oracle ERP (read-only reporting views, outbound from the internal network)
```

**Rules that keep the two apps apart:**

1. **No shared code at runtime.** The new app has its own repository, dependencies, lockfiles, build, tests and releases. Design tokens and icons are **copied** from the asset pack, not imported from the old app.
2. **No shared database.** The AI platform has its own PostgreSQL. It never writes to the approval MySQL. Reading Approval, Task or Information data later is limited to the existing read-only reporting-view pattern, with its own MySQL user, and only after the owner approves it.
3. **No shared secrets or cookies.** The new app never uses the old app's `SESSION_SECRET`, `ENCRYPTION_KEY`, session cookie, job secret or provider keys. It has its own.
4. **Identity:** the new app does **not** read the old app's sessions. See decision Q-AI-02 for the options. Until an identity provider is approved, development uses a local-only test sign-in that refuses to start in production.
5. **Failure isolation:** if the AI platform is down, `approval.arssteels.net` is unaffected, because nothing in it calls the AI platform. If the old app is down, the AI platform still runs; only the optional approval-data connector shows as stale.

## 4. What can be reused without copying secrets or creating a dependency

| Reuse | How | Safe because |
|---|---|---|
| ARS design tokens, logo, icons, sidebar look | Copy tokens and assets into the new repo; re-implement `SideNav`'s collapsible-group pattern | Brand files, no secrets |
| Patterns: zod validation, parameterised SQL, guards in every route, append-only audit, page-level authorization tests, CSP nonce, `Sec-Fetch-Site` CSRF check, no-store caching, relative redirects behind proxies (D-165), build-id reload notice (D-164) | Re-implemented in the new codebase | Lessons, not code links |
| Google sign-in | Only if the owner approves (Q-AI-02): add the new domain to an approved Google / Firebase OAuth client | The public client config is not secret; the new app gets its own server credentials |
| Approval / Task / Information facts for the AI | Read-only reporting views via a dedicated SELECT-only MySQL user (existing design, `reporting_views.sql`), after approval | Read-only, no raw tables, no writes |
| Deployment experience on GoDaddy Node.js Hosting | Same pattern for the **web** part only: a separate app on a separate subdomain | Separate app, own env vars |

## 5. Hosting findings

- GoDaddy **Node.js Hosting** runs Node.js apps, with a version picker, a build command and a start command. Nothing in the existing set-up shows a Python runtime, a long-running background service or a GPU. **Python/FastAPI and Ollama should be assumed not to run there** until GoDaddy confirms otherwise. *Owner to verify (Q-AI-01).*
- So the likely pattern is: **web on GoDaddy Node.js Hosting (separate app, `intelligence.arssteels.net`); AI engine + PostgreSQL + Ollama on a separate host** (an internal server, or a cloud VM). The engine is reached over authenticated HTTPS, through Cloudflare or a private tunnel, and Ollama is never exposed publicly.
- Cloudflare already fronts `arssteels.net`, so a new subdomain and an origin lock (like the old app's `ORIGIN_SECRET`) are straightforward.

## 6. Decisions needed from the owner

> **Answered 24 Oct 2026 (owner):** API-based models only (no Ollama, no Python host); **one application** (AI is the fourth module inside ARS Approvals, same sign-in and database); **the same repository** (branch `feature/ai-module`); providers **Claude, ChatGPT, Grok and DeepSeek**, switchable. The single-app decision makes §3's two-app boundary and the separate-identity questions (Q-AI-01, Q-AI-02, Q-AI-03) moot; see `architecture.md` §1. Q-AI-05 (Salesforce, Oracle access) and Q-AI-06 (resolved: same database, read through scoped repository functions) remain as noted there.


| ID | Question | Why it matters | Default until answered |
|---|---|---|---|
| Q-AI-01 | Where will the AI engine (Python + PostgreSQL + Ollama) run: an internal ARS server, a cloud VM, or another approved host? What CPU, RAM and GPU does it have? | Ollama needs a continuously running service with plenty of memory; GoDaddy Node.js Hosting is not suitable | Develop and test locally with Docker; write hosting docs for both options |
| Q-AI-02 | How should people sign in to the new app? (a) Google, through a new OAuth client for `intelligence.arssteels.net` (recommended); (b) the same Firebase project as the approval app (shared identity provider); (c) Microsoft Entra ID or another company SSO with MFA | The prompt prefers an approved shared identity provider; sessions and cookies must not be shared | Local-only development sign-in, disabled in production |
| Q-AI-03 | May I create a new **private** GitHub repository `HarishDevs/ars-intelligence-platform` and push to it? | Publishing to GitHub is outward-facing | Local git repository only |
| Q-AI-04 | Which hosted AI provider, if any, is approved, and for which data classes? | No confidential data may go to an unapproved external model | Local model only; hosted adapter built but disabled |
| Q-AI-05 | Salesforce and Oracle: who provides the integration user / reporting account, and in which sandbox should connectors be tested first? | Connectors must not touch production with guessed credentials | Connector framework with a fake source for tests; no live connection |
| Q-AI-06 | Should the AI read Approval, Task and Information data through the read-only reporting views (a new SELECT-only MySQL user)? | It is the only way to use that data without changing the old app | Not connected |
