# Security and authorization review

Current: **v1.46.0 (2 Nov 2026)**, Part A below. The original v1.6.0 review is kept unchanged as history in Part B.

---

# Part A: review at v1.46.0 (2 Nov 2026)

- **Scope:** the authorization and security changes from v1.7.0 to v1.46.0, with the most weight on v1.40.0 (audit remediation), v1.43.0 (QA pass) and v1.46.0 (this release). Audit item AUD-29 / V181-A9.
- **Method:** code reading against the files named, plus the tests named. Sources: `audit/MASTER_DEFECT_REGISTER.md` (Remediation), `qa/SECURITY_AUDIT.md`, `application-audit/06_SECURITY_AND_RELIABILITY_AUDIT.md`, DEVELOPMENT-MEMORY D-277 to D-280.
- **Not covered:** no external penetration test, no review of GoDaddy or Cloudflare settings, no test on the live site. Production secrets and key rotation are the owner's.

## A1. Changes since v1.6.0 that an auditor can check

| # | Control | What it does now | Where | Test |
|---|---|---|---|---|
| 1 | **Page access** (v1.8.0) | Super Admin sets Hidden / View / Full per page for everyone, a department or a person. Enforced on the server for pages, Server Actions and API routes (404 when hidden; no changes when view-only). The address is signed by the middleware. | `server/authorization/pages.ts`, `server/authorization/page-access.ts`, `lib/security/path-signature.ts` | `tests/security/page-guards.test.ts` |
| 2 | **Unknown addresses fail closed** (v1.46.0, V181-A7 / AUD-14) | For a person with any restriction (a page not Full, or a module they lack), an address that is no configured page is refused with `UNKNOWN_PAGE`, for views and changes, unless it is in `OPEN_PATHS` (`isOpenAddress`). People with no restriction are unaffected. Super Admin addresses refuse everyone else (G-3, v1.10.0). | `checkPageAccess` in `server/authorization/page-access.ts`; `OPEN_PATHS`, `isOpenAddress` in `server/authorization/pages.ts` | `tests/security/page-access-v181.test.ts` (also walks every `/users` and `/admin` page: each must be configured or listed open) |
| 3 | **Open addresses** (v1.46.0) | `/users/security` (Sign-in & devices: never Hidden or View-only, SEC-17 since v1.10.0), `/users/approvals` and `/users/more` (phone hubs; their links are already filtered), `/users/people/*` (contact card), `/admin/notifications/*` (not yet a configurable page). API routes pass `isOpenAddress`: each is covered by its page's `apis` patterns or the guard's `page` option. | `server/authorization/pages.ts` | same file |
| 4 | **Actions name their page** (v1.10.0, G-2/G-3) | Import actions check `admin.import` wherever they are posted (`getAdminActor("admin.import")`). Out of office for someone else needs the Admin area and Full on `admin.users` (`requireApiArea("admin", { change: true, page: "admin.users" })`). These pre-date v1.46.0; v1.46.0 adds tests for both. | `app/admin/import/actions.ts`; `createDelegationAction` in `app/users/collab-actions.ts` | `tests/security/page-access-v181.test.ts` |
| 5 | **Own guard on every admin page** (v1.40.0, SEC-02) | 15 admin and Super Admin pages that relied on the layout now call `requireArea` themselves. An invalid session cookie on `/admin` or `/superadmin` is redirected before rendering (OPS-20). | `app/admin/**`, `app/superadmin/**`, `middleware.ts` | `tests/security/page-guards.test.ts`, `tests/security/session-cookie-edge.test.ts` |
| 6 | **Sign-in does not reveal User IDs** (v1.40.0, SEC-01) | An account with no stored password still costs a full hash check. | `server/auth/password-sign-in.ts` | `tests/security/security.test.ts` |
| 7 | **Break-glass** (v1.40.0 FI-D06; v1.46.0 Q-015) | Disabled by default; a console script opens a time window and alerts every Super Admin. Its actions are audited and alerted. **v1.46.0:** while the window is open it signs in with the password alone (no WhatsApp code), because WhatsApp may be what is down. Every such sign-in writes audit `BREAK_GLASS_SIGNIN_NO_OTP` and alerts the Super Admins (`BREAK_GLASS_USED`, saying no code was asked for). Outside the window the break-glass account can't sign in at all; every other password account still needs the code. | `skipsWhatsAppCode` in `server/auth/sign-in-rules.ts`; `server/auth/password-sign-in.ts`; `server/auth/complete-sign-in.ts`; `server/auth/break-glass-alert.ts` | `tests/auth/password-sign-in.test.ts`, `tests/security/break-glass-alert.test.ts` |
| 8 | **Daily session** (v1.41.0, QA-SEC-03 in v1.43.0) | Phones and the installed app may stay signed in until midnight IST. Never for IT Admin, Super Admin or break-glass, whatever the browser claims. | `server/auth` (session policy) | `tests/auth/daily-privileged.test.ts` |
| 9 | **Try as is view-only** (v1.43.0, QA-SEC-02) | `/api/integrations/*` GETs count as writes, so a Try-as session can't connect someone's Google Calendar; no read receipts in Try as. | `middleware.ts` (WRITING_GETS) | e2e Try-as specs |
| 10 | **Confidential values** (v1.43.0 QA-SEC-01; v1.46.0 PB-34) | One rule, `canSeeConfidential`, for the request page, file downloads (denials audited) and the timeline. **v1.46.0:** Admin → Records has an Amount column; a confidential amount shows "Hidden" unless the viewer's roles may see confidential values (`rolesSeeConfidential`: IT Admin, Super Admin), on screen and in the CSV. Everyone who can open Admin → Records today is IT or Super Admin, so "Hidden" is the safe default for any other caller. | `server/approvals/confidential.ts`; `server/records/amount.ts`; `server/records/columns.ts`; `app/api/admin/records/[kind]/route.ts` | `tests/records/amount.test.ts` |
| 11 | **FYI recipients read only** (v1.43.0, QA-SEC-04) | Told-by-FYI people can open the request but not comment, upload or link. | `canViewRequest`, `wasToldByFyi` | e2e work/FYI flow |
| 12 | **Approval integrity** (v1.40.0 D-245; v1.46.0 D-279) | Nobody skips a step of their own request. **v1.46.0 (DR-02):** a request never ends Approved with no human approval unless its predefined type is ticked "May finish without an approver"; otherwise one approval step goes to the requester's HOD (event `HUMAN_APPROVAL_ROUTED`), or blocks for IT when there is no HOD. Custom requests never may. **DR-09:** a resubmit whose values change the route restarts from the earliest affected step (event `ROUTE_CHANGED`). | `server/engine/engine.ts`, `server/engine/reroute.ts`, `server/workflows/type-settings.ts` | `tests/engine/no-decision-guards.test.ts`, `tests/engine/owner-decisions-nov2.test.ts`, `tests/integration/owner-decisions-nov2.int.test.ts` |
| 13 | **Expired approvals** (v1.46.0, DR-05) | Shown as Expired everywhere (derived from `valid_until`; the stored status stays APPROVED). Amending one or raising a follow-up from it needs a reason (at least 5 characters), kept on its history (`EXPIRED_REUSED`). | `server/approvals/expiry-rules.ts`, `amendments.ts`, `follow-up.ts`, `consult.ts` | `tests/approvals/owner-decisions-nov2-display.test.ts` |
| 14 | **High-impact admin actions ask first** (v1.46.0, V181-A8 / AUD-25) | Load demo data: typed `LOAD DEMO`, checked in the action and again in `loadDemoData`, and refused on the server when more than 25 active real users exist (`DEMO_REAL_USER_LIMIT`, `server/demo/service.ts`). Remove a stored provider key, hide a page for everyone, deactivate a group, department or designation, close an approval type, save working days: a confirmation in the browser before the form is sent. These six are a guard against mistakes, not an access control; the server checks are unchanged. | `server/demo/service.ts`, `app/superadmin/demo/actions.ts`; `features/superadmin/SettingsGroupForm.tsx`, `PageRuleForm.tsx`; `features/admin/GroupForms.tsx`, `OrganisationForms.tsx`, `WorkflowPanels.tsx`, `CalendarForms.tsx` | `tests/demo/demo-guard.test.ts` |
| 15 | **Security records kept 90 days** (v1.46.0, DR-06) | Job step `securityRetention` deletes, once a day in batches of 1,000 (at most 20 batches per table per run), `login_logs`, `otp_challenges`, ended `user_sessions`, `used_security_links` and used or expired `password_tokens` older than 90 days. Never requests, their history, `audit_logs`, `users`, `user_devices` or notifications. A person under an active legal hold keeps theirs. Each run that deletes anything is audited `SECURITY_RECORDS_PURGED` with counts. | `server/ops/security-retention.ts`, `server/ops/automation.ts` | `tests/ops/security-retention.test.ts`, `tests/integration/security-retention.int.test.ts` |
| 16 | **Backups** (v1.40.0 OPS-09; v1.46.0 DR-08) | `.sha256` on every backup; AES-256-GCM with `BACKUP_ENCRYPTION_KEY` (the owner keeps a copy off the server). Optional off-site copies: S3-compatible (v1.40.0) and **Google Drive** (v1.46.0, job step `driveBackup`). Only `.enc` files are ever uploaded. The service-account key and the folder id are stored encrypted. The Test button only reads the folder; audited `GDRIVE_BACKUP_TESTED`; each copy audited `BACKUP_COPIED_TO_DRIVE`. The app lists and deletes only files it tagged itself (`appProperties arsBackup=1`). | `server/ops/backup.ts`, `server/ops/gdrive.ts`, `server/ops/gdrive-backup.ts`, `server/settings/definitions.ts` | `tests/ops/gdrive.test.ts`, `tests/ops/backup-file.test.ts` |
| 17 | **Origin lock status** (v1.46.0, Q-021) | The Super Admin home shows "Origin lock: on/off" from whether `ORIGIN_SECRET` is set; the value is never shown. Enforcement is unchanged (`middleware.ts`). | `server/ops/origin-lock.ts`, `app/superadmin/(home)/page.tsx` | `tests/ops/origin-lock.test.ts` |
| 18 | **Automated sweeps** (v1.43.0 QA) | Every non-public API refused when signed out; every admin and Super Admin API refused for an employee; cross-site writes refused; a 540-call IDOR sweep answered nothing. `npm audit --omit=dev` 0 on 2 Nov 2026. | `qa/SECURITY_AUDIT.md`, `qa/API_TEST_RESULTS.md` | QA-API-01 … 04 |

