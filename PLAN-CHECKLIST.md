# ARS Approval Platform — Plan & Checklist

> **Mandatory living file.** Every task is planned here *before* it is started and ticked here when it is done.
> Rules:
> 1. Never delete an item. When something no longer applies, mark it `[~]` with a reason and date.
> 2. Tick with the date: `[x] … (done 28 Sep 2026)`.
> 3. New work found mid-task gets a new checklist item first, then the work.
> 4. At the start of each session read ★, §Now, and the open questions in DEVELOPMENT-MEMORY.md §4.
> 5. At the end of each session update §Now, tick the items, and add a log entry in DEVELOPMENT-MEMORY.md §5. Record any new or changed flows in FLOWS.md.
> 6. The coverage map at the bottom must show every requirement mapped to at least one item. Nothing is left behind.

Legend: `[ ]` to do · `[>]` in progress · `[x]` done · `[~]` not applicable (with reason) · `[?]` blocked by an open question

---

## ★ North star
**Multi-level approvals in any custom manner.** The engine must support any number of levels in any combination: sequential, parallel, any-one, any-N-of-M, conditional and hybrid. Approvers can come from any source, and levels can be added or skipped by rules. Build the engine for this from the first engine phase (P2). The drag-and-drop designer (P3) is only the screen for building it. Check every task against this.

## Now / Next
- **Now:** Planning complete; the repo is live on GitHub (D-035). All planning questions answered except Q-004 values (DoA bands), Q-013 (notification templates from the owner) and Q-014 (reuse the OTP template).
- **Next:** Phase 0 code scaffold (P0-40 to P0-46): a single Next.js app with `/users`, `/admin` and `/superadmin`, local MySQL, the first migrations, then Phase 1 sign-in.

---

## Phase 0 — Setup and decisions

### 0.1 Planning files and records
- [x] P0-01 Create DEVELOPMENT-MEMORY.md, PLAN-CHECKLIST.md, FLOWS.md (done 28 Sep 2026)
- [x] P0-02 Move reference material into `reference/` (audit page, plan page, rule notes, earlier write-up) (done 28 Sep 2026)
- [x] P0-03 Record the north star (D-000) in all three files, CLAUDE.md and Claude memory (done 28 Sep 2026)
- [x] P0-04 Record the owner's answers as decisions D-003 to D-015 (done 28 Sep 2026)
- [x] P0-05 Update the plan page to v2 with the decisions and the DoA explanation, and republish (same URL). Copy saved as `reference/platform-plan-v2.html` (done 28 Sep 2026)
- [x] P0-08 Record the second-round answers (D-024 to D-033) and the Power BI reference (DEVELOPMENT-MEMORY §9) in all living files; republish the plan page as v3 (done 28 Sep 2026)
- [x] P0-07 Write CLAUDE.md (project root) and Claude memory entries enforcing the north star and the three living files (done 28 Sep 2026)
- [ ] P0-06 Owner reviews the plan v2 and this checklist

### 0.2 Infrastructure (all owned by itadmin@arssteels.co.in)
- [x] P0-10 Confirm the GoDaddy plan type: cPanel with Node.js; Node.JS Hosting product as used by the Power BI website (D-027) (done 28 Sep 2026)
- [x] P0-11 Choose the final stack: mirror the Power BI website stack (D-028) (done 28 Sep 2026)
- [x] P0-12 Review the Power BI website's CEOITBox integration, WhatsApp OTP, Google login, sessions, settings and GoDaddy deploy guide (D-029, DEVELOPMENT-MEMORY §9) (done 28 Sep 2026)
- [x] P0-12a CEOITBox: same number and API key as the Power BI website (D-036) (done 28 Sep 2026)
- [~] P0-13 SMS channel for OTP: not needed, OTP is WhatsApp only (D-025, 28 Sep 2026)
- [?] P0-14 Notification templates: the owner provides the wording (Q-013) → register them in CEOITBox (Utility category) → Meta approval → record the template names and variable order in the app's template registry. OTP reuses `wa_login_otp_v1` (Q-014)
- [ ] P0-15 Email through Resend from itadmin@arssteels.co.in (D-037): check the domain is verified in Resend (SPF/DKIM); API key in GoDaddy env vars only
- [ ] P0-16 Reuse Firebase project `power-bi-dashboard-3b29f` (D-038): add `approvals.arssteels.net` and `localhost` to its authorised domains
- [ ] P0-17 DNS + SSL: bind `approvals.arssteels.net` to the GoDaddy Node.js app (D-034)
- [ ] P0-17a On the first GoDaddy app: check that the disk is persistent (attachments), which MySQL host is reachable, and whether cron is available (Q-001 remainder)
- [x] P0-18 Git repository `HarishDevs/ARS-Approval-System` (D-035): `git init` in the project folder, `.gitignore` (node_modules, .next, .env*, backups, storage), README, repo-level CLAUDE.md, first commit pushed to `main` (done 28 Sep 2026)
- [ ] P0-18a Working rule: commit with clear messages; push at the end of every session; feature branches + pull requests once coding starts
- [ ] P0-19 Create the environments: local dev, staging (GoDaddy), production (GoDaddy)
- [ ] P0-20 Set up a secrets store on the server (environment files outside the web root, locked permissions); never in the repo
- [ ] P0-21 Set up database backups: daily, off-server copy, tested restore

