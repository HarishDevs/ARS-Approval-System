# ARS Approval Platform — Development Memory

> **Mandatory living file.** Read it at the start of every work session and update it at the end.
> Never delete history. Add to the log newest-first; change a decision only by adding a new decision that supersedes it.
> Companion files, which must always be kept in step:
> - [PLAN-CHECKLIST.md](PLAN-CHECKLIST.md): every task, planned before it is done, ticked when complete
> - [FLOWS.md](FLOWS.md): every flow (reference Asana flows and new-platform flows)

---

## ★ North star (never lose this)

**The main purpose of the platform is multi-level approvals, configured in any custom manner.**
- Any number of levels, in any order or combination: sequential, parallel, any-one, any-N-of-M, conditional, and hybrids of these. The approver at each level can come from any source (a person, a role, the HOD, the reporting manager, a group, a form field). Levels can be skipped or added by conditions such as amount or type.
- Every design, build and review decision is judged first against this. If a feature makes flexible multi-level approval harder, it waits.
- The engine is the product; the workflow designer is only the screen for building workflows (base plan §44). Data model = nodes + connections + rules + actors, **never fixed "Level 1…Level 4" columns** (base plan §40).

---

## 1. Project snapshot

| Item | Value |
|---|---|
| Product | ARS Approval Platform: one configurable approval engine replacing the Asana approval projects |
| Company | ARS Steels & Alloy International Pvt Ltd |
| Build team | Project owner (ARS IT, itadmin@arssteels.co.in) + Claude (AI pair developer) |
| Admin Portal (Super Admin) login | `itadmin@arssteels.co.in`, operated by the developers |
| Current stage | **v1.0.0 prepared for production (8 Oct 2026).** Feature-complete; QA defects fixed; CI green on Node 22 (checks, integration, e2e). Next: go-live on GoDaddy with the owner (docs/DEPLOYMENT.md) |
| Address | **`approvals.arssteels.net`** (single app; role routes `/users`, `/admin`, `/superadmin`, D-034) |
| Repository | **https://github.com/HarishDevs/ARS-Approval-System** (private, `main`, D-035). Local root: `D:\Omniroute\ARS Approval System` |
| Last updated | 8 Oct 2026 (build session 7) |

## 2. Key files and links

