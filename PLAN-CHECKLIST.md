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
- **Now:** **v1.0.0 is prepared for production** (8 Oct 2026).
  - The QA defects are fixed.
  - A Node 22 empty-file bug was caught by CI and fixed.
  - The deployment guide and release notes are updated, the version is 1.0.0, and the tag `v1.0.0` is pushed once CI is green.
  - The owner kept the policy items as they are (D-078).
- **Next, with the owner on GoDaddy** (docs/DEPLOYMENT.md):
  - DB and privilege check → migrate (15) → seed;
  - Node app from the `v1.0.0` commit, with env vars including UPLOAD_DIR;
  - DNS and HTTPS; Firebase authorised domain;
  - Resend key and a **new** CEOITBox key; cron;
  - break-glass; demo or real staff; the 19 templates; go-live checks.
- **Still open:** Q-015 (break-glass without WhatsApp); the real staff list.

---

## Session log — build session 1 (28 Sep 2026): planned before starting
- [x] S1-01 Record the owner's confirmation of both assumptions (D-042, Q-014) and the build choices (D-043) (done 28 Sep 2026)
- [x] S1-02 Scaffold the single Next.js app at the repo root (P0-40a, P0-41): package.json (versions pinned as on the Power BI site), tsconfig, next.config (COOP header, Firebase public config), Tailwind with the ARS tokens, ESLint, PostCSS, Vitest, the folder structure (done 28 Sep 2026)
- [x] S1-03 Environment schema (P0-43), `.env.example`, DB pool + transaction helper, migrate/seed scripts, docker-compose for MySQL on port 3307 (P0-42) (done 28 Sep 2026)
- [x] S1-04 Foundation migrations: departments, designations, users, roles + user_roles, otp_challenges, user_devices, user_sessions, login_logs, audit_logs (append-only triggers, P1-37), system_settings + history, whatsapp templates/variables/rate limit, notifications + deliveries, jobs; seeds for roles, the OTP template (reusing `wa_login_otp_v1`) and a bootstrap Super Admin (itadmin@) (done 28 Sep 2026)
- [x] S1-05 Security libraries: AES-256-GCM encryption, OTP generate/hash/verify, scrypt password hashing, session token signing, device cookie (done 28 Sep 2026)
- [x] S1-06 Settings (definitions, encrypted resolution, masking) and the CEOITBox + Resend adapters (P1-41, P1-42) (done 28 Sep 2026)
- [x] S1-07 Auth services with injectable dependencies: Google sign-in (P1-10), User ID + password → WhatsApp OTP (P1-11, P1-12), lockout (P1-15), DB-backed sessions + logout + sign out everywhere (P1-16), device check + new-login alert on email + WhatsApp (P1-17, P1-18), login logs with a wide user-agent column (P1-23) (done 28 Sep 2026)
- [x] S1-08 Authorisation: pure policy + guards for `/users`, `/admin`, `/superadmin`; middleware layer 1 (P1-30a, P1-31) (done 28 Sep 2026)
- [x] S1-09 UI: login page (Google, then User ID + password → OTP), area shells for /users, /admin, /superadmin using the ARS brand, generic 404 (P1-70, P1-71, P1-50) (done 28 Sep 2026)
- [x] S1-10 **Multi-level engine core (north star, P2-ENG):** graph model, validator (P3-04 rules incl. G-08/G-09/G-10), start/advance with sequential, parallel+join, any-one, any-N-of-M, conditions, skip + no-self-approval, reject / changes / hold / resume, simulation (P3-05 core) (done 28 Sep 2026)
- [x] S1-11 Unit tests for security, auth, policies and the engine; lint, typecheck, test and build all pass (done 28 Sep 2026)
- [x] S1-12 Start local MySQL, run migrations and seeds, smoke-test sign-in API paths (done 28 Sep 2026)
- [x] S1-13 Update the three living files; commit and push to GitHub (done 28 Sep 2026)

Found and fixed during session 1 (each covered by a test or smoke check):
- [x] S1-F1 Lockout locked one attempt early and skipped the lock alert: MySQL applies `SET` assignments left to right (D-044) (done 28 Sep 2026)
- [x] S1-F2 A blank optional env value (`FIREBASE_*=`) crashed every request; blanks now mean "not set" (D-045) (done 28 Sep 2026)
- [x] S1-F3 Tailwind resolved its config and content from the working directory, so pages were unstyled when started from another folder (as cPanel may do); both are now resolved from the project (D-046) (done 28 Sep 2026)
- [x] S1-F4 A whitespace-only form value didn't count as empty in conditions (done 28 Sep 2026)

## Session log — build session 2 (planned)
- [x] S2-01 `/superadmin` settings editor: grouped settings, encrypted secrets shown only as Configured / Not configured, save with validation, before/after audit, change history (P1-35, P1-54, P1-55, P1-60) (done 30 Sep 2026)
- [x] S2-02 Provider test-send buttons (CEOITBox, Resend) for the Super Admin only; results in the delivery log (P1-55) (done 30 Sep 2026)
- [x] S2-03 Admin user management in `/admin`: list, create, edit, set sign-in method, WhatsApp number, manager/HOD, roles (admin only), make inactive / reactivate (ends sessions), unlock, force sign-out (P1-04 to P1-06, P1-52) (done 30 Sep 2026)
- [x] S2-03a Organisation basics in `/admin` so user records can point at them: departments (code, name, HOD) and designations; add, edit, make inactive (P1-01, P1-51) (done 30 Sep 2026)
- [x] S2-03b Rules for managing users (D-047): only the Super Admin grants SUPER_ADMIN or edits Super Admin / break-glass accounts; no self-deactivation; the last Super Admin is protected; unit-tested (done 30 Sep 2026)
- [x] S2-04 Set password / first sign-in for password users and forgot password via WhatsApp OTP (P1-13, P1-14) (done 30 Sep 2026)
- [x] S2-05 Content-Security-Policy with a per-request nonce that still allows the Firebase Google popup (P1-34a) (done 30 Sep 2026)
- [x] S2-06 Engine persistence: workflow definitions and published versions, requests, instances (state JSON + tasks table), actions, timeline (P2-02, P2-06, P2-07, P2-20, P2-31) (done 30 Sep 2026)
- [x] S2-06a Approver groups (tables + directory) so the GROUP approver source works from the database (P2-05) (done 30 Sep 2026)
- [x] S2-06b Integration tests against a real MySQL test database: migrations, request numbering, start → decide → approve, concurrent decisions, append-only timeline (done 30 Sep 2026)
- [x] S2-07 Break-glass enable/disable script for the hosting console (P1-36) (done 30 Sep 2026)
- [x] S2-08 GitHub Actions CI: lint, typecheck, unit tests, build (P0-45) (done 30 Sep 2026)
- [x] S2-09 Update the three living files; commit and push (done 30 Sep 2026)