### 0.2b Code scaffold (D-028)
- [~] P0-40 Monorepo with two apps: replaced by a single app (D-034, 28 Sep 2026)
- [ ] P0-40a **Single Next.js app** (like the Power BI app) in the repo root, with route groups `/users`, `/admin`, `/superadmin`, `/login` and `/api`. Layers: `app/` (routes), `features/` (UI by domain), `server/` (engine, auth, business rules, server-only), `lib/` (db, integrations), `config/`, `database/` (migrations, seeds), `tests/`
- [ ] P0-41 Next.js 15 + React 19 + TypeScript strict + Tailwind 3 with the ARS preset from `D:\Omniroute\assets\tokens`; icons from the asset sprite
- [ ] P0-42 MySQL 8 via `mysql2`; SQL migration folder + migrate/seed scripts (same pattern as the Power BI site); `docker-compose.yml` for local MySQL
- [ ] P0-43 Environment schema validated at startup with zod (fail fast with a clear message)
- [ ] P0-44 Vitest unit tests + Playwright end-to-end; lint and typecheck scripts
- [ ] P0-45 CI on GitHub Actions (lint, typecheck, unit tests, build)
- [ ] P0-46 GoDaddy deploy: one Node.js app from GitHub `HarishDevs/ARS-Approval-System` → `approvals.arssteels.net`, env vars entered in GoDaddy only, cPanel cron calling a signed job-runner endpoint

