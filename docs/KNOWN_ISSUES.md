# Known issues

Applies to v1.39.0 (31 Oct 2026). This list started with the v1.6.0 work; rows are never removed, only marked fixed with the version.

Severity: **P0** critical, **P1** major workflow or access, **P2** significant, **P3** minor. Kept separate: defects, UI improvements, security, performance, debt, and decisions.

**Where open defects live now:** the independent audit of v1.39.0 (31 Oct 2026) lists 45 defects in `audit/MASTER_DEFECT_REGISTER.md`, with the details in the numbered reports beside it. Work on them is tracked in `PLAN-CHECKLIST.md`. This page keeps the earlier list current and points there rather than copying it.

## Verified existing defects (v1.6.0 baseline)
| ID | Sev | Issue | Status |
|---|---|---|---|
| V6-D01 | P3 | Blank screen while most pages load (3 of 48 routes had a loading state) | **Fixed** (v1.6.0 Phases 1–3, then v1.35.0): 20 `loading.tsx` skeletons on read-only pages, and since v1.35.0 a thin progress bar at the top on every page change (`features/shell/NavigationProgress.tsx`) |
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
| — | — | Findings of the v1.39.0 audit (e.g. SEC-01, SEC-02) | See `audit/MASTER_DEFECT_REGISTER.md` |

## Performance and reliability
| ID | Sev | Issue | Status |
|---|---|---|---|
| OPS-01 | P1 (ops) | Live `/api/health` showed jobRunner NEVER: the cron call wasn't reaching the app with the right secret | Owner (GO_LIVE_CHECKLIST §3). Not verifiable from the code; check that `/api/health` on live shows `jobRunner` `OK` and Super Admin → Automation shows recent runs |
| — | — | Findings of the v1.39.0 audit on backups, monitoring and CI (OPS-03 … OPS-11) | See `audit/MASTER_DEFECT_REGISTER.md`; recovery targets in `docs/RECOVERY_OBJECTIVES_AND_INCIDENT_RESPONSE.md` (draft) |

## Technical debt and later work
| ID | Item |
|---|---|
| TD-01 | 7 dev-only `braces` advisories (Tailwind 3 / ESLint); no fix exists (D-105). Still on Tailwind 3.4.17 at v1.39.0 |
| TD-02 | The PDF summary uses Latin-1 Helvetica (D-111); still true at v1.39.0 (`server/pdf/request-summary.ts`) |

## Waiting on a business decision (see IMPLEMENTATION_PLAN §7)
BD-1 … BD-10. Defaults are built; BD-6 and BD-7 are deferred.
