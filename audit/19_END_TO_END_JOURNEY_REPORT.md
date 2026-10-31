# 19 — End-to-end user journey report

**Method.** The journeys were walked in the in-app browser as the seeded test users, with sessions created the same way the e2e suite creates them (`TEST_EVIDENCE/AUDIT_BRIEF.md`), against the v1.39.0 build and the throw-away database. Every critical outcome was checked in the database with read-only SQL.

## J1 — Requester raises a request; the manager approves it

| Step | Role | Action | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | Ravi (USER) | Sign in (test session) → Home | Home with tiles and checklist | "Welcome back, Ravi Requester"; tiles; 8 open requests | PASS | B01 |
| 2 | Ravi | New request, submit empty | Validation, nothing saved | Field messages | PASS | 03 FN-01 |
| 3 | Ravi | Fill in and submit (default approver: his manager) | IN_PROGRESS, manager notified | CUS-2026-000003; APPROVAL_NEEDED → Manoj | PASS | B09; SQL |
| 4 | Manoj (USER, approver) | Waiting for me | The request is listed | Listed (8 waiting) | PASS | Page text |
| 5 | Manoj | Open → Approve | Approved; requester notified; next item offered | APPROVED; REQUEST_APPROVED → Ravi; "Next waiting for you" banner | PASS | B10; SQL |
| 6 | — | History | Audit and timeline | REQUEST_SUBMITTED, REQUEST_DECIDED; timeline on the page | PASS | SQL; B09 |
| 7 | Sita (USER, unrelated) | Open the request and its PDF by address | Refused | 404 / 404 | PASS | curl |

## J2 — Manager gives a task to a team member

| Step | Role | Action | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | Manoj | Create → Task → Others → "Ravi" → Enter → Create task | Task for Ravi; Ravi notified | TSK-2026-000020 OPEN for Ravi; WORK_TASK_ASSIGNED → Ravi | PASS | B12, B13; SQL |
| 2 | Manoj | Where the app goes after creating | Somewhere the task stays visible | Creator's My Tasks with the pane; the task isn't in that list | PARTIAL | UI-D04 |

## J3 — IT Admin and Super Admin consoles

| Step | Role | Action | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|
| 1 | Elena (IT_ADMIN) | All 36 Admin pages; all 19 Super Admin pages | 200 / 404 | 200 / 404 | PASS | Sweep |
| 2 | Sam (SUPER_ADMIN) | Approval type "E2E All Fields": Form Designer, flow map, Test mode | Renders; "Ready to save" | As expected | PASS | B14, B15 |
| 3 | Sam | Settings → search "otp" | Only Sign-in security | As expected | PASS | B16 |

## J4 — Session boundaries

| Step | Action | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|
| 1 | No cookie → `/users` | Sign in | 307 → `/login?next=%2Fusers` | PASS | curl |
| 2 | Garbage or tampered signature | Signed out | 307 → `/signed-out?reason=unknown` | PASS | curl |
| 3 | Logout, then reuse the old cookie | Refused | 307 (session revoked) | PASS | curl |

## Alternate scenarios

| Scenario | Status | Evidence |
|---|---|---|
| User without permission (requester on `/admin`) | PASS | Sweep |
| Missing record | PASS | Sweep (404) |
| Rejected transaction, request changes, resubmit, hold, recall, withdraw, delegation | Covered by e2e and integration (re-run) | 20 |
| Duplicate submission (idempotent submit key) | Covered by integration and e2e (re-run) | 20 |
| Inactive user | See `04_AUTHENTICATION_AUDIT.md` | — |
| External integration failure (email/WhatsApp not configured) | Observed: sends fail and are logged ("Resend API key is not configured"); the request still completes | Server log; FN-04 |
| Concurrent users | PF-01 (50 users, 0 errors) | 11 |
| Expired session | PASS | J4 |
| Export (PDF, CSV) | Covered by e2e (re-run) | 20 |