Found and fixed during session 2:
- [x] S2-F1 `last_value` is a reserved word in MySQL 8. The integration run caught it before it reached any database; the column is renamed `current_value` (done 30 Sep 2026)
- [x] S2-F2 React 19 clears a `<form action>` after every submit, which wiped the admin's typing on a validation error. Forms now submit through `useActionForm`, and only clear after a successful save where that's wanted (D-048) (done 30 Sep 2026)
- [x] S2-F3 A notification that was sent but failed to be recorded was marked FAILED and would be retried: a double send. Sending and recording now fail separately (D-052) (done 30 Sep 2026)
- [x] S2-F4 Setting limits showed the raw validation text ("Number must be greater than or equal to 5"). Now plain: "Use 5 or more." (done 30 Sep 2026)
- [x] S2-F5 A duplicate department code showed its message twice (done 30 Sep 2026)

## Session log — build session 3 (planned)
- [x] S3-01 `/users` home: My approvals queue (pending tasks) and My requests, with status pills (P2-41, P2-42) (done 30 Sep 2026)
- [x] S3-01a Form fields per workflow version (D-055): text, long text, number, date, choice, person; required; validated on the server; conditions and the person-from-field approver source use them (done 30 Sep 2026)
- [x] S3-02 Raise a request from a published approval type: title + form fields (a simple key/value form until the form builder, P3-03), submit (P2-40) (done 30 Sep 2026)
- [x] S3-03 Request page: details, the full level map (every step and branch, who approved or is pending), timeline, and approve / reject / request changes / hold / resume with reasons; record-level access (P1-30a layer 3, P2-43) (done 30 Sep 2026)
- [x] S3-04 Resubmit after changes required, from the request page (F-26) (done 30 Sep 2026)
- [x] S3-05 `/admin/workflows`: list, create and edit a workflow as structured steps (sequential levels, parallel groups, any-one / any-N, conditions), validate, test mode (simulate), publish, and version history (P3-01 first cut, P3-04, P3-05, P3-06) (done 30 Sep 2026)
- [x] S3-05a Pure builder → graph compiler with unit tests (sequential, parallel + join rules, any-one / any-N, skip conditions, every approver source) (done 30 Sep 2026)
- [x] S3-05b Step map for the request page: every level and branch with its status and people (pure, unit-tested) (done 30 Sep 2026)
- [x] S3-06 Approver groups screen in `/admin` (S2-06a data) (done 30 Sep 2026)
- [x] S3-07 Retry runner: signed `/api/jobs/run` for cPanel cron; retries FAILED deliveries with backoff (P1-48) (done 30 Sep 2026)
- [x] S3-08 Rate limiting on sign-in, OTP start and forgot password, per IP and per User ID (P1-21) (done 30 Sep 2026)
- [x] S3-09 Update the three living files; commit and push (done 30 Sep 2026)

Found and fixed during session 3 (in the browser run):
- [x] S3-F1 After a resubmission, a level finished in round 1 showed no approver; the map now shows each step's latest round (done 30 Sep 2026)
- [x] S3-F2 The request title was checked before the fields, so a bad amount only showed up on the second try; all errors now come back together (done 30 Sep 2026)
- [x] S3-F3 Avatar initials used punctuation ("Meena (MD)" → "M("); now letters only (done 30 Sep 2026)
- [x] S3-F4 "Asked for changes" appeared twice in the timeline (done 30 Sep 2026)
- [x] S3-F5 A race test expected one winner when a rejection and an approval hit an any-one step together; both are valid there. The test now uses two approvals, and the behaviour is recorded in FLOWS F-13 (done 30 Sep 2026)

## Session log — build session 4 (planned)
- [x] S4-01 Custom approvals for every user (P5, D-026, D-040): build a one-off route from the same levels builder (pick anyone, any mix of levels) and submit it at once; it belongs to that user (done 1 Oct 2026)
- [x] S4-02 Comments on a request, visible to everyone who can open it, and on the timeline (P2-08; attachments wait for the GoDaddy disk check, Q-001) (done 1 Oct 2026)
- [x] S4-03 Delegation / out of office (D-018, P4): a delegate for a date range; the engine's canActFor uses it; actor + on-behalf-of recorded (done 1 Oct 2026)
- [x] S4-04 SLA per step: reminders and escalation through the job runner (P4, F-31) (done 1 Oct 2026)
- [x] S4-05 Hand over pending steps when a user is deactivated (P1-05) (done 1 Oct 2026)
- [x] S4-06 In-app notification bell with unread count (P1-44) (done 1 Oct 2026)
- [x] S4-07 GoDaddy deployment dry run: build output, env var list, cPanel Node app settings, cron line, MySQL privileges (TRIGGER), a go-live checklist (P0-46, P0-17a) (done 1 Oct 2026)
- [x] S4-08 DoA matrix structure (P3-30), ready for the owner's values (Q-004) (done 1 Oct 2026)
- [x] S4-09 Update the three living files; commit and push (done 1 Oct 2026)

Notes from session 4:
- [x] S4-N1 The levels editor is now one shared component (`LevelsEditor`), used by the IT team's builder and by staff custom approvals, so the two can't drift apart (done 1 Oct 2026)
- [x] S4-N2 Delegation dates use India's date, whatever the database server's timezone (`INDIA_TODAY_SQL`), so an out-of-office starts and ends on the right day on GoDaddy (done 1 Oct 2026)
- [x] S4-N3 `check-privileges.js` added for go-live: CREATE TRIGGER must be allowed or the append-only guarantees are lost (done 1 Oct 2026)

