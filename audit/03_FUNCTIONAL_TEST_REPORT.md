# 03 — Functional test report

**Method.** Each core business function was carried out by hand through the UI in the in-app browser, against the v1.39.0 production build and the throw-away test database, and every outcome was verified in the database with read-only SQL. Function-by-function coverage of the remaining features comes from the automated suites, re-run as part of this audit; see `20_AUTOMATED_TEST_REPORT.md` for the counts. The feature-to-test mapping is in `01_FEATURE_INVENTORY.md`.

## Executed by hand (UI + database)

| ID | Function | Steps | Expected | Actual (database-verified) | Status | Evidence |
|---|---|---|---|---|---|---|
| FN-01 | Create a custom approval request (validation) | Submit empty | Field errors, nothing saved | Errors shown; no row added | PASS | Page text; `approval_requests` max id unchanged before FN-02 |
| FN-02 | Create a custom approval request | Title, details with markup, amount ₹1,25,000; default approver | Request IN_PROGRESS with a pending task for the manager | `approval_requests` 18 `CUS-2026-000003` IN_PROGRESS, requester 6; task "First approval", approver 5 | PASS | B09; SQL output (session log) |
| FN-03 | Notify the approver | (automatic) | In-app notification to the approver | `notifications`: APPROVAL_NEEDED → user 5 | PASS | SQL |
| FN-04 | Approve as the manager | Waiting for me → open → Approve | Request APPROVED, closed; requester told; "Next waiting for you" | Request 18 APPROVED, `closed_at` set; task APPROVED; REQUEST_APPROVED → user 6; banner shown | PASS | B10; SQL |
| FN-05 | Audit trail | (automatic) | Submission and decision audited | `audit_logs`: REQUEST_SUBMITTED (actor 6), REQUEST_DECIDED (actor 5) | PASS | SQL |
| FN-06 | Data persists after a refresh, and on reopening | Reopen `/users/requests/18` | Same data | Same, with status Approved | PASS | B10 |
| FN-07 | Create a task for another person (Draft task) | Create → Task → Others → Ravi → Create task | Task OPEN, assignee Ravi, created by Manoj; Ravi notified | `tasks` 20 TSK-2026-000020 OPEN, assignee 6, created_by 5; WORK_TASK_ASSIGNED → user 6 | PASS | B12, B13; SQL |
| FN-08 | Theme preference saved | Profile → Light | Saved and applied on the next page | Applied (`data-theme=light`) | PASS | B11 |
| FN-09 | Settings search (Super Admin) | Type "otp" | Only matching settings shown | Only Sign-in security shown | PASS | B16 |
| FN-10 | Admin pages load for the right roles | 55 Admin and Super Admin pages | 200 for the role, 404 otherwise | As expected for all 55 | PASS | `admin-superadmin-sweep.txt` |

## Covered by the automated suites (re-run in this audit)

The modules below are exercised end to end by the e2e suite (201 tests) and the integration suite (312 tests, real MySQL). In each case the integration tests check the database state directly.

| Module | Main specs |
|---|---|
| Requests | `approval-flow`, session7/11/12, v137, v140, v150, v160-smart-* (forms, readiness, amend, versions), v170-abc, v180 |
| Tasks & projects | v130–v133, v139 |
| Information | v190, `information` |
| Inbox / notifications | v160-workspace, v190, v131 |
| Calendar | v1100, `calendar` |
| Analytics | `analytics` |
| Pico Bot | picbot, ai-modules (mock provider) |
| Profile / security / delegation | profile, v135 |
| Admin | v138, v1391, v1392, `admin-users`, `import`, `budgets`, `reminders` |
| Super Admin | `settings`, `retention`, `page-access` |

Results are in `20_AUTOMATED_TEST_REPORT.md`.

## Not tested

| ID | Function | Reason | Status |
|---|---|---|---|
| FN-N1 | Email and WhatsApp delivery | No provider keys in the test environment; sends fail by design ("Resend API key is not configured") | BLOCKED |
| FN-N2 | Google sign-in (Firebase) | Needs the real Google project and a Google account | BLOCKED |
| FN-N3 | Weekly HOD report | Does not exist (FI-D01) | FAIL (missing) |
| FN-N4 | Deleting a workflow; Super Admin sign-in history | No test (FI inventory) | NOT TESTED |
