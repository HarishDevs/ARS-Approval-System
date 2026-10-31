# Final application audit report: ARS-CMS v1.39.0

## A. Executive summary

| | |
|---|---|
| **Application** | ARS-CMS (ARS Approval Platform, Central Management System) |
| **Version** | v1.39.0, tag `v1.39.0`, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| **Audit date** | 31 Oct 2026 |
| **Environment** | Owner's machine: the production build on `localhost:3100` with the throw-away MySQL 8 test database. In-app browser (Chromium). No access to production, its hosting or live provider credentials. |
| **Scope** | All 20 phases of the owner's master prompt. The application code was not changed; findings only. |

**Method.**
- The lead auditor tested by hand in the in-app browser as five seeded test users, covering journeys, screen sizes, themes, states and roles, and checked outcomes in the database.
- Four independent read-only reviewers covered security/API/auth/RBAC, database/workflows/integrations/reliability, code quality/DevOps/DR/docs/public web, and the feature inventory.
- Every automated suite was re-run.
- Evidence is in `audit/TEST_EVIDENCE/`.

**Overall result.** The application is functionally broad and largely sound.
- **Tests:**
  - Every automated suite passes: 767 unit, 312 integration, 201 e2e, 27 QA, origin lock and load.
  - The hand-run journeys succeeded, and the outcomes were verified in the database.
- **Data and access:**
  - Data integrity checks are clean.
  - Cross-user access to records is refused.
- **One High security defect (SEC-02):** four Super Admin pages give their data to anyone, through the request that client-side navigation sends. It affects the live site and should be fixed at once.
- **Operations:** the remaining issues are recovery and operations gaps (no recorded restore of a real backup, no off-site automation, no RPO/RTO), two approval-rule edge cases (DB-004, DB-005), and documentation drift.

## B. Audit statistics

These are counts of checklist rows across reports 01–20. Features in 01 are counted PASS only where the e2e or integration test that covers them passed in this audit's re-run.

| Status | Count |
|---|---:|
| PASS | 493 |
| FAIL | 35 |
| PARTIAL | 83 |
| NOT TESTED | 16 |
| BLOCKED | 18 |
| NOT APPLICABLE | 6 |
| **Total** | **651** |

- **Verified pass rate** = PASS / (PASS + FAIL + PARTIAL) = 493 / 611 = **80.7%**
- **Coverage** = (PASS + FAIL + PARTIAL) / applicable (651 − 6) = 611 / 645 = **94.7%**

NOT TESTED and BLOCKED rows are not counted as passing. Most BLOCKED rows need live credentials (WhatsApp, email, Google, AI, Salesforce) or production access.

## C. Module-wise assessment

| Module | Main evidence | Pass | Fail | Partial | Not tested / blocked | Status |
|---|---|---:|---:|---:|---:|---|
| Requests and approvals (engine, custom, DoA, versions) | 03, 08, 19; e2e/integration | High | DB-004, DB-005 | DB-006 | — | Works; 2 Medium rule gaps |
| Tasks & projects | 03, 19; e2e v130–v139 | ✓ | — | UI-D04, DB-007 | Team tasks list | Works |
| Inbox / notifications | 02, 09; e2e | ✓ | DB-009, DB-013, DB-014 (Low) | — | Live delivery (blocked) | Works in-app; delivery not verified |
| Information, Calendar, Analytics | 01; e2e | ✓ | FI-D02, FI-D03 (Low) | — | — | Works |
| Pico Bot (AI) | 09; e2e (mock) | ✓ | DB-003 (Low) | — | Live providers (blocked) | Works with the mock |
| Profile / sessions / sign-in | 04, 19 | ✓ | SEC-01 (Low) | 5 | OTP/Google (blocked) | Sound |
| Admin consoles | 02, 05; sweep | ✓ (36 pages) | — | — | — | Sound |
| **Super Admin** | 05, 10 | 19 pages render | **SEC-02 (High)**, OPS-20 | — | — | **Fix required** |
| Database | 07 | 12 | 0 | 6 | 1 | Sound (DB-001, DB-002 Low) |
| Operations / DR | 16, 17 | 22 | 6 | 10 | 5 | Gaps |
| Documentation | 18 | 4 | 4 | 13 | — | Out of date |

## D. Quality assessment