## Session log — build session 5 (planned)
- [x] S5-01 (done 7 Oct 2026 on demo staff, S6-03; real people swap in through groups and HODs) First real approval types (P2-50 to P2-55: MD, ED, Finance, Purchase & SCM) set up in the builder from the owner's staff list (D-033) and the Asana reference flows (FLOWS F-60 onward)
- [x] S5-02 Withdraw / cancel by the requester while still open, and reopen of an approved request by the Super Admin with a reason (F-29) (done 1 Oct 2026)
- [x] S5-03 Management dashboard: open requests by type and step, average time per level, overdue list, approvals per person (P7-01) (done 1 Oct 2026)
- [x] S5-04 Working days and a holiday calendar for SLA timing (F-31) (done 1 Oct 2026)
- [x] S5-05 Playwright end-to-end tests for sign-in guard, raise → approve → resubmit, delegation (P0-44) (done 1 Oct 2026)
- [x] S5-06 Branching paths (CONDITION) in the builder: "if amount > X go to these levels, otherwise those" (P3-01 step toward the canvas) (done 1 Oct 2026)
- [x] S5-07 (done 7 Oct 2026, S6-05; owner confirmed GoDaddy keeps files) Attachments on requests, once the GoDaddy disk check (Q-001) says local storage is persistent; otherwise S3-compatible storage
- [x] S5-06a Step map and DoA view understand choices; the request page shows the path taken (done 1 Oct 2026)
- [x] S5-04a Due and escalation times on the working calendar (escalate_at column); holiday screen in /admin/calendar (done 1 Oct 2026)
- [x] S5-08 Update the three living files; commit and push (done 1 Oct 2026)

Found and fixed during session 5:
- [x] S5-F1 Editing a saved workflow reused step ids (the builder counted from s1001 on every page load), so the save was refused with "id used twice". New steps now get random ids (done 1 Oct 2026)
- [x] S5-F2 Insights showed "0 min" for very quick decisions; it now says "under 1 min" (done 1 Oct 2026)
- [x] S5-N1 The SLA integration test now also moves `escalate_at` when it fakes elapsed time, since tasks now carry the calendar-based escalation time (done 1 Oct 2026)

## Session log — build session 6 (7 Oct 2026)
Owner's answers (7 Oct 2026):
1. Use dummy data for now, in place of the staff list.
2. Yes, GoDaddy keeps uploaded files (Q-001 disk), so attachments can go ahead.
3. Asked for every template format, to create the templates.
4. Asked for a DoA example.

The deployment go-ahead is still pending.

- [ ] S6-01 Go-live on GoDaddy following docs/DEPLOYMENT.md (with the owner): privilege check, migrate, seed, env vars, cron, Firebase domain, provider keys, break-glass, go-live checks (waiting for the go-ahead)
- [~] S6-02 Load the owner's staff list. Replaced by S6-02a for now (owner answer 1). The real list still comes later, through the user screens or a bulk import (P1-04)
- [x] S6-02a **Demo data** (D-071), loaded with one button in /superadmin/demo: (done 7 Oct 2026)
  - demo departments, designations and about 20 demo people, with managers, HODs and approver groups;
  - every demo person is marked "(demo)", has a `demo.` User ID, an itadmin+demo… email and no WhatsApp number;
  - safe to load twice; "Retire demo staff" makes them inactive (never deleted)
- [x] S6-03 **First approval types** F-60 to F-70 (P2-50 to P2-55): (done 7 Oct 2026)
  - built with the levels builder on the demo staff;
  - approvers come from groups and department HODs, so the real people can be swapped in later without editing workflows;
  - published, and each one passes its test-mode run
- [x] S6-03a **DoA example** (Q-004) built into Purchase & SCM. The amount bands add levels, and the DoA view shows the matrix. docs/DOA-EXAMPLE.md explains how to fill in the real values (done 7 Oct 2026)
- [x] S6-04 **WhatsApp templates** (Q-013, P0-14, P1-46): (done 7 Oct 2026)
  - one catalogue in code (`server/notifications/templates.ts`) with every event's wording, {{n}} variables in order, and sample values;
  - docs/NOTIFICATION-TEMPLATES.md for creating them in CEOITBox;
  - a /superadmin/templates screen to record the approved Meta name and switch each one on;
  - a test keeps the code, catalogue and document in step
- [x] S6-04a Escalation and "request blocked" messages also go on WhatsApp (they were email only) (done 7 Oct 2026)
- [x] S6-05 **Attachments** (D-072, F-18): (done 7 Oct 2026)
  - files on a request (raise, resubmit, or later while open), stored on disk outside the web root;
  - allowed types, size limits, file-type sniffing;
  - download only through a signed-in, permission-checked route;
  - shown in the timeline; never deleted
- [~] S6-06 Audit export (CSV) and login history for the Super Admin (P1-57). Moved to session 7 if time runs out (7 Oct 2026: moved to S7-03)
- [x] S6-07 Fix the duplicate flow number: F-70 was both "Price Realisation" and "Management dashboard". The dashboard becomes F-56 (done 7 Oct 2026)
- [x] S6-08 Tests (unit, integration, e2e) and the browser check; update the three living files; commit and push (done 7 Oct 2026)

Found and fixed during session 6:
- [x] S6-F1 An empty file box reached the server as a 0-byte file named "blob" and was refused as a wrong type, which blocked every plain submit. Empty entries are now ignored, with a regression test; the e2e suite caught it (done 7 Oct 2026)
- [x] S6-F2 The DoA view listed parallel reviewers as if they ran one after another; it now shows "A + B (together)" (done 7 Oct 2026)
- [x] S6-F3 Flow number F-70 was used twice; the dashboard is now F-56 (done 7 Oct 2026)

## Session log — build session 7 (8 Oct 2026)
Owner's instructions (8 Oct 2026):
- "When creating an approval I will create the DoA based on each approval; design the system based on that."
- "For all WhatsApp notification templates, create the WhatsApp notification template creator in the Super Admin. Use this as the master document for API services": CEOITBOX_API_Integration_Guide.docx and CEOITBOX_API_Master_Documentation.docx.

DoA per approval type (D-075, F-58):
- [x] S7-01 **DoA matrix** as part of each approval type: a new "DoA" level in the builder. (done 8 Oct 2026)
  - Holds: the amount field; the band limits (e.g. ₹1L / ₹10L / ₹25L / above); the approval levels (any approver source, rule, response time); and a tick grid of which levels each band needs.
  - Bands may be cumulative or not.
  - One per approval type. It can sit between ordinary levels (e.g. manager first, DoA, then accounts).
