# Known issues

Applies to v1.46.0 (2 Nov 2026). Earlier versions of this page: v1.39.0 (31 Oct 2026), then the v1.6.0 baseline. Rows are never removed, only marked fixed with the version.

Severity: **P0** critical, **P1** major workflow or access, **P2** significant, **P3** minor. Kept separate: defects, UI improvements, security, performance, debt, and decisions.

**Where open defects live now:**
- the independent audit of v1.39.0 (31 Oct 2026): `audit/MASTER_DEFECT_REGISTER.md`. All 45 defects were addressed in v1.40.0 (its "Remediation" section); OPS-07 (restore drill) is still the owner's action, see below;
- the first audit (16 Oct 2026, AUD-01 … AUD-29): `application-audit/06_SECURITY_AND_RELIABILITY_AUDIT.md`, tracked in `application-audit/11_IMPLEMENTATION_TRACKER.md` and PLAN-CHECKLIST (V181-A1 … A10);
- the QA pass of v1.42.1 → v1.44.0 (1–2 Nov 2026): `qa/BUG_REGISTER.md` (40 entries, 38 fixed, 2 open, both listed below).

This page keeps the earlier list current and lists what is still open. It does not copy those registers.

**Test results are not kept here.** The unit, integration, QA and e2e results of each release are reported with the release (the work log in DEVELOPMENT-MEMORY and the release's QA report), because they change with every run.

## Verified existing defects (v1.6.0 baseline)
| ID | Sev | Issue | Status |
|---|---|---|---|
| V6-D01 | P3 | Blank screen while most pages load (3 of 48 routes had a loading state) | **Fixed** (v1.6.0 Phases 1–3, then v1.35.0): 20 `loading.tsx` skeletons on read-only pages, and since v1.35.0 a thin progress bar at the top on every page change (`features/shell/NavigationProgress.tsx`). v1.44.1 added a skeleton for each phone screen |
| V6-D02 | P3 | A page error replaces the whole space, including the navigation (single root `error.tsx`) | **Fixed** (v1.6.0): each space has its own `error.tsx` (`app/users/error.tsx`, `app/admin/error.tsx`, `app/superadmin/error.tsx`), so the navigation stays; the root `app/global-error.tsx` is only the last resort |
| V6-D03 | P3 | Mark-all-read reloads the page; no undo | **Fixed** (v1.6.0 Phase 4): read state changes at once, rolls back if the server refuses, and "Mark all as read" can be undone (`features/shell/NotificationList.tsx`) |
| V6-D04 | P3 | Hex colours outside the tokens (disabled button, auth screens) | **Mostly fixed** (v1.6.0 tokens). Left on purpose: `app/global-error.tsx` (it renders without the app's stylesheet), the browser `theme-color` in `app/layout.tsx`, one gradient stop on the sign-in screen, and the fixed colour palette for projects (`features/work/client.tsx`) |
| V6-D05 | P3 | Search also listed requests where the person had been a delegate for a task that was already decided; opening one gave 404 (search and the request page used different rules) | **Fixed** (v1.6.0 Phase 4): one shared rule, `lib/db/repositories/visibility.ts`; integration test |
| V6-D06 | P2 | Found while building: on Next 15.5 a route-level `loading.tsx` (a) turns a later `notFound()` into HTTP 200, and (b) now and then stops the page refreshing after a Server Action (4/4 failures with it, 4/4 passes without, same test) | **Fixed by design** (v1.6.0): skeletons only on read-only pages that never call `notFound()`, listed in `tests/ui/loading-guard.test.ts`; forms also ask for a refresh after success (`useActionForm`) |
| V6-D07 | P3 | The middleware replaced the sandbox CSP that attachment downloads set for themselves (since v1.0) | **Fixed** (v1.6.0 Phase 5): file routes keep their own policy; E2E checks the header |

## Security and compliance
| ID | Sev | Issue | Status |
|---|---|---|---|
| — | — | No open finding at the v1.6.0 baseline (the audit register was closed, D-102) | — |
| — | — | Findings of the v1.39.0 audit (e.g. SEC-01, SEC-02) | **Fixed** (v1.40.0): see the "Remediation" section of `audit/MASTER_DEFECT_REGISTER.md` (SEC-02 page guards, SEC-01 sign-in timing, FI-D06 break-glass audit) |
| QA-SEC-01 … 05 | P1–P3 | Confidential files, Try as and Google Calendar, daily session for admins, FYI read-only, work-step tasks in projects (`qa/SECURITY_AUDIT.md`) | **Fixed** (v1.43.0) |
| AUD-14 (V181-A7) | P2 | Page access was keyed on the address an action was posted to; an address that is no configured page could carry a shared action past a Hidden or View-only rule | **Fixed** (v1.46.0, D-278): for a person with any page restriction (or a module they lack), an address that is no configured page is refused (`UNKNOWN_PAGE`) unless it is a listed open address (`OPEN_PATHS` / `isOpenAddress` in `server/authorization/pages.ts`; `checkPageAccess` in `server/authorization/page-access.ts`). Test `tests/security/page-access-v181.test.ts` |
| AUD-25 (V181-A8) | P2 | "Load demo data" had no confirmation and no production guard; other high-impact admin actions had no confirmation | **Fixed** (v1.46.0, D-278): demo load needs the typed word `LOAD DEMO` and is refused when there are more than 25 active real users (`DEMO_REAL_USER_LIMIT`, `server/demo/service.ts`); confirmations on remove provider key, hide a page for everyone, deactivate a group, department or designation, close an approval type, and save working days |
| Q-015 | P2 (ops) | The break-glass account needed the WhatsApp code, so it couldn't sign in when WhatsApp was the thing that was down | **Fixed** (v1.46.0, owner decision D-277): password alone while the break-glass window is open, audited `BREAK_GLASS_SIGNIN_NO_OTP`, Super Admins alerted |
| AUD-15 (V181-A10, Q-021) | P2 | Without `ORIGIN_SECRET`, requests can reach the GoDaddy origin around Cloudflare and set their own client IP, weakening the per-IP sign-in limits | **Open.** v1.46.0 shows an **Origin lock** on/off tile on the Super Admin home (`server/ops/origin-lock.ts`). The lock stays optional; the owner confirms it is set, then it may become mandatory |
| AUD-16 (DR-03) | P2 | An IT Admin can change a user's email or WhatsApp number (including an approver's) without a second approval or a notice | **Accepted by the owner** (D-277, 2 Nov 2026). No control built; recorded as a residual risk in the security review |
| AUD-04 (V181-A4, Q-020, QA-DB-02) | P1 if it applies | If the live MySQL session clock isn't UTC, column-default times and app-written times mix | **Open, waiting on the live check.** Open `/api/health/deep` on live: `dbClockOffsetMinutes` must be `0`. If not, V181-A4 pins the session time zone and converts once |
| OPS-07 | P1 | No restore of a real production backup has been recorded (GL-04) | **Open (owner).** Drill checklist in `docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md` §5 |

## Performance and reliability
| ID | Sev | Issue | Status |
|---|---|---|---|
| OPS-01 | P1 (ops) | Live `/api/health` showed jobRunner NEVER: the cron call wasn't reaching the app with the right secret | **Resolved on live:** `GET /api/health` on 16 Oct 2026 returned `jobRunner: OK` (application-audit 01). Keep checking `jobRunner` `OK` after each publish |
| — | — | Findings of the v1.39.0 audit on backups, monitoring and CI (OPS-03 … OPS-11) | **Fixed or built** (v1.40.0): see the register. OPS-10 (recovery targets) **approved by the owner on 2 Nov 2026**: RPO 24 h, RTO 4 h (`docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md`) |
| OPS-08 / DR-08 | P2 | Off-site backup was a manual weekly download | **Built** (v1.40.0 S3-compatible copy; v1.46.0 Google Drive copy, job step `driveBackup`). Works only once the owner sets `BACKUP_ENCRYPTION_KEY` and the Drive settings (DEPLOYMENT Part W) |
| AUD-20 / DR-06 | P2 | Security records (sign-in attempts, codes, sessions) were kept for ever | **Fixed** (v1.46.0): job step `securityRetention` deletes them after 90 days (`server/ops/security-retention.ts`). Business records (requests) are never purged; their retention is still a dry run |
| QA-DB-01 | P1 | Connection pool sized for one PC | **Fixed** (v1.43.0); the owner sets `DB_POOL_SIZE` on live (DEPLOYMENT B2) |
| QA-DB-08 | P3 | Two hot reads without a matching index | **Fixed, owner to run** `database/optional/v1421_qa_indexes.sql` once approved |
| QA-DB-09 | P3 | Analytics day filters wrap columns in `INDIA_DATE()`, so date indexes can't be used at very large volume | **Open (deferred).** Fine at today's volume |

## Configuration the owner must do
| ID | Item | Status |
|---|---|---|
| Q-024 | Google Calendar OAuth consent screen must be **External** and **published** (Testing mode cuts access after 7 days) | **Open (owner action in Google Cloud)**; decided D-277. DEPLOYMENT Part Q |
| Q-013 | WhatsApp templates not yet live go by email and in-app only | **Open (owner).** v1.46.0 shows the templates still off on the Super Admin home (`server/notifications/template-reminder.ts`) |

## Technical debt and later work
| ID | Item |
|---|---|
| TD-01 | 7 dev-only `braces` advisories (Tailwind 3 / ESLint); no fix exists (D-105). Still on Tailwind 3.4.17 at v1.46.0 |
| TD-02 | The PDF summary uses Latin-1 Helvetica (D-111); still true at v1.46.0 (`server/pdf/request-summary.ts`) |
| TD-03 | API routes are not bound to a page by default: each route is covered by a page's `apis` patterns or the guard's `page` option. A new API route without either is covered only by its area guard (v1.46.0; see the security review) |
| TD-04 | `condition_rules_backup` (v1.46.0 migration) can be dropped once the release has settled |

## Waiting on a business decision (see IMPLEMENTATION_PLAN §7)
BD-1 … BD-10. Defaults are built; BD-6 and BD-7 are deferred.

The audit decisions DR-01, DR-02, DR-03, DR-05, DR-06, DR-08 and DR-09 (and Q-015, Q-021, Q-022, Q-024) were answered by the owner on 2 Nov 2026 (D-277). Still waiting: Q-020 (after the live clock check) and making the origin lock mandatory (after Q-021 is confirmed).
