# Security and authorization review (v1.6.0)

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
