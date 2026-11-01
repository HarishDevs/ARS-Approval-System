# Regression test results (v1.44.0, 2 Nov 2026)

All runs on this PC: production builds (`npm run build`, `next start`) against the
throw-away test database `ars_approvals_test`. Nothing ran against production, and
no real email, WhatsApp or push message was sent.

## Final build (v1.44.0)

| Suite | Command / config | Result |
|---|---|---|
| Type check | `tsc --noEmit` | Clean |
| Lint | `npm run lint` (eslint .) | Clean |
| Unit | `vitest run` | **891 / 891** (110 files) |
| Integration | `npm run test:integration` | **330 / 330** (60 files) |
| End to end, full | Playwright, all of `tests/e2e` (fresh build) | **227 passed, 1 failed, 4 not run** of 232 (below) |
| End to end, after the fix | `approval-flow`, `v144-journey`, `v160-ui` (all 6 incl. the 4 not run) on the fixed build | **13 / 13** |
| End to end, mobile and journey | `v143-mobile`, `v144-journey`, `v141`, `v142` | Pass (in the runs above and the full run) |
| QA suite | `tests/qa-e2e` with `QA_VIEWPORTS=all` (10 widths, every role) | **32 / 32** |
| Mobile layout audit | script, 360 / 390 / 1440 px | 117 checks, all clean |
| Load test | `scripts/qa/load-test.mjs`, 10→300 users | See PERFORMANCE_TEST_RESULTS.md |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |

The full run's one failure was accessibility (QA-A11Y-03: the "100% Completed"
pill's contrast); the 4 not run were the rest of that serial file (one of them,
RA-01, needed rewriting for the phone tabs: QA-TST-03). After the one-class fix the
whole file and the specs it depends on passed (13/13). **The full suite was not run
end to end a third time after that fix**; the change was a colour class and a test.

## Earlier builds in this pass (for the record)

| Build | Suite | Result |
|---|---|---|
| v1.42.1 code (before the QA fixes) | e2e | 224 / 224 (twice) |
| v1.42.1 + QA fixes, before the phone layout | e2e | 223 passed, 2 failed: QA-TST-01 (test bug) and the site audit stopped because its server was stopped by hand |
| v1.43.0 (phone layout) | e2e, full | **229 / 229** |
| v1.43.0 | QA suite (10 widths) | 31 passed, 1 failed (QA-TST-02: test's public list), then 4/4 |
| v1.43.0 | integration | 329 / 329 |

## Fixed during the regression runs

QA-TST-01, QA-TST-02, QA-TST-03 (tests), QA-A11Y-03, QA-JRN-01, QA-JRN-02,
QA-MOB-01 to 04: see BUG_REGISTER.md.