### 0.3 Business inputs
- [?] P0-30 **DoA matrix.** The approval authority is itadmin@ (D-041); fill in the bands and approvers per request type before Phase 3 (Q-004)
- [ ] P0-31 Staff master, provided by the admin (D-033): name, email, WhatsApp number, department, designation, reporting manager, HOD, sign-in method, role(s). Prepare an import template (Excel) for it
- [ ] P0-32 Clean department list (replaces Asana's 27 values)
- [ ] P0-33 Clean request-type (Nature) list per approval type (merged from the ~60 Asana values)
- [ ] P0-34 Confirm the first-release templates and their approvers: MD, ED, Finance, Valarmadhi, SCM
- [x] P0-35 Break-glass holder = itadmin@ (D-041); keep the recovery credentials sealed offline (done 28 Sep 2026)

#### What a DoA matrix is
A **Delegation of Authority (DoA) matrix** is one table, signed off by management. For each kind of request and each amount range, it says **who must approve, and in what order**. The engine reads this table to choose the approval levels automatically. Today there is none: one approver clears everything from ₹3,890 to ₹5 Cr.

The example below uses today's approvers. **The amounts and names are placeholders for management to fill in.**

| Request type | Up to ₹1 L | ₹1 L – ₹5 L | ₹5 L – ₹25 L | Above ₹25 L |
|---|---|---|---|---|
| Purchase Order / Work Order | SCM Head | SCM Head → Finance | SCM Head → Finance → ED | SCM Head → Finance → ED → MD |
| Bill / payment / funds transfer | Finance checker → Finance HOD | + Finance Head | + ED | + MD |
| HR payments (salary, statutory, F&F) | HR Manager → HR HOD | HR Manager → HR HOD | + Finance → ED | + MD |
| IT purchase / licence / budget | IT Head | IT Head → Finance | + ED | + MD |
| Price realisation / discounts | Dept HOD(s) → ED | Dept HOD(s) → ED | Dept HOD(s) → ED → MD | Dept HOD(s) → ED → MD |
| Policy / special / investment | ED | ED → MD | ED → MD | ED → MD |

Management decides four things:
1. The amount bands.
2. The approver roles for each cell.
3. Whether a department's own HOD always comes first.
4. Who may approve on someone's behalf (delegation).

The Super Admin then enters the table in the Admin Portal (P3-30). Every request is routed from it, and changes are versioned with effective dates.

---

## Phase 1 — Foundation: sign-in, people, Admin Portal core, notifications

### P1-USR Users and organisation
- [ ] P1-01 Data model: companies/units, locations, departments, designations, cost centres
- [ ] P1-02 Data model: users. Fields: login ID, email (any domain), WhatsApp number, sign-in method (Google / password), firebase_uid, password hash, status (active / inactive), locked-until, is_super_admin, is_break_glass
- [ ] P1-03 Reporting hierarchy: reporting manager and HOD per user; manager-of-manager lookup
- [ ] P1-04 Users can only be created in the Admin Portal (no self sign-up); bulk import with validation
- [ ] P1-05 Make a user inactive (never hard-delete, D-033) → end their sessions, block sign-in, hand their pending approval steps to a chosen person; reactivate later if needed
- [ ] P1-06 Roles assigned per user, by the admin only (D-033): a user can hold several roles; no self-service role changes

### P1-AUTH Sign-in and security
- [ ] P1-10 Google sign-in via Firebase Auth, ID token verified on the server: the email must match an existing active user whose method is Google; link firebase_uid on the first sign-in only; **no OTP** (D-006)
- [ ] P1-11 User ID + password sign-in: Argon2id hashing, leaked-password check, minimum length (configurable)
- [ ] P1-12 OTP after password sign-in: 6 digits, 5 min, single use, 5 wrong tries, resend after 30 s, max 5 per hour, stored hashed, anti-enumeration response; sent on **WhatsApp only** (D-025) with the Authentication-category template
- [ ] P1-13 First sign-in for password users: set password (reuse the asset-pack create-password screens), verify the WhatsApp number by OTP
- [ ] P1-14 Forgot password: OTP on WhatsApp → new password → all sessions ended → alert sent
- [ ] P1-15 Lockout after 5 failed passwords (15 min, configurable) + alert
- [ ] P1-16 Sessions: secure HTTP-only cookie, idle and absolute timeouts (configurable), sign out everywhere
- [ ] P1-17 Device recognition: signed device cookie + browser/OS + IP / approximate location; trusted-device period
- [ ] P1-18 **New-login alert** on email + WhatsApp: time, device, browser, approximate location, IP, and a "This wasn't me" link
- [ ] P1-19 "This wasn't me": end all sessions, lock the account, notify the Super Admin
- [ ] P1-20 Security alerts for password changed, mobile/WhatsApp changed, account locked, repeated failures; every Super Admin sign-in alerts the Super Admin
- [ ] P1-21 Rate limiting on sign-in, OTP and password reset
- [~] P1-22 Step-up OTP for sensitive Admin Portal actions: not needed (D-032, 28 Sep 2026)
- [ ] P1-23 `login_logs` browser/user-agent column ≥ VARCHAR(500) (bug found on the Power BI site)

### P1-SEC Backend visibility and platform security (D-016)
- [~] P1-30 Separate admin build and address: replaced by role routes in one app (D-034, 28 Sep 2026)
- [ ] P1-30a Route protection in 3 layers (the Power BI site's pattern): (1) middleware blocks `/admin` and `/superadmin` without the right role; (2) every page, route handler and server action re-checks the role and permission on the server; (3) record-level data-scope checks. Admin UI built mainly as server components, with no config or secrets in client bundles. Unknown or forbidden admin routes return a generic 404
- [ ] P1-31 Every API call needs a signed-in session; permissions checked on the server per record; admin routes accept only Admin Portal roles (D-024); Super-Admin-only areas (providers, security, integrations, health, audit export) enforced on the server
- [ ] P1-32 No public API docs; no source maps in production; no config or keys sent to the browser; feature flags decided on the server
- [ ] P1-33 Generic error messages with a reference code; server/framework headers stripped; no provider names in the UI, emails or WhatsApp
- [ ] P1-34 CORS limited to ARS addresses; security headers (CSP, HSTS, frame-ancestors)
- [ ] P1-35 Secrets encrypted at rest, shown masked in the Admin Portal, with rotation dates
- [ ] P1-36 **Break-glass account** (D-011): disabled by default; enabled only by a server-side script run from the hosting console; each use alerts
- [ ] P1-37 **Append-only audit log** (D-012): no update or delete for anyone; the Super Admin can view and export
- [ ] P1-38 At go-live: rotate every key and password; remove developer access that is no longer needed

### P1-NOT Notification hub
- [ ] P1-40 Event-driven hub: each event is recorded once, then fanned out to channels
- [ ] P1-41 Email channel (Q-005), using ARS header/footer branding
- [ ] P1-42 WhatsApp channel through CEOITBox (D-009), with approved templates
- [~] P1-43 SMS channel for OTP: not needed (D-025, 28 Sep 2026)
- [ ] P1-48 Retry outbox for failed sends, driven by the cron job runner (the Power BI site lacked this); respect the CEOITBox rate limit
- [ ] P1-44 In-app notifications (bell icon from the asset pack)
- [ ] P1-45 Delivery log per channel with status, retries and failures; the Super Admin can resend
- [ ] P1-46 Template per event and channel, versioned, with preview
- [ ] P1-47 WhatsApp numbers verified by OTP; opt-in recorded

### P1-ADM Admin Portal (Super Admin) core
- [ ] P1-50 Admin area shells at `approvals.arssteels.net/admin` and `/superadmin` (D-034): navigation, ARS branding
- [ ] P1-50a Roles (D-024, D-039): **Super Admin** = itadmin@ (everything; `/superadmin`); **IT Admin** (`/admin`: approval types, forms, workflows, templates, DoA, users and roles as granted); **User** (`/users`). Provider keys, security, integrations, system health and audit export are `/superadmin` only
- [ ] P1-51 Organisation module (P1-01)
- [ ] P1-52 Users and hierarchy module (P1-02 to P1-05): create, import, edit, deactivate, force sign-out, reset password, unlock, change sign-in method
- [ ] P1-53 Roles and data rights: role builder, permission matrix, data scopes (own / team / department / list / all), field-level hiding
- [ ] P1-54 Security settings: password policy, OTP values, lockout, sessions, trusted-device period, alert rules, optional IP allowlist for the Admin Portal
- [ ] P1-55 Providers and integrations: Google OAuth, email, CEOITBox, SMS. Masked keys, test-send button
- [ ] P1-56 Notification center: templates, channels, delivery log
- [ ] P1-57 Audit viewer: search, filter and export the audit log; login history; security events
- [ ] P1-58 System health: job queue, notification failures, error summary (admin only)
- [ ] P1-59 Branding: logo, colours, email header, login message
- [ ] P1-60 Every admin change is written to the audit log with before and after values

### P1-UI User app foundation
- [ ] P1-70 App shell with the ARS tokens and icons (asset pack): sidebar, top bar, profile
- [ ] P1-71 Login screens: Google button, User ID + password, OTP screen, forgot password, create password
- [ ] P1-72 Profile: my details, my devices and sessions (sign out a device), notification preferences where the Super Admin allows them

---

## Phase 2 — Multi-level approval engine (the core of the product)

### P2-DM Data model (node graph, never fixed levels)
- [ ] P2-01 ApprovalTypes, ApprovalTemplates (versioned), FormDefinitions (versioned), FormFields (reusable field types)
- [ ] P2-02 WorkflowDefinitions → WorkflowVersions → WorkflowNodes + WorkflowEdges + WorkflowConditions
- [ ] P2-03 Node kinds: START, APPROVAL, PARALLEL-SPLIT, JOIN, CONDITION, WORK-ASSIGNMENT, NOTIFY, END
- [ ] P2-04 Completion rules on a group: ALL, ANY_ONE, ANY_N_OF_M (N configurable), with optional weighted or mandatory members
- [ ] P2-05 Approver sources per node: specific user, role, requester's HOD, department HOD, reporting manager, manager's manager, department, approval group, requester-selected (within governance), user from a form field
- [ ] P2-06 ApprovalRequests (permanent ID, e.g. PUR-2026-000421), ApprovalVersions, ApprovalInstances, ApprovalSteps, ApprovalActions
- [ ] P2-07 Step record: step ID, request, node, assigned approver(s), eligible approvers, **actual actor**, on-behalf-of, decision, time, comment, version
- [ ] P2-08 Comments, Attachments (versioned), Watchers
- [ ] P2-09 Numbering scheme per approval type (code prefix + year + sequence)

### P2-ENG Engine behaviour (all patterns from day one)
- [ ] P2-20 Instantiate a request against the **published workflow version** (running requests never change underneath)
- [ ] P2-21 Sequential levels (any number)
- [ ] P2-22 Parallel levels with a join (ALL)
- [ ] P2-23 Any-one and any-N-of-M groups
- [ ] P2-24 Conditional branches (amount, department, type, priority, any form field; AND/OR)
- [ ] P2-25 Hybrid graphs: combinations of all the above, nested
- [ ] P2-26 Skip rules (e.g. skip a level if the requester is that approver; no self-approval)
- [ ] P2-27 Resolve approvers when a step starts (so hierarchy changes are picked up); record who was resolved
- [ ] P2-28 **Server-side actor authorisation** on every action (D-020): the signed-in user must be an eligible approver or a valid delegate for this step
- [ ] P2-29 Canonical state machine (D-017): Draft, Submitted, Pending, In Progress, On Hold, Changes Required, Resubmitted, Approved, Rejected, Reopened, Closed
- [ ] P2-30 Actions: Approve, Reject (reason required), Request Changes (reason required), Put On Hold / Resume, Comment
- [ ] P2-31 Timeline / audit entry for every transition
- [ ] P2-32 Notification events emitted for every transition (to P1-NOT)
- [ ] P2-33 Engine test suite covering every pattern, including edge cases (an approver leaves mid-flow, an empty approver group, a condition with no matching branch)

### P2-UI Employee and approver portals (first cut)
- [ ] P2-40 Employee: create request from a template, dynamic form, attachments, submit, save draft
- [ ] P2-41 Employee: My Requests, with a status pill and a visual step tracker showing every level and branch
- [ ] P2-42 Approver: My Queue (ID, requester, department, type, amount, current step, age, SLA) with actions
- [ ] P2-43 Request detail: form data, documents, timeline, comments, the full level map
- [ ] P2-44 Secure deep links from email/WhatsApp that open the request after sign-in (D-019)

### P2-TPL First-release templates (D-021), built by configuration only
- [ ] P2-50 MD Approval
- [ ] P2-51 ED Approval
- [ ] P2-52 Finance Approval (Prabu)
- [ ] P2-53 Finance Approval (Valarmadhi)
- [ ] P2-54 Purchase & SCM Approval
- [ ] P2-55 Each template is checked against the reference flows in FLOWS.md Part A, with the known defects not reproduced

---

## Phase 3 — Workflow designer, DoA, validator, test mode
- [ ] P3-01 Visual drag-and-drop designer: START, APPROVAL, PARALLEL, ANY-ONE, ANY-N, CONDITION, WORK, END
- [ ] P3-02 Node settings panel: approver source, completion rule, SLA, allowed actions, notifications
- [ ] P3-03 Form builder: drag, add, remove and reorder fields; field types; required; validation; conditional visibility
- [ ] P3-04 **Workflow validator** before publish: start/end exist, all nodes connected, no dead ends, no unintended loops, every approval node has an approver source, no self-approval, valid completion rules, logically valid conditions with no conflicts, rejection path exists, resubmission/reopen policy set, valid escalation (base plan §34)
- [ ] P3-05 **Test mode / simulation:** enter sample values and see the exact levels and approvers, without creating a real request
- [ ] P3-06 Draft / publish / archive for templates, with version history and a diff
- [ ] P3-30 **DoA matrix module:** amount bands per type and department, approver roles per band, effective dates, versioned; used by condition nodes
- [ ] P3-40 Templates: HR Approvals, Admin, Recruitment (Manager → HOD)
- [ ] P3-41 Template: Finance Internal (level 1 chosen by Nature → optional level 2 → HOD), including the reject/hold paths at level 2 that are missing in Asana
- [ ] P3-42 Template: Price Realisation (parallel HOD sign-offs → ED → MD), with a decision on approve vs acknowledge
- [ ] P3-43 Templates: IT Internal, Plant, ASP, Branding, Training, Sumit (in the corrected form)

## Phase 4 — Lifecycle
- [ ] P4-01 Changes Required → requester edits → Resubmitted as a new version under the **same ID** (base plan §14)
- [ ] P4-02 Resubmission restarts from a policy-defined point (beginning / the level that asked / a specific level)
- [ ] P4-03 Reopen after approval: reason required; restart from beginning / a chosen level / current level; audited (base plan §15)
- [ ] P4-04 On Hold: paused, stays open, counts as pending; resume
- [ ] P4-05 Delegation: date range, delegate, scope; "on behalf of" recorded (D-018); the Super Admin can view and end any delegation
- [ ] P4-06 SLA per node, reminders, escalation chains (base plan §19)
- [ ] P4-07 Holiday / working-day calendar used by SLA and due dates
- [ ] P4-08 Recording approvals given outside the system (phone/meeting): approver records it with evidence (D-019)

## Phase 5 — Employee custom approvals
- [ ] P5-01 "Create custom approval", open to **every user whenever needed** (D-026): choose approvers and pattern (sequential / parallel / any-one / any-N / mixed), documents, submit
- [ ] P5-02 Anyone can pick anyone as an approver (D-040). Always-on safety rules: active users only, no self-approval, graph validated. No exclusion list
- [ ] P5-03 Custom flows are validated by the same validator (P3-04)
- [ ] P5-04 Super Admin can turn a useful custom flow into a predefined template

## Phase 6 — Documents, discussion, work assignment
- [ ] P6-01 Documents: PDF, Excel, Word, images; versions kept; never overwritten silently
- [ ] P6-02 Comments and @mentions on each request
- [ ] P6-03 Work assignment after approval: assignee or department, work tasks, completion, close (the IT pattern)
- [ ] P6-04 Watchers / followers

## Phase 7 — Management portal and analytics
- [ ] P7-01 Management control center: raised, pending, approved, rejected, changes required, on hold, overdue (today / period)
- [ ] P7-02 Views by department, approval type, approver, amount band, age, SLA
- [ ] P7-03 Approver workload and response times
- [ ] P7-04 Reporting views for Power BI (read-only DB views or API)
- [ ] P7-05 Data rights tools for the Super Admin: export (Excel/CSV), scheduled exports, corrections with a reason (versioned), archive, retention rules, legal hold

## Phase 8 — Integrations and mobile
- [ ] P8-01 ERP / Salesforce / other apps via API and webhooks (Super Admin configures)
- [ ] P8-02 Installable mobile web app (PWA) for approvers
- [~] P8-03 Import of Asana history. Not needed: D-013 (28 Sep 2026)
- [ ] P8-04 Switch off the Asana approval forms after go-live and tell users

## Go-live
- [ ] GL-01 User acceptance testing, per template, with the real approvers
- [ ] GL-02 Security review: auth, permissions, admin isolation, headers, secrets
- [ ] GL-03 Load test with typical volume (~500+ requests/month, multi-step)
- [ ] GL-04 Backup/restore drill
- [ ] GL-05 Key rotation and access clean-up (P1-38)
- [ ] GL-06 User guides: employee, approver, management; admin runbook
- [ ] GL-07 Pilot with one department, then roll out by template

---

## Stack (decided 28 Sep 2026, D-028)
| Layer | Choice | Proven on the Power BI site? |
|---|---|---|
| Hosting | GoDaddy Node.JS Hosting (Node 22), **one app** at approvals.arssteels.net; deploy from GitHub `HarishDevs/ARS-Approval-System` | Yes |
| Areas | Role routes `/users`, `/admin`, `/superadmin` (D-034) | Yes (the Power BI site has `/admin`, `/super-admin`, `/app`) |
| Framework | Next.js 15 App Router, React 19, TypeScript | Yes |
| UI | Tailwind 3 + ARS token preset + asset-pack icons | Yes (own brand theme) |
| Database | MySQL 8 (`mysql2`), SQL migrations + seeds | Yes |
| Google sign-in | Firebase Auth, server-side ID-token check | Yes |
| Sessions | HMAC-signed httpOnly cookie | Yes |
| Secrets in settings | AES-256-GCM encrypted settings table | Yes |
| WhatsApp | CEOITBox adapter (`x-api-key`) | Yes (live) |
| Email | Resend from itadmin@ (D-037) | Yes |
| Jobs / timers | DB job table + cPanel cron → signed job-runner endpoint | New (the Power BI site had no scheduler) |
| Tests | Vitest + Playwright | Yes |
| Superseded | NestJS / PostgreSQL / Redis from the base plan §38 | [~] Replaced to fit GoDaddy (28 Sep 2026) |

---

## Guardrails: Asana defects never to repeat
| ID | Rule |
|---|---|
| G-01 | The approver is the authenticated actor, checked on the server; never "assignee = approver" |
| G-02 | Rejected can never be shown as Approved; one state machine drives every view |
| G-03 | On Hold / Changes Required never mark a request complete |
| G-04 | Resubmission keeps the same ID (versions), no new request |
| G-05 | One record per request; department views are filters, never copies |
| G-06 | One notification per event per channel (no duplicates); placeholders validated at template save |
| G-07 | Amount routing comes from the DoA matrix; no single approver for every amount unless configured deliberately |
| G-08 | The validator blocks impossible conditions (e.g. "Nature is A AND Nature is B") |
| G-09 | The validator blocks approver sources that can never match (the Plant HOD bug) |
| G-10 | Every branch has reject / hold / changes handling (the Finance Internal level-2 gap) |
| G-11 | Every department value is routed or explicitly excluded (the Corporate Affairs / NBD gaps) |
| G-12 | No shared accounts; delegation instead |
| G-13 | No "let AI decide the number of approvers"; approver counts are deterministic |
| G-14 | Fields standardised through reusable field types; no per-project copies |
| G-15 | Only published templates are visible; no empty, unused structures |
| G-16 | Hard-coded "Level 1–4" columns are forbidden; use the node graph (north star) |

---

## Notification events (every one on email + WhatsApp + in-app, except OTP)
| ID | Event | Recipients | Checklist |
|---|---|---|---|
| N-01 | OTP code | User (WhatsApp only, D-025) | P1-12 |
| N-02 | New sign-in detected | User | P1-18 |
| N-03 | Password changed / mobile changed / account locked / repeated failures | User; Super Admin for locks | P1-20 |
| N-04 | Super Admin signed in | Super Admin | P1-20 |
| N-05 | Break-glass account enabled or used | Super Admin + holder | P1-36 |
| N-06 | Request submitted (receipt with ID) | Requester | P2-32 |
| N-07 | Action needed | Current approver(s) / delegate | P2-32 |
| N-08 | Approved at a level | Requester, next approver(s), watchers | P2-32 |
| N-09 | Fully approved | Requester, watchers, work assignee | P2-32 |
| N-10 | Rejected (with reason) | Requester, watchers | P2-32 |
| N-11 | Changes required (with reason) | Requester | P4-01 |
| N-12 | Resubmitted | Approver(s) at the restart level | P4-01 |
| N-13 | Put on hold / resumed | Requester | P4-04 |
| N-14 | Reopened | Requester, affected approvers | P4-03 |
| N-15 | SLA reminder | Approver | P4-06 |
| N-16 | Escalated | Escalation contact, approver | P4-06 |
| N-17 | Delegation started / ended | Delegator, delegate | P4-05 |
| N-18 | Work assigned / work completed | Assignee / requester | P6-03 |
| N-19 | Comment / @mention | Mentioned users, requester, current approver | P6-02 |
| N-20 | Delivery failures / provider problems | Super Admin | P1-45 |

---

## Coverage map (every requirement → checklist items)

### Base development plan (45 points, 28 Sep 2026)
| § | Topic | Items |
|---|---|---|
| 1 | Three-layer platform (users, builder, engine) | P1-USR, P3, P2-ENG |
| 2 | No recreation of the 104 projects | P2-TPL, G-05, G-15 |
| 3 | Approval Builder basic info | P2-01, P3-06 |
| 4 | Form builder | P3-03, P2-01 |
| 5 | Workflow types | P2-21 to P2-25 |
| 6 | Visual designer | P3-01, P3-02 |
| 7 | Approver selection engine | P2-05, P2-27 |
| 8 | Amount-based routing | P3-30, P2-24, G-07 |
| 9 | Conditional engine | P2-24 |
| 10–11 | Employee custom approvals + governance | P5-01 to P5-04 |
| 12–13 | Lifecycle; Reject vs Changes Required | P2-29, P2-30, P4-01 |
| 14 | Same ID on resubmission | P4-01, G-04 |
| 15 | Reopen | P4-03 |
| 16–17 | Actor security, step record | P2-28, P2-07, G-01 |
| 18 | Delegation | P4-05 |
| 19 | SLA and escalation | P4-06, P4-07 |
| 20 | Work assignment | P6-03 |
| 21 | Employee portal | P2-40, P2-41 |
| 22 | Approver portal | P2-42 |
| 23 | Management portal | P7-01, P7-02 |
| 24 | Universal timeline | P2-31, P2-43 |
| 25 | Documents with versions | P6-01 |
| 26 | Comments | P6-02 |
| 27 | Central notifications | P1-NOT |
| 28 | Audit trail | P1-37, P2-31 |
| 29–30 | Workflow and template versioning | P2-02, P2-20, P3-06 |
| 31 | Department architecture | P1-01, P1-03, G-05 |
| 32 | Visibility rules | P1-53 |
| 33 | Asana bug list → solutions | Guardrails G-01 to G-16 |
| 34 | Workflow validator | P3-04 |
| 35 | Test mode | P3-05 |
| 36 | Analytics | P7-01 to P7-03 |
| 37 | Power BI | P7-04 |
| 38 | Technical architecture | P0-11, Stack options |
| 39–40 | Core entities; node + connection + rule + actor | P2-DM, G-16 |
| 41 | Development phases | Phases 0–8 |
| 42 | Migration strategy (catalogue) | P2-TPL, P3-40 to P3-43 (flow reference only, D-013) |
| 43 | Preserve historical data | [~] Not needed, D-013 |
| 44 | Build order (engine before designer) | Phase 2 before Phase 3 |
| 45 | Target architecture | All phases |

### Owner requirements (28 Sep 2026)
| ID | Requirement | Items |
|---|---|---|
| R-01 | Multi-level approvals in any custom manner (**north star**) | P2-ENG, P2-DM, P3, P5, G-16 |
| R-02 | Admin Portal = Super Admin, handled by developers, itadmin@arssteels.co.in | P1-ADM, P1-30, D-003 |
| R-03 | All configuration only by the Super Admin | P1-31, P1-ADM, P3, P5-02 |
| R-04 | Full customisation rights and data rights for the Super Admin | P1-53, P1-ADM, P7-05 |
| R-05 | Only Admin-Portal-created users; any email | P1-04, P1-10, D-004 |
| R-06 | Google sign-in, no OTP | P1-10 |
| R-07 | User ID + password + OTP (mobile + WhatsApp); some staff password-only | P1-11, P1-12, P1-02 |
| R-08 | New-login detection notifies the user | P1-17 to P1-19 |
| R-09 | All notifications on WhatsApp and email | P1-NOT, N-01 to N-20 |
| R-10 | Nobody but the Super Admin sees backend, API, config or providers | P1-SEC |
| R-11 | WhatsApp via CEOITBox | P0-12, P0-14, P1-42 |
| R-12 | Hosting on GoDaddy | P0-10, P0-11, P0-19 |
| R-13 | Break-glass account + append-only audit | P1-36, P1-37 |
| R-14 | DoA clarity | §0.3 explanation, P0-30, P3-30 |
| R-15 | No Asana import; flow reference only | P8-03 [~], FLOWS.md Part A |
| R-16 | Maintain memory, plan checklist and flow files every session | Rules at top of all three files, CLAUDE.md, P0-01 |
| R-17 | GoDaddy cPanel + Node.js hosting | P0-10, P0-17a, P0-46, D-027 |
| R-18 | CEOITBox as in `D:\PBI New` | P0-12, P0-12a, P0-14, P1-42, D-029 |
| R-19 | OTP on WhatsApp only | P1-12 to P1-14, N-01, D-025 |
| R-20 | Dedicated Admin Portal for the IT team to create predefined approvals; everyone can create custom approvals | P1-50, P1-50a, P3, P5-01, D-024, D-026 |
| R-21 | Sender itadmin@arssteels.co.in; admin at admin.arssteels.net | P0-15, P0-17, P1-41, P1-50, D-030, D-031 |
| R-22 | No step-up OTP | P1-22 [~], D-032 |
| R-23 | Admin provides staff data; roles per user by admin only; add/inactivate users in the Admin Portal | P0-31, P1-04 to P1-06, P1-52, D-033 |
| R-24 | One app only at approvals.arssteels.net with /users, /admin, /superadmin | P0-40a, P1-30a, P1-50, P1-50a, D-034 |
| R-25 | GitHub repo HarishDevs/ARS-Approval-System for all activity | P0-18, P0-18a, P0-45, P0-46, D-035 |
| R-26 | Same WhatsApp number + API; owner provides notification templates | P0-12a, P0-14, D-036 |
| R-27 | Resend for email | P0-15, P1-41, D-037 |
| R-28 | Reuse the Firebase project | P0-16, P1-10, D-038 |
| R-29 | IT admins build approvals; providers/security Super Admin only | P1-50a, P1-31, D-039 |
| R-30 | Anyone can pick anyone in custom approvals | P5-02, D-040 |
| R-31 | itadmin@ = approval authority, admin login, break-glass | P0-30, P0-35, D-041 |