- [x] S7-02 The engine side: each DoA level compiles to an approval step that is skipped (AND/OR condition) in the bands where it isn't ticked. The checks: (done 8 Oct 2026)
  - every band needs a level;
  - the limits must rise;
  - the amount field must exist, be a number, and be required.
- [x] S7-03 New approval types start with an "Amount (₹)" field and a DoA matrix ready to fill in. The DoA view, request map, test mode and demo Purchase & SCM all use it (done 8 Oct 2026)
- [x] S7-04 Tests: compile/validate, routing at every band edge, DoA view, form checks (done 8 Oct 2026)

WhatsApp template creator (D-076, F-42), per the CEOITBox master document:
- [x] S7-05 CEOITBox client additions: (done 8 Oct 2026)
  - create a template (POST /api/v1/messageTemplate/create: name, language, category, components BODY/FOOTER with example.body_text);
  - sync from Meta (GET /api/v1/whatsapp/syncTemplatesFromMeta);
  - list templates (POST /api/v1/messageTemplate/getTemplates, paginated);
  - every send carries a userMessageId;
  - a 200 reply that carries an error object counts as a failure
- [x] S7-06 Registry storage per version: wording, footer, category, variable map, Meta status, rejection reason, last sync, submitted by/at (done 8 Oct 2026)
- [x] S7-07 /superadmin/templates becomes a creator. For each event: (done 8 Oct 2026)
  - write the wording with named placeholders ({{request_no}}…), which the app turns into {{1}}, {{2}} in order of use;
  - see a live preview, and submit it to CEOITBox for Meta approval;
  - "Sync status" pulls Meta's verdict: an approved template switches on by itself; a rejected one shows the reason;
  - "Send test to me" sends to the Super Admin's own number;
  - editing an approved template makes a new version (name _v2…); the old one keeps sending until the new one is approved
- [x] S7-08 docs/CEOITBOX-API.md: the endpoints and rules the app uses, from the master document. No keys, ever (done 8 Oct 2026)
- [x] S7-09 Tests: placeholder conversion, the create payload shape, a 200-with-error reply, sync status mapping, version rules (done 8 Oct 2026)

Carried over:
- [ ] S7-10 Go-live on GoDaddy (S6-01) when the owner gives the go-ahead (still waiting for the go-ahead)
- [~] S7-11 Audit export (CSV) and login history (P1-57), attachments on custom approvals, work hand-off (F-32): to session 8 if time runs out (8 Oct 2026: moved to session 8, S8-02)
- [x] S7-12 Update the three living files; commit and push (done 8 Oct 2026)

Found and fixed during session 7:
- [x] S7-F1 Rejected (400), blocked (200 with an error) and bad-key (401) CEOITBox replies were all mapped to a retryable error, so they would have been retried. The guide says never retry 400 or 401, so only network and 5xx errors are retried now (done 8 Oct 2026)
- [x] S7-F2 On narrow screens the form-fields row of the builder made the whole page scroll sideways. It now wraps until large screens (done 8 Oct 2026)
- [x] S7-N1 Levels further down a request map show "Not needed at this amount (DoA)" straight away, instead of "Waiting", when the amount's band doesn't tick them (done 8 Oct 2026)

- [x] S7-F3 "Submit to Meta" did nothing in the browser pane: confirmations used window.confirm, which some browsers block silently (counted as Cancel), so nothing reached CEOITBox. All 8 confirmations are now an in-page "Yes, continue / Cancel" bar. Verified live: ars_approval_needed_v1 was submitted to CEOITBox and the sync shows it waiting for Meta (done 8 Oct 2026)
- [x] S7-L1 Live check with the owner's CEOITBox test key, entered by the owner in /superadmin: sync and list worked; the first template (ars_approval_needed_v1) was submitted (done 8 Oct 2026)

