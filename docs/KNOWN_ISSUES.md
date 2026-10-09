# Known issues (v1.6.0 work)

Severity: **P0** critical, **P1** major workflow or access, **P2** significant, **P3** minor. Kept separate: defects, UI improvements, security, performance, debt, and decisions.

## Verified existing defects
| ID | Sev | Issue | Status |
|---|---|---|---|
| V6-D01 | P3 | Blank screen while most pages load (3 of 48 routes have a loading state) | Open → Phase 2 |
| V6-D02 | P3 | A page error replaces the whole space, including the navigation (single root `error.tsx`) | Open → Phase 2 |
| V6-D03 | P3 | Mark-all-read reloads the page; no undo | Open → Phase 4 |
| V6-D04 | P3 | Hex colours outside the tokens (disabled button, auth screens) | Open → Phase 1 |

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