| What | Where |
|---|---|
| Build plan (shareable page, v3) | https://claude.ai/artifact/9CWKEhnnDE1TTKowzgL4Ud (local copies: `reference/platform-plan-v1.html`, `-v2.html`, `-v3.html`) |
| Reference implementation (read-only) | `D:\PBI New` (ARS Power BI website). See §9 |
| Working rules for every session | `D:\Omniroute\CLAUDE.md` |
| Asana approval audit (shareable page) | https://claude.ai/artifact/CshLTbUecmdfgFkcG5re2g (local copy: `reference/asana-approval-audit.html`) |
| Asana rule notes (868 rules) | `reference/asana-rules-notes.md` |
| Earlier write-up (target-state vision; some facts out of date) | `reference/earlier-writeup-current-system.txt` |
| Base development plan (45 points, shared by owner 28 Sep) | Captured in PLAN-CHECKLIST.md §Coverage map; full text is in the plan page |
| Design assets (brand tokens, logos, icons, login screens) | `D:\Omniroute\assets` (tokens.json / tokens.css / tailwind.preset.js) |
| Figma reference file | `mfSBf0vugMktmwIJLYN6aD` (Starter plan, max 3 pages) |
| Multi-level engine (north star) | `server/engine/` (types, conditions, validate, engine, simulate); tests in `tests/engine/` |
| Sign-in services | `server/auth/` (google-sign-in, password-sign-in, complete-sign-in, session, sign-in-rules) |
| Area access rules | `server/authorization/policy.ts` + `guards.ts`, `middleware.ts` |
| Notification hub | `server/notifications/notify.ts`; adapters in `server/integrations/ceoitbox` and `resend` |
| Approvals persistence | `server/approvals/service.ts` (submit, decide, hold, resume, resubmit, workflows/versions), `server/approvals/messages.ts`, `lib/db/repositories/approvals.repository.ts`, `directory.repository.ts`; integration tests in `tests/integration/` (`npm run test:integration`) |
| End-to-end tests | `npm run test:e2e` (Playwright): builds the app, recreates `ars_approvals_test`, seeds E2E_* people, signs them in with test cookies; specs in `tests/e2e/` |
| Insights and calendar | `/admin/insights` (`insights.repository.ts`), `/admin/calendar` (`calendar.repository.ts`, `server/workflows/calendar.ts`) |
| Demo data | `server/demo/demo-data.ts` (people, groups, the 12 approval types), `server/demo/service.ts` (load, retire, Try as), `/superadmin/demo` |
| CEOITBox API reference | `docs/CEOITBOX-API.md` (summary of the owner's CEOITBOX_API_Master_Documentation.docx and Integration Guide, 8 Oct 2026; the .docx files stay outside the repo); client `server/integrations/ceoitbox/client.ts` |
| Template creator | `server/notifications/template-authoring.ts` (rules), `server/notifications/template-registry.ts` (save, submit, sync, test), `/superadmin/templates` and `/superadmin/templates/[code]` |
| DoA matrix | `server/workflows/builder.ts` (DOA stage, `doaSkipCondition`, `checkDoaForm`), `features/admin/WorkflowBuilder.tsx` (DoaEditor) |
| Notification templates | `server/notifications/templates.ts` (catalogue; generates `docs/NOTIFICATION-TEMPLATES.md` via `node scripts/dev/write-templates-doc.mjs`), `/superadmin/templates` |
| Attachments | `server/attachments/files.ts` (rules), `server/attachments/service.ts`, `/api/attachments/[id]`, env `UPLOAD_DIR` |
| DoA example | `docs/DOA-EXAMPLE.md` |
| Deployment guide | `docs/DEPLOYMENT.md` (GoDaddy Node.JS Hosting from GitHub, env vars, DB privilege check, migrations, cron, Firebase domain, provider keys, break-glass, go-live checks); `scripts/database/check-privileges.js` |
| Collaboration | custom approvals `/users/custom` (`submitCustomRequest`), comments, out-of-office `/users/delegation`, inbox `/users/notifications`; services `server/approvals/collab.ts`; data `lib/db/repositories/collab.repository.ts`; SLA job `server/jobs/sla.ts`; DoA view `/admin/doa` (`server/workflows/doa.ts`) |
| Request screens | `/users` (home, `queue`, `requests`, `requests/[id]`, `new`, `new/[workflowId]`); actions in `app/users/actions.ts`; view + access check in `server/approvals/view.ts`; level map `step-map.ts`; timeline wording `timeline.ts` |
| Workflow builder | `/admin/workflows` (list, new, `[id]` with versions, test mode, publish); compiler `server/workflows/builder.ts`; form fields `server/forms/fields.ts`; UI `features/admin/WorkflowBuilder.tsx` |
| Job runner and rate limits | `app/api/jobs/run` (cron), `server/jobs/retry-deliveries.ts`, `server/auth/rate-limit.ts`, `lib/db/repositories/jobs.repository.ts` |
| Admin screens | `/admin/users`, `/admin/users/[id]`, `/admin/organisation`; services in `server/admin/` (rules in `user-rules.ts`) |
| Super Admin screens | `/superadmin/settings` (providers, security, test send), `/superadmin/deliveries`, `/superadmin/audit` |
| Password flows | `server/auth/set-password.ts` (set link, forgot), shared WhatsApp code steps in `server/auth/otp-flow.ts`; pages `/set-password`, `/forgot-password` |
| Console scripts | `scripts/admin/break-glass.js` (hosting console only); `scripts/dev/dev-session.js` (LOCAL ONLY: session for screen checks) |
| CI | `.github/workflows/ci.yml` (lint, typecheck, unit, build; MySQL integration job) |
| Database | `database/migrations/`, `database/seeds/`, scripts in `scripts/database/`; local `docker-compose.yml` |
| Local dev server (Claude preview) | `D:\Omniroute\.claude\launch.json` runs `next dev` for the project folder on port 3000 (npm scripts break on the space in the path there) |

## 3. Decisions register

| ID | Date | Decision | Source |
|---|---|---|---|
| D-000 | 28 Sep 2026 | **North star: multi-level approvals in any custom manner.** Everything else serves this (see ★ above) | Owner |
| D-001 | 28 Sep 2026 | Build **one configurable approval engine**, not a copy of the 104 Asana projects. Approval definitions replace department × approver projects | Base plan §2 |
| D-002 | 28 Sep 2026 | The owner's 45-point development plan is the **foundation**. Changes are only those listed in this register | Owner |
| D-003 | 28 Sep 2026 | **Super Admin = the Admin Portal**, a separate app handled by the developers. Login `itadmin@arssteels.co.in`. Only this account can configure anything (approval types, forms, workflows, DoA, users, roles, data rights, notifications, providers, security, integrations) | Owner |
| D-004 | 28 Sep 2026 | **Only users created in the Admin Portal can sign in. Any email address/domain is allowed** (no domain restriction); no self sign-up | Owner (answer 1) |
| D-005 | 28 Sep 2026 | **Sign-in method is set per user**: Google, or User ID + password + OTP. Some staff use password + OTP only | Owner (answer 1) |
| D-006 | 28 Sep 2026 | **Google sign-in needs no OTP. User ID + password always needs an OTP**, sent to the user's **mobile (SMS) and WhatsApp** (see Q-003) | Owner (answer 2) |
| D-007 | 28 Sep 2026 | **New-login detection:** an unrecognised device or location triggers an alert to the user on email and WhatsApp, with a "This wasn't me" action | Owner |
| D-008 | 28 Sep 2026 | **Every notification goes on email and WhatsApp** (plus in-app). Each event is sent once, from a central notification hub | Owner |
| D-009 | 28 Sep 2026 | **WhatsApp provider: CEOITBox**, the same provider used for the ARS Power BI website | Owner (answer 3) |
| D-010 | 28 Sep 2026 | **Hosting: GoDaddy**, the same as the Power BI website. The stack must fit the GoDaddy plan in use (see Q-001) | Owner (answer 4) |
| D-011 | 28 Sep 2026 | **Break-glass admin account:** a sealed second admin account, disabled by default, that can only be enabled from the hosting console. Credentials are kept sealed (proposed holder: MD) | Owner accepted recommendation (answer 5) |
| D-012 | 28 Sep 2026 | **The audit log is append-only for everyone, including the Super Admin** (view and export only). Corrections create new versions and never overwrite | Owner accepted recommendation (answer 5) |
| D-013 | 28 Sep 2026 | **No Asana data import.** Asana approvals are used only as a flow reference. Removed: Asana import module and history migration | Owner (answer 7) |
| D-014 | 28 Sep 2026 | **Build team = the owner + Claude**, coding in this repository phase by phase | Owner (answer 8) |
| D-015 | 28 Sep 2026 | **Three mandatory living files:** DEVELOPMENT-MEMORY.md, PLAN-CHECKLIST.md and FLOWS.md. Never omit them; update them every session; cover every point | Owner (answer 8) |
| D-016 | 28 Sep 2026 | **No backend visibility for anyone but the Super Admin:** separate admin build, server-side permission checks, no public API docs, generic errors, no provider names shown, masked secrets, all provider accounts owned by itadmin@ | Owner |
| D-017 | 28 Sep 2026 | **One state model:** Draft → Submitted → Pending → Approved / Rejected / Changes Required → Resubmitted, plus **On Hold** (paused, stays open) and Reopened. One permanent Approval ID with versions | Base plan §12–15 + audit |
| D-018 | 28 Sep 2026 | **No shared accounts.** The MD gets an individual login; an assistant acts through delegation, recorded as "on behalf of" | Audit finding |
| D-019 | 28 Sep 2026 | **Approvals are never granted from inside a WhatsApp chat.** Messages carry a secure link, and the user signs in before acting. Off-system approvals are recorded with evidence | Audit + security |
| D-020 | 28 Sep 2026 | **Approver authorisation is checked on the server against the signed-in user**, never the assignee | Base plan §16 + audit defect |
| D-021 | 28 Sep 2026 | **First-release templates:** MD, ED, Finance, Valarmadhi, SCM (single approver). These cover ~94% of historical volume | Audit volumes |
| D-022 | 28 Sep 2026 | **Design system:** ARS asset pack tokens (primary #005398, accent red #ED1C25, Inter), 34-icon set, login screens reused | Existing assets |
| D-023 | 28 Sep 2026 | **Architecture:** modular monolith with two front-ends (user app, Admin Portal), one API, and background workers. The exact stack is fixed once Q-001 is answered | Base plan §38 |
| D-024 | 28 Sep 2026 | **The Admin Portal is one dedicated portal for the IT team, at `admin.arssteels.net`, used to create the predefined ("defined") approvals.** `itadmin@arssteels.co.in` is the Super Admin with every right. Other IT-team members get Admin Portal access only through roles the Super Admin assigns (see Q-011). *Refines D-003.* | Owner (answers 4, 5) |
| D-025 | 28 Sep 2026 | **OTP for User ID + password sign-in is sent on WhatsApp only** (no SMS, no email OTP). *Supersedes the channel part of D-006.* Google sign-in still needs no OTP | Owner (answer 3) |
| D-026 | 28 Sep 2026 | **Every user can create custom approvals whenever needed.** Built-in safety rules always apply: approvers must be active users, no self-approval, and the graph is validated before submission (see Q-012) | Owner (answer 4) |
| D-027 | 28 Sep 2026 | **Hosting: GoDaddy cPanel with Node.js available.** Target GoDaddy's "Node.JS Hosting" product (Node 22, deploy from GitHub or zip), as documented for the Power BI website, with cPanel MySQL and cPanel Cron Jobs. *Resolves Q-001.* | Owner (answer 1) + `D:\PBI New\Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md` |
| D-028 | 28 Sep 2026 | **Stack mirrors the Power BI website (proven on the same GoDaddy account):** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 3 + zod; MySQL 8 via `mysql2` with SQL migration files; Firebase Auth for Google sign-in (server-verified ID token); custom HMAC-signed session cookie; AES-256-GCM encrypted settings table for provider credentials; Vitest + Playwright. **Two Next.js apps in one repo** (npm workspaces): `apps/web` (users) and `apps/admin` (Admin Portal), sharing `packages/core` (engine, data access, notifications), so admin code is never shipped to users (D-016). Background work (SLA timers, escalation, notification retries) runs through a DB-backed job table triggered by cPanel cron | Derived from D-027 + PBI reference |
| D-029 | 28 Sep 2026 | **CEOITBox integration follows the Power BI website's adapter:** API-key auth (`x-api-key`), `POST {baseUrl}/api/v1/whatsapp/sendMessage` with `{templateName, language, to, templateVariables}` → `{id, waMessageId}`; base URL `https://official.ceoitbox.com`; ARS's single connected number (+91 7305904440, Phone ID 1057554220785929). Only Meta-approved templates are sent. The OTP template uses Meta's Authentication category. Credentials are entered in the Admin Portal's encrypted settings and are **never** put in the repo or env files. *Resolves Q-002.* | `D:\PBI New\Completed Documentation\WhatsApp\CEOITBOX_ADAPTER.md`, `Authentication\WHATSAPP_OTP.md` |
| D-030 | 28 Sep 2026 | **Email sender: `itadmin@arssteels.co.in`** (transport: see Q-005) | Owner (answer 5) |
| D-031 | 28 Sep 2026 | **Admin Portal address: `admin.arssteels.net`** | Owner (answer 5) |
| D-032 | 28 Sep 2026 | **No step-up OTP for sensitive admin actions.** *Closes Q-008.* | Owner (answer 6) |
| D-034 | 28 Sep 2026 | **One app only (like the Power BI app), at one address: `approvals.arssteels.net`.** Areas are separated by role-based routes: `/users` (everyone: requests, custom approvals, my approvals), `/admin` (IT team: predefined approvals, forms, workflows, DoA, users, roles), `/superadmin` (Super Admin only: providers, security, integrations, system health, audit export, break-glass). *Supersedes the two-app part of D-028 and the address in D-031 (admin.arssteels.net dropped).* Protection is enforced on the server in middleware and in every route handler and server action. Admin pages are built mainly as server components. No secrets, config or provider data are ever sent to the browser (keeps D-016) | Owner |
| D-035 | 28 Sep 2026 | **GitHub repository `HarishDevs/ARS-Approval-System` (private, branch `main`) holds all project activity.** Repo root = `D:\Omniroute\ARS Approval System`. The living files, reference docs and code all live there. Commit and push after every work session. Never commit secrets (`.env*` is git-ignored) | Owner |
| D-036 | 28 Sep 2026 | **CEOITBox: same WhatsApp number and API key as the Power BI website.** The daily limit (Tier 100K) is shared. OTP reuses the Power BI site's approved Authentication template (`wa_login_otp_v1`; confirm). **The owner will provide the notification templates.** *Resolves Q-002.* | Owner (answer 2) |
| D-037 | 28 Sep 2026 | **Email is sent through Resend** (HTTP API, as on the Power BI website) from `itadmin@arssteels.co.in`. The domain must be verified in Resend. *Resolves Q-005.* | Owner (answer 3) |
| D-038 | 28 Sep 2026 | **Reuse the Power BI website's Firebase project** (`power-bi-dashboard-3b29f`) for Google sign-in. Add `approvals.arssteels.net` (and localhost for development) to its authorised domains. *Resolves Q-007.* | Owner (answer 4) |
| D-039 | 28 Sep 2026 | **IT-team admins (`/admin`) create predefined approvals. Provider keys, security settings, integrations, system health and audit export stay Super Admin only (`/superadmin`).** *Resolves Q-011.* | Owner (answer 5) |
| D-040 | 28 Sep 2026 | **Custom approvals: anyone can pick anyone as an approver**, including ED and MD, with no exclusion list. The engine's safety rules still apply: approvers must be active users, and nobody approves their own request. *Resolves Q-012.* | Owner (answer 6) |
| D-041 | 28 Sep 2026 | **Approval authority (DoA owner) = `itadmin@arssteels.co.in`**, who also holds the admin login and the break-glass account. *Resolves Q-009 and the owner part of Q-004.* Risk accepted: keep the break-glass recovery credentials sealed offline, separate from the daily login | Owner (answer 7) |
| D-042 | 28 Sep 2026 | **Owner confirmed both assumptions:** (1) the login OTP reuses the Power BI site's Meta-approved `wa_login_otp_v1` template; (2) break-glass recovery credentials stay with itadmin@, sealed offline and separate from the daily login (risk accepted) | Owner |
| D-043 | 28 Sep 2026 | **Build choices for Phase 0/1 (session 1):** passwords hashed with Node's built-in `scrypt` (no native module, so the GoDaddy build can't fail on it; replaces the Argon2id idea in P1-11); sessions are HMAC-signed cookies **backed by a `user_sessions` table**, so "sign out everywhere" and "This wasn't me" can revoke them; the device is identified by a signed `ars_device` cookie; roles live in `user_roles` (SUPER_ADMIN, IT_ADMIN, USER), and a user may hold several; local MySQL runs in Docker on **port 3307** so it can't clash with the Power BI site's container on 3306; the approval engine is a pure TypeScript module (`server/engine`), unit-tested without a database, with persistence added next | Claude, following D-028 |
| D-044 | 28 Sep 2026 | **SQL rule: in a MySQL `UPDATE`, a column that depends on another column's old value must be assigned before that column** (MySQL applies `SET` assignments left to right). Found when the lockout locked on the 4th wrong password and skipped the lock alert; fixed in `recordFailedPassword`. Along with "do time maths in SQL", this is now a standing rule for every repository | Claude (bug found in smoke test) |
| D-045 | 28 Sep 2026 | **A blank environment value means "not set".** Optional env vars (Firebase Admin, APP_BASE_URL, JOB_RUNNER_SECRET) are optional because GoDaddy's editor may leave a key with an empty value; a blank must never crash the app | Claude (bug found in smoke test) |
| D-046 | 28 Sep 2026 | **The build never depends on the working directory.** PostCSS points Tailwind at `tailwind.config.ts` by absolute path, and Tailwind content paths are relative to the config file, because cPanel may start the app from another folder | Claude (bug found in preview) |
| D-047 | 30 Sep 2026 | **Rules for managing users.**<br>• IT Admins and the Super Admin manage users.<br>• **Only a Super Admin** can grant or remove SUPER_ADMIN, or change a Super Admin or the break-glass account.<br>• Nobody can deactivate themselves or remove their own admin role.<br>• The last active Super Admin can't be deactivated or demoted.<br>Pure rules in `server/admin/user-rules.ts`, checked on the server for every write. Verified in the browser against a tampered form (an injected SUPER_ADMIN role was refused). | Claude, following D-033/D-039 |
| D-048 | 30 Sep 2026 | **Admin changes use Server Actions.**<br>• Each action re-checks the area on the server and answers "Not found." when access is refused.<br>• Next.js compares Origin and Host on every action, which blocks cross-site requests.<br>• Forms submit through `useActionForm` (onSubmit + startTransition), not `<form action>`, because React 19 clears action forms after every submit and wiped the admin's typing on validation errors. | Claude (bug found in the browser) |
| D-049 | 30 Sep 2026 | **Set-password links and forgot password.**<br>• **Links:** single-use, stored only as a keyed hash, valid 72 hours, and a newer link replaces older ones. Sent by email to the user only; the admin never sees the link. Opening it (GET) never uses it up, so chat link previews can't burn it.<br>• **Both flows** end with a WhatsApp code to the number on file, set the password, end every other session, alert the user, and sign them in.<br>• **Forgot password** gives the same answer, in the same time, whether or not the User ID exists: the code is sent after the response, and wrong, unknown and expired codes share one message.<br>• A security lock ("This wasn't me") can only be cleared by an admin; a reset clears only a wrong-password lock. | Claude, following P1-13/P1-14 |
| D-050 | 30 Sep 2026 | **How approvals are saved.**<br>• Each request stores the engine state as JSON with a `state_version`. Every action runs one transaction: lock the row (`SELECT … FOR UPDATE`), load a fresh directory snapshot, make the pure engine call, save with a version check, sync the task table (for queues), append to `approval_events`. Notifications go only after the commit.<br>• A request stays bound to the **published version** it was submitted against. At most one version per workflow is published (a unique generated column).<br>• Request numbers are `PREFIX-YYYY-000001`, from a locked sequence row.<br>• The break-glass account is never an approver. Delegation returns false until delegation records exist (P4). | Claude (north star) |
| D-051 | 30 Sep 2026 | **Content-Security-Policy:**<br>• A fresh nonce per request, set in the middleware. Scripts need that nonce plus `'strict-dynamic'`; there is no `unsafe-inline` for scripts, and `unsafe-eval` only in dev.<br>• Frames only from the Firebase auth domain and accounts.google.com, and nobody may frame the app.<br>• Every page renders per request (the root layout is `force-dynamic`).<br>Verified: pages hydrate, server actions work, the Firebase frame loads, and there are no CSP violations. | Claude |
| D-052 | 30 Sep 2026 | **`notify()` returns a summary** of what happened on each channel (it still never throws). Sending and recording fail separately, so a message that was sent is never retried as FAILED, which would send it twice. | Claude (bug found in review) |
| D-053 | 30 Sep 2026 | **Testing:**<br>• Integration tests run on a throw-away `ars_approvals_test` database, recreated with the real migrations and seeds on every run; CI uses a MySQL service container.<br>• Local screen checks use `scripts/dev/dev-session.js`. It refuses production and non-local databases, is audited as DEV_SESSION_CREATED, and adds nothing an attacker with the database and SESSION_SECRET couldn't already do. | Claude |
| D-054 | 30 Sep 2026 | **The break-glass account is managed only by `scripts/admin/break-glass.js` in the hosting console.**<br>• It is created disabled, with all roles.<br>• The password is typed with hidden input, and must be at least 14 characters with letters and numbers.<br>• `enable` opens a window of at most 240 minutes; `disable` ends the window and all sessions.<br>• Every command is audited, with the OS user and host. | Claude, following D-011/D-041/D-042 |
| D-055 | 30 Sep 2026 | **The request form belongs to the workflow version.**<br>• Fields are text, long text, number (Indian grouping accepted), date, choice and person, each optional or required.<br>• Every submission is checked on the server against the version it was raised on, so a running request keeps its fields.<br>• The validator uses the form's field keys, so a condition or a person-from-field approver that names a missing field blocks publishing. | Claude, following F-11 |
| D-056 | 30 Sep 2026 | **The workflow builder works in levels.**<br>• A level is one step, or several steps in parallel joined by all / any one / any N.<br>• A step has any approver source, all / any one / any N, an optional "skip this step when…", and a policy for when nobody can approve (stop and tell IT, or skip).<br>• It compiles to the engine graph (START → steps / SPLIT…JOIN → END). The builder's own description is saved with the version so it can be edited again.<br>• Branching paths with CONDITION nodes are supported by the engine and will come with the drag-and-drop designer (P3-01). Skip conditions already cover amount bands (DoA). | Claude (north star) |
| D-057 | 30 Sep 2026 | **Who can open a request (layer 3):** the requester, anyone with a task on it (now or before), and IT Admin / Super Admin. Anyone else gets the same 404 as a request that doesn't exist, and the attempt is audited (REQUEST_ACCESS_DENIED). | Claude, following P1-30a |
| D-058 | 30 Sep 2026 | **Retrying failed messages.**<br>• cPanel cron POSTs `/api/jobs/run` every 5 minutes with an `x-job-secret` header, compared timing-safe. With no secret configured or a wrong one, it answers 404.<br>• The runner leases due FAILED deliveries (`FOR UPDATE SKIP LOCKED`, pushed 10 minutes ahead) and resends each from its stored payload.<br>• Retries wait 2, 4, 8… minutes, up to the WhatsApp retry limit setting. Errors that can't be fixed by retrying (not configured, no template) are not retried.<br>• The Super Admin also has **Retry now**. The same run deletes rate-limit hits older than a day. | Claude, following P1-48 |
| D-059 | 30 Sep 2026 | **Rate limits (sliding window in MySQL, per IP and per User ID, whether or not the account exists):**<br>• sign-in: 20 per IP / 10 per User ID per 15 min;<br>• code checks: 30 per IP per 15 min;<br>• forgot password: 10 per IP per 15 min, 5 per User ID per hour;<br>• set password: 10 per IP per 15 min;<br>• Google sign-in: 30 per IP per 15 min.<br>Over the limit gives 429 with a generic message and Retry-After. Verified live. | Claude, following P1-21 |
| D-060 | 1 Oct 2026 | **Custom approvals.** Any user builds a route with the same levels editor the IT team uses, and submits it in one go.<br>• It is saved as a CUSTOM workflow owned by that user and published at once. Numbers look like `CUS-YYYY-nnnnnn`.<br>• The form is fixed: details (required) and amount (optional).<br>• A step made only of the requester is refused; the graph validator still applies.<br>• Custom routes never appear in anyone else's New request list. | Claude, following D-026/D-040 |
| D-061 | 1 Oct 2026 | **Comments are append-only** (triggers, like the audit log). Anyone who can open the request can comment. The requester and pending approvers are told, except the author. Attachments wait for Q-001. | Claude |
| D-062 | 1 Oct 2026 | **Out of office.**<br>• A person names one delegate for a date range of up to 90 days, with no overlaps. IT can set one for anyone.<br>• While active (India date), the delegate sees those approvals in their queue, can open the requests, and decides them; actor and "on behalf of" are recorded.<br>• No chains. Never on the delegate's own request (the engine refuses the requester as actor).<br>• Start and end alert both people. Ended early with `ended_at`, never deleted. | Claude, following D-018 |
| D-063 | 1 Oct 2026 | **SLA.**<br>• A builder step can have "respond within N hours" (1 to 720), giving each task a due time.<br>• The job runner sends a reminder at the due time (to the approver and their active delegate) and an escalation at twice the time (to the approver's manager and the IT Admins).<br>• Each is sent once per task (`task_reminders`, claimed with INSERT IGNORE). Requests on hold get no notices.<br>• Calendar hours for now; working days and holidays come in S5-04. | Claude, following F-31 |
| D-064 | 1 Oct 2026 | **Handover.**<br>• IT moves a person's pending approvals to someone else. Each move is a pure engine `reassignTask` call (TASK_REASSIGNED event) through the normal locked path, so the timeline, audit and new-approver alert all happen.<br>• A move is refused for the requester, an inactive person, or someone already on that step; refused moves are reported.<br>• **Deactivation is refused while approvals still wait on the person.** | Claude, following P1-05 |
| D-065 | 1 Oct 2026 | **DoA lives in the workflow** as "skip this step when amount is at most ₹N". `/admin/doa` derives the amount-band matrix from the live versions for review with the owner (Q-004); no separate DoA table to keep in sync. Changing a limit means a new workflow version. | Claude |
| D-066 | 1 Oct 2026 | **Withdraw and reopen.**<br>• **Withdraw:** only the requester, while the request is open (in progress, on hold, or changes required). Pending approvals are closed and their approvers told. Shown as "Withdrawn" (CANCELLED); final, not undoable.<br>• **Reopen:** only the Super Admin, only an approved request, with a reason. It restarts from the first level in a new round on the same number and version; earlier approvals stay in the history.<br>Both are pure engine functions (WITHDRAWN / REOPENED events). | Claude, following F-29 |
| D-067 | 1 Oct 2026 | **Working calendar.**<br>• Response times count working hours only on India working days: Mon–Sat by default (setting `calendar.working_days`), minus holidays (table `holidays`), both managed by IT in `/admin/calendar`.<br>• Due and escalation times (`due_at`, `escalate_at` = twice the working time) are worked out when a task is created; calendar changes apply to new tasks only.<br>• Pure `addWorkingHours`, unit-tested. | Claude, following F-31 |
| D-068 | 1 Oct 2026 | **Choices in the builder.**<br>• A level can be "if [field] [condition] [value] → these levels, otherwise → those levels". It compiles to a CONDITION node with one condition edge and one otherwise edge; both paths carry on to the next level, and either path may be empty.<br>• Choices aren't nested (kept readable).<br>• The request map shows the path taken and marks the other "Not taken". The DoA view follows amount choices.<br>• With skip conditions, parallel levels and any-one / any-N, the builder can now express every shape in the north star. | Claude (north star) |
| D-069 | 1 Oct 2026 | **Insights page** (`/admin/insights`, IT Admin and Super Admin). Headline tiles (open, overdue, approved in 30 days, average time to approve) and tables: waiting now by level, time to decide per level (90 days), overdue list, decisions per person (30 days), requests by month (6 months). Tables rather than charts, because exact values matter here; a management role can be given access later. | Claude, following P7 |
| D-070 | 1 Oct 2026 | **End-to-end tests.** Playwright 1.63 (the version Next 15.5 needs) runs a production build on port 3100 against `ars_approvals_test`, with test-only secrets in `playwright.config.ts`. People are seeded by SQL and signed in with app-format session cookies. It runs as a third CI job, alongside the checks and integration jobs. | Claude, following P0-44 |
| D-071 | 7 Oct 2026 | **Demo data until the staff list arrives** (owner: "use dummy data for now").<br>• /superadmin/demo loads 20 invented demo people ("(demo)", `demo.` User IDs, emails `itadmin+demo.…@arssteels.co.in` so the IT mailbox sees every message, no WhatsApp numbers), 7 departments with HODs, 8 approver groups, and the 12 first approval types, published. Safe to repeat.<br>• Approval types pick people **by group or department HOD, never by name**, so the real staff swap in with no workflow edits.<br>• **Try as:** the Super Admin can continue as an active demo person to walk a request through. Only `is_demo` people, only with the USER role (enforced again at every request), audited (DEMO_TRY_AS); the Super Admin's own session ends.<br>• "Retire demo staff" makes them inactive, never deleted. | Claude, from owner answer 1 |
| D-072 | 7 Oct 2026 | **Attachments** (owner confirmed GoDaddy keeps files, Q-001).<br>• Files on disk in `UPLOAD_DIR` (outside the web root), random names, sha256 recorded.<br>• Allowed: PDF, PNG/JPG/WEBP, Word/Excel/PowerPoint, CSV, text. The contents are sniffed to match the name. 10 MB per file, 5 per upload, 20 per request.<br>• Added on raise or resubmit (requester), or any time while open (anyone who can see the request). Never deleted.<br>• Downloads only through `/api/attachments/[id]`, with the same check as the request page; always a download, with a sandbox CSP and nosniff.<br>• Server Action and middleware body limits raised to 52 MB. | Claude, following P2-08 |
| D-073 | 7 Oct 2026 | **WhatsApp template catalogue** (Q-013: owner asked for every format).<br>• One catalogue in code holds 20 Utility templates (wording, {{n}} order, Meta samples). It generates docs/NOTIFICATION-TEMPLATES.md, and a test keeps code, catalogue and document in step.<br>• The Super Admin records the approved name and switches each one on in /superadmin/templates. Until then the WhatsApp send is SKIPPED; email and in-app messages still go out.<br>• Values are sent on one line, cut to 300 characters, never empty (Meta's rules).<br>• Escalation and "request blocked" now go on WhatsApp too. The set-password link stays email only. | Claude, from owner answer 3 |
| D-074 | 7 Oct 2026 | **DoA example** (owner asked for one, Q-004): Purchase & SCM, with bands up to ₹1L SCM head; then + Finance head; above ₹10L + ED; above ₹25L + MD. Explained in docs/DOA-EXAMPLE.md with a table to fill in. The DoA view shows parallel reviewers as one level ("A + B (together)"). Flow F-70 was numbered twice, so the dashboard became F-56. | Claude, from owner answer 4 |
| D-075 | 8 Oct 2026 | **The DoA belongs to each approval type** (owner: "When creating an approval I will create the DoA based on each approval").<br>• The builder has a DoA matrix level: an amount field, rising limits (upper limit inclusive; the last band is "above"), and approval levels, each with any approver source, rule and response time. A tick grid says which levels each band needs, so bands can be cumulative or not.<br>• One per approval type. It can sit between ordinary levels.<br>• Each level compiles to an approval step skipped by an AND/OR range condition in the bands it isn't ticked for. Every band needs a level; the amount field must be a required number.<br>• New approval types start with a DoA matrix. The DoA view, request map ("Not needed at this amount (DoA)"), test mode and demo Purchase & SCM use it. Custom approvals don't.<br>• Supersedes the example-only approach of D-074 for new approval types; skip rules still work. | Owner, 8 Oct 2026 |
| D-076 | 8 Oct 2026 | **WhatsApp template creator on the CEOITBox API** (owner: create it in the Super Admin; the CEOITBox API documents are the master reference).<br>• /superadmin/templates lists the 20 messages. Each has an editor with named placeholders (turned into {{1}}, {{2}} in order of use), insert buttons, a live preview, and checks for Meta's rules.<br>• Submit → `POST /messageTemplate/create` (Utility, en, BODY + example, optional FOOTER).<br>• Sync → `GET /whatsapp/syncTemplatesFromMeta` + `POST /messageTemplate/getTemplates`. Approved versions go live by themselves and retire older ones; rejected ones show Meta's reason; paused ones stop.<br>• A change after submitting becomes the next version (`_v2`…); the old version keeps sending until the new one is approved.<br>• "Send a test to my WhatsApp" goes only to the Super Admin's own number.<br>• Sends carry `userMessageId` (`ars-n<id>`). A 200 reply with an error object counts as a failure. 400, 401 and blocked replies aren't retried.<br>• The app should get its own CEOITBox key ("ARS Approvals – prod"), rotated every 90 days. | Owner, 8 Oct 2026 |
| D-077 | 8 Oct 2026 | **QA defect fixes** (owner: "fix all the defects"; docs/qa §39).<br>• **Amounts:** NUMBER fields can have a minimum (0 for amounts), and a server-side DoA guard refuses negative DoA amounts.<br>• **Idempotent submit:** a one-time form key, `approval_requests.submission_key`, unique per requester; a repeat or race returns the first request.<br>• **Likely duplicates:** the same title on the same type within 10 minutes asks first ("This is a separate request" tick), checked after the form is valid.<br>• **Notification outbox:** `notification_outbox` is written in the action's transaction and sent after the commit; leftovers are sent by the job runner (claimed, at-least-once, at most 5 tries).<br>• **Attachments:** count and sha256 duplicate check under the request lock.<br>• **Long text:** comments and reasons over the limit are refused, not cut.<br>• **Templates:** the job runner syncs them daily.<br>• **Email:** subjects are one line.<br>• **My requests:** search, status filter and paging.<br>• D-QA-07 and -13 were already handled. D-QA-08, -10 and -14 wait for the owner (Q-QA-03, Q-QA-10). | Owner, 8 Oct 2026 |
| D-078 | 8 Oct 2026 | **Policy kept as it is** (owner: "keep as it is"):<br>• one person may approve more than one level of a request, directly or as a delegate (Q-QA-10);<br>• requests don't expire (Q-QA-03);<br>• rejection stays final.<br>**v1.0.0 is the first production release**; GoDaddy deploys the tagged commit, and only when CI is green on all three jobs. | Owner, 8 Oct 2026 |
| D-033 | 28 Sep 2026 | **Staff data is provided by the admin. Roles are assigned per user, by the admin only. Users are added or made inactive in the Admin Portal** (never hard-deleted, so history and audit stay intact). *Resolves Q-010.* | Owner (answer 7) |

## 4. Open questions (must be answered before the phase shown)

| ID | Question | Blocks | Status |
|---|---|---|---|
| Q-001 | GoDaddy plan type | Phase 0 stack choice | **Resolved 28 Sep → D-027/D-028.** Still to check on first deploy: the Node.js Hosting product vs cPanel "Setup Node.js App", whether its MySQL is the existing cPanel one (17 of 25 DB slots used), whether the disk is persistent (attachments), and cron availability **7 Oct 2026: owner confirmed the disk keeps uploaded files → D-072.** MySQL host and cron still to check on the first deploy |
| Q-002 | CEOITBox API details and sharing | Phase 0 / Phase 1 | **Resolved 28 Sep → D-029, D-036** (same number and key; the owner provides the notification templates) |
| Q-003 | OTP channels | Phase 1 OTP | **Resolved 28 Sep → D-025 (WhatsApp only)** |
| Q-004 | **DoA matrix** (explained in PLAN-CHECKLIST §0.3) | Phase 3 amount routing | **Owner resolved → D-041 (itadmin@).** Open: the actual amount bands and approvers per request type, to be entered by itadmin@ before Phase 3 **7 Oct 2026: example given (docs/DOA-EXAMPLE.md, demo Purchase & SCM); waiting for the real bands** **8 Oct 2026: owner decided the DoA is set per approval type at creation → D-075 (editor built); the values are entered by IT on screen** |
| Q-005 | Email sender | Phase 1 notifications | **Resolved 28 Sep → D-030, D-037 (Resend from itadmin@)** |
| Q-006 | App addresses | Phase 0 | **Resolved 28 Sep → D-034 (one address: approvals.arssteels.net; role routes /users, /admin, /superadmin)** |
| Q-007 | Google sign-in project | Phase 1 | **Resolved 28 Sep → D-038 (reuse power-bi-dashboard-3b29f)** |
| Q-008 | Admin Portal step-up | Phase 1 | **Closed 28 Sep → D-032 (not needed)** |
| Q-009 | Break-glass holder | Phase 1 go-live | **Resolved 28 Sep → D-041 (itadmin@)** |
| Q-010 | Staff master data | Phase 1 | **Resolved 28 Sep → D-033 (admin provides; roles per user by admin; add/inactivate in the Admin Portal)** |
| Q-011 | IT-team access to the Admin Portal | Phase 1 roles | **Resolved 28 Sep → D-039** |
| Q-012 | Custom approval limits | Phase 5 | **Resolved 28 Sep → D-040 (anyone can pick anyone; the no-self-approval safety rule stays)** |
| Q-013 | **Notification templates:** the owner will send the WhatsApp (and email) wording for the events N-06 to N-20; the Meta template names come after approval | Phase 1 notifications | Open, waiting on the owner **7 Oct 2026: all 20 formats delivered (docs/NOTIFICATION-TEMPLATES.md); the owner creates them in CEOITBox and switches each on in /superadmin/templates** |
| Q-014 | OTP template | Phase 1 | **Resolved 28 Sep → confirmed by the owner: reuse `wa_login_otp_v1`** (D-042) |
| Q-015 | **Break-glass and WhatsApp:** the break-glass account signs in with a password **plus the WhatsApp code** (D-025). If WhatsApp or CEOITBox is down, which is exactly when break-glass may be needed, it can't sign in. Keep the code, or skip it only during the console-enabled window? | Go-live | Open, waiting on the owner (built conservatively: the code is required) |

## 5. Work log (newest first)

### 8 Oct 2026 (v1.0.1: deployment guide)
- The owner is in GoDaddy's "Deploy your Node.js app" wizard (GitHub → main, Add secrets).
- Generated the production env file outside the repo with fresh secrets (never displayed).
- Added `start:production` (migrate + seed + next start), because the platform may have no terminal, and `db:check`.
- DEPLOYMENT.md rewritten step by step, informed by the Power BI GoDaddy guide (read-only). It adds the Resend domain verification for arssteels.co.in and a new CEOITBox prod key.

### 8 Oct 2026 (release v1.0.0 prepared)
- The owner kept the policy items as they are (D-078).
- **CI had been red since session 6 on the e2e job.** Node 22 sends an empty file box as a 0-byte "undefined" file, so every plain submit was refused; local runs use Node 24, which hid it. Fixed: any 0-byte entry is ignored. **Lesson: check CI after every push.**
- Release preparation: DEPLOYMENT.md updated, RELEASE-NOTES.md, version 1.0.0, .nvmrc 22, tag v1.0.0.

### 8 Oct 2026 (QA defect fixes, S8-06)
- **Fixed:** D-QA-01, -02, -03, -04, -05, -06, -09, -11 and -15 (D-077), with migration 202610081300 (submission_key, notification_outbox).
- **Already handled:** D-QA-07 and D-QA-13.
- **Waiting for the owner:** D-QA-08, -10 and -14 are policy choices.
- **Found:** S8-F1 (check order), caught by the e2e test.
- **Tests:** +4 unit, +9 MySQL integration (negative DoA, retry and race idempotency, duplicate tick, outbox send and crash recovery, attachment dedupe and limit race, search and paging, daily sync) and +1 e2e.
- **Totals:** 213 unit + 53 integration + 15 e2e; lint, typecheck and build pass.
- The QA document was regenerated with the fixed expectations.

### 8 Oct 2026 (QA suite)
- From the owner's master QA prompt: docs/qa/QA-TEST-SUITE.md with 600 test cases specific to this app.
- Every section the prompt asked for (1–43) is included, along with the RTM over R01–R40, 15 defect risks and 12 open questions (Q-QA-01..12).
- Main code-review findings:
  - **D-QA-04:** a negative amount is accepted and takes the lowest DoA band (approval bypass);
  - **D-QA-01:** a submit retried after a timeout creates a duplicate request.
  Both are planned as S8-06.
- The document is generated from docs/qa/source/*.py (`python docs/qa/source/gen.py docs/qa/QA-TEST-SUITE.md`).

### 8 Oct 2026 (build session 7, live check)
- The owner entered a CEOITBox key and Phone ID in /superadmin themselves (Claude did not enter it). The sync and list calls worked.
- "Submit" seemed dead because window.confirm was blocked silently. Replaced with an in-page confirm bar (S7-F3).
- `ars_approval_needed_v1` was then submitted and shows as waiting for Meta.
- The owner should rotate that key after testing, because it was pasted into chat.

### 8 Oct 2026 (build session 7)
- **Owner's instructions:** the DoA is set per approval type when it is created; build the WhatsApp template creator in Super Admin; the CEOITBox API documents are the master reference.
- **Read:** both .docx files (Integration Guide, Master Documentation). No key values are in them, and none were copied.
- **Built:**
  - the DoA matrix (D-075): schema, compile, editor, defaults, DoA view, request map, demo Purchase & SCM;
  - the template creator (D-076): client calls (create, sync, list, userMessageId, error mapping), registry versions (migration 202610081200), and the creator screens;
  - docs/CEOITBOX-API.md, and the regenerated docs/NOTIFICATION-TEMPLATES.md.
- **Fixes:** S7-F1 (non-retryable CEOITBox replies), S7-F2 (narrow-screen overflow), S7-N1.
- **Tests:** +17 unit (DoA bands and conditions, routing at the band edges, checks; placeholder rules; payloads; reply mapping) and +6 MySQL integration (DoA required-field rule, routing by band including a non-cumulative level, the creator end to end against a fake CEOITBox: draft, submit payload, pending, approved goes live, v2 replaces v1, rejection reason, test send to own number only). +2 e2e (DoA matrix built on screen and used; creator draft, submit needs the key).

### 7 Oct 2026 (build session 6)
- **Owner's answers:** use dummy data; GoDaddy keeps files; send every template format; give a DoA example.
- **Built:**
  - demo data with Try as (D-071), and the 12 first approval types F-60 to F-71 (P2-50 to P2-55);
  - the DoA example (D-074);
  - the template catalogue, document and registry screen, with WhatsApp for escalation and blocked requests (D-073);
  - attachments (D-072).
- **Found and fixed:**
  - S6-F1: the e2e suite caught empty file boxes blocking every submit;
  - S6-F2: parallel levels in the DoA view;
  - S6-F3: duplicate F-70.
- **Tests:** +23 unit (templates and code kept in step, file rules, demo set validity and DoA bands) and +9 MySQL integration (demo load twice, a ₹15L purchase routed SCM → Finance → ED, Try as rules, retire, attachment rights, closed request, the registry). +4 e2e (load demo, switch on a template, Try as + raise with a PDF + download, wrong type refused, outsider 404).
- **Local only:** the demo data is loaded in the dev database.

### 1 Oct 2026 (build session 5)
- **Built:**
  - choices in the builder (D-068), with the request map and DoA support;
  - withdraw / reopen (D-066), with screens, messages and timeline wording;
  - the working calendar (D-067), with the `escalate_at` column, `/admin/calendar` and the SLA job using it;
  - Insights (D-069);
  - Playwright e2e (D-070): 8 tests covering the access guards, security headers, and IT builds → tests → publishes → raise → manager approves → HOD asks for changes (reason enforced) → resubmit → approved → outsider gets 404; in CI.
- **Blocked:** S5-01 (staff list) and S5-07 (Q-001) are marked [?].
- **Fixes:** S5-F1 (duplicate step ids when editing a saved workflow, found in the browser), S5-F2.
- **Tests:** +15 unit (choices, calendar maths, withdraw/reopen) and +4 MySQL integration (withdraw rights, reopen rights and round, calendar due times across a holiday, insights).
- **Browser:** Purchase Approval version 2 published with a choice (above ₹5L: CFO review by Meena), and the DoA view matched. PUR-2026-000002 was raised and then withdrawn by Ravi; the timeline shows the reason. Insights and calendar render.
- **Local only:** Purchase Approval v2 and PUR-2026-000002 exist in the dev database.

### 1 Oct 2026 (build session 4)
- **New:**
  - custom approvals (D-060); comments (D-061);
  - out of office / delegation (D-062), including queue items "for <name>" and request access for delegates;
  - SLA due times, reminders and escalation (D-063), with "Overdue" in the queue;
  - handover with the deactivation guard (D-064);
  - the notification bell, inbox and mark all read;
  - the DoA matrix (D-065);
  - `docs/DEPLOYMENT.md` and `check-privileges.js`.
- **Engine:** `reassignTask` + the TASK_REASSIGNED event; `slaHours` on approval nodes.
- **Builder:** "Respond within N hours" per step. The levels editor is now shared with custom approvals.
- **Tests:** +10 unit (handover, delegation, custom self-check, delegation dates, SLA decisions, DoA bands) and +8 MySQL integration (custom submit and privacy, self-approval refused, delegate approves on behalf and stops when ended, delegate can't approve own request, handover then deactivation, handover to the requester skipped, append-only comments, SLA reminder then escalation each sent once).
- **Browser run:** Ravi raised CUS-2026-000001 for Meena and commented. Meena set out of office to Test Staff. Test Staff saw it in the queue "for Meena (MD)" and approved, and the timeline shows it was on her behalf. The bell showed the unread counts and cleared with Mark all as read. `/admin/doa` showed ₹0–₹5,00,000: Manager → HOD; above ₹5,00,000: Manager → HOD → MD.
- **Local only:** request CUS-2026-000001 and the Meena → Test Staff out-of-office exist in the dev database.

### 30 Sep 2026 (build session 3)
- **The north star is usable end to end.** Staff raise, approvers act, requesters resubmit, and the page shows every level.
- **Workflow builder** in `/admin/workflows` (D-056):
  - form fields (D-055);
  - levels, each one step or parallel steps, with all / any one / any N and a skip condition;
  - all 8 approver sources;
  - validation with plain messages, test mode with real names, publish, version history.
- **Request screens** in `/users`:
  - home with counts, the "Waiting for me" queue and "My requests";
  - "New request" (pick a published type, fill the form);
  - the request page: level map with parallel branches, rules and people; details; timeline;
  - the action panel: approve / reject (reason) / ask for changes (reason) / hold, and resume;
  - resubmit with a pre-filled form. Record-level access (D-057).
- **Approver groups screen.** Retry runner with cron endpoint and Retry now (D-058). Rate limiting on every sign-in and code route (D-059).
- **Tests:** +20 unit (builder, step map, form fields, timeline, retry backoff, rate-limit rules); +5 MySQL integration (a builder-made hybrid workflow, form enforcement, unknown form field blocks publishing, rate-limit window, delivery lease with SKIP LOCKED).
- **Browser run with 4 local test people:**
  - Workflow: Manager → HOD → MD (skipped at or below ₹5L). Test mode gave the right names for ₹12.5L and ₹75k.
  - PUR-2026-000001 raised by Ravi. The MD couldn't open it before being assigned (404). The manager approved; a reject without a reason was refused. The HOD asked for changes; Ravi resubmitted with a new amount (round 2, same number). The HOD approved; the MD held, resumed and approved → **Approved**.
- **Fixes:** S3-F1 to S3-F5.
- **Local only:** test users RAVI01 and MEENA01, workflow PURCHASE and group FIN_CHECK exist in the dev database. They are not seeds.

### 30 Sep 2026 (build session 2)
- **Super Admin area:**
  - `/superadmin/settings` has grouped settings. Secrets are encrypted, shown only as Configured / Not configured, and can be removed; history and audit keep only a keyed fingerprint.
  - Values have safe limits, with plain-word errors.
  - Test-send goes only to your own email and number.
  - There is a delivery log and an audit-log viewer.
  - Verified in the browser and in MySQL: the key is stored encrypted and never appears in the page.
- **Admin area:**
  - Users: list with search and status filter, create, edit (sign-in method, WhatsApp number normalised to +91, department, designation, manager, roles), deactivate and reactivate (ends sessions), unlock, force sign-out, set-password link.
  - Departments (with HOD) and designations.
  - D-047 rules. Changing the WhatsApp number or sign-in method alerts the user. Every change is audited with before and after values.
- **Set password and forgot password** (D-049), on a shared WhatsApp-code module (`otp-flow.ts`) that sign-in now uses too.
- **CSP** with a per-request nonce (D-051).
- **Multi-level engine persisted in MySQL** (D-050):
  - Workflows with versions, publish and archive; requests with permanent numbers; task queue; append-only timeline; approver groups; directory snapshot.
  - Emails for approval needed, approved, rejected, changes requested, on hold, and blocked (to IT).
- **11 integration tests on real MySQL:**
  - A hybrid request (manager → parallel HOD + any-one finance group → MD above ₹5L), plus the small-amount path.
  - Numbering stays unique under concurrency.
  - Two approvers acting at the same moment are serialised.
  - Nobody can decide another person's task, and the requester is never their own approver.
  - The timeline is append-only, and invalid workflows can't be published.
  - Resubmit keeps the same number, round 2; hold and resume work; a running request stays on its version when a new one is published.
- **Break-glass console script** (D-054); open question Q-015.
- **CI:** GitHub Actions runs lint, typecheck, unit tests, build and a MySQL integration job. Verified that the build works with no `.env.local`.
- **Bugs found and fixed:** the `last_value` reserved word (S2-F1), forms wiped after a validation error (S2-F2), a possible double send (S2-F3), raw validation wording (S2-F4), a duplicated error message (S2-F5).
- An order-dependent race test was corrected. On an any-one step a rejection doesn't end the request while another approver can still approve, so "both succeed" was legitimate; the test now uses two simultaneous approvals.
- **Local only:** a test user TEST002 and a break-glass account #5 (test email/number) exist in the dev database. They are not seeds and never go to production.

### 28 Sep 2026 (build session 1)
- Owner confirmed both assumptions (D-042). Recorded the build choices (D-043).
- **Scaffold:** one Next.js 15 / React 19 / TypeScript strict / Tailwind app at the repo root, versions pinned as on the Power BI site; zod env schema; mysql2 pool and transaction helper; migrate/seed scripts (trigger-safe splitter); Docker MySQL 8 on port 3307.
- **Schema (6 migrations):** departments (with HOD), designations, users (per-user sign-in method, lock and break-glass fields), roles + user_roles, otp_challenges, user_devices, user_sessions, login_logs (user agent VARCHAR(500)), **append-only audit_logs (triggers)**, system_settings + history, WhatsApp templates/variables/rate-limit log, notifications + deliveries, jobs. **Seeds:** roles; the `wa_login_otp_v1` OTP template; the itadmin@ Super Admin (Google, all three roles).
- **Security:** AES-256-GCM secrets, keyed hashing, hashed OTP codes, scrypt passwords with a policy check, signed session, purpose ("This wasn't me") and device tokens.
- **Sign-in:** Google (Firebase ID token verified on the server, link on the first sign-in, no OTP); User ID + password then a **WhatsApp-only OTP** (cooldown, hourly cap, attempt limit, single use, re-check after the OTP); lockout with an alert; DB-backed sessions, logout, sign out everywhere; new-device detection and a **new-login alert** (email + WhatsApp + in-app) with a "This wasn't me" link that ends sessions, locks the account and alerts the Super Admin; every Super Admin or break-glass sign-in alerts the Super Admin. All messages are generic (no user enumeration).
- **Access:** area policy (users / admin / superadmin), guards in every layout **and** page, API guards, middleware. Forbidden admin areas return 404.
- **UI:** split login page from the asset pack (Google, password, OTP), area shells with ARS branding, security page (sign out everywhere), "This wasn't me" page.
- **Notification hub:** one call records the in-app row, then email (Resend) and WhatsApp (CEOITBox) deliveries. It never throws; a missing template is SKIPPED with `TEMPLATE_NOT_CONFIGURED` (Q-013).
- **Multi-level engine core (north star):** node graph (START, APPROVAL, SPLIT, JOIN, CONDITION, END); completion ALL / ANY_ONE / ANY_N on steps and joins; 8 approver sources; conditions with AND/OR and a default path; skipIf; no self-approval; BLOCK/SKIP when no approver; delegation; reject / request changes / hold / resume; resubmit from the beginning or the requesting step (rounds, including parallel branches); validator (G-08 impossible conditions, G-09 unknown sources/fields, cycles, dead ends, counts); simulator (stages, skips, blocks, branches).
- **Tests:** 80 unit tests (38 engine, 10 security, 8 rules/policy, 6 notification hub, 16 password/OTP + alerts, 2 env). Typecheck, lint and production build are green.
- **Smoke test on local MySQL:** migrations and seeds apply and re-run safely; audit UPDATE/DELETE rejected; route protection redirects every area to /login (including a forged cookie); security headers present; the password flow reaches the WhatsApp send step (no provider key yet, so nothing was sent); lockout on the 5th wrong password with audit + alert rows; the login page renders the lock message.
- **Bugs found and fixed:** the lockout off-by-one caused by MySQL SET ordering (D-044); blank env values crashing requests (D-045); unstyled pages when started from another folder (D-046); whitespace-only values not counted as empty in conditions.
- Planned session 2 in PLAN-CHECKLIST (S2-01 to S2-09).

### 28 Sep 2026 (third round)
- Owner answered: one app only at approvals.arssteels.net with /users, /admin, /superadmin; the GitHub repo HarishDevs/ARS-Approval-System for all activity; the same CEOITBox number and API (the owner provides notification templates); Resend; reuse the Firebase project; IT-team admin split confirmed; anyone can pick anyone; itadmin@ is the approval authority and the admin/break-glass login → D-034 to D-041.
- Initialised git in `D:\Omniroute\ARS Approval System`, added `.gitignore`, `README.md` and a repo-level `CLAUDE.md`, committed the planning files and pushed to `main`.

### 28 Sep 2026 (later)
- Owner answered the second round: GoDaddy cPanel + Node.js; CEOITBox as in `D:\PBI New`; OTP on WhatsApp only; the Admin Portal is for the IT team to create predefined approvals while everyone can create custom approvals; sender itadmin@arssteels.co.in; Admin Portal at admin.arssteels.net; no step-up OTP; the admin provides staff data, sets roles per user, and adds or inactivates users → D-024 to D-033.
- Read the Power BI website project (`D:\PBI New`, read-only; `.env.local` deliberately not opened because it holds live secrets). Took its proven GoDaddy deployment path, stack, CEOITBox adapter contract, WhatsApp OTP design, Google/Firebase login and encrypted settings pattern as the reference → D-027 to D-029. See §9.

### 28 Sep 2026
- Owner set the **north star: multi-level approvals in any custom manner** → D-000. Added it to all three living files, `D:\Omniroute\CLAUDE.md` and Claude memory.
- Plan page republished as **v2** (same URL): decisions, DoA explanation, GoDaddy stack options, CEOITBox, no import, engine supports every multi-level pattern from Phase 2. Copy saved as `reference/platform-plan-v2.html`.
- Rewrote `reference/asana-rules-notes.md` (the temporary copy had been cleared) and restored `reference/asana-approval-audit.html` from the published page.
- Owner answered the planning decisions → D-003 to D-015 recorded.
- Created the three living files and `reference/`. Copied the audit page, plan page, rule notes and earlier write-up into `reference/`.
- Published build plan v1 (Admin Portal / Control Center, sign-in, notifications, hidden backend, architecture, phases, risks, decisions).
- Checked the connected Supabase account: only one unrelated project (finance/subscription app). **Not to be used** for ARS.
- Gave an overview of the available planning inputs.

### 25 Sep 2026
- Read all Asana automation rules (868) through Customize → Automations, read-only. Found rule defects (MD Rejected → Approved Section; MD copies mark any completion Approved; assignee-based approval checks; Plant HOD check; Branding impossible routing; ED/HR copies watching an unused dropdown; Finance Internal L2 gap; routing gaps for CA/NBD). Updated the audit page to v2.

### 24 Sep 2026
- Audited every Asana approval project read-only (104 projects, 7 tiers, 11 internal): structure, fields, sections, task histories, flows, gaps. Published the audit page v1.

## 6. Feature catalogue (status: Planned / In progress / Done)

| Area | Feature | Status | Checklist ref |
|---|---|---|---|
| Access | Google sign-in (no OTP) | In progress: built and unit-tested; live test needs Firebase Admin values | P1-AUTH |
| Access | User ID + password + OTP (WhatsApp only, D-025) | In progress: built, tested, smoke-tested to the send step; live send needs the CEOITBox key (S2-01) | P1-AUTH |
| Admin Portal | IT-team access with roles assigned by the Super Admin (D-024, Q-011) | Planned | P1-ADM |
| Access | Per-user sign-in method; admin-created users only; any email | **Done (30 Sep 2026)**: enforced at sign-in, managed in /admin/users | P1-USR |
| Access | New-login detection + alert + "This wasn't me" | In progress: built and tested; WhatsApp copy waits for Q-013 | P1-AUTH |
| Access | Lockout, sessions, trusted devices, forgot password | **Done (30 Sep 2026)** except idle timeout and approximate location | P1-AUTH |
| Admin Portal | Separate app; Super Admin only; audited changes | **Done** as role areas in one app (D-034), every change audited | P1-ADM |
| Admin Portal | Organisation, users, hierarchy, roles, data scopes | In progress: users, roles, manager, departments + HOD, designations done; data scopes, import to do | P1-ADM |
| Admin Portal | Security, providers, notification templates, audit viewer | In progress: providers, security, test send, delivery log, audit viewer; **WhatsApp template registry done 7 Oct 2026** | P1-ADM |
| Admin Portal | Approval Builder, form builder, workflow designer, validator, test mode | **Done as a structured levels builder (30 Sep 2026)**: forms, levels, validation, test mode, versions; drag-and-drop canvas later | P3 |
| Admin Portal | DoA matrix, SLA/escalation, holiday calendar | **Done (1 Oct 2026)**: DoA view, SLA, working days and holidays | P3/P4 |
| Admin Portal | Data rights: view, export, correct (versioned), archive, retention | Planned | P1-ADM / P7 |
| Messaging | Notification hub: email + WhatsApp (CEOITBox) + in-app, delivery log | In progress: hub, adapters, delivery log, retry runner and Retry now done; in-app bell in S4 | P1-NOT |
| Engine | Requests, permanent ID, state machine, server-side approver check | **Done with screens (30 Sep 2026)** | P2 |
| Engine | Sequential / Parallel / Any-One / Any-N-of-M / Conditional / Hybrid | **Done and persisted (30 Sep 2026)**: 38 engine tests + 11 MySQL integration tests | P2/P3 |
| Engine | Approver sources (user, role, HOD, manager, group, form field…) | Engine core done (8 sources); designer UI in P3 | P3 |
| Engine | Resubmission with versions, Reopen, On Hold, Changes Required | **Done (1 Oct 2026)** incl. withdraw and reopen | P4 |
| Engine | Delegation ("on behalf of"), SLA, reminders, escalation | **Done (1 Oct 2026)**: out of office, SLA hours, reminders, escalation; working days in S5 | P4 |
| Engine | Custom approvals open to every user, whenever needed (D-026) | **Done (1 Oct 2026)** | P5 |
| Engine | Documents (versioned), comments, work assignment after approval | In progress: comments done; documents wait for Q-001; work assignment later | P6 |
| Portals | Employee, Approver, Management portals | Employee + approver **done (30 Sep 2026)**; management portal P7 | P2/P7 |
| Insight | Analytics, SLA dashboards, Power BI views | In progress: Insights page done (1 Oct 2026); Power BI views later | P7 |
| Connect | ERP / Salesforce / webhooks, mobile web app | Planned | P8 |
| Security | Rate limiting on sign-in, codes, forgot / set password | **Done (30 Sep 2026)** (D-059) | P1-SEC |
| Security | Content-Security-Policy with per-request nonce | **Done (30 Sep 2026)** (D-051) | P1-SEC |
| Security | Break-glass account; append-only audit log | **Done (30 Sep 2026)**: audit log + timeline append-only; break-glass console script; Q-015 open | P1-SEC |

## 7. Key facts from the Asana audit (reference for templates)

- **Volume:** about 4,800 requests since Dec 2025. MD 1,655 · ED 1,347 · Finance 849 · Valarmadhi 345 · SCM 316 · HR 62 · Admin 69 · Recruitment 67 · Finance Internal 69 · IT 11 · Price Realisation 17 · Sumit 5.
- **Approvers:**
  - MD: "MD" account, used by an assistant.
  - ED: Rajesh Bhatia.
  - Finance: Prabu. Valarmadhi tier: valarmadhi ARS Steel.
  - SCM: madhanagopal.
  - Sumit Bhatia (NBD).
  - HR / Admin: Srinivasa Raghavan K → Subashini. Recruitment: Gokulakrishnan Raghavan → Subashini.
  - Finance Internal: level 1 by Nature (Anbu, Thulasiram D, rishika.l, Anupriya Devaraj, Srivani M, christypricilla) → level 2 (Naveen Kumar G / Anbu) → HOD Valarmadhi.
  - IT: Babulal M.
  - Price Realisation: Ragu, G Chandra Mouli, Gopi K, Prabu → Rajesh Bhatia → MD.
- **Request fields:** Department, Nature, Priority, Amount, Subject/Party, Cheque/PO/Invoice No, Approval Information, Required/Due date, Mode of Approval, attachments. Value Category bands today: 0 / ≤1L / 1–3L / 3–5L / >5L.
- **Departments in use:** Branding, Purchase & SCM, Sales, MDO, EDO, HR & Admin, IT, Field Marketing & Technical, ASP, Steel Plant, Finance & Accounts, NBD, Corporate Affairs, Projects, Training & Development. The 27-value list needs cleaning.
- **Defects the new design must not repeat:** listed in PLAN-CHECKLIST §Guardrails (G-01 to G-16).

## 8. Environment and credentials register (names only, never secrets)

| Item | Owner account | Where stored | Status |
|---|---|---|---|
| GoDaddy hosting (Node.JS Hosting, Deluxe; cPanel MySQL; Cron Jobs) | itadmin@arssteels.co.in | GoDaddy | Existing (Power BI site uses it); new app to be created in Phase 0 |
| CEOITBox WhatsApp (1 number, Phone ID 1057554220785929) | itadmin@arssteels.co.in | CEOITBox, API key entered only in Admin Portal encrypted settings | Existing; sharing to confirm (Q-002) |
| Firebase project `power-bi-dashboard-3b29f` (Google sign-in) | itadmin@arssteels.co.in | Firebase console | Reused (D-038); add authorised domain approvals.arssteels.net |
| Resend (email from itadmin@arssteels.co.in) | itadmin@arssteels.co.in | Resend dashboard; API key entered only in `/superadmin` encrypted settings (as for CEOITBox, D-016) | Reused (D-037); domain verification to check |
| Domain: approvals.arssteels.net | itadmin@arssteels.co.in | GoDaddy DNS (assumed) | To bind to the GoDaddy Node.js app (D-034) |
| GitHub repo HarishDevs/ARS-Approval-System | HarishDevs (push via the proursolutions-source account) | GitHub | Active (D-035) |
| cPanel cron for the job runner | itadmin@ | GoDaddy cPanel → Cron Jobs: every 5 min `curl -s -X POST -H "x-job-secret: …" https://approvals.arssteels.net/api/jobs/run` | Set up at go-live (S4-07) |
| `SESSION_SECRET`, `ENCRYPTION_KEY`, `JOB_RUNNER_SECRET` | – | GoDaddy app environment variables only; `ENCRYPTION_KEY` also backed up in a password manager | Fresh local-only values generated 28 Sep 2026 in the git-ignored `.env.local`; production values to be generated separately at deploy |
| Firebase Admin service account (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) | itadmin@arssteels.co.in | `.env.local` (dev) / GoDaddy env vars (prod), entered by the owner | Not yet entered; needed for a live Google sign-in test |
| Break-glass admin | itadmin@ (D-041, D-042) | Sealed offline, separate from the daily login | Script ready (D-054). Create it on GoDaddy at go-live with `create`, then `set-password`; the dev database has a local test copy only |

## 9. Reference project: ARS Power BI website (`D:\PBI New`)

Built by the same owner and deployed on the same GoDaddy account. Used as the **pattern library**, read-only. Copy patterns, not secrets.

| Topic | Where in `D:\PBI New` | What we reuse |
|---|---|---|
| GoDaddy deployment | `Completed Documentation\Deployment\GODADDY_DEPLOYMENT_GUIDE.md` | Node.JS Hosting (Node 22, GitHub/zip deploy, env-var screen), MySQL paths A/B, migrate/seed scripts, post-deploy checklist, VPS fallback |
| CEOITBox adapter | `ars-steels-bi\server\integrations\whatsapp\ceoitbox\client.ts`, `Completed Documentation\WhatsApp\CEOITBOX_ADAPTER.md` | Request contract, `x-api-key` auth, error codes, "never send an unapproved template", delivery log that never rolls back the business action |
| WhatsApp OTP | `ars-steels-bi\server\auth\whatsapp-otp.ts`, `Authentication\WHATSAPP_OTP.md` | OTP request/verify with an anti-enumeration response, cooldown and attempt limits computed in SQL, Authentication-category template. Known bug to avoid: `login_logs.browser` must be ≥ VARCHAR(500) |
| Google login | `server\auth\google-login.ts`, `Authentication\GOOGLE_LOGIN.md` | Firebase ID token verified on the server; link `firebase_uid` on first login only to pre-created accounts; inactive → 403 |
| Sessions | `lib\session\session.ts` | HMAC-signed cookie (httpOnly, sameSite) |
| Encrypted settings | `features\settings\definitions.ts`, `server\settings\*-config.ts`, `Authorization\SETTINGS.md` | AES-256-GCM settings table for provider credentials, edited in the admin UI |
| Notifications / outbox | `server\notifications\*`, `WhatsApp\NOTIFICATIONS.md`, `OUTBOX_RETRY_AND_WEBHOOKS.md` | Dispatch + delivery table; add the retry outbox that the Power BI site lacked |
| Known limits carried over | `KNOWN_ISSUES.md`, guide §10 | No built-in scheduler (use cPanel cron); local-disk uploads may not persist (check, or use object storage); no key rotation |
| Project documentation discipline | `Completed Documentation\*` (DECISION_LOG, CHANGELOG, KNOWN_ISSUES, PROJECT_STATUS) | Same idea as our three living files |