| Area | Assessment |
|---|---|
| Functional | **Good.** Core journeys pass with database verification. One documented feature is missing (weekly HOD report, FI-D01). |
| UI/UX | **Good.** Consistent shell; no sideways scrolling at 8 sizes; light and dark themes. Naming drift after renames (UI-D01–D03). |
| API | **Good.** Every action is guarded server-side (168 actions). No stack traces leak, cross-site POSTs are refused, and rate limits trigger. |
| Database | **Good.** Every table has a primary key; no orphans; append-only audit triggers present; optimistic locking where it matters. Migration runner has no lock (DB-002). |
| Security | **One High (SEC-02).** Otherwise strong: CSP with nonce, HSTS, secure cookies, AES-GCM settings, parameterised SQL, no XSS or SSRF route found. |
| Permissions | **Good** for pages and records (65 pages per role; IDOR refused), except SEC-02. |
| Integrations | **Adequate.** Failure isolation holds; several retry and limit edge cases (DB-008–DB-014). Live tests blocked. |
| Workflows | **Good.** No silent skip on resubmit (Q-022 guard verified). Two edge cases (DB-004, DB-005). |
| Performance | **Meets the target with a thin margin** (p95 1.71 s against 2 s at 50 users; Home 1.86 s). |
| Reliability | **Adequate.** Sessions in the database survive restarts; health endpoint present but not alerting on a late job runner (OPS-11). |
| Accessibility | **Good.** axe light/dark passes; keyboard focus visible. No screen-reader test. |
| Compatibility | **Chromium only verified.** Firefox and Safari not tested. |
| DevOps | **Adequate.** CI gates lint, types, unit, build, integration, e2e and npm audit. The e2e job is close to its timeout and flaky (OPS-03, OPS-04). Nothing stops an un-green commit from being deployed (risk). |
| Disaster recovery | **Not verified.** No restore of a real backup (OPS-07), no off-site automation (OPS-08), no RPO/RTO (OPS-10). |
| Documentation | **Out of date** for user and admin guides (OPS-12–OPS-17). The living files (decisions, flows, plan) are current. |

## E. Critical findings (P0 / P1)

| ID | Severity | Finding |
|---|---|---|
| **SEC-02** | High, **P0** | `/superadmin/ai/history`, `/superadmin/ai/reports`, `/superadmin/ai/data-sources` and `/superadmin/salesforce` return their page data to any request carrying `RSC: 1` and any cookie, even an invalid one, because the pages lack their own `requireArea("superadmin")`. Reproduced independently by the lead auditor (`TEST_EVIDENCE/BROWSER/SEC-02-lead-repro.txt`). Encrypted secrets are not exposed. |
| **OPS-07** | Medium, P1 | No restore of a real production backup has been tested (go-live gate GL-04). |

There are no Critical defects.

## F. Production readiness

**Classification: NOT READY** until SEC-02 is fixed. With SEC-02 fixed and a backup restore tested, the application would be **CONDITIONALLY READY**.

Justification:
- All mandatory automated gates pass, and the main journeys are verified, so the application works as a product.
- A release gate is still failing: an access-control defect that exposes Super Admin data to unauthenticated requests.
- A second gate is unverified: recovery from backup.
- Production itself (hosting, DNS, SSL configuration, live integrations) could not be inspected, so it is not verified. A single read-only request to the live login page showed valid TLS and the security headers.
- The site is already live, so SEC-02 is an existing exposure. The fix is small (four guard calls) and should be released as a hotfix.

## G. Remediation roadmap

1. **Immediate (hotfix):**
   - SEC-02: add `requireArea("superadmin")` to the four pages, plus a test that fails when any admin or superadmin page has no own guard.
   - OPS-20: return 404, not the area title, for an unauthorised `/admin` or `/superadmin`.
2. **High priority:**
   - OPS-07: test a restore of a real backup.
   - DB-004: block self-Skip by admins.
   - DB-005: warn, or refuse, an approval that would complete with zero decisions.
   - OPS-08: automate an off-site backup.
   - OPS-10: set RPO/RTO and write an incident procedure.
3. **Medium:**
   - OPS-03, OPS-04: CI timeout and the flaky e2e test.
   - OPS-12: rewrite the user guide.
   - FI-D01: build the weekly HOD report, or remove the claim.
   - PF-R01: measure performance on production hosting.
   - SEC-01: constant-time password start.
4. **Low:**
   - UI naming (UI-D01–D04);
   - integration retry and limit edge cases (DB-008–DB-014);
   - DB-001, DB-002, DB-003, DB-006, DB-007;
   - docs (OPS-13–OPS-17, FI-D04, FI-D05);
   - public-web basics (OPS-18, OPS-19);
   - unused code and dependencies (OPS-01, OPS-02);
   - CI Node runtime (OPS-06);
   - backup encryption (OPS-09);
   - a health check that alerts (OPS-11);
   - FI-D02, FI-D03, FI-D06.
5. **Future:**
   - Firefox/Safari and screen-reader testing;
   - stress and soak testing on staging;
   - live integration tests in a staging tenant.

Effort estimates are not given, except for SEC-02 (a few lines per page plus a test).

## Remaining uncertainty

- **Production:** server configuration, data, cron jobs and backups were not inspected (BLOCKED).
- **External services:** email, WhatsApp, Google sign-in and Calendar, AI providers and Salesforce were tested against mocks only.
- **Code-review-only checks:** about 26 security checks passed on code review alone (marked in 04 and 10).
- **Audit process:** the test database was recreated part-way through the audit by the lead auditor's own integration run. The affected checks were re-run, as each report notes.