## Session log — build session 8 (planned)
- [ ] S8-01 Go-live on GoDaddy (docs/DEPLOYMENT.md) when the owner gives the go-ahead. Then enter the new CEOITBox key, submit the 20 templates, sync and test-send each
- [ ] S8-02 Audit export (CSV) and login history (P1-57); attachments on custom approvals; work hand-off after approval (F-32)
- [ ] S8-03 CEOITBox webhook for delivery and read receipts (HTTPS, secret header), shown in Message deliveries
- [x] S8-05 QA test-case suite for the whole platform (owner's master QA prompt, 8 Oct 2026): docs/qa/QA-TEST-SUITE.md, specific to this app (real statuses, roles, DoA, CEOITBox, attachments). It includes a traceability matrix, defect risks found by reading the code, and the smoke, sanity, regression and critical suites (done 8 Oct 2026: 600 cases; P0 160, P1 201, P2 150, P3 89; smoke 24, sanity 18, regression 361, critical 144; generated from docs/qa/source)
- [x] S8-06 Fix the QA defects (owner: "fix all the defects", 8 Oct 2026):
  - [x] S8-06a D-QA-04: amounts in a DoA field (and amount fields generally) can't be negative. NUMBER fields gain a minimum; the DoA field is enforced at ≥ ₹0 on the server (done 8 Oct 2026)
  - [x] S8-06b D-QA-01: idempotent submit. A one-time submission key on each form, stored unique per requester; a repeat returns the first request (done 8 Oct 2026)
  - [x] S8-06c D-QA-02: same requester, type and title within 10 minutes → "looks like a duplicate", with a tick to raise it anyway (done 8 Oct 2026)
  - [x] S8-06d D-QA-03: attachments are counted under the request lock; the same file (sha256) isn't stored twice on a request (done 8 Oct 2026)
  - [x] S8-06e D-QA-05: over-long comments and reasons are refused with the limit shown, instead of cut silently (done 8 Oct 2026)
  - [x] S8-06f D-QA-06: notification outbox. Messages are written in the same transaction as the decision, sent after the commit, and any left unsent are sent by the job runner (done 8 Oct 2026)
  - [x] S8-06g D-QA-09: the job runner syncs WhatsApp template status from Meta once a day (done 8 Oct 2026)
  - [x] S8-06h D-QA-11: My requests gets search (number or title), a status filter and paging (done 8 Oct 2026)
  - [x] S8-06i D-QA-15: line breaks stripped from email subjects (done 8 Oct 2026)
  - [x] S8-06j D-QA-07 and D-QA-13 checked: already handled (deactivation with pending approvals is refused; reminders skip held requests). Correct the QA document (done 8 Oct 2026)
  - [x] S8-06k D-QA-08, D-QA-10, D-QA-14: the owner chose to keep them as they are (D-078) (done 8 Oct 2026)
Found during S8-06:
- [x] S8-F1 The new duplicate check ran before field validation, so a negative amount on a repeated title showed the duplicate message instead of the amount error. It now runs inside the transaction, after the form is valid; the e2e test caught it (done 8 Oct 2026)
- [x] S8-07 Prepare the production release v1.0.0 (owner, 8 Oct 2026):
  - Found and fixed S8-F2: CI's e2e job had failed since session 6, because on Node 22 an empty file box arrives as a 0-byte "undefined" file and blocked every plain submit;
  - updated DEPLOYMENT.md (migration list, new CEOITBox key, templates, cron jobs, UPLOAD_DIR, demo option, extra go-live checks, known limits);
  - RELEASE-NOTES.md; version 1.0.0; .nvmrc 22;
  - tag v1.0.0 once CI is green (done 8 Oct 2026)
- [ ] S8-01b Go-live on GoDaddy with the owner, following docs/DEPLOYMENT.md
- [x] S8-04 Update the three living files; commit and push (done 8 Oct 2026)

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
- [x] P0-14 Notification templates: the owner provides the wording (Q-013) → register them in CEOITBox (Utility category) → Meta approval → record the template names and variable order in the app's template registry. OTP reuses `wa_login_otp_v1` (Q-014) (7 Oct 2026: all 20 formats in docs/NOTIFICATION-TEMPLATES.md and /superadmin/templates; the owner creates them in CEOITBox)
- [ ] P0-15 Email through Resend from itadmin@arssteels.co.in (D-037): check the domain is verified in Resend (SPF/DKIM); API key in GoDaddy env vars only
- [ ] P0-16 Reuse Firebase project `power-bi-dashboard-3b29f` (D-038): add `approvals.arssteels.net` and `localhost` to its authorised domains
- [ ] P0-17 DNS + SSL: bind `approvals.arssteels.net` to the GoDaddy Node.js app (D-034)
- [>] P0-17a On the first GoDaddy app: check that the disk is persistent (attachments), which MySQL host is reachable, and whether cron is available (Q-001 remainder) (7 Oct 2026: owner confirmed the disk is persistent; MySQL host and cron still to check on the first deploy)
- [x] P0-18 Git repository `HarishDevs/ARS-Approval-System` (D-035): `git init` in the project folder, `.gitignore` (node_modules, .next, .env*, backups, storage), README, repo-level CLAUDE.md, first commit pushed to `main` (done 28 Sep 2026)
- [ ] P0-18a Working rule: commit with clear messages; push at the end of every session; feature branches + pull requests once coding starts
- [ ] P0-19 Create the environments: local dev, staging (GoDaddy), production (GoDaddy)
- [ ] P0-20 Set up a secrets store on the server (environment files outside the web root, locked permissions); never in the repo
- [ ] P0-21 Set up database backups: daily, off-server copy, tested restore

### 0.2b Code scaffold (D-028)
- [~] P0-40 Monorepo with two apps: replaced by a single app (D-034, 28 Sep 2026)
- [x] P0-40a **Single Next.js app** (like the Power BI app) in the repo root, with route groups `/users`, `/admin`, `/superadmin`, `/login` and `/api`. Layers: `app/` (routes), `features/` (UI by domain), `server/` (engine, auth, business rules, server-only), `lib/` (db, integrations), `config/`, `database/` (migrations, seeds), `tests/` (done 28 Sep 2026)
- [x] P0-41 Next.js 15 + React 19 + TypeScript strict + Tailwind 3 with the ARS preset from `D:\Omniroute\assets\tokens`; icons from the asset sprite (done 28 Sep 2026)
- [x] P0-42 MySQL 8 via `mysql2`; SQL migration folder + migrate/seed scripts (same pattern as the Power BI site); `docker-compose.yml` for local MySQL (done 28 Sep 2026; Docker MySQL on port 3307)
- [x] P0-43 Environment schema validated at startup with zod (fail fast with a clear message) (done 28 Sep 2026; blank optional values count as unset (D-045))
- [x] P0-44 Vitest unit tests + Playwright end-to-end; lint and typecheck scripts (28 Sep 2026: Vitest in place with 80 tests; Playwright still to do) (done 1 Oct 2026; Vitest + Playwright e2e in CI)
- [x] P0-45 CI on GitHub Actions (lint, typecheck, unit tests, build) (done 30 Sep 2026; lint, typecheck, unit tests, build + MySQL integration job)
- [>] P0-46 GoDaddy deploy: one Node.js app from GitHub `HarishDevs/ARS-Approval-System` → `approvals.arssteels.net`, env vars entered in GoDaddy only, cPanel cron calling a signed job-runner endpoint (1 Oct 2026: docs/DEPLOYMENT.md + check-privileges.js; deployment waits for the owner's go-ahead)

### 0.3 Business inputs
- [>] P0-30 **DoA matrix.** The approval authority is itadmin@ (D-041); fill in the bands and approvers per request type before Phase 3 (Q-004) (7 Oct 2026: example in docs/DOA-EXAMPLE.md and the demo Purchase & SCM; real values still to come (Q-004)) (8 Oct 2026: owner decided: DoA set per approval type when creating it (D-075); the editor is built)
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
- [>] P1-01 Data model: companies/units, locations, departments, designations, cost centres (28 Sep 2026: departments (with HOD) and designations; units, locations and cost centres still to do)
- [x] P1-02 Data model: users. Fields: login ID, email (any domain), WhatsApp number, sign-in method (Google / password), firebase_uid, password hash, status (active / inactive), locked-until, is_super_admin, is_break_glass (done 28 Sep 2026; Super Admin is a role (D-043), not a flag)
- [ ] P1-03 Reporting hierarchy: reporting manager and HOD per user; manager-of-manager lookup
- [>] P1-04 Users can only be created in the Admin Portal (no self sign-up); bulk import with validation (30 Sep 2026: admin-only creation done; bulk import still to do)
- [x] P1-05 Make a user inactive (never hard-delete, D-033) → end their sessions, block sign-in, hand their pending approval steps to a chosen person; reactivate later if needed (30 Sep 2026: deactivate ends sessions and blocks sign-in, reactivate done; handing over pending steps comes with S3) (done 1 Oct 2026; handover required before deactivation (F-16))
- [x] P1-06 Roles assigned per user, by the admin only (D-033): a user can hold several roles; no self-service role changes (done 30 Sep 2026; D-047 rules)

### P1-AUTH Sign-in and security
- [>] P1-10 Google sign-in via Firebase Auth, ID token verified on the server: the email must match an existing active user whose method is Google; link firebase_uid on the first sign-in only; **no OTP** (D-006) (28 Sep 2026: built and unit-tested; a live test needs the Firebase Admin service-account values)
- [>] P1-11 User ID + password sign-in: Argon2id hashing, leaked-password check, minimum length (configurable) (28 Sep 2026: scrypt instead of Argon2id (D-043), policy checks; leaked-password check still to do)
- [>] P1-12 OTP after password sign-in: 6 digits, 5 min, single use, 5 wrong tries, resend after 30 s, max 5 per hour, stored hashed, anti-enumeration response; sent on **WhatsApp only** (D-025) with the Authentication-category template (28 Sep 2026: built, unit-tested and smoke-tested to the send step; a live send needs the CEOITBox key entered in /superadmin (S2-01))
- [x] P1-13 First sign-in for password users: set password (reuse the asset-pack create-password screens), verify the WhatsApp number by OTP (done 30 Sep 2026; single-use link + WhatsApp code (D-049))
- [x] P1-14 Forgot password: OTP on WhatsApp → new password → all sessions ended → alert sent (done 30 Sep 2026; uniform answers, code sent after the response)
- [x] P1-15 Lockout after 5 failed passwords (15 min, configurable) + alert (done 28 Sep 2026; verified on MySQL (5th wrong password locks, alert recorded))
- [>] P1-16 Sessions: secure HTTP-only cookie, idle and absolute timeouts (configurable), sign out everywhere (28 Sep 2026: DB-backed sessions, logout, sign out everywhere; idle timeout still to do)
- [>] P1-17 Device recognition: signed device cookie + browser/OS + IP / approximate location; trusted-device period (28 Sep 2026: signed device cookie, user agent, IP, trusted period; approximate location still to do)
- [>] P1-18 **New-login alert** on email + WhatsApp: time, device, browser, approximate location, IP, and a "This wasn't me" link (28 Sep 2026: built and tested; the WhatsApp copy waits for the owner's template (Q-013))
- [x] P1-19 "This wasn't me": end all sessions, lock the account, notify the Super Admin (28 Sep 2026: ends sessions, locks the account, alerts the user and the Super Admin; admin unlock arrives with S2-03; unlock done 30 Sep 2026)
- [>] P1-20 Security alerts for password changed, mobile/WhatsApp changed, account locked, repeated failures; every Super Admin sign-in alerts the Super Admin (28 Sep 2026: account locked + Super Admin/break-glass sign-in alerts; password/mobile-changed alerts come with S2-03/S2-04; added 30 Sep 2026, email now, WhatsApp after Q-013)
- [x] P1-21 Rate limiting on sign-in, OTP and password reset (done 30 Sep 2026; D-059)
- [~] P1-22 Step-up OTP for sensitive Admin Portal actions: not needed (D-032, 28 Sep 2026)
- [x] P1-23 `login_logs` browser/user-agent column ≥ VARCHAR(500) (bug found on the Power BI site) (done 28 Sep 2026; VARCHAR(500))

### P1-SEC Backend visibility and platform security (D-016)
- [~] P1-30 Separate admin build and address: replaced by role routes in one app (D-034, 28 Sep 2026)
- [x] P1-30a Route protection in 3 layers (the Power BI site's pattern): (1) middleware blocks `/admin` and `/superadmin` without the right role; (2) every page, route handler and server action re-checks the role and permission on the server; (3) record-level data-scope checks. Admin UI built mainly as server components, with no config or secrets in client bundles. Unknown or forbidden admin routes return a generic 404 (28 Sep 2026: layers 1 (middleware) and 2 (every layout and page, plus API guards; forbidden admin areas return 404) done; layer 3 comes with requests) (done 30 Sep 2026; layer 3: request pages open only for requester, participants and IT/Super Admin (D-057))
- [>] P1-31 Every API call needs a signed-in session; permissions checked on the server per record; admin routes accept only Admin Portal roles (D-024); Super-Admin-only areas (providers, security, integrations, health, audit export) enforced on the server (28 Sep 2026: area guards for API routes; per-record checks come with requests)
- [>] P1-32 No public API docs; no source maps in production; no config or keys sent to the browser; feature flags decided on the server (28 Sep 2026: no production source maps, no x-powered-by, public config only for Firebase)
- [>] P1-33 Generic error messages with a reference code; server/framework headers stripped; no provider names in the UI, emails or WhatsApp (28 Sep 2026: generic errors with a REQ- reference code)
- [>] P1-34 CORS limited to ARS addresses; security headers (CSP, HSTS, frame-ancestors) (28 Sep 2026: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy set; CSP is S2-05 (P1-34a); CSP done 30 Sep 2026)
- [x] P1-34a Content-Security-Policy with a per-request nonce, compatible with the Firebase popup (S2-05, added 28 Sep 2026) (done 30 Sep 2026; D-051)
- [>] P1-35 Secrets encrypted at rest, shown masked in the Admin Portal, with rotation dates (30 Sep 2026: encrypted, shown only as Configured/Not configured, history by fingerprint; rotation dates still to do)
- [>] P1-36 **Break-glass account** (D-011): disabled by default; enabled only by a server-side script run from the hosting console; each use alerts (28 Sep 2026: schema plus the sign-in window rule and alert; the enabling script is S2-07; script done 30 Sep 2026, see Q-015)
- [x] P1-37 **Append-only audit log** (D-012): no update or delete for anyone; the Super Admin can view and export (done 28 Sep 2026; MySQL triggers reject UPDATE/DELETE (verified))
- [ ] P1-38 At go-live: rotate every key and password; remove developer access that is no longer needed

### P1-NOT Notification hub
- [>] P1-40 Event-driven hub: each event is recorded once, then fanned out to channels (28 Sep 2026: hub built (in-app + email + WhatsApp, never throws); the retry runner is P1-48)
- [>] P1-41 Email channel (Q-005), using ARS header/footer branding (28 Sep 2026: Resend adapter built; key entry is S2-01)
- [>] P1-42 WhatsApp channel through CEOITBox (D-009), with approved templates (28 Sep 2026: CEOITBox adapter with rate limit built; key entry is S2-01)
- [~] P1-43 SMS channel for OTP: not needed (D-025, 28 Sep 2026)
- [x] P1-48 Retry outbox for failed sends, driven by the cron job runner (the Power BI site lacked this); respect the CEOITBox rate limit (done 30 Sep 2026; /api/jobs/run with lease and backoff (D-058))
- [x] P1-44 In-app notifications (bell icon from the asset pack) (done 1 Oct 2026; bell with unread count + inbox)
- [x] P1-45 Delivery log per channel with status, retries and failures; the Super Admin can resend (30 Sep 2026: Super Admin delivery log; resend button with the retry runner (S3-07)) (done 30 Sep 2026; Retry now + automatic retries)
- [x] P1-46 Template per event and channel, versioned, with preview (7 Oct 2026: catalogue with preview, registry screen, versioned rows)
- [ ] P1-47 WhatsApp numbers verified by OTP; opt-in recorded

### P1-ADM Admin Portal (Super Admin) core
- [>] P1-50 Admin area shells at `approvals.arssteels.net/admin` and `/superadmin` (D-034): navigation, ARS branding (28 Sep 2026: shells for /admin and /superadmin)
- [>] P1-50a Roles (D-024, D-039): **Super Admin** = itadmin@ (everything; `/superadmin`); **IT Admin** (`/admin`: approval types, forms, workflows, templates, DoA, users and roles as granted); **User** (`/users`). Provider keys, security, integrations, system health and audit export are `/superadmin` only (28 Sep 2026: SUPER_ADMIN / IT_ADMIN / USER roles and area policy)
- [>] P1-51 Organisation module (P1-01) (30 Sep 2026: departments (with HOD) and designations; units, locations, cost centres still to do)
- [>] P1-52 Users and hierarchy module (P1-02 to P1-05): create, import, edit, deactivate, force sign-out, reset password, unlock, change sign-in method (30 Sep 2026: create, edit, deactivate, reactivate, unlock, force sign-out, set-password link, change sign-in method; import still to do)
- [ ] P1-53 Roles and data rights: role builder, permission matrix, data scopes (own / team / department / list / all), field-level hiding
- [>] P1-54 Security settings: password policy, OTP values, lockout, sessions, trusted-device period, alert rules, optional IP allowlist for the Admin Portal (30 Sep 2026: password length, OTP, lockout, trusted-device values in /superadmin; session timeouts and IP allowlist still to do)
- [>] P1-55 Providers and integrations: Google OAuth, email, CEOITBox, SMS. Masked keys, test-send button (30 Sep 2026: Resend + CEOITBox keys and test-send; Google (Firebase Admin) stays an env value)
- [ ] P1-56 Notification center: templates, channels, delivery log
- [>] P1-57 Audit viewer: search, filter and export the audit log; login history; security events (30 Sep 2026: viewer with action filter and paging; export and login-history view still to do)
- [ ] P1-58 System health: job queue, notification failures, error summary (admin only)
- [ ] P1-59 Branding: logo, colours, email header, login message
- [x] P1-60 Every admin change is written to the audit log with before and after values (done 30 Sep 2026 for settings, users, roles, departments, designations, workflows)

### P1-UI User app foundation
- [>] P1-70 App shell with the ARS tokens and icons (asset pack): sidebar, top bar, profile (28 Sep 2026: sidebar shell with ARS branding)
- [x] P1-71 Login screens: Google button, User ID + password, OTP screen, forgot password, create password (28 Sep 2026: Google + User ID/password + OTP screens; forgot/create password in S2-04; forgot + set password screens done 30 Sep 2026)
- [ ] P1-72 Profile: my details, my devices and sessions (sign out a device), notification preferences where the Super Admin allows them

---

## Phase 2 — Multi-level approval engine (the core of the product)

### P2-DM Data model (node graph, never fixed levels)
- [ ] P2-01 ApprovalTypes, ApprovalTemplates (versioned), FormDefinitions (versioned), FormFields (reusable field types)
- [x] P2-02 WorkflowDefinitions → WorkflowVersions → WorkflowNodes + WorkflowEdges + WorkflowConditions (done 30 Sep 2026; nodes/edges stored as the version's JSON graph, one published version at a time)
- [ ] P2-03 Node kinds: START, APPROVAL, PARALLEL-SPLIT, JOIN, CONDITION, WORK-ASSIGNMENT, NOTIFY, END
- [ ] P2-04 Completion rules on a group: ALL, ANY_ONE, ANY_N_OF_M (N configurable), with optional weighted or mandatory members
- [x] P2-05 Approver sources per node: specific user, role, requester's HOD, department HOD, reporting manager, manager's manager, department, approval group, requester-selected (within governance), user from a form field (30 Sep 2026: all 8 sources resolve from MySQL; approver groups have tables (screen in S3-06)) (done 30 Sep 2026; approver groups screen added)
- [>] P2-06 ApprovalRequests (permanent ID, e.g. PUR-2026-000421), ApprovalVersions, ApprovalInstances, ApprovalSteps, ApprovalActions (30 Sep 2026: requests with permanent numbers, state, tasks and timeline; form versions come with the form builder)
- [x] P2-07 Step record: step ID, request, node, assigned approver(s), eligible approvers, **actual actor**, on-behalf-of, decision, time, comment, version (done 30 Sep 2026; actual actor + on-behalf-of per task)
- [>] P2-08 Comments, Attachments (versioned), Watchers (1 Oct 2026: comments done (append-only); attachments and watchers later) (7 Oct 2026: comments and attachments done (attachments never deleted; a newer file is added); watchers later)
- [x] P2-09 Numbering scheme per approval type (code prefix + year + sequence) (done 30 Sep 2026; PREFIX-YYYY-000001 from a locked sequence row)

### P2-ENG Engine behaviour (all patterns from day one)
- [x] P2-20 Instantiate a request against the **published workflow version** (running requests never change underneath) (done 30 Sep 2026; tested with a new version published mid-flight)
- [x] P2-21 Sequential levels (any number) (engine core done 28 Sep 2026; stored with S2-06)
- [x] P2-22 Parallel levels with a join (ALL) (engine core done 28 Sep 2026 (joins: ALL, ANY_ONE, ANY_N))
- [x] P2-23 Any-one and any-N-of-M groups (engine core done 28 Sep 2026)
- [x] P2-24 Conditional branches (amount, department, type, priority, any form field; AND/OR) (engine core done 28 Sep 2026 (AND/OR groups, default path))
- [x] P2-25 Hybrid graphs: combinations of all the above, nested (engine core done 28 Sep 2026)
- [x] P2-26 Skip rules (e.g. skip a level if the requester is that approver; no self-approval) (engine core done 28 Sep 2026 (skipIf, no self-approval, BLOCK/SKIP when no approver))
- [x] P2-27 Resolve approvers when a step starts (so hierarchy changes are picked up); record who was resolved (done 30 Sep 2026; resolved from a fresh directory snapshot when each step starts)
- [x] P2-28 **Server-side actor authorisation** on every action (D-020): the signed-in user must be an eligible approver or a valid delegate for this step (28 Sep 2026: the engine enforces approver-or-delegate; the server wiring comes with S2-06; wired and tested on MySQL 30 Sep 2026)
- [ ] P2-29 Canonical state machine (D-017): Draft, Submitted, Pending, In Progress, On Hold, Changes Required, Resubmitted, Approved, Rejected, Reopened, Closed
- [x] P2-30 Actions: Approve, Reject (reason required), Request Changes (reason required), Put On Hold / Resume, Comment (engine core done 28 Sep 2026)
- [x] P2-31 Timeline / audit entry for every transition (done 30 Sep 2026; append-only approval_events)
- [>] P2-32 Notification events emitted for every transition (to P1-NOT) (30 Sep 2026: approval needed / approved / rejected / changes / hold / blocked on email + in-app; WhatsApp waits for Q-013)
- [>] P2-33 Engine test suite covering every pattern, including edge cases (an approver leaves mid-flow, an empty approver group, a condition with no matching branch) (28 Sep 2026: 38 engine tests; 'an approver leaves mid-flow' still to do)

### P2-UI Employee and approver portals (first cut)
- [>] P2-40 Employee: create request from a template, dynamic form, attachments, submit, save draft (30 Sep 2026: pick a type, fill the form (text, long text, number, date, choice, person), submit; attachments and drafts still to do)
- [x] P2-41 Employee: My Requests, with a status pill and a visual step tracker showing every level and branch (done 30 Sep 2026)
- [x] P2-42 Approver: My Queue (ID, requester, department, type, amount, current step, age, SLA) with actions (30 Sep 2026: queue with request, requester, step and age; SLA column with S4-04) (done 1 Oct 2026; due time and Overdue in the queue)
- [>] P2-43 Request detail: form data, documents, timeline, comments, the full level map (30 Sep 2026: form data, full level map, timeline; documents and comments in S4)
- [x] P2-44 Secure deep links from email/WhatsApp that open the request after sign-in (D-019) (done 30 Sep 2026; links open /users/requests/id after sign-in)

### P2-TPL First-release templates (D-021), built by configuration only
- [x] P2-50 MD Approval (7 Oct 2026 on demo staff)
- [x] P2-51 ED Approval (7 Oct 2026 on demo staff)
- [x] P2-52 Finance Approval (Prabu) (7 Oct 2026 as Finance (controller), via a group)
- [x] P2-53 Finance Approval (Valarmadhi) (7 Oct 2026 as Finance (head), via the department HOD)
- [x] P2-54 Purchase & SCM Approval (7 Oct 2026 with the DoA bands)
- [x] P2-55 Each template is checked against the reference flows in FLOWS.md Part A, with the known defects not reproduced (7 Oct 2026: shapes as FLOWS F-60 to F-71, people by group/HOD (G-01..G-15 not reproduced))

---

## Phase 3 — Workflow designer, DoA, validator, test mode
- [>] P3-01 Visual drag-and-drop designer: START, APPROVAL, PARALLEL, ANY-ONE, ANY-N, CONDITION, WORK, END (30 Sep 2026: structured levels builder (D-056); drag-and-drop canvas later) (1 Oct 2026: levels builder now has choices (CONDITION); drag-and-drop canvas still later) (8 Oct 2026: DoA matrix editor per approval type added)
- [>] P3-02 Node settings panel: approver source, completion rule, SLA, allowed actions, notifications (30 Sep 2026: approver source, completion rule, skip condition, no-approver policy; SLA and notifications per step later)
- [>] P3-03 Form builder: drag, add, remove and reorder fields; field types; required; validation; conditional visibility (30 Sep 2026: fields with type, required and choices in the builder; conditional visibility later)
- [>] P3-04 **Workflow validator** before publish: start/end exist, all nodes connected, no dead ends, no unintended loops, every approval node has an approver source, no self-approval, valid completion rules, logically valid conditions with no conflicts, rejection path exists, resubmission/reopen policy set, valid escalation (base plan §34) (28 Sep 2026: core rules incl. G-08/G-09, cycles, dead ends; rejection-path and escalation checks still to do) (1 Oct 2026: conditions on choices validated too; rejection-path and escalation checks still to do)
- [x] P3-05 **Test mode / simulation:** enter sample values and see the exact levels and approvers, without creating a real request (28 Sep 2026: simulate() core with stages, skips, blocks and branches; UI with P3) (done 30 Sep 2026; test mode with real names)
- [>] P3-06 Draft / publish / archive for templates, with version history and a diff (30 Sep 2026: versions, publish and archive in the service; screens in S3-05) (30 Sep 2026: draft/publish/archive with version history; diff still to do)
- [>] P3-30 **DoA matrix module:** amount bands per type and department, approver roles per band, effective dates, versioned; used by condition nodes (1 Oct 2026: DoA expressed as amount skip conditions; /admin/doa matrix view; owner's values pending Q-004)
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
- [x] P7-01 Management control center: raised, pending, approved, rejected, changes required, on hold, overdue (today / period) (done 1 Oct 2026; /admin/insights (D-069))
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
