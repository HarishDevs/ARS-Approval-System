# 10 — Testing and verification plan

ARS Approval Platform v1.8.0, audited 16 Oct 2026.

## 1. Verification performed in this audit

| Check | Command / method | Result (16 Oct 2026, local) |
|---|---|---|
| Lint | `npm run lint` | Pass: 0 errors, 1 warning (unused `Link` import in `app/admin/reports/[key]/page.tsx:1`) |
| Typecheck | `npx tsc --noEmit` | Pass |
| Unit | `npx vitest run` | **433 / 433 passed** (59 files) |
| Integration | `npx vitest run --config vitest.integration.config.ts` (Docker MySQL 8.0, fresh DB from migrations and seeds) | **188 / 188 passed** (39 files), including the backup/restore drill |
| E2E | `npx playwright test` (production build on :3100) | **92 / 92 passed** |
| QA E2E | `npx playwright test -c playwright.qa.config.ts` | **27 / 27 passed**: security, files, perf budget (local), a11y, phone width |
| Origin lock | `npx playwright test -c playwright.origin.config.ts` | **1 / 1 passed** |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities (193 production dependencies) |
| CI | `gh run list` | Last 4 runs green (v1.7.0 B/C → v1.8.0); the v1.7.0 list-A run failed and was fixed by the next push |
| Live (read-only) | `GET https://approval.arssteels.net/api/health` | `{"status":"ok","version":"1.8.0","database":"ok","jobRunner":"OK"}` |
| Audit probes | 5 throwaway Vitest tests in a scratch folder, run against the repo's code and kept out of the repo | **All 5 confirmed the findings**: D-01 resubmit keeps a skipped DoA level (AUD-02); D-04 delegate double vote (AUD-05); D-03 branch rejection under an ANY_ONE join (AUD-06); SEC-01 import vs the contact rule, two cases (AUD-01) |

**Not run:**
- the loader QA suite (`playwright.loaders.config.ts`) and the perf suites (`vitest.perf.config.ts`, `playwright.perf.config.ts`), which are outside CI by decision D-089;
- any test against production;
- any live provider call (CEOITBox, Resend, Firebase).

## 2. Current coverage observations

**Test inventory** (from `01` §3): 133 test files with about 790 cases:

| Suite | Cases (approx.) |
|---|---|
| Unit | 433 |
| Integration | 188 |
| E2E | 92 |
| QA | 27 |
| Origin | 1 |
| Loaders | 45 |
| Perf | 3 |

**Strong:** the engine, approvals and requests, workflows and forms, and auth rules.

**Weak or missing:**

| Area | Gap |
|---|---|
| Super Admin space | No direct tests; E2E only |
| CSV import | 2 test files for 919 lines. **The contact-change rule is untested on the import path (AUD-01).** |
| Page-access enforcement through Server Actions and posting paths | 3 test files; the bypass scenarios in AUD-14 are untested |
| Export routes | No test touches `GET /api/exports/[id]`, `GET /api/superadmin/audit` (CSV) or the guards of `GET /api/admin/dashboards/[slug]` |
| Admin actions | `saveGroupAction`, `groupMemberAction`, `deleteWorkflowAction`, `promoteCustomAction`, `saveDesignation`, `forceSignOut` |
| Engine cases | Branch rejection under ANY joins; delegate double vote; resubmit across a DoA band; custom all-skip |
| E2E flows | Recall, reopen, consultation, delegation end to end, escalation link opening |
| Integrations | No contract tests for CEOITBox and Resend; fakes only |
| `features/` UI | 106 files covered almost only through E2E |
| Coverage tooling | v8 coverage is configured but never run in CI, and no thresholds are set |

**Test file naming:** files are named by release or session (`session4`, `v160-*`, `v180*`), not by module, so coverage per module is hard to read. Add a module index (below) rather than renaming files.

## 3. Regression tests to add with each fix

Each Phase A/B item ships with the tests below. Write the test first, watch it fail on today's code, then fix. The audit probes already show the failing scenarios.

