# Enhancement implementation plan (v1.5.0)

**Source:** `ARS_Approval_Platform_Development_Spec_and_Claude_Prompt.docx`, given by the owner on 9 Oct 2026 ("Go ahead").
**Baseline (Phase 0, read-only, 9 Oct 2026):**
- **Code:** branch `main` at `0acbc01`, tag v1.4.0; working tree clean.
- **Live:** `https://approval.arssteels.net/api/health` → `version 1.4.0`, database ok, **jobRunner NEVER**. The cron job has not reached the app yet; this is an owner action, see the go-live checklist.
- **CI on `0acbc01`:**
  - checks, unit, build: pass;
  - integration (MySQL 8): pass;
  - E2E + QA suite + origin check: pass.
- **Local, same commit:** unit 301/301, integration 81/81 (6 runs in a row), E2E 38/38, QA 27/27, origin 1/1, load test 0 errors at p95 586 ms.

The audit (`docs/APPLICATION_CURRENT_STATE_AUDIT.md`) was written against v1.3.5. Its update sections record what v1.3.6 and v1.4.0 closed. This plan starts from the code as it is now.

## Status words
**Done earlier** = already shipped (version noted). **This release** = planned for v1.5.0. **Owner** = not code. **Decided** = deliberately not built, with a reason.

## Feature map (spec §5)

| # | Feature | What exists (file) | Gap → work in v1.5.0 | Migration |
|---|---|---|---|---|
| 1 | My Work dashboard | `/users` overview: tiles, Waiting for me, recent (`app/users/page.tsx`) | Add sections: due soon / overdue, returned for changes, drafts, recently completed. Bounded queries; links to existing pages | no |
| 2 | Visual approval tracker | Level map + timeline (`server/approvals/step-map.ts`, `features/requests/StepMap.tsx`) | Add a "where it is now" summary (who it waits for, since when, next step), a progress count, and step status in words as well as colour | no |
| 3 | Drafts, autosave, smart forms | none | Server-side drafts per user and form; autosave (debounced) with Saving/Saved/Unable to save; recovery; discard; version check across tabs; 30-day expiry; submit removes the draft. Also custom approvals | `request_drafts` |
| 4 | Global search + saved views | My requests search; Super Admin requests search | `/users/search` over requests the person may see (raised, task on it, delegate, admin = all); filters; paging; private saved views (create/rename/default/delete) | `saved_views` |
| 5 | Mobile-first | Drawer menu; tables scroll sideways | Card layout for queue and lists on phones; request page action bar first; bigger touch targets; phone E2E | no |
| 6 | Notification preferences + delivery tracking | Delivery log with SENT/FAILED/SKIPPED, DELIVERED/READ via webhook (done v1.4.0) | Per-person, per-channel choices for non-critical events. Security, sign-in and "approval needed" stay mandatory (policy). Skipped by preference is logged as SKIPPED/USER_PREFERENCE. In-app inbox always kept | `notification_preferences` |
| 7 | Bulk approval | none | Waiting for me: select several approval tasks → review → approve. Each one goes through `decideTask` (locks, versions, DoA, audit). Per-item result; at most 25 at a time; work tasks, holds and non-approve actions excluded | no |
| 8 | Delegation / absence | Out of office with dates, overlap check (row lock), end, audit (done) | Show Upcoming / Active / Ended; a preview of what the delegate will see now; time-zone note; explicit policy text (covers waiting and new approvals while active). Blocked-step recovery done v1.4.0 | no |
| 9 | Comments + mentions | Append-only comments; participants notified | `@` mentions limited to people who can already see the request; mentioned people get a "mentioned you" message once; rendering stays plain text. **Decided:** no internal-only notes and no threads (a second visibility model; not asked by staff) | no |
| 10 | Approval summary PDF | none | `/api/requests/[id]/summary.pdf`: same access check as the page; A4; Unicode font; timeline, decisions, fields, attachment names; "exported summary" note; audited | no; **dependency:** `pdf-lib` only (built-in Helvetica; fontkit and Noto Sans dropped, D-111) |
| 11 | Simulation + version comparison | Test mode (simulate) | Test mode also shows skipped steps and choice outcomes. A "Compare with live version" diff (steps, approvers, rules, form fields, DoA). Impact note: requests in progress keep their version (D-050). Unsaved warning and archive done v1.4.0; AND/OR and nesting done v1.4.0 | no |
| 12 | Workload + SLA alerts | Approver dashboard; escalation levels; scan fix (done v1.4.0) | Workload page: per approver, pending, overdue, age bands (<1 d, 1–3 d, 3–7 d, >7 d), median wait. "Due soon" reminder at 75 % of the response time (once). Handover suggests eligible people with the least pending | `task_reminders.kind` + DUE_SOON |
| 13 | Guided help | Field hints; user guide (docs) | `/users/help`: how-tos, status glossary, search; a first-use checklist on My Work (dismissal stored server-side); "Copy details for IT" (request number, page, version; no form values) | `user_flags` |
| 14 | Security, backups, monitoring | B-01, S-01..S-07, P-01..P-07, health, backups, drill, receipts (done v1.3.6–v1.4.0) | Correlation id: `x-request-id` on every response and in error logs and error pages. Super Admin alert when the job runner fails or a backup fails (once a day). Go-live checklist file | no |