## A2. Residual risks (accepted or open)

| # | Risk | Severity | Status |
|---|---|---|---|
| R-01 | **IT may change contact details without approval** (AUD-16, DR-03). An IT Admin can change a user's email or WhatsApp number, including an approver's, then sign in as them; changes are audited but nobody is asked or told. | Medium (insider) | **Accepted by the owner, 2 Nov 2026 (D-277).** Rely on the audit log and the IT team's trust |
| R-02 | **The origin lock is optional** (AUD-15, V181-A10). Without `ORIGIN_SECRET`, a request sent straight to the GoDaddy origin could set its own `CF-Connecting-IP` and dodge the per-IP sign-in limit (the per-User-ID limit still holds). | Medium | **Open.** The tile shows the state; the owner confirms it is set (Q-021); then it may become mandatory |
| R-03 | **API routes are not page-bound by default.** `isOpenAddress` lets every `/api/` address through; each route relies on its page's `apis` pattern or the guard's `page` option. A new API route with neither is checked only by its area guard, not by page rules. | Low | Open by design; check at each new route (API_REFERENCE lists each route's guard) |
| R-04 | **Break-glass without a code** while its window is open. Anyone with the sealed password can sign in during the window. | Low | Accepted (Q-015). The window is opened only from the server console; every use is audited and alerted |
| R-05 | **Database clock** (AUD-04, QA-DB-02). If the live session clock is not UTC, times mix. | P1 if it applies | Open until the live `/api/health/deep` shows `dbClockOffsetMinutes` = 0 (V181-A4) |
| R-06 | **Six of the new confirmations are in the browser only.** A crafted request can skip them; it still passes every server-side access check. | Low | Accepted; they prevent mistakes, not abuse |
| R-07 | **Exports need no separate permission** (S-03 below) and **no field-level masking beyond confidential fields** (S-02 below, partly closed by the confidential rule) | Low | Unchanged since v1.6.0 |
| R-08 | **Off-site backups** need `BACKUP_ENCRYPTION_KEY` and the Drive or S3 settings. Until set, backups live only on the GoDaddy account. | Medium (operations) | Owner action (GO_LIVE checklist) |

No critical or high-severity issue is open in the code at v1.46.0.

## A3. Status of the v1.6.0 findings (Part B §3)

| # | Status at v1.46.0 |
|---|---|
| S-01 | Partly addressed: the PDF summary and quick search have per-user limits (since v1.10.0); analytics and readiness are still unlimited reads |
| S-02 | Partly addressed: confidential form fields exist and are hidden from people who may not see them (v1.43.0 QA-SEC-01, v1.46.0 Records amount) |
| S-03 | Unchanged; owner decision still open |
| S-04, S-05 | Unchanged; accepted |
| S-06 | **Fixed** (v1.40.0): `/api/health/deep` answers 503 when the job runner is late, so an uptime monitor alerts |
| S-07 | Unchanged |

## A4. Secrets handling during this work

No `.env*` file was opened or printed; no credentials were entered; no production system was touched. `ORIGIN_SECRET`, `BACKUP_ENCRYPTION_KEY` and the Drive service-account key are the owner's to set.

---

# Part B: review at v1.6.0 (history, unchanged)

Unified prompt §2, Addendum A §20 and Addendum B (BB, BD, BH, BI).

- **Scope:** every surface added or changed in v1.6.0, checked against the platform's existing controls.
- **Method:** code reading plus the automated tests named below.
- **Not covered:** this is not an external penetration test.

## 1. Platform controls (unchanged, relied on)

| Control | Where |
|---|---|
| **Sign-in.** Only admin-created users can sign in, by Google or by user id and password. The password route needs a WhatsApp OTP, and attempts are rate-limited. | `server/auth/*`, `server/auth/rate-limit.ts` |
| **Sessions.** HMAC-signed and server-side; sign-out ends the session on the server. | `server/auth`, QA-AUTH-01 |
| **Areas.** `/users`, `/admin` (IT team) and `/superadmin` are checked in each layout, page, action and route handler. Anyone else gets a plain 404. | `server/authorization/guards.ts` |
| **Record access.** One visibility rule covers the requester, task holder or decider, active delegate and consultee. | `lib/db/repositories/visibility.ts` (`visibleToSql`) |
| **Approval integrity.** One lock per request, a `state_version` check, no self-approval, and DoA authority checked at decision time. | `server/approvals/service.ts` |
| **Append-only history.** Database triggers refuse UPDATE and DELETE on these tables. | `audit_logs`, `approval_events`, `request_comments` |
| **Secrets.** Provider keys are stored AES-256-GCM encrypted and never shown again; server secrets live only in GoDaddy environment variables; `.env*` is git-ignored. | `lib/security/encryption.ts` |
| **Headers.** A per-request CSP nonce. File downloads keep their own sandboxed CSP. | `middleware.ts` (`FILE_ROUTE`) |
| **Spreadsheet safety.** CSV cells that start with `= + - @` and similar are neutralised. | `server/import/csv.ts` (`guardCell`) |
| **Approval by email or WhatsApp reply.** Not implemented, by policy (BG-08). | — |

## 2. v1.6.0 surfaces

| Surface | Who | Server-side checks | Tests |
|---|---|---|---|
| Readiness check, submit, duplicates, budgets | Requester | No writes on check. The submit re-runs every check under a type lock. Duplicate matches the person can't open show no number or link. | `readiness.int.test.ts` |
| Templates, raise again, autofill | Owner | Every query filters on `user_id`; "raise again" works only for the person's own requests; people, calculated and file fields are never copied. | `readiness.int.test.ts` (FN4) |
| Amendments | Original requester | Requester-only, approved-only and type-allows checks. Only amendable fields are taken from the form. Original locked FOR UPDATE; audited. | `amendments.int.test.ts` |
| Analytics | Everyone (own scopes); IT (organisation) | Scopes come from the database (reporting manager, HOD, roles). Asking for a scope the person doesn't have falls back to their own. All SQL is parameterised. | `analytics.int.test.ts`, e2e `v160-zanalytics` |
| Reports and exports | Per report | The scope is re-resolved for every run and download. Query keys are whitelisted. 20 downloads a minute; 5,000 rows. Exports are audited without data. XLSX uses inline strings only. | `reports.int.test.ts`, `export.test.ts`, e2e `v160-zreports` |
| Saved views | Owner | Owner-filtered; a view stores filters only, and the scope is checked again when it's opened. | e2e `v160-zreports` |
| Scheduled reports | Owner | They run with the owner's **current** permissions. Inactive owners and lost access pause the schedule. Each slot is claimed once. Email goes to the owner only. | `reports.int.test.ts` |
| Alert rules | Owner | The owner's current scope is checked on every evaluation; a lost scope switches the rule off. Firing is claimed and has a cool-down. | `reports.int.test.ts` |
| Needs attention, snooze, resend | IT team | `getAdminActor` in every action. Resend releases only unsent rows that aren't being sent. Audited. | `reliability.int.test.ts`, e2e `v160-reliability` |
| Automation (run now, resend) | Super Admin | `requireApiArea("superadmin")` in each action. Job records hold counts and short errors only. | e2e `v160-reliability` |
| Version compare, restore, migration | IT team | Migration needs an admin actor. Each request is re-checked inside its lock. Warnings need an explicit yes. Audited, with a timeline event. | `migration.int.test.ts`, e2e `v160-smart-zversions` |
| Configuration export and import | IT team | Export contains no secrets, only references. Import verifies the checksum, schemas and references, creates a draft only, and never changes live checks. Audited. | `promotion.int.test.ts` |
| Legal holds | Super Admin | Super Admin only, with a reason to place and to release. A hold blocks deletion for everyone, including the Super Admin. Audited. | `governance.int.test.ts` |
| Feature switches | Super Admin sets them | A switch only hides a feature. Every page and action keeps its own access check (BI-06). | `reports.int.test.ts` (switches) |

## 3. Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| S-01 | The readiness check, analytics pages and report previews have no per-user rate limit. Only exports do. These are read-only and scoped, but a heavy user could load the database. | Low | Open (register A21-05, AReliability-03) |
| S-02 | Field-level masking of confidential form fields isn't available. Anyone who may see a request sees every field, in analytics and exports too. | Medium, if confidential fields are added | Open (A3.5-04, ASecurityreq-02) |
| S-03 | Exporting and scheduling don't need a permission separate from viewing. Anyone may export what they may see. | Low | Open by design (A3.5-06); decision for the owner |
| S-04 | The configuration file checksum proves integrity, not authenticity: anyone could re-sign an edited file. The import still creates only a draft, which IT reviews before publishing. | Low | Accepted; documented in D-125 |
| S-05 | Scheduled reports email the file to the owner's address. Report data leaves the app, to the owner only. | Low | Accepted; can be switched off (feature switch) |
| S-06 | No alert fires if the cron job stops entirely. Automation shows LATE, but nobody is told. | Medium (operations) | Open (BD-02); the owner's cron fix is a go-live item |
| S-07 | Pause and resume of schedules and alerts aren't audited (creation is). | Low | Open (AAuditevents-02/05) |

No critical or high-severity issue was found in the v1.6.0 changes.

## 4. Secrets handling during this work

- No `.env*` file was printed, opened for display or committed.
- `D:\PBI New\.env.local` was not opened.
- No credentials were entered anywhere.
- The test suites use throwaway databases and test-only secrets (`playwright.config.ts` `E2E_ENV`).