| Finding | Test level | Test case |
|---|---|---|
| AUD-02 (D-01) | Engine unit + integration | ₹5,000 sent back by ED, resubmitted at ₹50,00,000 → CFO step activates. Unchanged amount → earlier approvals kept. A condition branch flips on resubmit → new branch taken. |
| AUD-11 (D-07) | Integration | A resubmit that exceeds a BLOCK budget is refused; a duplicate unique identifier on resubmit is refused; `request_submission_checks` is updated in the same transaction |
| AUD-01 (SEC-01) | Unit (`import-plan.test.ts`) + integration | IT Admin importing another IT Admin's new email, WhatsApp or sign-in method → row error. Super Admin → allowed. Own row → allowed. |
| AUD-03 (M-1) | Integration | Remove IT_ADMIN from `itadmin`, re-run the seeds → still removed. Empty DB → bootstrap admin created. |
| AUD-04 (T-1) | Integration | Session `time_zone='+05:30'` set on the test pool → overdue counts, India-date filters and the audit export range unchanged after the fix |
| AUD-05 (D-04) | Engine unit + integration | A delegate who is also a named approver can't decide both tasks; the queue hides the second task |
| AUD-06 (D-03) | Engine unit | With the new join option, Legal rejects and Finance approves → APPROVED. Default option → today's behaviour. |
| AUD-07 (D-02) | Integration + E2E | A custom route whose steps all skip is refused; a predefined type flagged "may auto-approve" still can |
| AUD-08 (DEF-02) | Unit (notify deps) | `createNotification` throws → outbox row remains unsent and is retried |
| AUD-09 (D-06) | Integration + E2E | An FYI recipient and an escalation manager open the request (read-only); a stranger gets 404 |
| AUD-10 (D-05) | Integration | Request auto-approved at submit keeps its files; a disk write failure rolls back the submit |
| AUD-12 (D-08 etc.) | Integration | Each of submit, withdraw, reopen, hold, resume, resubmit, type export and dashboard CSV writes one audit row |
| AUD-13 (D-09) | Integration + E2E | Expired approval shows Expired in lists and reports; amend follows DR-05 |
| AUD-14 (G-3, SEC-02) | E2E | `admin.import` Hidden → posting the import action to `/superadmin/import` is refused. `users.request` View → `decideAction` posted to `/users/queue` is refused. |
| AUD-15 (SEC-06) | Unit + origin E2E | Production config without `ORIGIN_SECRET` fails at start; `CF-Connecting-IP` is trusted only with the origin header |
| AUD-17 (DEF-01) | Integration | Template sync returning a failure → step FAILED and an alert recorded |
| AUD-18 (RISK-01) | Integration | Two concurrent `runAutomations` → one run, one SKIPPED |
| AUD-19 (DEF-03/04) | Integration (seeded volume) | Above the cap → truncation flagged, or the SQL aggregate equals the full calculation |
| AUD-20 (R-1) | Integration | Purge removes only eligible rows; legal-held rows untouched; the dry-run count equals the purge count |
| AUD-21 (I-1) | Integration + `EXPLAIN` | Day-boundary cases (23:59 / 00:00 IST) return the same rows as before |
| AUD-22 (M-2/M-3) | Script integration | Edited half-applied file refused; two concurrent migrate runs serialised |
| AUD-24 (T-2) | Integration | A seeded mismatch is detected by the check |
| AUD-25 | E2E | Demo load asks for confirmation and is refused on a populated DB |
| AUD-26 | E2E + axe | 375 px admin page: no user links in the bottom bar; axe passes with the drawer or menu open |
| AUD-28 | Integration + E2E | The delivery log filter finds a known failed delivery; counts equal `COUNT(*)` |

## 4. Integration testing approach

- **Keep:** real MySQL 8 in Docker (`npm run db:up`, port 3307). Each run builds a fresh database from the real migrations and seeds. Files run serially.
- **Add a migration-from-snapshot test** before releases that carry migrations: restore a sanitised copy of the production schema (structure only, no personal data) and apply the new migrations. This catches failures on the production data shape that a fresh-from-empty run can't see.
- **Provider contracts:** keep the fakes, plus one opt-in, manually triggered test per provider. It runs only with a sandbox key held outside the repo and is never part of CI.

## 5. Regression strategy

1. **Every push** (project rule, already in force): lint, typecheck, unit, integration, E2E, QA and origin configs, run locally and then in CI.
2. **Coverage (REC-36):**
   - add `vitest run --coverage` to the CI `checks` job and publish the text summary;
   - set ratcheting thresholds per folder: `server/engine` and `server/approvals` ≥ current level; `server/import`, `server/authorization` and `app/superadmin` start at their current level and only go up.
3. **Nightly or weekly (manual or scheduled):** the loader QA suite and the perf suites. Record p95 in `docs/PERFORMANCE_ANALYTICS.md` and compare with the 10 Oct 2026 baseline (whole dashboard p95 151.9 ms at 6,300 requests).
4. **Module index:** add `tests/README.md` mapping modules to test files, so gaps are visible despite the per-release file names.

## 6. Release verification checklist (for the owner and IT)

1. CI is green on the tagged commit.
2. Take a backup and confirm it exists (Super Admin → home, "Back up now"; or the scheduled one).
3. Read the release notes for any behaviour change (Phase A: resubmit routing).
4. Publish on GoDaddy.
5. Check `GET /api/health`: the new version, `database ok`, `jobRunner OK` within 10 minutes.
6. Run the live smoke test (`docs/GO_LIVE_READINESS_CHECKLIST.md` §4). Then, as a test user:
   - raise a test request on a test type;
   - approve it;
   - send it back for changes and resubmit with a higher amount, checking that the expected levels run again (after A1);
   - open the FYI link (after B2);
   - download an attachment;
   - check Message deliveries for the messages it produced.
7. **If anything fails:** use the rollback levers in `docs/BACKUP_RESTORE_AND_ROLLBACK.md`. Phase A has no migrations, so republishing the previous tag is enough.

## 7. Measurements to take (no figures were invented in this audit)

| Measurement | How | Why |
|---|---|---|
| Production MySQL time zone | `SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();` | Settles AUD-04 |
| First Load JS per route | `next build` output; bundle analyzer on `/admin/workflows/[id]`, `/users/custom`, `/users/requests/[id]` | UI P5 |
| Server time and query count on the request page and the new-request page | `tests/perf` before and after REC-27 | AUD-27 |
| `EXPLAIN` plans for list, queue, search and analytics period filters | Local DB with the perf seed | AUD-21, I-3, I-4 |
| RSC payload size of `/admin/groups` and `/users/requests/[id]` | Browser network tab (`?_rsc`) | UI P4 (full user lists sent to the client) |
| Job run durations on live | Super Admin → Automation run history | AUD-18 (timeouts, overlap) |