## Order (spec §4)
1. **Phase 0:** this plan and the baseline (done).
2. **Phase 1:** security and operations. Already closed in v1.3.6–v1.4.0; this release adds #14's correlation ids and failure alerts, and the go-live checklist.
3. **Phase 2:** #1, #2, #3, #4, #5.
4. **Phase 3:** #6, #7, #8, #9, #10.
5. **Phase 4:** #11, #12, #13.
6. **Phase 5:** regression, docs, release report.

## Migration (one file, `202610100900_v150_user_comfort.sql`)
- `request_drafts`:
  - columns: `id`, `user_id` FK, `draft_key` (`WF:<workflowId>` or `CUSTOM`), `title`, `fields_json`, `version`, `created_at`, `updated_at`, `expires_at`;
  - UNIQUE (`user_id`, `draft_key`).
  - **Ownership:** every query filters on `user_id`.
  - **Expiry:** 30 days; cleared by the job runner.
- `saved_views`: `id`, `user_id` FK, `name`, `query_json`, `is_default`, timestamps; UNIQUE (`user_id`, `name`).
- `notification_preferences`: (`user_id`, `event_group`, `channel`) PK, `enabled`. A missing row means on (the default).
- `user_flags`: (`user_id`, `flag`) PK, `set_at`. Used for onboarding dismissed.
- `task_reminders.kind` + `DUE_SOON`.

Recovery: additive only, so the v1.4.0 code ignores the new tables. A failed run resumes from the failed statement (D-107/R-10). Tests: a fresh database in integration and E2E; upgrade from the v1.4.0 schema via the migrate-resume test pattern.

## Risks and how they are handled
- **Policy (#6):** making notifications optional changes D-008 (email and WhatsApp for everything). The owner asked for preferences in the spec. Mandatory groups stay on, and "approval needed" stays mandatory so approvals aren't missed.
- **Bulk approval (#7):** never bypasses the engine. Each item is a normal `decideTask`; there is no shared transaction, so a failure affects one item only.
- **PDF (#10):** a new dependency, pure JS, so nothing native for GoDaddy. **As built:** `pdf-lib` only, with no font file. Text outside Latin-1 is written as a stand-in (D-111).
- **Search (#4):** access is built into the SQL (the same rule as `loadRequestView`): requester, task holder or decider, active delegator's tasks, or admin.

## Progress
Ticked in `PLAN-CHECKLIST.md` (session V150-xx) and recorded in `IMPLEMENTATION_CHANGELOG.md` and `TEST_AND_RELEASE_REPORT.md`.
