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
| D-079 | 8 Oct 2026 | **The live address is `approval.arssteels.net`**, singular (the owner created this subdomain). It replaces `approvals.arssteels.net` in D-034 and earlier entries. `APP_BASE_URL=https://approval.arssteels.net`. The code's fallback, the docs, the template samples and the tests were all updated. Earlier log entries keep the old spelling as history. | Owner, 8 Oct 2026 |
| D-080 | 8 Oct 2026 | **Email sender `approvals@arssteels.net`** (the owner verified arssteels.net in Resend), with **Reply-to `itadmin@arssteels.co.in`** (new setting `email.reply_to`). This supersedes the earlier sender itadmin@arssteels.co.in (D-037). Builds clean `.next` first, because GoDaddy reuses the app folder (v1.0.3). | Owner, 8 Oct 2026 |
| D-081 | 8 Oct 2026 | **GoDaddy runs the app behind Cloudflare**, whose email obfuscation rewrites addresses in the HTML. Every address shown on a page goes through `<Email>` / `<SafeText>` (features/ui/SafeText.tsx). New screens must do the same, or React hydration breaks (#418). **Extended 9 Oct 2026 (v1.3.2):** this applies to any user-written text too (titles, comments, field values, timeline, notifications); CI test `tests/e2e/cloudflare-safe.spec.ts` guards it. | Claude, from the live console |
| D-082 | 8 Oct 2026 | **The Super Admin's Google sign-in is `itsupport@arsenergy.co.in`**. `itadmin@arssteels.co.in` is an alias of arunram@arssteels.co.in, and Google ID tokens carry the primary address, so login_logs showed UNKNOWN_ACCOUNT.<br>• Migration 202610081400 moves the bootstrap account (User ID `itadmin`, roles unchanged) once, only if it's unlinked.<br>• The bootstrap seed now only creates the account and never overwrites it.<br>• **Rule for staff:** create users with their **primary** Google email, never an alias. | Owner, 8 Oct 2026 |
| D-083 | 8 Oct 2026 | **The three parts of the app are called "spaces" on screen** (My approvals, Admin, Super Admin), not "areas". One **account menu** at the top right holds the name, email, the current space badge, **Switch space**, Notifications, Sign-in & devices and Sign out. The sidebar holds only the current space's pages, and on phones it opens as a drawer. Code identifiers (`AppArea`, `requireArea`) keep their names. | Owner, 8 Oct 2026 (three UI reviews) |
| D-084 | 8 Oct 2026 | **Bulk import of master data by CSV** (F-59): users, departments, designations, approver groups and holidays, from the Admin **and** the Super Admin space.<br>• **Check** is a dry run; **Import** re-plans inside one transaction and writes every row or none.<br>• Matched by User ID, code or date: it creates or updates, and never deletes or deactivates.<br>• The same rules as the forms (D-025, D-047); audit per record + `IMPORT_COMPLETED`; downloads of current data are audited (`IMPORT_DATA_DOWNLOADED`).<br>• CSV, not XLSX: no extra library, and Excel opens and saves it. Approval types are not imported; they are built and tested in the workflow builder. | Owner request, 8 Oct 2026 |
| D-085 | 8 Oct 2026 | **Approver designations** (F-72). A designation is ticked "Approver" (Manager and above). Only approver-eligible people (active, not break-glass, designation ticked) can be **chosen** as approvers.<br>• This covers named workflow and custom steps, group members, HOD, reporting manager, delegate, handover target, and person fields feeding FORM_FIELD_USER.<br>• Choices already saved stay valid until changed; the engine is unchanged.<br>• Existing designations are ticked at migration; new ones start unticked.<br>• **Supersedes the "pick anyone" part of D-026/D-040.** Owner chose "all approver pickers". | Owner, 8 Oct 2026 |
| D-086 | 8 Oct 2026 | **Super Admin deletes requests: a soft delete** (F-73).<br>• A reason is required; pending tasks are CANCELLED.<br>• The request is hidden from every list, queue, job and report; the row, timeline and audit stay (D-012).<br>• Super Admin → Requests (All / Deleted) and a button on the request page. There is no undo. Owner chose soft over permanent. | Owner, 8 Oct 2026 |
| D-087 | 8 Oct 2026 | **Admin dashboards** (F-74), `/admin/dashboards/*`: Utilisation, Department-wise raised, Approver-wise, Raiser-wise by department.<br>• One GET filter (India dates, the FY to date by default, type incl. custom, department); a CSV per page.<br>• Department = the raiser's current department (the approver's, on the approver page). A delegate's decision counts for the approver. Deleted requests are excluded. | Owner, 8 Oct 2026 |
| D-088 | 8 Oct 2026 | **Form field creator** (F-75).
- **Field types:** Short/Long text, Number, Date, Dropdown (IT's options, a list editor), **Department / Designation from the list** (LOOKUP, `source`, the code stored, the name shown, checked against the active list), Person. Help text can be set.
- **Keys** follow the label until edited; saved keys are locked.
- **Conditions** are type-aware: dates compare by calendar order (engine + validator accept YYYY-MM-DD for before/after); lists, options and people are picked, not typed.
- **Test mode** keeps the valid sample values.
- **The level map** previews skip conditions that already hold. | Owner, 8 Oct 2026 |
| D-089 | 9 Oct 2026 | **The loader/loading-state audit suite lives outside CI** (`tests/qa-loaders/`, `playwright.loaders.config.ts`). It asserts the target behaviour, using intercepted Server Actions and page fetches (slow, 500, abort, offline, malformed, replay) and DB counts, so it stays red until the defects in `docs/qa/LOADER-QA-REPORT.md` are fixed. Once they are, it can join CI. | Claude, QA session 13 |
| D-090 | 9 Oct 2026 | **Form resilience** (QA session 14).
- Every `useActionForm` Server Action goes through `guardAction`: failures become a plain message and the fields are kept; a 30 s limit says it "may still go through"; "session ended" is detected via `/api/auth/status` (yes/no only).
- The form keeps **its own busy state** instead of `useActionState`'s pending, which can't end while the action's request is open.
- `app/error.tsx` / `app/global-error.tsx` replace the blank Next error.
- **No `loading.tsx` at space level:** it streams pages, so a missing record returned 200 instead of 404 (breaks D-016) and stalled action refreshes. Navigation feedback is link-level instead: `useLinkStatus` in the sidebar, and `PendingLink` (a normal page load) for period and paging links. | Claude, from audit evidence |
| D-091 | 9 Oct 2026 | **Email sender `no_reply@approval.arssteels.net`** (supersedes the address in D-080; Reply-to stays `itadmin@arssteels.co.in`). The owner set it in Super Admin; `approval.arssteels.net` is verified in the Resend team "arssteels". It is now the code default too. | Owner, 9 Oct 2026 |
| D-092 | 9 Oct 2026 | **Client IP = Cloudflare's `CF-Connecting-IP`** (Q-018: the owner confirmed all traffic goes through Cloudflare). X-Forwarded-For is never read from the left. Without the Cloudflare header, the right-most entry is used (the nearest proxy's), then X-Real-IP; values must be valid IPs (`lib/http/client-ip.ts`). This closes QA-SEC-06. Remaining risk: a request sent straight to the GoDaddy origin, bypassing Cloudflare, could set its own CF-Connecting-IP. | Owner, 9 Oct 2026 |
| D-093 | 9 Oct 2026 | **Dependency upgrades** (Q-017): Next and eslint-config-next 15.5.27, firebase-admin 14.5.0, plus `npm audit fix`. Two npm `overrides`: Next's bundled postcss → 8.5.28 (build-time only) and the Firebase client's Firestore grpc-js → 1.14.6 (Firestore is unused; Auth only). Result: `npm audit --omit=dev` 0 vulnerabilities. A firebase client major upgrade (11 → 12/13) isn't needed for security, so it waits until there is a reason. | Owner, 9 Oct 2026 |
| D-094 | 9 Oct 2026 | **Job runner heartbeat:** each successful `/api/jobs/run` updates a single `RUNNER_HEARTBEAT` row in the (previously unused) `jobs` table. Super Admin → Message deliveries shows "Job runner: last ran N min ago": green within 15 minutes, amber otherwise or if it never ran. This lets the owner confirm the cron job (DEPLOYMENT Part I). | Claude, 9 Oct 2026 |
| D-095 | 9 Oct 2026 | **User sidebar: one "Profile" entry** (owner: "take out of office, Notification, Sign-in & devices to the Profile page"). `/users/profile` shows the person's details read-only, with tabs for Notifications, Out of office and Sign-in & devices. Those pages keep their addresses (`ProfileTabs`, `NavItem.also`). | Owner, 9 Oct 2026 |
| D-096 | 9 Oct 2026 | **Audit fixes (v1.3.6).**
- **Retry payloads** (message bodies kept for re-sending) are stored AES-256-GCM encrypted with ENCRYPTION_KEY, cleared on send and after 7 days. Rows written before v1.3.6 are read as plain JSON.
- **After sign-in**, only a same-site path without backslashes, whitespace or control characters is followed.
- **One-time codes:** each try claims an attempt with a conditional UPDATE before checking the code.
- **Resend** calls time out after 15 s.
- **Idle sign-out** defaults to 120 minutes (setting `auth.idle_timeout_minutes`, 15–720) on top of the 12-hour session.
- **Confirmations:** every form that asks for one must render `{confirmBar}` (unit guard). | Owner ("Go Ahead"), 9 Oct 2026 |
| D-097 | 9 Oct 2026 | **Step kinds and new sources.**
- An approval step can be **WORK**: "Mark as done" instead of approve, may go to the requester, can't be rejected, changes can be asked. It implements hand-off after approval (F-32).
- **NOTIFY** steps tell people and move on.
- **New sources:** DESIGNATION (optionally the requester's department; approval steps need an approver designation) and REQUESTER (work and FYI only; the validator refuses it on an approval step).
- Task rows carry `task_type`. Dashboards count approvals only. | Owner ("fix every pending"), 9 Oct 2026 |
| D-098 | 9 Oct 2026 | **Blocked-step recovery by IT:** ASSIGN people, SKIP, RETRY after fixing masters, or TAKE_PATH on a choice. A reason is required; it is audited (REQUEST_UNBLOCKED) and the requester is told. | Owner, 9 Oct 2026 |
| D-099 | 9 Oct 2026 | **Builder rules:** a choice or skip rule holds up to 10 conditions, all or any. Choices nest up to 3 deep (supersedes D-068's "not nested"). Old single-comparison specs stay valid. | Owner, 9 Oct 2026 |
| D-100 | 9 Oct 2026 | **Escalation levels:** reminder at T; then the manager and IT at 2×T; the manager's manager at 3×T; one more at 4×T. The setting `general.escalation_levels` (1–3, default 2) sets how far. Tasks that got every notice drop out of the scan (R-08). | Owner, 9 Oct 2026 |
| D-101 | 9 Oct 2026 | **Resubmit restart per approval type:** from the step that asked (default) or from the beginning. | Owner, 9 Oct 2026 |
| D-102 | 9 Oct 2026 | **Security (audit S-06, S-07, P-01..P-09).**
- A locked account answers like an unknown one unless the password is right.
- "This wasn't me" links work once.
- Optional `ORIGIN_SECRET` origin lock via a Cloudflare header.
- Google sign-in only for provider `google.com`.
- Another IT Admin's email, WhatsApp, sign-in method or set-password link: Super Admin only.
- The CEOITBox URL must be https; provider bodies in logs are masked.
- Cross-site and sibling-site API POSTs are refused (Sec-Fetch-Site).
- **Kept, with reasons:**
  - P-02: the 52 MB action body is needed for 5×10 MB uploads;
  - P-08: one SESSION_SECRET, with domain-separated HMACs; rotating it signs everyone out, by design;
  - P-09: trigger privilege checked by `scripts/database/check-privileges.js`. | Owner, 9 Oct 2026 |
| D-103 | 9 Oct 2026 | **`/api/health`:** public; 200/503; version, database, job runner. For an uptime monitor. | Claude, 9 Oct 2026 |
| D-104 | 9 Oct 2026 | **Backups:**
- Daily, from the job runner: a gzipped SQL dump in one consistent snapshot, paged by full primary key, with triggers and no DEFINER.
- New attachments are copied too; old dumps go after `BACKUP_KEEP_DAYS`.
- Super Admin "Back up now".
- `scripts/database/restore.js` needs `--confirm-database`.
- The drill (restore, then a checksum of every table) runs in CI. | Owner, 9 Oct 2026 |
| D-105 | 9 Oct 2026 | **Tooling:**
- vitest 5 / vite 7 / plugin-react 5, `postcss-selector-parser` override; production audit 0.
- 7 dev-only advisories remain (`braces`, no fix) under Tailwind 3/ESLint; build-time on our own files; accepted.
- CI adds the production audit, the QA suite and the origin check.
- The load test is run locally before go-live (tests/perf). | Claude, 9 Oct 2026 |
| D-106 | 9 Oct 2026 | **Reuse and reach:**
- IT can make a custom approval an approval type (draft copy).
- Power BI read-only views are an optional SQL file, not a migration (CREATE VIEW privilege).
- The app is installable (manifest + icons), with no offline cache. | Claude, 9 Oct 2026 |
| D-107 | 9 Oct 2026 | **Integrity (audit R-04..R-10):**
- A delete closes an open request through the engine and tells approvers and the requester; the outbox drops older messages for deleted requests.
- Publishing locks the type row.
- A failed custom approval removes its one-off type.
- A handover restarts the response clock and forgets reminders; hold time extends due times.
- Request numbers use the year in India.
- Migrations resume from the failed statement.
- Out-of-office overlap is checked under a row lock.
- Every decision is in the audit log too. | Claude, 9 Oct 2026 |
| D-108 | 9 Oct 2026 | **v1.5.0 user comfort (owner's development spec):**
- **Drafts** are kept server-side per person and form for 30 days. This supersedes the "no drafts" note under D-078: the owner asked for drafts in the spec.
- **Search** builds the access rule into its SQL, the same rule as the request page.
- **Saved views** are private.
- **Bulk approval:**
  - plain approvals only (no work tasks, no requests on hold);
  - at most 25 at a time;
  - each one goes through `decideTask` and gets its own result. | Owner spec; Claude, 9 Oct 2026 |
| D-109 | 9 Oct 2026 | **Out of office (#8):**
- It covers approvals already waiting and new ones, on India dates (start of the start day to end of the end day).
- A delegate must still be approver-eligible when they act, not only when named.
- The job runner logs each start and end once. | Claude, 9 Oct 2026 |
| D-110 | 9 Oct 2026 | **Notification choices (#6) amend D-008:**
- **Always on:** security and sign-in messages, and "work waiting for you".
- **Can be switched off by email or WhatsApp:** updates on your own requests, reminders and escalations, comments and mentions, and FYI.
- **Recording:** a switched-off message is logged SKIPPED / USER_PREFERENCE; the in-app inbox always gets everything.
- **Events not in a group** are treated as mandatory. | Owner spec; Claude, 9 Oct 2026 |
| D-111 | 9 Oct 2026 | **PDF summary (#10):**
- Built with `pdf-lib` and its built-in Helvetica. The planned fontkit and Noto Sans are not used: that keeps it to one pure-JS dependency with no font file.
- Text outside Latin-1 is written as a stand-in ("₹" → "Rs.").
- The same access check as the request page applies, and every download is audited. | Claude, 9 Oct 2026 |
| D-112 | 9 Oct 2026 | **Mentions, due soon, monitoring:**
- **Mentions (#9):**
  - `@UserID` notifies only people who can already see the request, once;
  - plain text;
  - no internal notes and no threads.
- **Due soon (#12):** a heads-up at 75 % of the response time. It doesn't take an escalation slot.
- **New messages:** "mentioned you", "due soon" and the Super Admin's job/backup alert go by inbox and email. There are no WhatsApp templates for them yet (an owner choice).
- **Request ids (#14):** each request gets an id, from Cloudflare's CF-Ray or a new UUID. A caller's own id is never trusted. The id is shown as the "Reference" and is written in error logs.
- **Super Admin alerts:** at most once a day per kind. | Claude, 9 Oct 2026 |
| D-113 | 10 Oct 2026 | **Route-level `loading.tsx` only on read-only list pages.** In Next 15.5 a route skeleton turns a later `notFound()` into HTTP 200 and can block the refresh after a Server Action. Pages with actions and `[id]` pages have none; list pages sit in route groups. `tests/ui/loading-guard.test.ts` enforces the allow-list, and `useActionForm` calls `router.refresh()` after success. | Claude, 10 Oct 2026 |
| D-114 | 10 Oct 2026 | **Smart forms are worked out on the server.**
- Show-if and required-if rules, CALC fields (a safe formula parser, no eval) and LINE_ITEMS (paise, BigInt, at most 100 lines).
- On submit the server recomputes every calculated value and total, ignores what the browser sent, and clears hidden fields.
- CALC and LINE_ITEMS can be the DoA amount. | Claude, 10 Oct 2026 |
| D-115 | 10 Oct 2026 | **Submission readiness (FN1) and duplicates (FN3):**
- One service (`server/approvals/readiness.ts`). It runs read-only for "Check before submitting" and again inside the submit transaction, taking the approval-type lock first and then using FOR SHARE reads, so two submits can't both pass.
- Only duplicate and budget warnings need confirming; routing and missing-department notes don't.
- A possible duplicate needs a reason (5+ characters), which is stored and audited (`DUPLICATE_WARNING_OVERRIDDEN`).
- A BLOCK policy applies to requesters; IT can override with a reason.
- Matches the person can't open show no number or link.
- A repeated submission key re-reads under the lock, so a double click still makes one request. | Claude, 10 Oct 2026 |
| D-116 | 10 Oct 2026 | **Budgets (EN-09):**
- Per department per financial year (April–March, India time).
- Committed = the checked amounts of open and approved requests; withdrawn and rejected requests stop counting.
- No budget loaded is a warning, never "unlimited".
- Over budget warns by default; `general.budget_policy` = BLOCK refuses (an owner decision). | Claude, 10 Oct 2026 |
| D-117 | 10 Oct 2026 | **Autofill and templates (FN4):**
- Sources are the person's profile (department, designation), their own templates and their own earlier requests only.
- People fields, calculated fields and files are never copied. Values that no longer fit the form are dropped and counted.
- An explicit choice (template or "raise again") wins over the draft; the profile fills only empty fields.
- Each prefilled field says where its value came from. | Claude, 10 Oct 2026 |
| D-118 | 10 Oct 2026 | **Workflow reliability (FN2, FN8, FN11):**
- Every automation step is recorded in `job_runs` (counts only) and runs on its own.
- Health is OK / LATE / FAILING / NEVER.
- Stuck detection is read-only; IT fixes through existing audited actions or snoozes with a reason.
- Resend releases only unsent rows that aren't being sent, so a message is never sent twice. Recovery never touches decisions.
- Run now and Resend on Automation are Super Admin only; Needs attention is for the IT team. | Claude, 10 Oct 2026 |
| D-119 | 10 Oct 2026 | **Status register:**
- Statuses are exactly Implemented / Yet to do / Not feasible.
- A Not feasible row needs a blocker, a prerequisite and an alternative.
- Plant/business unit, cost centre, ERP integrations, APM/DB/deploy telemetry and request-level due dates are Not feasible with today's data. | Claude, 10 Oct 2026 |
| D-120 | 10 Oct 2026 | **Amendments after approval (FN5):**
- An amendment is a new request of the same type, raised by the original requester. It changes only the fields the type marks as amendable; everything else is taken from the values in force.
- It always goes through the type's current workflow again, with DoA re-evaluated.
- The original request and its decisions never change. The values in force are the latest APPROVED amendment's; a rejected or withdrawn amendment changes nothing.
- One open amendment at a time (the original is locked FOR UPDATE).
- The original isn't treated as a duplicate of its amendment.
- Only the change in amount counts against the budget, and a reduction counts only once approved.
- Cost centre isn't in the data (Not feasible). | Claude, 10 Oct 2026 |
| D-121 | 10 Oct 2026 | **Version history and the migration assistant (FN7):**
- **Compare:** any two versions (steps, routes, fields).
- **Restore:** copies an older version as a new draft with the same step ids; only when no draft exists.
- **Migration:** moves open requests from an older version to the live one, IT only.
  - A dry run gives a verdict for each request; warnings need an explicit yes.
  - A reached step that has gone must be mapped onto a live step of the same kind.
  - Finished requests, step-kind changes and part-way parallel joins can't be moved.
  - Each request moves in its own locked transaction, re-checked on its current state. The state is lined up with the target: new steps start WAITING, and unreached old steps are dropped.
  - Runs and per-request outcomes are recorded, with an audit entry and a timeline event.
  - Undo: restore the old version, publish it and move the requests back. | Claude, 10 Oct 2026 |
| D-122 | 10 Oct 2026 | **Analytics semantics and scopes (Addendum A):**
- **Pending vs overdue.** Pending = a PENDING task on an IN_PROGRESS request. Overdue = past `due_at`, which is in working hours and paused by holds. Steps without a response time are never overdue.
- **"Approaching"** reuses the 75 % due-soon rule.
- **Counting.** Requests and tasks are counted apart and never added. Aging uses calendar time (since raised and at the current step, separately).
- **Periods.** India time. Raised counts by submission date, outcomes by closing date, decisions by decision date; the comparison is the equally long previous period.
- **Scopes** are resolved on the server: My requests, My approvals, My team (reporting manager), My department (HOD) and Whole organisation (IT only).
- **Freshness.** Figures are live queries with an "As of" time; there is no cache.
- **Metric dictionary** lives in code (`server/analytics/metrics.ts`) and is rendered as a page and a doc.
- **Charts:** SVG with semantic tokens, dash, marker and pattern encoding, and a table view. The palette validator was unavailable (noted as a limitation). | Claude, 10 Oct 2026 |
| D-123 | 10 Oct 2026 | **Reports, exports, schedules, alerts:**
- **Catalogue.** A code catalogue with per-report scopes. One run path (`prepareReport`) serves the screen, the files and the schedules.
- **Exports.** CSV through the formula guard; our own XLSX writer (OOXML in a ZIP, inline strings only, no dependency); PDF via pdf-lib. 5,000 rows max, 20 downloads a minute, audited without data.
- **Schedules** run with the owner's current permissions. Each slot is claimed once (unique schedule + due time). The file is emailed to the owner only (5 MB cap). Inactive owners or lost access pause the schedule, as do three failures in a row.
- **Alerts** check the owner's current scope. They fire once per crossing and cool-down, claimed on the rule, by inbox and email. | Claude, 10 Oct 2026 |
| D-124 | 10 Oct 2026 | **Feature switches** (`features.*`) are ON, OFF or IT_ONLY (an IT trial) for analytics, reports, scheduled reports and alerts, amendments and templates. They only hide features: access checks stay, no data is removed, and the jobs respect them. | Claude, 10 Oct 2026 |
| D-125 | 10 Oct 2026 | **Configuration promotion (FN9):**
- Export the live version as JSON with portable references (login id, group, department and designation codes) and a SHA-256 checksum. The checksum proves integrity, not authenticity.
- Import checks the checksum, schemas, references and validation, shows a diff, and only ever creates a DRAFT.
- Live submission checks of an existing type are never changed by an import; a new type brings its checks.
- Both directions are audited. | Claude, 10 Oct 2026 |
| D-126 | 10 Oct 2026 | **Legal holds and retention (FN10):**
- Holds are placed by the Super Admin only, on a request, a person or an approval type, with a reason to place and to release. They block request deletion for everyone, and housekeeping keeps related rows.
- Retention durations default to 0 (keep for ever) and feed a dry run only. There is no archival or deletion execution until the owner approves a policy and makes a separate decision. | Claude, 10 Oct 2026 |
| D-127 | 10 Oct 2026 | **Attachment fields and collaborators (owner request, v1.6.1):**
- **Attachment fields.**
  - The new field type ATTACHMENT has `maxFiles` (1–5) and can be required.
  - The browser sends `file:<key>`. The server checks each file (type, size, the 20-per-request limit) and puts the count in the field value, overwriting whatever the browser sent.
  - Files carry `request_attachments.field_key`. On resubmit, files already in the field count.
  - Rules on an attachment field can only test filled or empty.
  - Never copied by templates, raise again or follow-ups. Not amendable, and not a duplicate match key.
- **Collaborators** (`request_collaborators`).
  - The requester or IT add any active person except the requester, up to 20, at submit or later.
  - They see the request through `isParticipant` and `visibleToSql`, so search, mentions, files, the PDF and comments all follow. They can comment and add files, and can stop following.
  - They are told when added and when the request is approved, rejected, sent back, resubmitted or withdrawn.
  - They never approve and get no tasks.
  - Adding and removing are audited and appear on the timeline.
  - My requests has a "Shared with me" tab. | Owner request; Claude, 10 Oct 2026 |
| D-128 | 10 Oct 2026 | **Backups live in Private Storage (supersedes the BACKUP_DIR advice in D-104):**
- The Node.js app runs in a container (`/app`). It can persist files only under Private Storage (`/private`); a cPanel `/home/<user>` path is not visible to it (ENOENT on live).
- `BACKUP_DIR` defaults to a `backups` folder beside `UPLOAD_DIR` (`/private/backups`).
- Backup failures are explained in plain words. | Found on live; Claude, 10 Oct 2026 |
| D-129 | 10 Oct 2026 | **Approval expiry is fixed at approval (v1.7.0, A1):**
- When a request of a type with "Approval valid for (days)" is approved, `valid_until` = approval time + those days. A later change to the type's setting never moves dates already given.
- It is cleared if the request leaves APPROVED (reopen).
- The requester is told once, 7 days before (job step `expiry`, claimed per request).
- Expiry is shown (Valid until / Expired on). It doesn't block amendments, which are how an approval is renewed. | Owner list A; Claude, 10 Oct 2026 |
| D-130 | 10 Oct 2026 | **Stopped job runner is noticed from outside (A5):**
- A stopped cron can't report itself. The check runs when `/api/health` is called (uptime monitor) and when IT or the Super Admin open a page, after the answer is sent.
- "Stopped" = last run over 2 hours ago (a runner that never ran shows NEVER on System health instead).
- At most one look per 10 minutes per process; the alert at most once a day (`JOB_RUNNER_STOPPED`). | Claude, 10 Oct 2026 |
| D-131 | 10 Oct 2026 | **Re-check and fix changes copies, never the record (A6):**
- The workflow state (`state_json`) is the record; `approval_tasks` are its copy for queues and reminders.
- "Re-check and fix" rewrites task rows from the state and closes pending rows the state doesn't have (CANCELLED, never deleted), audited as `REQUEST_REPAIRED`.
- "In progress with no open step" is reported, never auto-fixed. | Claude, 10 Oct 2026 |
| D-132 | 10 Oct 2026 | **Confidential fields and the Can export permission (A8, A9):**
- A field marked confidential is shown only to the requester, IT, and anyone who holds or decided a task on the request (or covers a pending one today). Everyone else (collaborators, advisers, the PDF they download) sees "Confidential". Drill-down lists and reports never show form values.
- Downloads stay open to everyone by default. Super Admin can set `features.exports` = ROLE: then downloads, emailed schedules and background exports need the new role **Can export** (`EXPORTER`), or IT. | Owner list A; Claude, 10 Oct 2026 |
| D-133 | 10 Oct 2026 | **Duplicate scope and unique identifiers (A10):**
- Duplicate checks can count anyone's requests (default), the same person's or the same department's.
- Must-be-unique fields (up to 5 per type) refuse a repeat on any open or approved request of the type, at any date, for everyone including IT; a rejected or withdrawn request frees the value.
- Race safety comes from the per-type row lock already taken at submit (D-QA), not a database unique index, so no data migration is needed. | Owner list A; Claude, 10 Oct 2026 |
| D-134 | 10 Oct 2026 | **Analytics drill-down, filters and comparisons (list B):**
- One reader (`server/analytics/query.ts`) turns the address into filters for both the dashboard and the drill-down list, so a list always matches the number it came from.
- Extra filters (status now, approver, step, response-time state, age) are conditions on the request and narrow every number.
- "Previous period" for this month = the same days of last month; for last month = the month before; "Same period last year" is a choice.
- Team and department views compare with organisation rates and times only (never records).
- History charts (backlog, overdue, passed response times) are worked out from request and task times; there is no history table. | Owner list B; Claude, 10 Oct 2026 |
| D-135 | 10 Oct 2026 | **Schedules with recipients, shared views, alert options (B06–B08):**
- Extra schedule recipients are people in the app (by user id, up to 10). Each gets the report run with **their own** permissions for the same scope; anyone who can't is skipped. A schedule never widens what someone sees.
- A shared view shares its name and filters only; each viewer gets their own numbers. One default view per person and page.
- Alerts have a severity, optional quiet hours (India time; CRITICAL ignores them; a held alert goes after they end) and a channel (inbox, or inbox and email). | Owner list B; Claude, 10 Oct 2026 |
| D-136 | 10 Oct 2026 | **Background exports, backup check, rate limits, indexes (list C):**
- Background exports run with the owner's permissions when made, up to 50,000 rows (CSV, Excel; PDF stays 5,000). They are written to private storage beside backups, downloadable by the owner for 7 days, then removed by the job runner.
- `scripts/database/verify-backup.js` restores into a separate empty database only and compares every table's rows and the triggers with the file.
- Analytics pages are limited to 40 loads a minute per person; the readiness check to 20.
- Indexes added on the period columns after measuring (docs/PERFORMANCE_ANALYTICS.md). | Owner list C; Claude, 10 Oct 2026 |
| D-137 | 10 Oct 2026 | **Reports are for IT only; navigation tidy-up (owner, v1.7.1; supersedes the "everyone" part of D-123):**
- Reports (catalogue, downloads, schedules, alerts, background exports) are for IT Admins and the Super Admin, checked on the server by `canUseReports` at every entry point and in the job runner. They live in the Admin space (`/admin/reports`). Analytics stays for everyone.
- Analytics has the same screens in both spaces (`/users/analytics`, `/admin/analytics`), so opening it never changes the space.
- Help and Profile are in the account menu, not the sidebar; "My work" is "Overview". | Owner; Claude, 10 Oct 2026 |
| D-138 | 12 Oct 2026 | **One filter engine for the personal lists (owner, v1.7.2):**
- My requests and Collaborating share `server/requests/list-filters.ts`; Waiting for me extends `queue-filters.ts` the same way.
- Every filter is an address-bar value, parsed and checked on the server and bound as a parameter.
- The base set (raised by me / I'm a collaborator, not removed / waiting for me) is always applied first; filters only narrow it.
- Filter choices (people, departments, steps, types) come only from that base set.
- Saved views use the existing analytics views (targets my_requests, collaborating, queue), open to everyone (not reports).
- The list pages have no route-level loading skeleton, because they host Server Actions (V6-D06). | Owner; Claude, 12 Oct 2026 |
| D-139 | 15 Oct 2026 | **Approved lists (owner, v1.8.0):** "My approved requests" = raised by me, status APPROVED. "Approved by me" = I decided an approval task with APPROVED (decided_by me, so approvals given for someone I cover count; on_behalf_of shows for whom), whatever happened to the request later. Same filter engine (D-138), with tabs and filters per list. | Owner; Claude, 15 Oct 2026 |
| D-140 | 15 Oct 2026 | **Custom approval set-up (owner, v1.8.0):**
- IT (Admin → Custom approval) sets the fields and, for "All of them must approve", "Respond within" and "If nobody to approve", a default and whether people may change it.
- The server applies fixed options to every step (not FYIs) on submit.
- Changes apply to new custom approvals only; each request keeps the form stored with its own workflow version (owner: OK).
- "Specific people" is a search-and-pick picker; work tasks and FYIs list and accept anyone active (namedApprovers checks approval steps only), approval steps approver-eligible people only (D-085). | Owner; Claude, 15 Oct 2026 |
| D-141 | 15 Oct 2026 | **Page access (owner, v1.8.0):**
- Managed by the Super Admin only.
- Every page of My approvals and Admin (server/authorization/pages.ts, with the API routes that belong to it) is Full, View or Hidden for everyone, a department or a person. Person beats department beats everyone; no rule = Full; a space's first page is never hidden.
- Checked on the server in requireArea (page: Hidden → 404) and requireApiArea (Server Actions and change APIs need Full).
- The page address comes from the middleware, signed with SESSION_SECRET. The middleware now also runs on prefetches. Without a valid address, a person with restrictions is refused (fail closed).
- Never applies to the Super Admin. Audited (PAGE_ACCESS_CHANGED / PAGE_ACCESS_DENIED). | Owner; Claude, 15 Oct 2026 |
| D-142 | 15 Oct 2026 | **Inactivity sign-out (owner, v1.8.0; supersedes the 120-minute default):**
- 30 minutes by default; the Super Admin sets 5 to 480 minutes.
- Applies to users and IT admins; the Super Admin is exempt (12-hour limit only).
- The browser's session check no longer counts as activity (it used to keep an open tab signed in for ever). Activity in the page is reported at the next minute's check.
- A warning with "Stay signed in" 2 minutes before. | Owner; Claude, 15 Oct 2026 |
| D-210 | 28 Oct 2026 | **Classic view (owner: "2 views for WebApp, Classic and Compact… Classic based on the sketch (use Tally as reference); the user can switch and save"):** user setting ui.workspace_view (COMPACT default = today's sidebar layout; CLASSIC). Classic: no sidebar; /users shows the Gateway of ARS-CMS (company, signed in as, today; a keyboard menu of the modules with highlighted letters, then Overview dashboard, Search, Calendar, Analytics; At a glance counts); /users/menu/<module> is a module's menu (Approval/Tasks/Information Management) with summary boxes; every page shows Gateway › module › page and the module's pages as tabs; ↑↓ Enter and letters choose; Esc goes up a level (not while typing or in a dialog). The map comes from the same page list as the sidebar (features/shell/users-nav.ts, classic-modules.ts). Switch: profile menu and Profile → Appearance; saved on the account. Overview stays at /users?view=overview. | Owner; Claude, 28 Oct 2026 |
| D-209 | 28 Oct 2026 | **Reminder and escalation rules (owner: "reminders for approvals, tasks… configured from Admin… conditions on any field and the values in it… escalation notification over mail… completely customisable at any level or any scenario"):** Admin → Automation → Reminders & escalations. A rule: Reminder or Escalation; Approvals (pending steps) or Tasks (open tasks); conditions (all/any) on standard fields (type, step, status, requester, approver, departments, priority, hours pending/since raised/overdue) and any form field (form.<key>, numbers compare as numbers, Indian commas ok); up to 10 stages/levels, each after/before an anchor (reached the person, raised, due), optional repeat (every N h, up to 20 times), recipients (assignee, delegate, manager, manager's manager, requester, requester's manager, HOD, IT admins, named people); editable subject/text with placeholders; inbox always, email optional. Job step "rules" (every run) claims each send once (notification_rule_sends unique rule/record/stage/repeat); missed repeats send only the latest. RULE_ESCALATION is a mandatory message (Work waiting for you); RULE_REMINDER can be switched off by people (Reminders). Test previews matches without sending. The fixed step response-time reminders (sla.ts) stay. Migration 202610281200 (new tables). | Owner; Claude, 28 Oct 2026 |
| D-208 | 28 Oct 2026 | **Sign-in "Both" (owner: "add sign-in options as Both so that they can either login through Gmail or user id pass otp"; supersedes D-005's one-method-per-person):** users.sign_in_method gains BOTH (migration 202610281000, additive). allowsGoogle / allowsPassword (types/auth.ts) decide every check: sign-in rule, password sign-in lockout counting, set-password links, invitations (Both gets the set-password link; Google needs no set-up), WhatsApp number required, Google unlink / password clear when a method is removed, CSV import (GOOGLE, PASSWORD or BOTH), security-change notices, Admin user form (third card "Both"), user page, users list and the person's Security page. The sign-in page already offers both ways to everyone. Lockout (failed passwords) applies to the account, so it also pauses Google sign-in for a Both user until it ends. | Owner; Claude, 28 Oct 2026 |
| D-207 | 28 Oct 2026 | **My Approvals menu (owner):** sidebar and Go to order: New request, My pending requests, My approved requests, Waiting for me, Approved by me, Collaborating, Request templates. "My requests" is labelled "My pending requests" in the menu (the page itself keeps its title). | Owner; Claude, 28 Oct 2026 |
| D-206 | 27 Oct 2026 | **Custom approval options, names, Tasks order and Analytics per person (owner):** (1) On the custom approval page levels and parallel steps are for everyone; "Add a DoA matrix", "Add a choice (if / otherwise)" and "Skip this step when…" appear only when IT switches them on in Admin → Custom approval → "What people may add" (step policy `features`, all off by default, also for set-ups saved before); the server refuses them when off (unavailableFeatures). IT's own approval types (Admin workflow builder) keep everything. (2) Renames only (order unchanged): /users/new "New request" → "Request templates"; /users/custom "Custom approval" → "New request" (sidebar, Go to, page titles, breadcrumbs, help, tour, page-access labels, draft label, "Submit request"); the Overview and My requests buttons say "New request" and open /users/custom (owner's choice). The Admin set-up page keeps "Custom approval"; the request type name stays "Custom approval". (3) Tasks group order: New task, My tasks, Assigned by me, Team tasks (sidebar and Go to). (4) Analytics shows each person only the dashboards they need (boardsFor): module boards need the module, SLA needs Approvals or Tasks, Employee analytics a team/department/organisation view, Department analytics HOD or IT, Data quality IT; the overview shows only the person's modules; a dashboard they can't use opens the overview (server-checked). (5) "Opening…" on the Analytics picker stayed after the dashboard loaded (the picker stays mounted across navigation); it now resets when the dashboard or scope changes. | Owner; Claude, 27 Oct 2026 |
| D-205 | 26 Oct 2026 | **Pico Bot trained on the ARS Salesforce (owner: "with all the available data in Salesforce train the Pico Bot and add all the training data in AI Rules for Salesforce"):** "training" = the AI Rules document for Salesforce chats (sent with every question, max 20,000 characters), not model training. A read-only survey of 47 objects (schema, values in use, record counts; no personal data) was condensed into docs/AI-RULES-SALESFORCE.md (~15,400 chars): everyday words to objects/fields (dealer code = Account.Customer_Code__c, Executive = Employee__c, CO/DO = Order, secondary order, regions), key fields and the status values actually used, data traps (quantity/amount test outliers, legacy status fields, same-label fields, Opportunity is demo data), recipes (executives logged in by region, attendance, secondary orders by region and status, dealer 360, targets, collections, stock) and presentation rules. Migration 202610261500 loads it as the SALESFORCE rules only when none exist (never overwrites the IT team's rules); scripts/dev/write-salesforce-rules-migration.mjs regenerates it. Combined chats now also get the rules of each data source they read (ruleScopesFor). Also blocked: date of birth and KYC id fields. Probe: the executives-by-region question went straight to the right single query (was 4-5 lookups). | Owner; Claude, 26 Oct 2026 |
| D-204 | 26 Oct 2026 | **Big requests (owner: "360 degree Dashboard on Dealer Code 1JA02" failed twice with "couldn't put that answer together", then "This chat is limited to Salesforce data"):** (1) the Salesforce-only chat's own instructions listed "Salesforce" among the out-of-scope topics; the list now leaves out the chat's own data, and a request that is only partly answerable (ERP data) is answered for the part it can, with one line on the rest. (2) Longest answer default 1,200 -> 4,000 output tokens (a saved value still wins); an answer cut off at the limit is asked again once with double the room (max 8,000). (3) Eight lookup rounds (was six); the last round keeps the tools described and asks for the written answer (tool_choice none), because Claude refuses a request with earlier tool calls but no tools. (4) Identity and bank fields are never readable either (Aadhar, PAN, bank account, account number, IFSC, MICR): Account carries them. Found: 1JA02 is Account.Customer_Code__c (Akash J Enterprises, Chennai North); the label is "Customer Code", not "Dealer Code". | Owner; Claude, 26 Oct 2026 |
| D-203 | 26 Oct 2026 | **The question leaves the box when sent (owner: the typed prompt stayed in the box while analysing):** the assistant page clears the box as soon as Enter is pressed (the form is read first) and shows the question in the conversation with "Analysing…"; if asking fails, the question is put back to edit or resend. The floating panel already cleared at once; on failure it now also puts the question back (as well as offering Retry). | Owner; Claude, 26 Oct 2026 |
| D-202 | 26 Oct 2026 | **Pico Bot reliability (owner: after v1.23.0 NVIDIA still answered "couldn't read"; on Claude it worked but showed "taking longer than expected" and an odd unchecked 1278786832310):** replayed the owner's questions through the real code with tests/probe (local DB, a stand-in Salesforce built from the real ARS schema; the local NVIDIA key had been removed, so Groq gpt-oss-120b answered). Findings and fixes: (1) everyday names work in lookups: object and field by API name or label ("Executive", "Region", "Last Login"), so one call can answer; the prompt says call count/group directly. (2) A full page of records said nothing about the total ("50 logins" was the page size): the result now says it may be cut off and points to a count. (3) An unanswered question stayed in the history and the model answered it instead of the new one: unanswered questions are dropped from the context. (4) Groq's schema check refused null optional values and other filter shapes: optional values may be null; filters accept {field, operator}, [field, op, value] and operator words, normalised then checked strictly. (5) Provider retries: up to three attempts judged one by one (rate limit waited out, using Groq's "try again in 11.5s" message when there's no whole-second header, up to 20 s; malformed tool call asked again). (6) The assistant page waits up to 5 minutes (was the 30 s form limit). (7) 12+ digit numbers (ids, timestamps) aren't checked figures. The NVIDIA default model nemotron-3.5-bolt-e4b is a small edge model and handles multi-step lookups poorly; Claude answered well. Production check (owner's own Salesforce connector): 2 executives logged in today and no attendance, while Pico Bot reported 422/429, so the app is connected to another org (the UAT sandbox). | Owner; Claude, 26 Oct 2026 |
| D-201 | 26 Oct 2026 | **Pico Bot accuracy (owner: "not able to get any accurate details" from a Salesforce chat on NVIDIA Nemotron):** checked against the live org: no secondary orders were created that day and the real statuses are Draft, Converted, Awaiting Dealer Approval…, so the answers' 150/80/50/20 and "5 orders, 1,250 MT, North/South" were invented. Causes and fixes: (1) a plain date on a date-time field (CreatedDate = 2026-10-26) is a Salesforce error; it is now that whole day in India time (UTC range). (2) Lookup fields (Region__c) returned record ids; lists, breakdowns and filters now use the linked record's Name (Region__r.Name), checked live. (3) The person's words didn't find objects named differently from their label (Executive = Employee__c); objects and fields now show labels. (4) Invented figures were only a hover note; now an answer is challenged once to fetch them, then with no data read it becomes a plain "couldn't read it", and with data the cards and charts showing unchecked figures are removed and a visible note names them; earlier answers with unchecked figures aren't fed back to the model. The checker accepts totals, differences, percentages, rounding and counts worked out from the data. (5) Breakdowns take a second grouping (region then status) and return count with sum and an overall total. (6) Security: secret fields (password, session id, token, secret, OTP, API key; encrypted strings) are never readable, even with "*" (Employee__c has Password__c and Session_ID__c). Prompt: never ask for object/field names, search with the person's words, use date literals, retry a failed lookup, never show sample numbers. | Owner; Claude, 26 Oct 2026 |
| D-200 | 26 Oct 2026 | **Split-screen home page, Google-safe (owner asked why the split screen was gone and chose it back, made Google-safe; supersedes the D-198 page layout):** "/" uses AuthLayout again with `landing`: the brand panel is a labelled region (not aria-hidden), the "Need access?" line is dropped there; the welcome shows the h1 ARS-CMS, the purpose, four features, who can use it, how Google data is used and the privacy link; Sign in fades into the sign-in form (D-190 transition restored). The sign-in pages are unchanged. Lesson: when a fix replaces a layout the owner chose, say so plainly and offer the choice. | Owner; Claude, 26 Oct 2026 |
| D-199 | 26 Oct 2026 | **Rollback to approval.arssteels.net (owner: "Rollback everything to approval.arssteels.net"; supersedes the move in D-196, keeps the ARS-CMS name D-195 and the public home page D-198):** DEFAULT_APP_BASE_URL is https://approval.arssteels.net again; privacy and terms name approval.arssteels.net; template sample links use it. LEGACY_HOSTS stays: with arssteels.net still connected, LEGACY_HOSTS=arssteels.net,www.arssteels.net sends links issued on arssteels.net back to approval. Owner's steps: docs/DOMAIN-MIGRATION.md → Rollback (DNS A record approval, GoDaddy domain, env, cron, CEOITBox, Google Branding). | Owner; Claude, 26 Oct 2026 |
| D-198 | 26 Oct 2026 | **Home page as a public page about the app (Google OAuth review, second attempt; supersedes the D-190 layout for "/"):** after v1.22.1 went live on arssteels.net Google still reported "behind a login page", "doesn't explain the purpose" and "name doesn't match ARS-CMS". The home page used the sign-in split layout (Sign in to continue, Need access?), so it read as a login screen, and the most visible brand was the "ARS Green Steel" logo. "/" now uses the public page shell (header with the logo and the name ARS-CMS, footer with policy links): hero with h1 "ARS-CMS" and the purpose, four features, who can use it, how Google data is used (links to privacy and terms), Sign in links to /login. The sign-in pages keep the split layout. Also found: approval.arssteels.net returns 404 (the GoDaddy app no longer has it connected) and /api/health shows the job runner LATE (cron still calling the old address). | Owner; Claude, 26 Oct 2026 |
| D-197 | 26 Oct 2026 | **Google OAuth verification findings (owner pasted 8 findings):** the review ran against https://arssteels.net while that address still showed GoDaddy's "Coming Soon" page (root A 68.178.145.238; /privacy 404), so it saw no app, no privacy link, no purpose and a different name. The approval subdomain still served v1.20 ("ARS Internal Workspace"). Fix in the app: the home page now states its purpose in visible text (the brand panel is aria-hidden and hidden on phones), including Google Calendar use; the privacy link and full policy were already there. Found: arssteels.net uses GoDaddy name servers (domaincontrol.com), not the owner's Cloudflare, so DOMAIN-MIGRATION.md now does DNS in GoDaddy and the Cloudflare origin lock does not apply. Owner: publish, move the domain, verify arssteels.net in Search Console (TXT), Branding name "ARS-CMS" and the ARS logo, wait 24 h, resubmit. | Owner; Claude, 26 Oct 2026 |
| D-196 | 25 Oct 2026 | **Move to arssteels.net (owner: from the subdomain to the main domain without interruption):** APP_BASE_URL stays the single source of every link; the 13 hard-coded fallbacks now use lib/http/app-url.ts (default https://arssteels.net). Middleware: with LEGACY_HOSTS (e.g. approval.arssteels.net) a visit to a former host gets a 308 to the same path and query on APP_BASE_URL, except the job runner, provider webhooks and /api/integrations/* callbacks, so machine callers and OAuth keep working while they are moved. Email keeps sending from no_reply@approval.arssteels.net (verified in Resend; independent of where the site lives). The owner's runbook (DNS, GoDaddy domain, Cloudflare origin-lock hostname, Firebase authorised domain, Google OAuth client and consent screen, Salesforce callback, cron, CEOITBox webhook, checks, rollback) is docs/DOMAIN-MIGRATION.md. | Owner; Claude, 25 Oct 2026 |
| D-195 | 25 Oct 2026 | **ARS-CMS (owner):** the visible application name is ARS-CMS, Central Management System (supersedes "ARS Internal Workspace", D-188). Changed in titles, home and sign-in pages, manifest, emails, settings defaults, privacy and terms, Pico Bot's introduction. WhatsApp template bodies in templates.ts keep the Meta-approved "ARS Approvals" wording (only email subjects there changed), so no template needs re-approval to keep sending. | Owner; Claude, 25 Oct 2026 |
| D-194 | 25 Oct 2026 | **Site audit and Bug 1 (owner: "run complete end-to-end, touch, navigation, broken links… tests"):** Bug 1 = New chat after an answer bounced back to the old chat: the composer kept its last result (with the old conversation id) across the navigation and replaced the address with it; fixed by keying the composer by conversation. New e2e `zz-site-audit` (runs last): per role (Super Admin, IT Admin, staff) a GET-only crawl of every reachable page (≤260 each, ≤2 filter variants per page) recording 4xx/5xx pages and links, broken downloads, page and console errors, 5xx requests, broken images and sideways scroll; then the menu pages on a 375 px touch phone and the phone menu by tap. Lesson: never run integration tests while e2e runs (they share the test database and reset it). | Owner; Claude, 25 Oct 2026 |
| D-193 | 25 Oct 2026 | **AI Analytics (owner: "all possible AI analytics… usage and utilisation"):** Admin page from ai_messages / ai_conversations, India time, compared with the previous period: questions, answered %, failures, active users vs AI-enabled people (adoption), average and 90th-percentile answer time, conversations, tokens, estimated cost (prices in AI settings), answers using company data and with calculated figures; trend; by chat, department, data lookup (JSON_TABLE over evidence), provider/model, top users; weekday × hour heatmap; failure reasons in plain categories; daily-limit person-days. Read-only; page key admin.ai_analytics. | Owner; Claude, 25 Oct 2026 |
| D-192 | 25 Oct 2026 | **Pico Bot (owner):** the assistant's visible name is "Pico Bot" (Progress Insight Companion Bot); it introduces itself so. Code names (PicBot component, picbot test ids, settings keys) unchanged. | Owner; Claude, 25 Oct 2026 |
| D-191 | 25 Oct 2026 | **Admin → Records (owner):** three registers (approval requests, tasks, information) of every record whoever raised it, for the Admin area (IT Admin, Super Admin); page key admin.records. Read-only SQL with whitelisted sorts and checked filters (server/records/filters.ts), shared columns for the table and the CSV (server/records/columns.ts), 50 rows a page, CSV up to 10,000 rows (UTF-8 BOM for Excel, formula-guarded cells, rate-limited, audited RECORDS_EXPORTED, honours canExport). The amount is left out: it lives in each type's form data and can be a confidential field. Rows link to the record (IT may open any request, task or information item). | Owner; Claude, 25 Oct 2026 |
| D-190 | 25 Oct 2026 | **Landing on the sign-in split layout (owner, supersedes the D-188 header/footer layout):** the home page renders AuthLayout with the welcome; "Sign in to continue" plays a 200 ms leave animation, then opens /login, whose content enters with a 320 ms fade (AuthLayout `.auth-enter`); reduced motion skips both; a plain link without JavaScript. AuthLayout uses min-h-dvh (min-h-full collapsed without a parent height). Brand panel eyebrow: "ARS Steels · Internal Workspace". | Owner; Claude, 25 Oct 2026 |
| D-189 | 25 Oct 2026 | **App-wide clean-up (owner: "complete Admin forms clean-up and all the application cleanup"):** done in four parallel parts (Admin, Super Admin, requests/modules, user pages/analytics/shell). Rule: instructions → hover hints; status, data, errors, empty states, warnings, confirm-dialog text and anything with an email address stay visible. Hints inside links became the link's title (an ⓘ can't sit inside a link). No server, data or business logic changed. | Owner; Claude, 25 Oct 2026 |
| D-188 | 25 Oct 2026 | **Landing page "ARS Internal Workspace" (owner's spec):** minimal public home (header, hero, footer), both Sign in buttons use the existing /login, Privacy / Terms / IT Support use the existing destinations (IT Support = the existing Cloudflare-safe mail link with a label). Visible name changed in the page title template, manifest and sign-in subtitle only; no routes, identifiers, OAuth, sessions or email sender names changed. **Risk flagged to the owner:** the home page was the D-161 page for Google OAuth verification; the Google data-use text now lives only in the privacy policy, and the consent screen's app name must be updated to match. | Owner; Claude, 25 Oct 2026 |
| D-187 | 25 Oct 2026 | **AI Rules (owner: an "AI training module"):** Admin page; one Markdown document per scope (ALL, GENERAL, APPROVAL, TASK, INFORMATION, SALESFORCE, COMBINED) in table `ai_rules`; the editor is a formatted (email-like) document converted to Markdown in the browser and back; each question carries ALL + its chat's rules inside `<company_rules>`, after the safety rules, capped at 20,000 characters. IT Admin and Super Admin; audited with fingerprints. | Owner; Claude, 25 Oct 2026 |
| D-186 | 25 Oct 2026 | **Scrollbars (owner):** thin, theme-coloured, no arrows, in light and dark. | Owner; Claude, 25 Oct 2026 |
| D-185 | 25 Oct 2026 | **Try as for every person (owner):** on the user page, for IT Admin (staff only) and Super Admin (anyone but themselves and break-glass). A browser can't be made to open a private window, so: a signed one-time link (5 minutes) is refused wherever someone is already signed in (never replaces a session); the session (auth_method TRY_AS, `tried_by`) lasts an hour and is **view-only**: the middleware marks every unsafe request (POST/PUT/PATCH/DELETE or a Server Action) and the central session check treats it as signed out, except sign-out and keep-alive. Banner shows who opened it. Audited. | Owner; Claude, 25 Oct 2026 |
| D-184 | 25 Oct 2026 | **AI settings arranged (owner):** General, one card per provider (API key, Model, May see business data, status badges, Test), Common settings; several forms over the same settings group (absent keys are left unchanged). | Owner; Claude, 25 Oct 2026 |
| D-183 | 25 Oct 2026 | **Dropdowns and checkboxes (owner):** enum settings are dropdowns, ON/OFF are switches, a comma list with `choices` (module chats) is checkboxes; stored values unchanged. | Owner; Claude, 25 Oct 2026 |
| D-182 | 25 Oct 2026 | **Chat rename, pin, delete (owner):** ⋯ menu per chat in the sidebar; `ai_conversations.pinned_at`; PATCH /api/ai/conversations/[id] (owner only, audited). | Owner; Claude, 25 Oct 2026 |
| D-181 | 25 Oct 2026 | **Salesforce Settings page (owner):** everything Salesforce moved out of AI settings to /superadmin/salesforce; OAuth returns there. | Owner; Claude, 25 Oct 2026 |
| D-180 | 25 Oct 2026 | **AI module is the assistant only (owner's sketch):** sidebar group "AI Assistant" lists the person's chats (search; ~10 visible, rest scroll); clicking it opens a new chat and the list. AI Dashboard, Business Intelligence and Insights removed (addresses redirect to the assistant; the propose-action tool is unused by the UI). Data Sources, AI Reports (usage, failures, events moved from AI settings) and AI Activity History (everyone's) are under Super Admin → AI Details. | Owner; Claude, 25 Oct 2026 |
| D-179 | 25 Oct 2026 | **Clean UI (owner):** page descriptions, form-field hints and long setting labels become hover hints (ⓘ, keyboard-focusable, screen-reader text kept). The setting-label splitter is a loop, not a regex (a nested regex hung the dev server). | Owner; Claude, 25 Oct 2026 |
| D-178 | 25 Oct 2026 | **Pic bot as a business analyst (owner):** persona and format rules (direct answer first, human tone, no technical words; metrics and chart blocks for dashboards); Pic bot may calculate totals and percentages from tool figures (base figures still only from tools); answers rendered from Markdown to React elements (never HTML); figure check ignores dates; failures shown in plain words (technical reason kept for the Super Admin); new `salesforce_group` tool (GROUP BY with COUNT/SUM/AVG/MIN/MAX, month/year buckets, allowlisted, USER_MODE). | Owner; Claude, 25 Oct 2026 |
| D-177 | 24 Oct 2026 | **Pic bot reliability (v1.18.0):** 6 tool rounds (was 4); a provider 400 for a malformed tool call (tool_use_failed) is retried up to twice; the last round tells the model to answer (Groq refuses a tool call when no tools are offered); Salesforce object and field lists are compact (Groq free tier 8,000 TPM). | Claude, 24 Oct 2026 |
| D-176 | 24 Oct 2026 | **Super Admin unrestricted in Pic bot (owner: "By default give all access to Superadmin. They should not have any restriction"):** every chat mode and Salesforce scope ALL regardless of their own settings and the general/combined/module-chat switches. Kept: the emergency stop (the Super Admin's own kill switch) and a live Salesforce connection; provider "may see business data" still applies (it is about the provider, not the person). | Owner; Claude, 24 Oct 2026 |
| D-175 | 24 Oct 2026 | **Salesforce "all objects" (owner: "allow all objects"):** the allowlist value `*` lets Pic bot read any object the connected Salesforce user can query. Object and field names come from Salesforce describe (cached 10 min), never from the model alone; still read-only, WITH USER_MODE, 50 rows, OWN/ALL scope. The hourly copy ignores `*`. | Owner; Claude, 24 Oct 2026 |
| D-174 | 24 Oct 2026 | **More AI providers (v1.17.0, owner):** the owner's test key was for Groq (groq.com), not xAI's Grok, so Groq was added; the owner also asked for Gemini (Google AI Studio) and NVIDIA Nemotron. All three use the OpenAI-style adapter at their own address (api.groq.com/openai/v1, generativelanguage.googleapis.com/v1beta/openai, integrate.api.nvidia.com/v1); same rules as the others (encrypted key, business data off until approved, active/fallback). Model names may contain "/". | Owner; Claude, 24 Oct 2026 |
| D-173 | 24 Oct 2026 | **Settings form (v1.16.1, owner):** a setting whose schema is a fixed list of choices (z.enum) is shown as a dropdown with plain names; the stored values are unchanged. A plain (not secret) setting left empty, with nothing stored and no default, stays unset instead of being validated, so unused providers don't block a save. | Owner; Claude, 24 Oct 2026 |
| D-172 | 24 Oct 2026 | **Pic bot - ai (v1.16.0), owner's master prompt; owner explicitly authorised building it into ARS Approvals:**
- **Launcher:** a floating launcher with the supplied logo (`public/brand/pic-bot.jpg`) and a chat panel on every page for people with an effective chat mode.
- **Chat modes:** per person (`users.chat_modes`: GENERAL, APPROVAL, TASK, INFORMATION, SALESFORCE, COMBINED; default the three module modes) and per module (`ai.module_modes`). General and Combined are off by default. Effective = global ∩ person ∩ modules (∩ Salesforce scope and connection), re-read per request. A conversation keeps its mode.
- **Salesforce:** one central OAuth connection (web server + PKCE), tokens encrypted, refresh and revoke. Live read-only queries are allowlisted with `WITH USER_MODE`; each person's scope (`users.salesforce_scope`) is NONE, OWN (`OwnerId` of their Salesforce user by email) or ALL. The hourly copy uses the same connection and is optional. Client-credentials settings removed.
- **Limits:** per minute (MySQL), per person (2) and global (10) concurrency with a bounded queue; one retry honouring Retry-After; Stop aborts. Idempotency via `ai_messages.request_key`.
- **Measured:** 10 clients in-process and over HTTP, mocked provider (`CHATBOT_CONCURRENCY_TEST_REPORT.md`).
- **Not verified:** a real Salesforce org or a real provider. | Owner; Claude, 24 Oct 2026 |
| D-171 | 24 Oct 2026 | **zod 3.24.1 → 4.6.7 (security):** CI's production audit failed on GHSA-mrhx-c7xc-m3w5 (high; every zod below 4.6.6; no 3.x fix). Upgraded to zod 4. Two code changes: issue `.type` → `.origin` (settings messages), and `.default({})` → `.prefault({})` for the calendar config's nested object. zod 4's own default messages differ in wording where a schema sets none. | Claude, 24 Oct 2026 |
| D-170 | 24 Oct 2026 | **AI module released as v1.15.0 on `main` (owner):** "create this as a main production ready application and i can publish it in Godaddy". Branch `feature/ai-module` merged into `main` (fast-forward), tagged v1.15.0. Nothing new on GoDaddy except outbound HTTPS to the providers; steps in DEPLOYMENT Part R. | Owner; Claude, 24 Oct 2026 |
| D-169 | 24 Oct 2026 | **AI module built, all phases (owner: "complete all the phases in one go"):**
- **Providers:** Claude, ChatGPT, Grok and DeepSeek behind one `chat()` interface (tool calling in both API shapes). Keys are encrypted settings, with Active + Fallback and a Test button.
- **Data permission:** one per provider, "may see business data", NOT_ALLOWED by default. Without it the provider answers without tools.
- **Tools:** fixed, parameterised and limited to the person (approvals, requests, tasks, information, Salesforce datasets), re-checking modules when they run. Numbers come from tools; any figure missing from the data is flagged.
- **Proposals:** human approval only. The approver is the reporting manager (else an IT Admin), never the asker or the AI. Version and hash are checked, and proposals expire after 7 days. Execution is switched off.
- **Connector framework:** sync runs, checkpoints and records, plus a read-only Salesforce client (client credentials), hourly via the "ai" automation.
- **Not connected:** Oracle (needs a relay; GoDaddy can't reach it) and Power BI.
- **Docs:** `docs/ai-module/`. | Owner; Claude, 24 Oct 2026 |
| D-168 | 24 Oct 2026 | **AI module: one application, API-based models, same repository (owner):**
- The owner's brief asked for an independent AI platform (FastAPI, Ollama, separate subdomain). The owner then answered: API-based models only; deploy as a single application; use the same repository; providers Claude, ChatGPT, Grok and DeepSeek, switchable.
- So: AI is the fourth module inside ARS Approvals, written in TypeScript, on branch `feature/ai-module` in worktree `D:\Omniroute\ars-ai-module`. `main` and the live site are untouched until the owner merges and publishes.
- **Module access:** Approval, Task, Information and AI are per-person grants (`users.module_access`, a SET column whose default is Approval + Task + Information, so no way of creating a person can leave them out), enforced inside page access (pages, actions, APIs); Super Admin exempt; existing users backfilled to Approval + Task + Information (no change), AI to nobody.
- Design: `docs/ai-module/`. | Owner; Claude, 24 Oct 2026 |
| D-167 | 23 Oct 2026 | **Onboarding tour for the user space (v1.14.0, owner):**
- 15 steps: Welcome, Overview, New request, Custom approval, Waiting for me, My requests, My tasks, New task, Information, Calendar, Google Calendar, Notifications, Go to and search, Out of office, Finish (`features/help/tour-steps.ts`).
- Each step opens its page and highlights one part (`data-tour` markers); the card docks at the bottom on phones; Back / Next / Skip, ← → and Esc; focus stays in the card. Steps for pages hidden by page access are left out.
- Opens by itself once, on Overview, until finished or skipped (never by itself in a demo "Try as" session) (flag TOUR_DONE in `user_flags`, every device). "Take the tour" in the account menu, Help and the first-use card (`/users?tour=1`).
- Same day (owner): Re-invite and Reset password are on the user page only, not the users list (supersedes that part of D-166). | Owner; Claude, 23 Oct 2026 |
| D-166 | 23 Oct 2026 | **Invite user and reset password by email (v1.13.0, owner):**
- **Add user** has "Email an invitation now" (ticked by default). **Re-invite** and **Reset password** are on the user's page and on each row of the users list.
- Google users are told to sign in with Google as their email; password users get their User ID and a set-password link (72 h, older links stop working). Reset has its own wording; the current password works until a new one is set. Before a first password there is nothing to reset (the plain set-password link is used).
- **Owner choice:** the WhatsApp code on set-password stays (D-025 unchanged). Messages are email only (USER_INVITED, PASSWORD_RESET_LINK; audit USER_INVITED, PASSWORD_RESET_LINK_SENT).
- Same rules as editing the user; never on your own row, inactive or break-glass accounts. The link is never shown to the admin. | Owner; Claude, 23 Oct 2026 |
| D-165 | 23 Oct 2026 | **Route handlers redirect to own pages with a relative address (v1.12.6):** behind GoDaddy's proxy `request.url` is `http://localhost:<port>`, so `new URL(path, request.url)` leaked it (the calendar callback sent people to localhost:20011). `redirectToPage(path)` in `lib/http/redirect.ts` answers 303 with a relative Location and refuses other sites. The middleware's own redirects were already relative. | Owner report; Claude, 23 Oct 2026 |
| D-164 | 20 Oct 2026 | **A page from an older build says to reload (v1.12.5):**
- Every publish makes new Server Action ids (Next 15 salts them per build), so a page opened before a publish gets "Server action not found" for every submit, delete or draft save.
- Forms map Next's `UnrecognizedActionError` to "ARS was updated since this page opened… reload", and raise a **Reload page** banner. `/api/auth/status` returns the build (`.next/BUILD_ID`); the minute session check compares it with the build that made the page.
- A server error with a digest shows a reference for IT; other unexpected answers are named. The session-ended check still runs first. | Owner report; Claude, 20 Oct 2026 |
| D-163 | 20 Oct 2026 | **File storage failures are named, not hidden (v1.12.4):**
- A failed write to `UPLOAD_DIR` is classified (NOT_SET, NO_PERMISSION, MISSING, READ_ONLY, FULL, OTHER), logged with its code, and sent once a day as a Super Admin alert (FILE_STORAGE_FAILED).
- People get a plain storage message with their input kept.
- Super Admin Overview shows a File storage panel; `/api/health` reports storage ok or failed. | Owner report; Claude, 20 Oct 2026 |
| D-161 | 17 Oct 2026 | **Public home page, privacy policy and terms (owner, v1.12.2):**
- `/`, `/privacy` and `/terms` are public, for Google OAuth verification. `/` sends signed-in people to `/users`.
- The privacy policy must stay true to what the calendar sync does (scopes, stored fields, encryption, revocation) and keep the Limited Use statement. Change the two together.
- WEB-07 (no invented legal pages) is superseded: the pages state facts about the app; the owner approves the wording. | Owner; Claude, 17 Oct 2026 |
| D-162 | 17 Oct 2026 | **Calendar scope narrowed to calendar.events.owned (v1.12.2):** least privilege for verification. Events list, insert, patch, delete and watch all accept it (Google reference, checked 17 Oct 2026); the calendar picker uses `minAccessRole=owner`. | Claude, 17 Oct 2026 |
| D-158 | 17 Oct 2026 | **Inactivity sign-out for everyone, with a signed-out page (owner, v1.12.1):** supersedes the Super Admin exemption of v1.8.0.
- After the set minutes without activity (default 30), any session is ended for good (revoked as IDLE_TIMEOUT).
- The next visit, or the open page itself, goes to `/signed-out?reason=…`, which explains why and links to sign in again.
- `/api/auth/status` reports the reason for the browser's own session only. | Owner; Claude, 17 Oct 2026 |
| D-159 | 17 Oct 2026 | **Analytics pickers are dropdowns (owner, v1.12.1):** the dashboard and "Whose numbers" are selects that open the choice at once (D-156 otherwise unchanged). | Owner; Claude, 17 Oct 2026 |
| D-160 | 17 Oct 2026 | **Google Calendar across domains (owner, v1.12.1):**
- The Google OAuth consent screen must be External, and published, so people from every ARS domain can connect.
- Internal gives "Error 403: org_internal".
- No domain restriction in ARS. | Owner; Claude, 17 Oct 2026 |
| D-157 | 16 Oct 2026 | **Analytics Center metric rules (v1.12.0):**
- **Rates:** never divide by zero; with nothing to divide by they show "—".
- **Completion rates are cohorts:** of what was raised or created in the period (cancelled and withdrawn left out), the share finished by now.
- **Acknowledgement rate:** eligible recipients (fixed at publishing) are the denominator. Opening and delivery are separate measures.
- **On-time:** uses the real completion and due times only. No `updated_at` substitutes; tasks without a due date are counted separately.
- **Department attribution:** requests by raiser, tasks by assignee, information by sender, acknowledgements by recipient, each by their department now.
- **Unavailable metrics are shown as unavailable:** acknowledgement deadlines, total views, effort and utilisation, dependencies, recurrence.
- **Every metric is in the dictionary** with its board, reliability and limits. | Owner brief; Claude, 16 Oct 2026 |
| D-156 | 16 Oct 2026 | **One Analytics page with nine boards (v1.12.0):**
- **Boards:** Executive overview, Approval analytics (the existing screen), Task, Information, Employee, Department, SLA & performance, Trends & forecasts, Data quality.
- **Navigation:** the boards are tabs, not separate navigation items.
- **Shared:** scope, period and comparison, which carry over between tabs. Older links with approval filters open the Approval board.
- **Computing:** server-side aggregation only, the existing scopes, and no cross-user caching.
- **Exports:** CSV (employees, departments, 24 months) with the same scope, rate-limited and audited. | Owner brief; Claude, 16 Oct 2026 |
| D-155 | 16 Oct 2026 | **One calendar page (v1.11.0):**
- `/users/calendar` shows approvals waiting on the person, their tasks, calendar-eligible information, needed-by dates and personal entries, by month, week or day, with filters.
- Older `?month=` links still work. Each entry shows its source and its Google sync state.
- Personal entries (`calendar_items`) are visible only to their owner. | Owner brief; Claude, 16 Oct 2026 |
| D-154 | 16 Oct 2026 | **Calendar sync runs from the 5-minute job runner (v1.11.0):** GoDaddy has no always-on worker.
- **Reconciliation:** each connection is reconciled on the interval (default 15 min). Push notifications queue a sync sooner.
- **Jobs:** collapse while waiting (one per connection and kind); one sync per connection at a time (lock); exponential backoff with jitter; DEAD after the retry limit, then a Super Admin alert. "Sync now" queues and runs after the response, never inside it. | Claude, 16 Oct 2026 |
| D-153 | 16 Oct 2026 | **What syncs and how (v1.11.0):**
- **Business dates:**
  - approval due times (approver), task due times (assignee), needed-by (off by default), information with an effective date of types marked "Show on calendars";
  - ARS is the source: Google edits are put back; Google deletions follow the policy (stop syncing, or recreate);
  - **never** an approval, completion or acknowledgement.
- **Personal entries:** two-way. Conflicts follow the policy (default: the person reviews).
- **Events:** fixed ids per record (idempotent); a content hash means unchanged records write nothing; stored etags mean ARS's own writes don't loop; private; reference-only text by default. | Owner brief; Claude, 16 Oct 2026 |
| D-152 | 16 Oct 2026 | **Google Calendar is set up by the Super Admin, connected by each person (v1.11.0):**
- **Super Admin:** one OAuth client (secret encrypted, never shown); "Enabled" only after every check passes; the set-up gives no access to anyone's calendar.
- **Each person:** OAuth with least-privilege scopes; single-use state + nonce cookie; tokens encrypted; disconnect revokes them.
- **Owner:** creates the Google Cloud OAuth client (Q-024). | Owner brief; Claude, 16 Oct 2026 |
| D-151 | 16 Oct 2026 | **Page rules follow the action (v1.10.0, G-3):**
- An action or API that belongs to a page names its page key (`requireApiArea(area, { page })`, `getAdminActor(pageKey)`). Its rule is checked as well as the rule of the address it was posted to.
- Super Admin addresses refuse everyone else.
- "Sign-in & devices" is not restrictable (SEC-17): it is a personal security control. Rules saved for it before are ignored.
- An API route must call `requireApiArea` unless it is on the reasoned public list in `tests/security/route-inventory.test.ts`. | Claude, 16 Oct 2026 |
| D-150 | 16 Oct 2026 | **Security hardening (v1.10.0, owner brief SEC-01 to SEC-19):**
- **Seed:** gives `itadmin` roles only when it has none (AUD-03).
- **CSV import:** applies the P-04 contact rule (AUD-01).
- **Headers:** `Cache-Control: private, no-store` on every non-static answer; API preflights get no CORS grant; production redirects visitors Cloudflare reports as plain HTTP.
- **Limits:** per-person DB-backed limits on the costly signed-in routes and the webhook (`server/security/limits.ts`).
- **Audit:** request lifecycle changes go to the central audit log.
- **Not done, with reasons:**
  - **CAPTCHA:** not added, because there are no anonymous forms (SEC-11).
  - **Dependency findings:** accepted (build tooling only; the fixes are major upgrades).
  - **Malware scanning:** not available on shared hosting. | Claude, 16 Oct 2026 |
| D-149 | 16 Oct 2026 | **User sidebar, regrouped (owner, v1.9.2):**
- Order: Overview; My Approvals (New request, Custom approval, Waiting for me, My requests, My approved requests, Approved by me, Collaborating); Tasks (My tasks, Assigned by me, Team tasks, New task); Information (Information inbox, Sent by me, New information); Search; Calendar; Analytics.
- The three groups are collapsible. The current page's group opens by itself; open or closed choices are kept in the browser (localStorage `ars.nav.groups`).
- Admin and Super Admin sidebars keep plain headings. | Owner; Claude, 16 Oct 2026 |
| D-148 | 16 Oct 2026 | **Optional triggers in migrations (v1.9.1):**
- A trigger block may be marked `-- @optional`. When the database user isn't allowed to run it (hosted MySQL with binary logging refuses CREATE TRIGGER without SUPER), it is skipped with a warning naming the SQL file to run in phpMyAdmin. Other errors, and unmarked triggers, still stop the migration.
- Used only for the v1.9.0 task and information history guards, because the app only inserts there.
- The audit-log, timeline and comment triggers stay required (D-012). | Claude, 16 Oct 2026 |
| D-143 | 16 Oct 2026 | **Three business modules (owner, v1.9.0):**
- **Approvals** stay on the one graph engine (D-001).
- **Tasks** and **Information** are new, independent records with their own lifecycle, never stored only as notifications.
- A task's completion never approves anything, and reading or acknowledging information never completes a task or approves anything.
- A task may point to an approval request (`related_request_id`), but their states stay separate.
- The approval engine's "work" steps stay part of approvals. | Owner; Claude, 16 Oct 2026 |
| D-144 | 16 Oct 2026 | **Module set-up is configuration, versioned (v1.9.0):**
- IT keeps **Task types** and **Information types** in the Admin space, each with a form made by the same field builder as approval types (D-055).
- A type has versions: a draft is edited, checked, previewed and published; the published version is used for new records; each record keeps the version it was made with.
- A type can be retired (no new records) and reactivated.
- Fields of a published version are never changed in place; a new version is made instead.
- Who may create a record of a type: everyone, chosen departments or chosen people.
- Task types set the allowed steps (Blocked on or off; reopen; reassign; who may cancel), whether a completion note or file is required, default priority and due days, reminders and the assignment scope.
- Information types set acknowledgement, expiry days, who may be sent to and reminders.
- Every change is audited with before and after values. | Claude, 16 Oct 2026 |
| D-145 | 16 Oct 2026 | **Information recipients are fixed when it is published (v1.9.0):**
- Departments, groups and "everyone" are resolved into a person list at publishing and stored. People who join later don't receive it; people who leave keep their record.
- Read (opened) and acknowledged (a separate button, when the type asks for it) are recorded separately, with time and person. | Claude, 16 Oct 2026 |
| D-146 | 16 Oct 2026 | **Notification categories and the bell (owner, v1.9.0):**
- Each notification has a category (APPROVAL, TASK, INFORMATION, SYSTEM) and its related record.
- Older notifications get their category from their event type, using the same list.
- The bell opens a dropdown of the latest 10 (newest first, by id) with type filters. **Read more** opens the Notifications page with All / Approvals / Tasks / Information views. Neither marks anything read by itself. | Owner; Claude, 16 Oct 2026 |
| D-147 | 16 Oct 2026 | **Approval integrity and raiser scope (owner brief, v1.9.0):**
- An approval type can be limited to departments or people who may raise it, checked on the server.
- On resubmit, if the new values change the route (a skipped level, a condition or a DoA band), the request restarts from the beginning; the earlier history stays. This supersedes the per-type restart choice only when the route changes; owner question Q-022 can later choose "earliest affected step".
- One person can't decide two tasks of the same step in the same round (audit AUD-05, AUD-02). | Owner; Claude, 16 Oct 2026 |
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
| Q-016 | **Loader audit fixes** (docs/qa/LOADER-QA-REPORT.md): may I fix DEF-02 (High: a failed form answer crashes the page), DEF-03 (no time limit) and DEF-06 (unreadable busy button) before the next Publish, then DEF-01/04 and the Low ones? | Before the next Publish | **Answered 9 Oct 2026:** owner said complete the failed tests → all 9 fixed and retested (QA session 14) |
| Q-017 | **Dependency upgrades (DEF-E1):** `npm audit` shows 6 high / 7 moderate in production deps. Upgrade Next to 15.5.27 (patch) and firebase-admin to 14.5.0 (minor) now, and plan the firebase client major upgrade? | Before or with the next Publish | **Answered 9 Oct 2026: yes → D-093** (done in v1.3.4) |
| Q-018 | **Rate-limit IP source (DEF-E2):** is all traffic to approval.arssteels.net forced through Cloudflare? If yes, use `CF-Connecting-IP`; if not, the right-most X-Forwarded-For entry added by GoDaddy's proxy. A wrong choice could put all users on one address. | Before go-live | **Answered 9 Oct 2026: yes, all traffic goes through Cloudflare → D-092** (done in v1.3.4) |
| Q-019 | **Which Resend account holds the API key in Super Admin?** The "arsenergy" team (open in Chrome) is empty. Email works only once the From domain (`approvals@arssteels.net`) is verified in the account that owns the key, or a new key from a team with a verified domain is entered. | Before go-live (no email is delivered today) | **Answered 9 Oct 2026:** the key is "New Api Approval" in the Resend team "arssteels" (harishkumar.t@arssteels.com). The owner verified `arssteels.net` there; Resend's log showed "API key not authorized for this domain" for a few minutes after verification, then the test email was **sent** |
| Q-020 | **Production database time zone** (audit AUD-04): the app writes UTC times but compares them with the database clock, and never sets the session time zone. Run `SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();` on live. | Before V181-A4 | Open, waiting on the owner (16 Oct 2026) |
| Q-021 | **Is `ORIGIN_SECRET` set on GoDaddy, and may it become mandatory in production?** (audit AUD-15: without it, per-IP sign-in limits can be bypassed) | Before V181-A10 | Open, waiting on the owner (16 Oct 2026) |
| Q-022 | **Resubmit after the amount or conditions change** (audit AUD-02, runtime-confirmed: a skipped higher DoA level stays skipped): restart from the earliest affected step (recommended) or from the beginning? | Before V181-A1 | Open, waiting on the owner (16 Oct 2026) |
| Q-023 | **Further owner decisions from the audit:** DR-01 join rejection semantics; DR-02 no approval without a human decision; DR-03 controls on IT changing approvers' contact details; DR-04 Super Admin inactivity limit; DR-05 what an expired approval means; DR-06 retention durations; DR-08 off-site encrypted backups and RTO/RPO (see `application-audit/12_DECISION_REGISTER.md`) | Before Phase B and D | Open, waiting on the owner (16 Oct 2026) |
| Q-024 | **Google Calendar (v1.11.0):** create the Google Cloud OAuth client (Web application, redirect URI in DEPLOYMENT Part Q). Internal or External consent screen? If External, publish it: Testing mode limits access to 7 days. | Before enabling the integration | Open, waiting on the owner (16 Oct 2026) |
| Q-025 | **Google OAuth verification (v1.12.2):**
- Use a separate Cloud project from the Power BI site? Its name and logo show on that project's consent screens.
- Support email: a Google Group or the filing account (itadmin@ is an alias).
- Who approves the privacy policy and terms? | Before filing | Open, waiting on the owner (17 Oct 2026) |

## 5. Work log (newest first)

### 28 Oct 2026 (v1.27.0: Classic view; reminder and escalation rules)
- D-209 rules with unit (tests/notifications/rule-model.test.ts), integration (tests/integration/notification-rules.int.test.ts: form-field escalation to manager and IT once, repeats, tasks) and e2e (v127: build, test, save, off, delete).
- D-210 Classic view with unit (tests/ui/classic-modules.test.ts) and e2e (v127: switch, Gateway, letters, Enter, tabs, Esc, saved, back to Compact) with screenshots checked.

### 28 Oct 2026 (v1.26.0: sign in with Google or password)
- D-208 with unit (rules, form), integration (tests/integration/sign-in-both.int.test.ts) and e2e (v1130: Add user with Both) tests.

### 28 Oct 2026 (v1.25.1: My Approvals menu order)
- D-207; v190 and session9 e2e updated and passing.

### 27 Oct 2026 (v1.25.0: custom approval options, renames, Tasks order, Analytics per person)
- D-206 with unit tests (tests/approvals/v1250-custom-features.test.ts) and e2e (v180: options off by default then switched on; v1120: "Opening…" ends, a plain user's dashboards; v190: new names); navigation for every role checked by the site audit.

### 26 Oct 2026 (v1.24.0: Salesforce guide in AI Rules)
- D-205. Survey by a helper agent (read-only Salesforce connector, 47 objects); guide written and checked (dealer-360 and region queries run on the live org); migration applied locally, stored text identical to the guide. Unit 661, integration 268 pass.

### 26 Oct 2026 (v1.23.3: big requests)
- D-204. Probe: the dealer request found Account by Customer_Code__c in one query with Aadhar/PAN hidden; Groq's free tier (8,000 tokens a minute) can't finish a multi-lookup dashboard. Unit 660, integration 268 pass.

### 26 Oct 2026 (v1.23.2: question leaves the box when sent)
- D-203; Pico Bot e2e asserts the box is empty right after Enter (8 pass).

### 26 Oct 2026 (v1.23.1: Pico Bot reliability)
- tests/probe (local only, not in any suite): `npx vitest run -c tests/probe/vitest.probe.config.ts --silent=false` with PROBE_QUESTIONS ("||" separated), PROBE_PAUSE_MS, PROBE_ONLY_ACTIVE; prints the model's lookups and answers, never keys; restores the local Salesforce status and fallback provider.
- With the fixes the three owner questions (executives by region, attendance today, secondary orders by region and status) were answered from the data in 2-5 lookups.
- D-202 fixes with unit tests; unit 658, integration 268, Pico Bot e2e 8 pass.

### 26 Oct 2026 (v1.23.0: Pico Bot accuracy)
- Reproduced with the Salesforce connector (read-only, production org): CreatedDate = 2026-10-26 fails (must be dateTime); TODAY and the UTC range work; no secondary orders that day (2 executives logged in); Region__c is a lookup (ids), Region__r.Name aliased groups work; Executive = Employee__c with Last_Login__c, plus Password__c and Session_ID__c (now blocked).
- Fixes D-201 with unit tests (dates, lookups, two-level groups, secrets, figure checks, guarded answers) and updated integration tests (challenge round, describe call). Unit 655, integration 268, Pico Bot e2e 8: all pass.

### 26 Oct 2026 (v1.22.4: split-screen home page back, Google-safe)
- Rollback checked live: approval.arssteels.net serves v1.22.3 (home, privacy, terms, login, health ok, job runner OK); arssteels.net and www point to another GoDaddy service (TLS error).
- Home page back on the split screen with the Google-required content (D-200); checked at 1440 px and 375 px (no sideways scroll), Sign in → /login.

### 26 Oct 2026 (v1.22.3: rollback to approval.arssteels.net)
- Live check before rollback: arssteels.net runs v1.22.2, job runner OK; the approval DNS record is gone (no A record, zone serial 2026102604).
- Code default, policy pages, template samples and CLAUDE.md back to approval.arssteels.net (D-199); rollback runbook at the top of docs/DOMAIN-MIGRATION.md.

### 26 Oct 2026 (v1.22.2: home page for Google's second review)
- Live check: arssteels.net serves v1.22.1 (home, /privacy, /api/health ok); approval.arssteels.net 404 at GoDaddy; job runner LATE.
- Home page rebuilt as a public page about ARS-CMS (D-198), checked at 1280 px light and 375 px dark (no sideways scroll); LandingWelcome and the .auth-leave animation removed; e2e updated.

### 26 Oct 2026 (v1.22.1: Google OAuth verification findings)
- Checked the live sites: arssteels.net and www show GoDaddy "Coming Soon" (/privacy 404); approval.arssteels.net serves the older v1.20 build. Name servers for arssteels.net are GoDaddy's.
- Home page: visible purpose paragraph (D-197), checked at 375 px (no sideways scroll; privacy link present); e2e assertion added.
- docs/DOMAIN-MIGRATION.md: DNS steps moved to GoDaddy; new "Google verification" section mapping each of Google's 8 findings to its fix and the order to resubmit.

### 25 Oct 2026 (v1.22.0: Bug 1, Pico Bot, AI Analytics, ARS-CMS, domain move prepared, site audit)
- Bug 1 (owner's steps recording): New chat after an answer returned to the old chat; fixed (composer keyed by conversation) with an e2e regression test.
- Renames: the assistant is Pico Bot (D-192); the app is ARS-CMS (D-195).
- AI Analytics page (D-193) with unit, integration and e2e tests.
- Domain move prepared (D-196) and docs/DOMAIN-MIGRATION.md written for the owner.
- Site audit on the full e2e data: no broken links or pages, no page or console errors, no 5xx. Real findings fixed: six pages scrolled sideways on a 375 px phone (an absolutely positioned .sr-only label in wide tables escaped the card's scroll area; fixed globally; two more, AI Analytics and AI Reports, came from grid items keeping their min-content width on a phone: `.grid > * { min-width: 0 }`); the audit hit the export rate limit (429; now one check per download address). One test matched "Analytics" against the new "AI Analytics" link (exact match now). The first audit run failed because integration tests ran at the same time on the shared test database (lesson in D-194). Static link check of the code: no broken internal links. npm audit (production): 0.

### 25 Oct 2026 (v1.20.0: clean-up and landing page)
- Clean-up by four parallel agents (D-189); one paused on a usage limit and was resumed; a mid-edit syntax error briefly showed in the dev server and was fixed.
- Landing page (D-188) checked in the browser: desktop, 375 px (light theme) and 320 px; no horizontal scroll; Sign in → /login; /users still redirects when signed out.

### 25 Oct 2026 (v1.19.0: analyst chat, clean UI, Try as, AI Rules)
- Owner requests through the session: ChatGPT-like analyst with dashboards and insights; no technical parts; clean UI with hover instructions; AI pages restructured from a hand sketch; Salesforce Settings; dropdowns/checkboxes; AI settings by provider; chat pin/rename/delete; Try as for everyone in a private window; themed scrollbars; AI Rules.
- Verified locally: NVIDIA answered a pipeline dashboard (54 opportunities, table, take-aways); an AI Rule ("call opportunities deals", closing line) was followed; Try as: the link was refused in a signed-in window, opened a view-only session in a clean client, refused chat, Server Action and API changes, allowed sign-out, and refused reuse.
- Found and fixed while testing: a nested regex in the setting-label splitter hung the dev server (now a loop, with a timing test); Try as skipped the view-only check for demo people (fixed; a test chat it created was deleted); hover tips caused a horizontal scrollbar (now display:none until hovered); Groq free tier (8,000 TPM) too small for multi-round analyst answers; NVIDIA used for local tests.
- Migrations (additive, applied locally; run on start in production): 202610251200_ai_chat_pins, 202610251300_try_as, 202610251400_ai_rules.

### 24 Oct 2026 (v1.18.0: Salesforce all objects; Super Admin unrestricted)
- Owner: Salesforce chat not visible for a demo person. Cause: the person needs the Salesforce chat ticked and a scope; the allowlist held the literal placeholder "Object:Field". Owner asked to allow all objects (D-175) and to give the Super Admin everything (D-176).
- Groq trial: "tool_use_failed", then "tool choice is none", then the free-tier 8,000 TPM limit; fixed by D-177. Then "How many Account records are there?" answered 90 from the UAT sandbox (demo person, scope ALL).
- CI on v1.17.1 failed one e2e (expected four providers); fixed. Lint, typecheck, unit 621, integration (AI) 19 passed.

### 24 Oct 2026 (v1.17.0: Groq, Gemini, NVIDIA)
- The owner's "Grok" test key started with gsk_ (Groq). Asked; the owner chose to add Groq, then Gemini and NVIDIA Nemotron (D-174).
- **Local test:** Groq key entered on the local AI settings only (owner's test key, typed in chat for this app). The first Test returned "empty answer": gpt-oss is a reasoning model and the Test allowed 20 tokens. Raised to 1024 and added a "ran out of room" message; Test then passed (0.8 s). Pic bot refused an Approvals question because Groq is not approved for business data (correct).
- Lint, typecheck, unit 619 passed; e2e left to CI.
- **v1.17.1:** the owner sent NVIDIA's reference (nemotron-3.5-bolt-e4b) and a test key; entered locally only; Test passed (0.5 s). The guessed default model replaced by this one.

### 24 Oct 2026 (v1.16.1: settings fixes while testing Pic bot locally)
- **Owner report:** saving AI settings failed on the empty ChatGPT and Grok model boxes ("Too small…"). Fixed (D-173); the owner also asked for dropdowns for the business-data choice, done for every fixed-choice setting.
- **Local test:** the DeepSeek key works but the account returned HTTP 402 Insufficient Balance; Pic bot answers need a funded provider.
- Lint, typecheck, unit 618 passed. E2E left to CI (the preview server was using the main checkout's .next).

### 24 Oct 2026 (Salesforce UAT connect; deployment check)
- **Salesforce UAT sandbox:** the owner made a separate External Client App. Connect failed first with `redirect_uri_mismatch` (callback not yet in the app), then `invalid_scope` (the app had only `mcp_api` and `refresh_token`; Pic bot uses the REST API and needs `api`). After the owner added `api`, the sign-in returned to `localhost:3000`, which had been stopped; restarting it and reloading the callback finished the connect. **Test connection passed.** Connected as a person's account for the trial; a read-only integration user is still recommended (PB-15).
- **Not MCP:** Salesforce Hosted MCP (`api.salesforce.com/platform/mcp/…`, scope `mcp_api`) is for MCP clients such as Claude's connector; Pic bot calls Salesforce directly with allowlisted SOQL. The My Domain setting takes the org's login domain, not an MCP address.
- **Release state:** `main`, `feature/pic-bot` and `origin/main` are the same commit (v1.16.0, CI green). Docs only this session: deployment-guide troubleshooting (PB-14), V-11 verified in UAT.

### 24 Oct 2026 (v1.16.0: Pic bot - ai)
- **Owner request:** the master prompt `Pic_bot_ai_Claude_Master_Prompt.md` (floating logo from a supplied image, chat modes, module and user permissions, Salesforce in Super Admin, concurrency, tests, docs). The prompt excluded approval.arssteels.net unless authorised; the owner authorised ARS Approvals when asked.
- **Audit first** (`docs/CHATBOT_ARCHITECTURE_AUDIT.md`, `CHATBOT_CURRENT_STATE_AUDIT.md`), then the plan, then the build on branch `feature/pic-bot` (D-172).
- **Measured:** 10 concurrent people in-process (10/10, avg 773 ms with a 300 ms mock provider, 2 calls) and 10 HTTP clients on the production build (10/10, avg 797 ms). A global limit of 4 queued and still served all 10.
- **Fixed during testing:** focus didn't return to the launcher after Escape (the launcher is unmounted while the panel is open; now focused after it reappears); the audit query used `created_at` instead of `occurred_at`.
- **Shell lesson:** long python-in-bash heredocs failed to parse several times; script files in the scratchpad worked.

### 24 Oct 2026 (AI module branch: phases 4 to 8)
- **Phase 4:** an "AI" sidebar group (own icon), seven AI pages, AI settings under Super Admin, and the "ai" feature switch.
- **Phase 5:**
  - providers (`server/ai/providers.ts`), settings (`ai.*`, encrypted keys) and routing (`config.ts`);
  - tools (`tools.ts`), the orchestrator (`assistant.ts`) and the figure check (`validate.ts`);
  - the Assistant with evidence, plus History and a Dashboard of live figures.
- **Phase 6:** `ai-data.repository.ts`; the connector framework; the Salesforce client; the AI upkeep job; Data Sources with real status.
- **Phase 7:** proposals (`proposals.ts`) and Insights & Recommendations.
- **Phase 8:** documents, a tour step, and tests: `tests/ai/ai-engine.test.ts` (12) and `tests/integration/ai-assistant.int.test.ts` (8, with fake fetch), plus additions to `tests/e2e/ai-modules.spec.ts`.
- **Mid-way (owner):** a test API key is entered by the owner in AI settings. I don't enter keys.
- **Lesson:** don't run the preview dev server and the full E2E suite in the same folder; they share `.next` (32 false failures earlier).

### 24 Oct 2026 (AI module branch: discovery, decisions, module access)
- **Owner brief:** "ARS Approval Platform — Independent AI Module Upgrade" (a fourth module, AI; independent codebase; FastAPI; Ollama; Salesforce and Oracle; module access in user management).
- **Phase 1 discovery** written to `docs/ai-module/` (existing architecture, user schema, roles, guards, page access, sidebar, hosting, risks).
- **Owner answers** re-scoped it (D-168): API-based models only; one application; the same repository; Claude, ChatGPT, Grok and DeepSeek switchable. Work moved to branch `feature/ai-module` in worktree `D:\Omniroute\ars-ai-module`; `main` untouched.
- **Phase 3 module access built:** migration `202610240900_ai_module_access.sql`; `server/modules/modules.ts`; pages name their module and `checkPageAccess` / `checkPageKey` / `navAccess` refuse or hide a missing one; user form check boxes, rules (`checkModuleChange`), save and audit; users list column and filter; Overview and Calendar follow modules.
- **Tests:** unit, integration and E2E for module access. Analytics boards and Google Calendar sync are a follow-up (AI-04b).

### 23 Oct 2026 (v1.14.0: onboarding tour; invite buttons on the user page only)
- **Owner request:** Re-invite and Reset password inside the user page, not the users list; a complete onboarding tour for users (Approvals, Tasks, Calendar).
- **Built (D-167):** `features/help/tour-steps.ts`, `features/help/OnboardingTour.tsx` (mounted in AppShell for the user space), `finishTourAction`, `data-tour` markers (page header, Overview tiles, bell, Go to), Take the tour in the account menu, Help and the first-use card. The users list is back to no actions.
- **Tests:** `tests/help/tour-steps.test.ts`; `tests/e2e/v1140-tour.spec.ts` (opens once by itself and walks all 15 steps with a highlight on each target; Help and account menu; keys; Esc saves; phone). The e2e sign-in helper marks the tour done unless a test asks otherwise, so it never covers other tests. The full run caught the demo "Try as" session (not signed in through that helper): the tour no longer opens by itself for demo people.

### 23 Oct 2026 (v1.13.0: invite user and reset password by email)
- **Owner request:** invite user and reset password in User management, with email messages; mid-task: both buttons on the users list too. The owner chose to keep the WhatsApp code on set-password.
- **Built (D-166):** `sendInvitationWithDeps` and `sendSetPasswordLinkWithDeps(purpose: SET | INVITE | RESET)` in `server/auth/set-password.ts`; three emails in `security-messages.ts`; commands `invite` and `reset-password`; Add user tick box and banner; `UserRowActions` on the list (results as a toast); `hasPassword` on list rows.
- **Found while testing:** the row buttons' screen-reader status line (absolutely positioned) escaped the table's scroll area and made the page 430 px too wide on phones; each row form is now `relative`.
- **Tests:** `tests/auth/set-password.test.ts` (invite, reset, rules); `tests/e2e/v1130-invite.spec.ts`.

### 23 Oct 2026 (v1.12.7: Next.js security update)
- CI on aad9fb2 failed only at `npm audit --omit=dev`: two new Next.js advisories (critical RCE in image optimisation with SVG; DoS via Server Actions) affect up to 15.5.27. Upgraded `next` and `eslint-config-next` to 15.5.28 (exact pins kept). Audit: 0 vulnerabilities.
- Lesson: the CI wait loop used `gh run list --commit <short sha>`, which matches nothing, so it waited forever. Use the full SHA (`git rev-parse HEAD`).

### 23 Oct 2026 (v1.12.6: Google Calendar sends people to localhost)
- **Owner report (screenshots):** after Allow on Google's screen, the browser went to `localhost:20011/users/profile/calendar?connected=1` ("refused to connect"). `connected=1` shows the connection itself succeeded.
- **Cause:** the connect and callback route handlers built the way back from `request.url`, which behind the host's proxy is the internal address.
- **Fix (D-165):** `redirectToPage` (relative 303); both routes use it. Tests: `tests/security/redirect-to-page.test.ts`; an E2E check that both answers carry a relative Location.
- The v1.12.5 test run was interrupted (session ended); everything ran again for this commit.

### 20 Oct 2026 (v1.12.5: "Couldn't reach the server" on submit and delete)
- **Owner report:** every submit and every delete said "unable to connect / couldn't reach the server".
- **Live checks (read-only):** `/api/health` ok on v1.12.4 (database, job runner, storage ok); 12 requests all served by one build; a Server Action post with this site's Origin passes Next's origin check (multipart too). So the posts reach the app.
- **Cause:** Next 15 salts Server Action ids per build. Pages opened before the v1.12.4 publish post old ids; the server answers "Server action not found", Next throws `UnrecognizedActionError`, and `guardAction` showed it as "Couldn't reach the server". Reloading the page fixes it.
- **Fix (D-164):** `actionErrorMessage` in `features/ui/form.tsx`; `UpdateNotice` banner; `server/ops/build.ts`; build in `/api/auth/status`; discard draft, autosave and theme use the same messages.
- **Tests:** `tests/ui/guard-action.test.ts`; `tests/e2e/v1125-stale-page.spec.ts` (a real build answering "not found" to the form; a changed build raising the banner).
- **Earlier the same day (account recovery question):** switching an account to User ID + password blocks its Google sign-in; Forgot password only sends a code when the account has a WhatsApp number (the screen looks the same either way, on purpose). Recovery: another Super Admin switches it back, or the owner runs a one-row UPDATE in phpMyAdmin.

### 20 Oct 2026 (v1.12.4: upload failures)
- **Owner report (screenshots):** a task with an .xlsx said "Couldn't reach the server"; a custom approval was submitted but its files "couldn't be saved". Both point to `UPLOAD_DIR` not being writable on the host.
- **Why the task form blamed the connection:** `stageFiles` threw outside the action's try, so the generic message showed.
- **Fix (D-163):**
  - `server/attachments/storage.ts` (`checkStorage`, `classify`, `reportStorageFailure`);
  - `readFiles` catches storage errors;
  - request upload paths report them;
  - Super Admin File storage panel; health `storage`;
  - DEPLOYMENT troubleshooting row.
- **Test:** `tests/integration/v1124-storage.int.test.ts` reproduces an unwritable folder. Docker Desktop wouldn't start locally, so the integration and E2E suites ran in CI only.
- **Owner:** check File storage after publishing; set `UPLOAD_DIR` (Part C).

### 17 Oct 2026 (v1.12.3: Google connect errors)
- **Owner test:** the consent screen is now External (the "unverified app" warning appears, as expected). One connect attempt ended in `error=SCOPE`; the redirect then landed on a local server that was no longer running (localhost:20011).
- **Fix:**
  - the SCOPE message names the two calendar checkboxes;
  - NO_REFRESH is a separate case;
  - `calendar.events` and `calendar` are also accepted (incremental consent);
  - granted scope names are audited;
  - integration test added.
- **Guide:** the demo-video step mentions the warning and the checkboxes.

### 17 Oct 2026 (v1.12.2: Google OAuth verification readiness)
- **Owner:** asked for a verification-ready filing guide.
- **App:**
  - public `/` home, `/privacy` (with Limited Use) and `/terms`, public in middleware; links on the sign-in page;
  - 120 px logo;
  - scope narrowed to `calendar.events.owned` with an owner-only calendar list (D-161, D-162).
- **Tests:** `v1122-public.spec.ts`; the viewport check covers the new pages and caught the privacy page overflowing at 360 px (long scope names), now fixed; calendar unit and integration tests are updated (scope, owner-only list).
- **Guide:** a shared doc, "Google OAuth Verification Filing Guide – ARS Approvals": checklist, Branding values, scope justifications, domain verification, video script, submission, rejections, open questions.
- **Open questions (Q-025):** which Cloud project (shared with Power BI?), support email, policy sign-off.

### 17 Oct 2026 (v1.12.1: owner follow-ups)
- **Analytics:** board tabs and scope chips → dropdowns (`features/analytics/AnalyticsPicker.tsx`); tests updated.
- **Forced sign-out page (D-158):**
  - `server/auth/session.ts`: nobody exempt; idle sessions revoked; `sessionEndReason`;
  - `/signed-out` page;
  - guard redirect with the reason; SessionWatch goes to the page;
  - `/api/auth/status` gives the reason;
  - E2E covers the requester and the Super Admin.
- **Google "Error 403: org_internal" (D-160):** consent screen must be External; guidance added to the Super Admin page, DEPLOYMENT Part Q and the calendar report. Owner action in Google Cloud.

### 16 Oct 2026 (v1.12.0: Analytics Center)
- **Owner brief:** a complete Analytics Center (D-156, D-157).
- **Built:**
  - board tabs on the Analytics page; Executive, Task, Information, Employee, Department, SLA, Trends and Data-quality boards;
  - `analytics-center.repository.ts` (scoped SQL aggregation); `server/analytics/center.ts` (age buckets, alerts, forecasts);
  - 39 new dictionary metrics with board, reliability and limits;
  - Today / Yesterday / Previous quarter periods;
  - a CSV export route;
  - the `analytics.aging_days` setting.
- **Tests:**
  - unit (`v1120-center`);
  - integration (`v1120-analytics`: denominators, cancelled and withdrawn, real timestamps, parallel approvers, scope isolation, empty periods, safe search);
  - E2E (`v1120-analytics`).
- **Bugs found while testing:**
  - a reserved word used as a SQL alias (`over`);
  - two metrics named "Overdue tasks", now unique with a test;
  - the sender isn't a recipient of their own information (the test expectation was wrong; the behaviour is right).
- **Reports:** `application-audit/ANALYTICS_IMPLEMENTATION_TRACKER.md`, `ANALYTICS_TEST_REPORT.md`, `APPLICATION_CURRENT_STATE_AUDIT.md` Part B.
- **Also:** made the viewport E2E loop retry a navigation that is cut off (one CI flake on v1.11.0).

### 16 Oct 2026 (v1.11.0: Google Calendar two-way sync)
- **Owner brief:** Super Admin-controlled Google Calendar with true two-way sync (D-152 to D-155).
- **Built:**
  - migration (7 tables);
  - Google client (fetch);
  - sync engine: incremental pull with 410 recovery, desired-state push, conflicts, deletion policies;
  - jobs step `calendar`;
  - OAuth connect and callback; webhook;
  - Super Admin Integrations page; Profile → Calendar tab;
  - calendar month, week and day views with personal entries;
  - information-type "Show on calendars".
- **Tests:**
  - unit (16);
  - integration with a fake Google (18);
  - E2E (4);
  - the five-viewport check now includes the calendar pages.
- **Reports:** `application-audit/APPLICATION_CURRENT_STATE_AUDIT.md` (Part A), `GOOGLE_CALENDAR_INTEGRATION_REPORT.md`.
- **Owner next:** create the Google OAuth client (deployment guide, Part Q), then enable.

### 16 Oct 2026 (v1.10.0: security hardening and website fixes)
- **Owner brief, 39 items:** audit in `application-audit/SECURITY_AND_WEBSITE_AUDIT.md`; tracker in `SECURITY_WEBSITE_FIX_TRACKER.md`; summary in `SECURITY_AND_WEBSITE_FINAL_REPORT.md`.
- **Security fixes:**
  - AUD-01 (import contact rule), AUD-03 (seed);
  - G-1, G-2, G-3 (page access bound to the action; D-151);
  - SEC-17 (security page not restrictable);
  - rate limits, Cache-Control, CORS preflight, HTTPS redirect;
  - audit gaps; generic export error (D-150).
- **Website fixes:** per-page titles (82 pages), favicon, logo link, dynamic copyright, phone menu focus, phone bar in My approvals only, mailto links, ConfirmDialog for discarding a custom draft.
- **New tests:**
  - `tests/security/v1100-security.test.ts`, `tests/security/route-inventory.test.ts`;
  - `tests/integration/v1100.int.test.ts`;
  - `tests/e2e/v1100-web.spec.ts` (five viewports, link crawl, 404, titles, menu, IDOR).

### 16 Oct 2026 (v1.9.2: user sidebar regrouped)
- Owner's sidebar order, with collapsible My Approvals, Tasks and Information (D-149).
- Tests:
  - three E2E tests now open the group before clicking a page in it;
  - one analytics test is scoped to the page content (hidden sidebar links matched "request");
  - the acknowledgement test checks the lasting note;
  - a new E2E test covers order, opening, remembering, the auto-open of the current group and the keyboard.

### 16 Oct 2026 (v1.9.1: deploy fix)
- **Owner:** the v1.9.0 preview failed ("Process exited before becoming ready").
- **GoDaddy Preview runtime log:** migration statement 5 (CREATE TRIGGER) refused: "You do not have the SUPER privilege and binary logging is enabled". Statements 1–4 were applied; live (Publish) stayed on v1.8.0 and is healthy.
- **Fix (D-148):** optional trigger blocks in `migrate.js`; the four new history triggers are marked optional; `database/optional/v190_append_only_triggers.sql` is for phpMyAdmin; a DEPLOYMENT troubleshooting row was added.
- **Test:** `tests/integration/migrate.int.test.ts` reproduces the host refusal (log_bin_trust_function_creators = 0 for the test).

### 16 Oct 2026 (v1.9.0: Approval, Task and Information modules)
- **Source:** the owner brief "Configurable Approval, Task & Information Management System".
- **Inventory first:** independent tasks and information didn't exist; only work and FYI steps inside approvals did. These stay part of approvals.
- **Built (D-143 to D-147):**
  - Task and Information types, with versions and audit;
  - the two modules with their lifecycles, lists, pages, files and reminders;
  - notification categories and the bell dropdown;
  - the sidebar grouping and independent scrolling;
  - six new field types;
  - raiser scope for approval types;
  - four reports.
- **Fixed from the audit:** AUD-02 (resubmit re-routing), AUD-05 (one vote per step), AUD-08 (outbox).
- **Register:** `application-audit/13_MODULES_IMPLEMENTATION_REGISTER.md`.
- **Checks:** see the commit.

### 16 Oct 2026 (application audit, read-only)
- **Source:** the owner's audit brief (discovery, technical audit, roadmap). No feature work; nothing in the app, database or deployment was changed.
- **Output:** `application-audit/00` to `12`. The executive summary answers the ten questions. Other reports:
  - a matrix of 157 features: 124 verified by tests, 6 code-verified, 18 partial, 5 broken, 4 not built;
  - a finding register (AUD-01..29);
  - 42 recommendations;
  - roadmap phases A–E, with an implementation tracker and a decision register.
- **Checks:** lint and typecheck OK; unit 433, integration 188, E2E 92, QA 27, origin 1 all pass; `npm audit --omit=dev` 0. Live `/api/health`: v1.8.0, database ok, **jobRunner OK**, so the old cron blocker in the docs is resolved on live.
- **P1 findings:**
  - **AUD-02**, resubmit keeps a skipped higher DoA level skipped. Runtime-confirmed: ₹5,000 → ₹50 lakh approved without the CFO.
  - **AUD-01**, the CSV import skips the contact-change rule, so one IT Admin can take over another. Runtime-confirmed at planner level.
  - **AUD-03**, the bootstrap seed re-grants Super Admin on every start.
  - **AUD-04**, the database session time zone is never set. Potential; Q-020.
- **Also runtime-confirmed:** delegate double vote (AUD-05); branch rejection under an ANY join (AUD-06).
- **Recommended first task:** V181-A1 (resubmit re-routing), with A2 and A3 in the same release.

### 15 Oct 2026 (v1.8.0: approved lists, custom approval set-up, page access, inactivity sign-out)
- **Source:** owner request, plus the answers: timeout for users and admins, not the Super Admin; only the Super Admin manages pages; field changes apply to new custom approvals only.
- **Built (D-139 to D-142):**
  - /users/approved and /users/approved-by-me;
  - Admin → Custom approval (fields, step options, preview) and DynamicFields shared with the request form;
  - PeoplePicker in the step editor; work and FYI steps can name anyone;
  - Super Admin → Page access with signed page addresses;
  - inactivity sign-out with a warning.
- **Found and fixed:** the browser's 5-minute session check refreshed the session, so an open tab was never signed out for inactivity.
- **Checks:** unit 433, integration 188, E2E 92, QA 27, origin 1.

### 12 Oct 2026 (v1.7.2: Collaborating screen and filters)
- **Source:** owner asked for "a separate screen for all the approvals in which I am a collaborator, with a complete possible custom filter", then "filters in For me, My Requests also".
- **Built (D-138):**
  - /users/collaborating;
  - a shared filter engine and screen for My requests and Collaborating;
  - Waiting for me gains the extra filters and saved views.
- **Checks:** unit 422, integration 182, E2E 88, QA 27, origin 1.

### 10 Oct 2026 (v1.7.1: navigation and reports access)
- **Source:** owner screenshot. Analytics from the Admin portal switched the space to My approvals.
- **Built (D-137):**
  - Analytics in the Admin space;
  - Help and Profile in the account menu;
  - "Overview" instead of "My work";
  - Reports for IT only, in the Admin space.
- **Checks:** unit 417, integration 176, E2E 85, QA 27, origin 1.

### 10 Oct 2026 (v1.7.0: lists A, B and C)
- **Source:** owner, "Work on A, B and C in one Go" (the non-completed points list given the same day).
- **A (D-129 to D-133):**
  - approval expiry with a 7-day notice; a needed-by calendar; bulk move of pending tasks; form preview in the builder;
  - a stopped-job-runner alert; re-check and fix for inconsistent requests; delegation-end notices;
  - confidential fields; an optional Can export permission;
  - duplicate scope and must-be-unique fields; refresh from profile; amendment drafts.
- **B (D-134, D-135):**
  - drill-down lists with filters carried; status, approver, step, response-time and age filters;
  - due today and in 7 days, median time, first-pass, rework and withdrawal rates;
  - month-on-month and year-on-year comparisons, and team or department vs organisation;
  - status mix, backlog, overdue, passed response times, decision trend and a department × step heatmap;
  - schedule editing with recipients (each gets their own permissions); shared and default views;
  - alert severity, quiet hours and channel.
- **C (D-136):**
  - p95 measurement (docs/PERFORMANCE_ANALYTICS.md) and new indexes;
  - background exports (up to 50,000 rows, 7 days);
  - `npm run db:verify-backup`;
  - rate limits on Analytics and the readiness check.
- **Fixed on the way:**
  - CI E2E QA-AZ-02 failed on list A's push: the "Can export" description mentioned "Super Admin", so the test's checkbox match found it. Reworded. Lesson: run the QA suite locally before every push.
  - Two v160 E2E tests relied on wording changed in this batch. The wording was restored.
- **Checks (local, before the tag):** unit 417, integration 175, E2E 82, QA 27, origin 1, perf 3 (local only).

### 10 Oct 2026 (v1.6.1: attachment fields and collaborators)
- **Source:** the owner asked for an attachment field type in the approval flow builder, and multiple collaborators per request.
- **Built (D-127):**
  - the ATTACHMENT field type with server-side counting;
  - collaborators, with a reusable PeoplePicker component;
  - a Collaborators card on the request page and "Shared with me" in My requests.
- **Checks:** unit 396, integration 152, E2E 76, QA 27, origin 1.

### 10 Oct 2026 (v1.6.0: master prompt, then the unified master prompt)
- **Source:** the master prompt (audit, UI modernisation, features, validation), then `ARS_Approval_Platform_Unified_Claude_Code_Master_Prompt.md` ("Build this"). Copy: `docs/requirements/UNIFIED_MASTER_PROMPT.md`.
- **Built, v1.6.0 phases 0–6a:**
  - UI kit, dark mode, skeletons, toasts and undo, error summary;
  - bottom navigation, command palette, shortcuts, queue filters;
  - timeline, file preview, resubmission diff;
  - recall, ask for information, consultation, delegation, links and follow-ups.
- **Built, unified prompt:**
  - the status register (1,857 rows);
  - smart forms (D-114);
  - readiness, duplicates, budgets, autofill and templates (D-115..D-117);
  - Needs attention, Automation, job-run history and safe resend (D-118);
  - `docs/AUTOMATION_INVENTORY_AND_RECOVERY.md`.
- **Fixed on the way:**
  - V6-D01..D07 (KNOWN_ISSUES);
  - the double-click submit under the type lock;
  - line items lost from templates and resubmit;
  - the new-request form not remounting when started from a template.
- **Checks:** unit 359, integration 122, E2E 66/66 (axe in dark and light).
- **Register:** 316 Implemented, 1,499 Yet to do, 42 Not feasible.
- **Not deployed:** pushed to GitHub only; the live site stays on v1.4.0 until the owner publishes.
- **Later the same day:** amendments (D-120), version compare/restore and the migration assistant (D-121). Checks: unit 368, integration 128, E2E 69/69. Register: 385 / 1,429 / 43.
- **Then, the same day:**
  - analytics (D-122);
  - reports, exports, schedules and alerts (D-123);
  - department scorecard and reconciliation check;
  - feature switches (D-124), promotion (D-125), legal holds (D-126);
  - the required docs (analytics audit, limitations, test matrix, security review, backup/rollback, go-live checklist, implementation report).
- **CI finding:** QA-FILE-01 had failed on GitHub since the RD-02 file-preview change. The test took the preview link; it now checks both links.
- **Final:** version 1.6.0, tag `v1.6.0`. Register: 1,287 / 504 / 66. **Not deployed.**
- **Next:** the owner's go-live checklist; v1.7.0 starts with U-09.

### 9 Oct 2026 (v1.5.0: owner's development spec)
- **Source:** the owner gave the development spec (14 features, phases 0–5) and said "Go ahead".
- **Phase 0:** baseline and plan in `docs/development/ENHANCEMENT_IMPLEMENTATION_PLAN.md`.
- **Built:**
  - #1 My work sections and the first-use checklist;
  - #2 the tracker summary;
  - #3 server-side drafts with autosave;
  - #4 search and saved views, with access in the SQL;
  - #5 phone cards and touch targets;
  - #6 notification choices (D-110);
  - #7 bulk approval through `decideTask`;
  - #8 out-of-office preview and policy, the delegate rechecked when acting, starts and ends logged (D-109);
  - #9 @mentions (D-112);
  - #10 the PDF summary with pdf-lib (D-111);
  - #11 test mode: choices, skip reasons, the diff against live, the impact note;
  - #12 the workload page, the due-soon reminder at 75 %, handover suggestions;
  - #13 the help page and "Copy details for IT";
  - #14 `x-request-id` in headers and logs, and Super Admin alerts on job or backup failure.
- **Migration:** one file, additive.
- **New package:** `pdf-lib`.
- **Testing found:**
  - bulk results vanished once the queue was empty;
  - the old test-mode "Skipped:" line had gone;
  - DUE_SOON took an escalation slot;
  - the out-of-office backfill would have logged every past delegation.
  All four are fixed and covered by tests.
- **Checks:** tsc and lint clean; unit 328; integration 97 (3 runs in a row); E2E 47; QA 27; origin 1; build OK; production audit 0.
- **Not done (by the spec):** no deploy and no live checks. Live `/api/health` showed jobRunner NEVER, so the cron secret needs checking (GO_LIVE_CHECKLIST §3).
- **The owner's question "where is the To Do":**
  - it is the **To do** badge in Waiting for me, shown on work-task steps;
  - it appears only for an approval type with a **Work task** step, once a request reaches that step.

### 9 Oct 2026 (v1.4.0: every pending item)
- The owner asked to "fix every pending item in one go", then publish.
- **Engine and builder:**
  - work and FYI steps; designation and requester sources;
  - IT recovery for blocked steps;
  - all/any rules and choices nested 3 deep;
  - new notifications (task for you, FYI, resumed, changes made, removed, moving again) and 6 new templates (26 in all).
- **Integrity:** R-04..R-10 fixed (D-107).
- **Security:**
  - S-06, S-07;
  - P-01 origin lock, proven on a real `next start`;
  - P-03..P-07;
  - P-02/P-08/P-09 decided (D-102).
- **Ops:**
  - `/api/health`; daily backups with a CI restore drill. The drill caught two real bugs: composite-key paging that could repeat rows, and computed columns slipping into the dump; computed columns are now read from SHOW CREATE TABLE, and 6 full runs in a row pass;
  - CEOITBox receipts webhook; multi-level escalation;
  - migration resume.
- **Features:**
  - audit CSV and sign-in history; custom approval attachments;
  - remove/archive approval types, unsaved-changes warning, resubmit policy;
  - queue and notifications paging; custom → approval type;
  - Power BI views; installable app.
- **Clean-up:** D-02 loose ends, D-03 shared labels, admin home query moved to a repository, one time format.
- **Tooling:** vitest 5; CI adds the QA suite, the origin check and the audit; load test (50 people: 2,400 requests, 0 errors, p95 586 ms).
- **Docs:** README, USER-GUIDE, DEPLOYMENT (E2, G6, G7, K2, O, P), E2E report status, the audit update.
- **Checks:** types and lint clean; unit 301; integration 81; e2e 38; QA 27/27; origin 1; build OK.

### 9 Oct 2026 (v1.3.6: first audit fixes)
- **B-01:** `UserCommands` now renders the confirmation bar. New e2e test `user-commands.spec.ts`, plus a source guard `confirm-bar.test.ts`, proved to fail on the old code.
- **S-01:** `lib/security/delivery-payload.ts` (seal/open); `createDelivery` seals; `leaseDueDeliveries` opens; `markRetrySent` clears; `pruneDeliveryPayloads` runs in housekeeping. Integration test added.
- **S-02:** `lib/http/safe-next.ts`, used by the login page and `SignInPanel`. Unit test added.
- **S-03:** `reserveChallengeAttempt` replaces `incrementChallengeAttempt`. Integration test: 12 parallel tries → 5 claims.
- **S-04:** AbortController on Resend calls (15 s). Unit test added.
- **S-05:** idle check in `isSessionActive`, with the new setting. Integration test added.
- **Regression:** lint and types clean; unit 266; integration 68; build; e2e 29; QA 27/27.

### 9 Oct 2026 (v1.3.5: Profile page; application audit)
- **Profile (D-095, F-77):**
  - new `/users/profile`: read-only details via `getOwnProfile`, plus `ProfileTabs`;
  - the sidebar drops Out of office, Notifications and Sign-in & devices;
  - the account menu has a Profile link.
  - e2e `profile.spec.ts` (tabs, highlight, phone width without sideways scroll); `cloudflare-safe` now covers `/users/profile`.
- **Application audit:** the owner's master prompt. The report is `docs/APPLICATION_CURRENT_STATE_AUDIT.md`. The audit was read-only, using four parallel inspections plus local checks:
  - tsc and lint clean; unit 262/262; e2e 28/28; production audit 0; CI green on v1.3.4.
  - **Broken:** B-01, the admin "Deactivate user" and "Sign out everywhere" never run (`UserCommands.tsx` doesn't render the confirm bar).
  - **Security:** S-01 set-password link stored in plain text in retry payloads; S-02 open redirect via `/\`; S-03 OTP attempt race; S-04 no Resend timeout; S-05 no idle timeout.
  - **Not implemented:** backups and restore, health endpoint, BLOCKED-step recovery, WORK/NOTIFY nodes.
  - These were not fixed in the audit (read-only). They are queued as AUD-01..05.

### 9 Oct 2026 (v1.3.4: cron guide, Q-017, Q-018, default sender)
- The owner answered **yes** to Q-017 and Q-018, asked for a step-by-step cron guide, and approved changing the default From address.
- **Q-017 (D-093):** Next 15.5.27, firebase-admin 14.5.0, `npm audit fix`, overrides for postcss (inside Next) and grpc-js (inside Firestore); production audit 13 → **0** vulnerabilities.
- **Q-018 (D-092):** client IP from `CF-Connecting-IP` (new `lib/http/client-ip.ts`, unit test). QA-SEC-06 now sends requests the way Cloudflare delivers them, and passes, so the QA suite is **27/27**.
- **D-091:** default From address is now `no_reply@approval.arssteels.net` (settings definition, fallback, docs, CLAUDE.md).
- **D-094:** job runner heartbeat on Message deliveries; integration test added.
- **DEPLOYMENT Part I** rewritten step by step (I1–I8): find the secret, test by hand, cPanel Cron Jobs, optional log, check the heartbeat, Cloudflare WAF skip, and a Cloudflare Worker cron trigger as the alternative.
- **Checks:** types and lint clean; 262 unit, 65 integration, 27 e2e (new: job runner status), QA 27/27; production build OK.

### 9 Oct 2026 (live approval email test)
- The owner changed the From address to `no_reply@approval.arssteels.net` (Super Admin settings; approval.arssteels.net is verified in Resend) and asked for one approval to test email.
- Harish Kumar raised CUS-2026-000003 for IT Admin (temporary designation QA_TEST, approver). Deliveries: APPROVAL_NEEDED email + WhatsApp SENT; after IT Admin approved, REQUEST_APPROVED email + WhatsApp SENT to Harish.
- Cleanup: request soft-deleted with a reason; IT Admin's designation reset; QA_TEST inactive and not an approver.

### 9 Oct 2026 (email fixed on live)
- The owner verified `arssteels.net` in the Resend team "arssteels". The first retest still gave 403; Resend's log said "API key not authorized for this domain… from arssteels.net" (key "New Api Approval", Full access).
- A few minutes later, the Super Admin "Send test email" succeeded ("Test email sent to itsupport@arsenergy.co.in").
- **Email now works.** Old failed notifications weren't re-sent (they're stale; and with no cron job, nothing retries them).

### 9 Oct 2026 (QA session 15b: live email and WhatsApp test, v1.3.3)
- The owner approved live test data and messages to their own addresses.
- **Deliveries before the test:** every email FAILED (EMAIL_REQUEST_FAILED, 1 try, retries never ran, so there is no cron job); WhatsApp SENT where a template is live, SKIPPED for security events (templates waiting for Meta).
- **Provider test:** WhatsApp SENT to +91 91500 91870; email "Resend rejected the email (HTTP 403)".
- **Resend dashboard (owner's Chrome):** team "arsenergy" has no domains, no keys and no logs, so the configured key belongs to a different Resend account where arssteels.net isn't verified.
- **End-to-end test:**
  - designation QA_TEST (approver) given to IT Admin;
  - Harish Kumar raised custom CUS-2026-000002 → APPROVAL_NEEDED to IT Admin;
  - IT Admin commented → REQUEST_COMMENT to Harish; approved → REQUEST_APPROVED to Harish;
  - all three were WhatsApp SENT and email FAILED (403).
- **Cleanup:** CUS-2026-000002 soft-deleted with a reason (shows on the Deleted tab); IT Admin's designation reset; QA_TEST inactive and not an approver. The owner's earlier CUS-2026-000001 was left untouched.
- **Clicks in the background Chrome windows didn't reach the page,** so the forms were submitted with `requestSubmit` from the page (same handlers).
- **Fixed:** the "People" multi-select had no accessible name (`aria-label`); QA-A11Y-01 extended to /users/custom.

### 9 Oct 2026 (QA session 15: live test, v1.3.2)
- **Tested on approval.arssteels.net in the owner's Chrome.** Browser 1 = IT Admin; Browser 2 = Harish Kumar.
- **Production rules:** view only; client-side checks where nothing reached the server (a failed submit was simulated by stopping the POST in the browser).
- **Live state:**
  - v1.3.1, behind Cloudflare;
  - all 33 pages 200 for IT Admin (≤ 0.71 s); plain user 404 on the admin spaces; security headers present;
  - Resend and CEOITBox configured; 11/20 WhatsApp templates live;
  - no masters or approval types yet (2 users).
- **v1.3.1 fixes confirmed live:** form failure message with input kept; builder key/list/date/lookup; readable busy button; named controls.
- **Defect L-01 (live):** React #418 on /admin/import and /superadmin/audit, because Cloudflare email obfuscation rewrote plain-text addresses (D-081 again).
  - Fixed with SafeText in those pages and in every place that shows user-written text.
  - New CI test `cloudflare-safe.spec.ts` (verified red without the fix, green with it).
- **Regression:** 259 unit / 64 integration / 26 e2e; QA 26/27.
- **Waiting for the owner:** live tests that write data or send real messages (L15-08).

### 9 Oct 2026 (QA session 14: end-to-end master prompt, fixes, retest, v1.3.1)
- **Baseline** (all green): 254 unit, 64 integration, 25 e2e; migrations idempotent. `npm audit`: 13 production findings (6 high) in next/postcss and firebase/firebase-admin chains (DEF-E1, needs approval).
- **New suite `tests/qa-e2e/`:**
  - session (sign out, deactivated user, forged cookie, lockout, per-ID limit);
  - authorization (record URL, Super Admin pages, replayed decision);
  - business rules (DoA routing, hold/resume, withdraw, reject reason, reopen);
  - security (XSS, SQLi, headers, CSRF, disguised file); files/CSV accuracy; performance (median page < 1.5 s; 20 concurrent p95 0.29 s);
  - accessibility; phone layout.
- **Corrected my own test mistakes** before judging:
  - a redirect was followed;
  - the limits were misread;
  - 20 browsers were measured instead of the server;
  - focus left the page.
- **Found:**
  - DEF-E3: unnamed builder fields (fixed);
  - DEF-E2: the per-IP sign-in limit can be dodged with a spoofed X-Forwarded-For (open: the fix depends on the live proxy chain).
- **Fixed all 9 loader defects (D-090).** My first attempt (a space-level `loading.tsx`) caused a 404→200 regression and a stuck Save (DEF-E4); it was caught by the audit, reverted and replaced before commit.
- **Retest:** loader audit 45/45 (from 29/42); QA suite 26/27; final regression 259 unit / 64 integration / 25 e2e. Reports: `docs/qa/E2E-QA-REPORT.md`, plus a retest section in `LOADER-QA-REPORT.md`.

### 9 Oct 2026 (QA session 13: loader audit, TC-001…TC-085)
- **Method:**
  - reconnaissance and a loader inventory (12 loaders: L-01…L-12; no `error.tsx` anywhere, no branded animation);
  - an executable Playwright suite against a production build and the e2e DB, run 3 times with stable results;
  - diagnostics for TC-040 and TC-074.
- **Corrected my own script mistakes before reporting:**
  - locator clashes ("Attach", "Continue");
  - a `main` element missing after a redirect;
  - `isVisible({ timeout })` not waiting;
  - a preset equal to the default period.
- **Results:** 51 PASS / 19 FAIL / 2 BLOCKED (TC-044, 083 need fault injection) / 13 N/A; coverage 97.2 %, pass rate 72.9 %.
- **Strong:** every transaction-integrity case. Single records on double clicks, concurrent approvals, replays, and close/refresh during a submit; a replayed Super Admin delete as a plain user was refused. All verified in the DB.
- **Defects:**
  - DEF-02 (High): any failed, offline, malformed, cut-off or unauthenticated form answer crashes the page (`useActionForm` + no error boundary);
  - DEF-03: no time limit;
  - DEF-06: busy button contrast 1.42:1;
  - DEF-01: no navigation feedback outside Dashboards/Import;
  - DEF-04: rapid dashboard period changes show a different period from the address;
  - DEF-05: no aria-busy/live region on ordinary forms;
  - DEF-07: "Not found." when the session ends mid-request;
  - DEF-08: "Working…" flash and button width jump;
  - DEF-09: the first period-link click after a cold start is ignored (cause not established).
- No application code changed; fixes wait for the owner (Q-016).

### 8 Oct 2026 (build session 12: form field creator tested and fixed, v1.3.0)
- The owner asked for the whole flow creation form to be tested, database-backed dropdowns, the dropdown creator and the date selector fixed, every data type checked, and an e2e test.
- **Tested in the browser key by key.** The automation's paste first hid the bugs, so key-by-key input was used.
- **Confirmed:**
  - the Choices box dropped every comma ("Capex, Opex" → "CapexOpex");
  - the field key stopped at the first letter ("Delivery Date" → `d`).
- **Found in the code:**
  - number boxes dropped "1." / "-" as they were typed;
  - conditions were a text box for every type, and the engine/validator refused date order;
  - the operators ignored the type;
  - test mode threw away all sample values on one bad value.
- **Built:**
  - `features/admin/FormFieldsEditor.tsx`: field editor, ChoiceListEditor, NumberDraftInput, operatorsFor, ConditionValueInput;
  - the LOOKUP type in `server/forms/fields.ts` (isIsoDate, partial parse data, readable dates and lookup names);
  - `lib/db/repositories/lookups.repository.ts`, wired into submit, resubmit, simulate, the builder options, the request form, test mode and the request view;
  - date order in `server/engine/conditions.ts` and `validate.ts`;
  - the step-map preview of skip conditions, with date words.
- **Tests:**
  - unit 254 (+11 in form-fields.test.ts);
  - integration 64;
  - e2e 25 (+3 in session12.spec: builds every field type key by key, test mode on date and department conditions, publishes, raises with validation, checks the stored values and the skipped level).

### 8 Oct 2026 (build session 11: approver designations, request deletion, dashboards, v1.2.0)
- The owner asked for:
  - approvers limited to designations of Manager and above, through a per-designation flag;
  - a Super Admin delete for requests;
  - four dashboards in Admin.
- Asked two questions; the owner chose **all approver pickers** and a **soft delete** (D-085, D-086).
- **A. Approver designations:**
  - migration 202610081500 (`designations.is_approver`, existing ones ticked);
  - `server/approvals/approver-rules.ts` (pure) and `approver-check.ts`; `lib/db/repositories/approvers.repository.ts`; the directory snapshot carries `approver`.
  - **Checks on save:**
    - workflow save: named USER sources, ignoring ids that no longer exist (the validator handles those at publish);
    - custom submit; group member add; HOD; reporting manager; delegation; handover;
    - FORM_FIELD_USER person fields on submit and resubmit;
    - import (manager, HOD, members; a manager who is new in the same file is checked by their designation).
  - Pickers list eligible people plus the saved value. Test mode keeps everyone as the sample requester.
  - Demo designations are flagged (Executive is not an approver; Accountant is, because the Finance checkers approve).
- **B. Deletion:**
  - migration 202610081501;
  - `server/approvals/delete.ts`, `request-admin.repository.ts`;
  - `deleted_at IS NULL` added to findRequest and lockRequest (so actions and the page 404), the queue, my requests, duplicate checks, handover, pending counts, SLA jobs, insights and the admin counts;
  - Super Admin → Requests page; a Delete card on the request page, with a server-side redirect, because the page being left becomes a 404.
- **C. Dashboards:**
  - `server/dashboards/filters.ts` (pure); `lib/db/repositories/dashboards.repository.ts`; `server/dashboards/export.ts`;
  - `/api/admin/dashboards/[slug]`;
  - pages under `app/admin/dashboards/*` with `DashboardFrame` (tabs, filter, presets, KPI tiles, outcome bars, measure bars), and a loading skeleton.
- **Tests:**
  - unit 243;
  - integration 64 (+4 in session11; the test helper now gives people an approver designation);
  - e2e 23 (+3 in session11; e2e people have Manager/Executive designations);
  - checked in the browser.

### 8 Oct 2026 (build session 10: bulk import, v1.1.0)
- The owner asked for import with a download template and an upload, for Admin and Super Admin, for users, designations, departments "and that kind", with loaders (D-084, F-59).
- **Built:**
  - `server/import/csv.ts`: an Excel-friendly CSV reader/writer; formula cells guarded;
  - `kinds.ts`: column specs;
  - `plan.ts`: a pure planner with every rule;
  - `service.ts`: check, import (one transaction), downloads;
  - `lib/db/repositories/import.repository.ts`;
  - actions `app/admin/import/actions.ts`; download route `/api/admin/import/[kind]?type=template|data`;
  - pages `/admin/import` and `/superadmin/import` with loading skeletons;
  - `features/admin/ImportPanel.tsx`; `features/ui/Spinner.tsx`;
  - Import buttons on the Users, Departments, Groups and Calendar pages; DEPLOYMENT.md Part K gives the order.
- **Rules worth remembering:**
  - an unchanged inactive reference (manager, department, HOD, group member) is accepted, so a re-uploaded export stays valid;
  - managers can be rows of the same file (set after every row is written);
  - the members cell replaces the group's members.
- **Tests:**
  - unit 234 (+17 import);
  - integration 60 (+7: order of imports, all-or-nothing, the Super Admin role rule, sessions ended on an email change, groups/holidays, export → re-import = no changes);
  - e2e 19 (+2: template download, check with a problem, import; the Super Admin screen; a plain user gets 404 on the download);
  - lint and typecheck clean; the screen and its loader were checked in the browser.

### 8 Oct 2026 (build session 9: UI polish, v1.0.6)
- The owner sent three UI reviews (My approvals, Super Admin templates, Admin overview) and asked to check each item, build it, and say "space" instead of "area" (D-083).
- **Shell:**
  - new ProfileMenu (account menu with Switch space and Sign out) and MobileNav (a phone drawer; before this there was no menu below 768 px);
  - SideNav active item gets a left accent;
  - cards and table rows get hover states; `.card-link`;
  - PageHeader spacing and an actions slot; compact EmptyState; content capped at max-w-7xl.
- **My approvals:** "Welcome back, <name>"; compact KPI tiles linking to filtered lists; the top 5 waiting and recent items. My requests has one action bar (search, filter, New request).
- **Admin:** the overview cards were still marked "Being built". They are now equal-height link cards with live counts. The stale "Approval types · soon" sidebar item is removed.
- **Super Admin templates:**
  - a status panel (live count, progress bar, last sync, Sync);
  - short row titles (`templateLabel`) with the event code below and the purpose behind a "?";
  - uniform right-aligned Open/Create buttons; the detail page title is the short label.
- **Found while building:** Tailwind opacity modifiers don't work on the CSS-variable tokens (`@apply` fails the build), so solid tokens are used. Badges no longer wrap.
- **Tests:**
  - unit 217 (adds the short-label test), integration 53;
  - e2e 17 (adds session9.spec: the account menu and the phone drawer; updates the greeting and template panel selectors);
  - lint and typecheck clean; the screens were checked in the browser at desktop and phone width.

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
