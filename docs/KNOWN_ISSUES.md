# Known issues (v1.6.0 work)

Severity: **P0** critical, **P1** major workflow or access, **P2** significant, **P3** minor. Kept separate: defects, UI improvements, security, performance, debt, and decisions.

## Verified existing defects
| ID | Sev | Issue | Status |
|---|---|---|---|
| V6-D01 | P3 | Blank screen while most pages load (3 of 48 routes have a loading state) | Open → Phase 2 |
| V6-D02 | P3 | A page error replaces the whole space, including the navigation (single root `error.tsx`) | Open → Phase 2 |
| V6-D03 | P3 | Mark-all-read reloads the page; no undo | Open → Phase 4 |
| V6-D04 | P3 | Hex colours outside the tokens (disabled button, auth screens) | Open → Phase 1 |
| V6-D05 | P3 | Search also listed requests where the person had been a delegate for a task that was already decided; opening one gave 404 (search and the request page used different rules) | **Fixed** (Phase 4): one shared rule, `lib/db/repositories/visibility.ts`; integration test |
| V6-D06 | P2 | Found while building: on Next 15.5 a route-level `loading.tsx` (a) turns a later `notFound()` into HTTP 200, and (b) now and then stops the page refreshing after a Server Action (4/4 failures with it, 4/4 passes without, same test) | **Fixed by design**: skeletons only on read-only pages that never call `notFound()`, listed in `tests/ui/loading-guard.test.ts`; forms also ask for a refresh after success (`useActionForm`) |
| V6-D07 | P3 | The middleware replaced the sandbox CSP that attachment downloads set for themselves (since v1.0) | **Fixed** (Phase 5): file routes keep their own policy; E2E checks the header |

## Security and compliance
| ID | Sev | Issue | Status |
|---|---|---|---|
| — | — | No open finding at baseline (the audit register is closed, D-102) | — |

## Performance and reliability
| ID | Sev | Issue | Status |
|---|---|---|---|
| OPS-01 | P1 (ops) | Live `/api/health` shows jobRunner NEVER: the cron call isn't reaching the app with the right secret | Owner (GO_LIVE_CHECKLIST §3) |

## Technical debt and later work
| ID | Item |
|---|---|
| TD-01 | 7 dev-only `braces` advisories (Tailwind 3 / ESLint); no fix exists (D-105) |
| TD-02 | The PDF summary uses Latin-1 Helvetica (D-111) |

## Waiting on a business decision (see IMPLEMENTATION_PLAN §7)
BD-1 … BD-10. Defaults are built; BD-6 and BD-7 are deferred.
