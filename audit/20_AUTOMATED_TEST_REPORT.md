# 20 — Automated testing and coverage

All suites were run on 31 Oct 2026 on the owner's machine against v1.39.0 (commit `0473f25`).

The e2e and QA suites ran against the audit server: the v1.39.0 build on :3100 with the test-only environment from `playwright.config.ts`. They used scratch Playwright configs that reuse that server instead of rebuilding, because the build takes about 7.5 minutes here, beyond the project's 5-minute server limit. The specs, global setup (a fresh database and seeded users) and assertions are the project's own, unchanged. The CI run for the same commit is in `16_DEVOPS_DEPLOYMENT_AUDIT.md`.

| ID | Suite | Command | Result | Status | Evidence |
|---|---|---|---|---|---|
| AT-01 | Lint | `npm run lint` | 0 errors, 0 warnings | PASS | `TEST_EVIDENCE/AUTO/lint.txt` |
| AT-02 | Type check | `npx tsc --noEmit -p .` | 0 errors | PASS | `AUTO/typecheck-raw.txt` |
| AT-03 | Unit (Vitest) | `npx vitest run` | **767 / 767** passed (88 files) | PASS | `AUTO/unit.txt` |
| AT-04 | Integration (Vitest + MySQL 8) | `npx vitest run -c vitest.integration.config.ts` | **312 / 312** passed (56 files) | PASS | `AUTO/integration.txt` |
| AT-05 | E2E (Playwright, Chromium) | full `tests/e2e`, 57 files | **201 / 201** passed (17.9 min) | PASS | `AUTO/e2e-full.txt` |
| AT-06 | QA E2E (`playwright.qa.config.ts`): session, authorization, business rules, security, integrations, files, performance, accessibility, layout | `tests/qa-e2e` | **27 / 27** passed | PASS | `AUTO/qa-e2e.txt` |
| AT-07 | Origin lock (`playwright.origin.config.ts`) | `tests/origin` | **1 / 1** passed | PASS | `AUTO/origin.txt` |
| AT-08 | Load (`tests/perf/load.spec.ts`), 50 users × 8 rounds | perf | passed; p95 1,708 ms; 0 errors | PASS | `AUTO/perf-load.json` |
| AT-09 | Dependency audit, production | `npm audit --omit=dev` | 0 vulnerabilities | PASS | `AUTO/npm-audit-prod.txt` |
| AT-10 | Dependency audit, all | `npm audit` | 14 moderate, all `minimatch` < 11.0.1 in dev tooling (eslint) | PARTIAL | `AUTO/npm-audit-all.txt` |
| AT-11 | Production build | `next build` | Compiled; 129 routes | PASS | Build output (session log) |
| AT-12 | Unit coverage | `npx vitest run --coverage` (by the OPS auditor) | 64% of statements, but only over the 192 files the unit tests load; `app/` is not measured | PARTIAL | `15_CODE_QUALITY_AUDIT.md` |

## Coverage by area (from the inventory and the suites)

| Area | Covered by | Gaps |
|---|---|---|
| Approval engine and workflows | Unit (engine, builder, DoA, policy) + integration (approvals, versions, working draft) + e2e (approval-flow, v137, v140, v160-smart-*, v1391) | Admin Skip on one's own request (DB-004); zero-decision approval (DB-005). Both are untested behaviours. |
| Roles and permissions | e2e site audit (every page, every role), qa-e2e authorization, integration | **No test checks that every `/superadmin` and `/admin` page has its own guard**, which is how SEC-02 got through |
| Auth and sessions | qa-e2e session, integration auth | OTP delivery and Google sign-in (external) |
| Tasks, Information, Inbox, Calendar | e2e v130–v139, v190, v1100; integration | Team tasks list, working calendar actions (FI) |
| Integrations | Integration tests with mocked providers | No live provider tests (BLOCKED) |
| Accessibility | axe light/dark (v160-ui RA-03), qa-e2e accessibility | No screen-reader test |

## Important untested paths

1. A guard test for every admin and superadmin page (SEC-02).
2. Admin self-skip (DB-004) and zero-decision approval (DB-005).
3. A restore of a real backup (OPS-07).
4. Firefox and Safari.
