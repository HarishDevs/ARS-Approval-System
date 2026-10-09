# Test strategy

The existing stack is kept: Vitest (unit), Vitest against real MySQL 8 (integration), and Playwright against a production build (E2E, QA suite, origin lock). Everything runs in CI except the load test.

| Layer | Where | What it proves | Command |
|---|---|---|---|
| Unit | `tests/**/*.test.ts` | Pure rules: engine, builder, forms (conditions, calculations, line items), money, budget maths, dates and SLA, permissions, notification choices, UI helpers | `npm test` |
| Integration | `tests/integration/*.int.test.ts` | Real SQL: access rules, transitions (recall, info hold, consult, delegate), budgets, revisions, links, watchers, templates, reports, bulk reassignment, version restore; concurrency through `state_version` | `npm run test:integration` |
| E2E | `tests/e2e/*.spec.ts` | Journeys in a real browser, desktop and phone; dark mode; toasts and errors; keyboard; **axe scans** of the key pages | `npm run test:e2e` |
| QA suite | `tests/qa-e2e` | The 27 regression cases from QA sessions 13–15 | `npx playwright test -c playwright.qa.config.ts` |
| Origin | `tests/origin` | Cloudflare origin lock | `npx playwright test -c playwright.origin.config.ts` |
| Security | inside unit, integration and E2E | Direct calls without rights → 404; cross-user access; file access; search scope; delegation abuse; duplicate submits | as above |
| Performance | `tests/perf/load.spec.ts` (local) | 50 people at once; p95 compared with the v1.4.0 baseline of 586 ms | `npx playwright test tests/perf` |

## Rules
- Run the related tests after each part, and everything at the end.
- **Integration:** 3 runs in a row to catch flakiness.
- Failing tests are never deleted or weakened to pass. Fix the cause, add a regression test, and record it in `KNOWN_ISSUES.md` if it is left open.
- **Accessibility:** automated axe checks plus manual keyboard checks. Screen-reader checks are listed as not done unless they were done; axe doesn't prove WCAG conformance.
- **Results:** recorded in `IMPLEMENTATION_REPORT.md` with real counts (passed, failed, skipped, blocked).
