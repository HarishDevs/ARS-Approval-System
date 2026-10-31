# 08 — Workflow audit (prefix DB)

| | |
|---|---|
| Target | ARS-CMS v1.39.0, commit `0473f2560398844f875a3bec49206e13078d06d7` |
| North star | "Multi-level approvals in any custom manner" |
| Evidence folder | `audit/TEST_EVIDENCE/DB/` |

## 1. Method

1. **Code review.** I read the following in full:
   - `server/engine/engine.ts` and `conditions.ts`;
   - the relevant parts of `types.ts` and `validate.ts`;
   - in `server/approvals/service.ts`: submit, mutate, afterChange, resubmit, recall, delegate, blocked-step recovery, withdraw, reopen and the custom approvals;
   - `server/workflows/{doa,migration,migration-plan,step-policy}.ts` and the builder schema;
   - `server/jobs/sla.ts`, `server/approvals/bulk.ts` and `server/approvals/readiness.ts`;
   - for tasks: `server/work/on-complete.ts`, the relevant parts of `server/work/service.ts` and `server/modules/tasks.ts`;
   - for background jobs: `app/api/jobs/run/route.ts` and `server/ops/automation.ts`.
2. **The unit suites, run by me:**

   ```
   npx vitest run tests/engine tests/approvals tests/workflows tests/jobs tests/work tests/notifications --reporter=verbose
   ```

   Result: **41 files, 342 tests passed** (`06_vitest_engine_approvals_workflows_jobs_work_notifications.txt`).
3. **My own engine probes.** These are pure function calls with no database or server: 14 probes, all passing. They pass because they assert the behaviour the engine actually has, including the defect behaviour.
   - Code: `audit/TEST_EVIDENCE/DB/probes/engine.probe.test.ts`, run with its own config `probes/probe.vitest.config.ts`.
   - Output: `08_engine_probes_output.txt`.
   - They do not change any app or test file.
4. **The database.** I ran read-only queries on the shared test database (`04_…`, `10_…`, `11_…`).
5. **Not re-run over HTTP.** I did not exercise approval flows live:
   - Decisions go through Next.js server actions, which need build-specific action ids.
   - The shared database was being reset by another suite during the audit (the E2E_* users disappeared at 17:26 UTC, `07_session_db_backed_http.txt`).
   - These flows are marked as covered by the cited integration and e2e specs, which **I did not re-execute**.

## 2. Checks

### 2.1 Approval engine against the north star

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| W-01 | Sequential levels, any number | unit | PASS | `06_…`: engine.test.ts "activates only the first level, then each next level in order", "supports any number of levels (12 in a row)" |
| W-02 | Parallel SPLIT and JOIN with ALL, ANY_ONE and ANY_N; late branches closed | unit | PASS | `06_…`: "ALL: waits for every branch", "ANY_ONE join: …others are closed", "ANY_N join: 2 of 3 branches"; `engine.ts:174-214` |
| W-03 | Any N of M on one level; a rejection ends the step only when N can no longer be reached | unit | PASS | `06_…`: "needs 3 approvals out of 4", "one rejection doesn't end it while 3 approvals are still possible; two do"; `engine.ts:349-367, 460-468` |
| W-04 | Conditional branch (CONDITION node, guarded and default edges) | unit plus code | PASS | `06_…` branch.test.ts and v140-builder "and/or conditions"; `engine.ts:149-157` |
| W-05 | DoA bands are compiled to `skipIf` per level and route correctly at every edge | unit | PASS | `06_…` doa-matrix.test.ts "routes by band, at every edge"; `builder.ts:257-258` |
| W-06 | Skip rule (`skipIf`) | unit | PASS | `06_…` "skipIf skips a level" |
| W-07 | `onNoApprover` defaults to BLOCK, and a blocked step is not skipped | probe plus code | PASS | Probe DB-P4 "BLOCK (default)…"; `engine.ts:265-268`; `step-policy.ts:15` default `BLOCK` |
| W-08 | `onNoApprover: SKIP` cannot approve a request with zero independent decisions | probe | **FAIL** | DB-005. Probes DB-P4 "SKIP: every approval step skipped -> APPROVED at submit with zero decisions" and "requester is the only member of the group…" |
| W-09 | Not enough approvers for ANY_N blocks the step | probe | PASS | Probe DB-P4 "ANY_N needing more people than resolve -> BLOCKED"; `engine.ts:270-273` |
| W-10 | SLA: reminder at T, escalation at 2T, further levels up to the setting, each sent once; held requests excluded | unit plus code; integration cited | PASS | See note A |
| W-11 | Rejection ends the request and closes open tasks | unit | PASS | `06_…` "reject at any level ends the request and closes open tasks (never shows as approved, G-02)" |
| W-12 | Request changes, then resubmit (REQUESTING_STEP or BEGINNING; parallel branches restarted) | unit | PASS | `06_…` "changes required keeps the request open, then resubmits from the requesting level…", "restart at the requesting level also restarts open parallel branches…"; `engine.ts:522-571` |
| W-13 | **Can a required level be silently skipped when a DoA band or condition changes on resubmit (Q-022 / AUD-02)?** | probe, code, integration cited | PASS | See note B |
| W-14 | An approver chosen in a form field changes on resubmit | probe | **FAIL** (Low) | DB-006. Probe DB-P3 |
| W-15 | Hold and resume, ask for information and answer; SLA clock paused | unit plus code | PASS | `06_…` "on hold pauses decisions and stays open; the approver resumes", v160 "ask for information"; `service.ts:661-668` `extendDueTimes` |
| W-16 | Recall (requester only; decisions kept; stale decisions refused) | unit | PASS | `06_…` v160-engine "recall (EN-04)", 4 tests; `service.ts:753-758` |
| W-17 | Withdraw (requester only; pending tasks closed) | unit plus code | PASS | `06_…` session5 "withdraw closes pending approvals…"; `service.ts:970-975` |
| W-18 | Delegation and acting on behalf (actor plus `on_behalf_of` recorded); passing an approval on (max 3, no ping-pong, active approver-eligible only) | unit plus code | PASS | `06_…` session4 "a delegate acts on behalf…"; `engine.ts:425-446`; `service.ts:775-794`; delegations resolved by India date (`directory.repository.ts:37-41`) |
| W-19 | Amendment of an approved request (original locked; one open amendment at a time; must change something) | code review | PASS (code review) | `service.ts:449-460, 547-559` |
| W-20 | Versions: a running request keeps its version; open requests migrate only under lock and version check, with explicit acceptance of warnings | unit plus code | PASS | See note C |
| W-21 | **Nobody approves their own request**: resolution, decision, delegate, handover, IT assignment | probe, unit, database | PASS | See note D |
| W-22 | **IT recovery of a blocked step on the IT person's own request** | probe plus code | **FAIL** | DB-004. Probe DB-P6 "SKIP by the requester themself is accepted by the engine and the request ends APPROVED"; `service.ts:796-803` checks only `isAdmin` |
| W-23 | Inactive approver | code, probe, database | PASS | See note E |
| W-24 | Deleted or inactive approver group | code plus grep | PASS | See note F |
| W-25 | Concurrent decisions on one request | code; integration cited | PASS | See note G |
| W-26 | Reopen (Super Admin only; new round from the start) | unit plus code | PASS | `06_…` session5 "reopen restarts an approved request from the first level in a new round"; `service.ts:977-982` |
| W-27 | Bulk approve: each item goes through `decideTask` (same lock and rules); work tasks, held and sent-back requests skipped | code; integration cited | PASS (code review) | `server/approvals/bulk.ts:1-60`; `tests/integration/bulk.int.test.ts:42` "…never twice" (not re-executed) |
| W-28 | Live end-to-end approval over HTTP | — | NOT TESTED | No `app/api` route decides an approval: decisions exist only as Next.js server actions, which need build-specific action ids. I rechecked after the E2E_* users were recreated; the reason is not a missing user. The lead's running e2e suite exercises these flows. Covered by `tests/integration/approvals.int.test.ts:99` "runs manager → parallel HOD + any-one Finance → MD for ₹12.5L…" and `:253` "changes required → requester resubmits…" (not re-executed by me) |

### Notes on the engine checks

**A. SLA (W-10).**
- Unit: `06_…` session4 "reminds once when due and escalates once at twice the time" and "multi-level escalation (D-100)".
- Code: `server/jobs/sla.ts:96-204`, with each notice claimed by `INSERT IGNORE INTO task_reminders`.
- Integration: `tests/integration/v140.int.test.ts:189` (not re-executed).
- Escalation only notifies people. Nothing is reassigned automatically.

**B. Resubmit after a DoA band or condition changes (W-13).** No required level can be silently skipped.
- The service switches to BEGINNING when `routeChanged()` reports that any `skipIf` (DoA bands included) or edge condition evaluates differently (`service.ts:722`, `conditions.ts:94-100`).
- Probe DB-P1 shows the pure engine alone, with REQUESTING_STEP, *would* keep the higher level skipped. The service guard is therefore load-bearing.
- Probe DB-P2 shows a branch flip is also detected.
- `tests/integration/v190.int.test.ts:238` "raising the amount on resubmit brings back the skipped CFO level (AUD-02)" was not re-executed. Q-022 is still open only on "earliest affected step vs beginning".

**C. Versions and migration (W-20).**
- Unit: `06_…` version-migration tests (10).
- Code: `server/workflows/migration.ts:93-122` (FOR UPDATE, `state_version` check, `acceptWarnings`).
- Integration: `approvals.int.test.ts:289` "a running request stays on its version…" (not re-executed).
- Note: new steps placed upstream of the current position do not run for a migrated request. The admin is warned about this explicitly (`migration-plan.ts:113-115`).

**D. Nobody approves their own request (W-21).**
- Probes DB-P5: a requester who is the approver's delegate is refused; a requester inside a ROLE source is excluded; IT ASSIGN refuses the requester.
- Unit: `06_…` "the requester still can't decide an approval step of their own request".
- Code: `engine.ts:122, 428, 655, 719`.
- Database: **0 approval tasks whose approver or decider is the requester, across 17,561 requests** (`10_…`), and again 0 in snapshot 3, taken during the e2e run (`13_…`). The 1–2 matches in snapshot 1 are WORK tasks given to the requester, which are allowed by design (`05_…`).

**E. Inactive approver (W-23).**
- Deactivation is refused while the person has pending approvals (`server/admin/users.ts:211-213`).
- At activation, inactive people are filtered out, and the step BLOCKS (probe DB-P4).
- The Needs-attention ("stuck") check lists a task held by an inactive person (`tests/integration/reliability.int.test.ts:66`, not re-executed).

**F. Deleted or inactive group (W-24).**
- Groups are never deleted: there is no `DELETE FROM approver_groups`.
- An inactive group resolves to no members (`directory.repository.ts:33-35`), so the step BLOCKS unless it is set to SKIP (see W-08).
- People already asked keep their tasks.

**G. Concurrent decisions (W-25).**
- `lockRequest … FOR UPDATE` plus `saveRequestState … WHERE state_version = ?` (`approvals.repository.ts:389-421`), and one vote per person per step (`engine.ts:435`).
- `tests/integration/approvals.int.test.ts:173` "two approvers of an any-one step acting at the same moment: one wins…" (not re-executed).

### 2.2 Task workflows

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| T-01 | Task rules, holidays and adhoc permissions | unit | PASS | `06_…` tests/work (6 files) all passed |
| T-02 | Stale task edits refused (`row_version`) | code; integration cited | PASS | `server/modules/tasks.ts:239, 312`; `tests/integration/v190.int.test.ts:101` "…stale pages are refused…" (not re-executed) |
| T-03 | Recurrence: one next occurrence (rule moved under lock); holidays skipped | code | PARTIAL | `server/work/on-complete.ts:58-87`. Duplicates are prevented, but the next occurrence is created in a separate transaction *after* the completion has committed. A crash or error in between loses it (logged only, `:31-35`), and nothing recovers it later |
| T-04 | Bulk and list actions use the same guarded path | code | PASS | `server/work/service.ts:436-470` (`actOnTask` per item) |
| T-05 | Multi-assignee ad hoc task is atomic | code | **FAIL** (Low) | DB-007 |

### 2.3 Background jobs

| ID | Check | Method | Status | Evidence |
|---|---|---|---|---|
| J-01 | The job endpoint needs the secret (compared in constant time) and looks like a missing route without it | HTTP plus code | PASS | `12_webhook_and_job_endpoint_http.txt`: no secret gives HTTP 404, a wrong secret gives HTTP 404; `app/api/jobs/run/route.ts:15-25` |
| J-02 | Each automation step is isolated and recorded in `job_runs` (OK or FAILED with a summary), and the Super Admin is alerted | code; integration cited | PASS (code review) | `server/ops/automation.ts:265-291`; `route.ts:30-33`; `tests/integration/reliability.int.test.ts:122` (not re-executed) |
| J-03 | Per-item idempotency inside jobs (outbox claim, `INSERT IGNORE` reminders, report slots, delivery lease `SKIP LOCKED`) | code | PASS (code review) | `outbox.repository.ts:20-25`; `sla.ts:69, 150`; `schedules.ts:175`; `jobs.repository.ts:35-54` |
| J-04 | Overlapping runs (a slow run past the 5-minute cron) | code | PARTIAL | There is no run-level lock. The per-item claims prevent most double work, but whole steps such as housekeeping and backup can run twice at once (`runDailyBackup` checks only the latest file's time, `backup.ts:186-192`) |
| J-05 | Job runner actually running in this environment | database plus HTTP | NOT APPLICABLE | No cron here. `job_runs` has only manual or test entries (`10_…`). `/api/health` showed `jobRunner: "NEVER"`, then `"OK"` after the tests ran (`07_…`) |

### Status counts (08)

| Status | Count |
|---|---|
| PASS | 30 |
| PARTIAL | 2 |
| FAIL | 4 |
| NOT TESTED | 1 |
| BLOCKED | 0 |
| NOT APPLICABLE | 1 |
| **Total** | **38** |

- **PASS (30):** W-01 to W-07, W-09 to W-13, W-15 to W-21, W-23 to W-27, T-01, T-02, T-04, and J-01 to J-03.
- **PARTIAL (2):** T-03 and J-04.
- **FAIL (4):** W-08, W-14, W-22 and T-05.
- **NOT TESTED (1):** W-28. **NOT APPLICABLE (1):** J-05.

## 3. Answer: can a required stage be silently skipped?

| Scenario | Answer | Evidence |
|---|---|---|
| A DoA band or skip condition changes on resubmit | **No.** The service restarts from the beginning when the route changes. | W-13, probe DB-P1, `service.ts:722` |
| A branch condition changes on resubmit | **No.** It counts as a route change. | Probe DB-P2 |
| An approver is inactive | **No by default.** The step blocks for IT. | W-07, W-23 |
| A group is deleted or inactive | **No by default.** Groups are never deleted; an inactive group blocks. | W-24 |
| The step is set to `onNoApprover: SKIP` and nobody resolves (including when the requester is the only candidate) | **Yes.** The step is skipped and recorded only as "Skipped: nobody to approve". A request can end APPROVED with zero decisions. Custom approvals may choose SKIP by default. | DB-005 |
| An IT Admin whose own request has a blocked step | **Yes.** They can SKIP it, or pick the path on a choice step, themselves. | DB-004 |
| An approver chosen in a form field is changed on resubmit | The step is not skipped, but it stays approved by the previously chosen person. | DB-006 |
| An open request is migrated to a version with a new upstream step | That step won't run. The admin is warned and must tick "accept warnings". | W-20 (by design) |

## 4. Risks and recommendations (not defects)

- **R-W-1. Recurrence.** Create the next occurrence in the same transaction as the completion, or add a recovery sweep for completed tasks that still have `recurrence_json` and no successor.
- **R-W-2. Job overlap.** Add a run-level advisory lock (`GET_LOCK('ars_jobs', 0)`) around `runAutomations`.
- **R-W-3. Escalation.** Escalation only notifies. Consider an optional automatic handover after the last level, which would be an owner decision.
- **R-W-4. Directory load per action.** Every decision loads the whole directory (every user, role, group and delegation) inside the request lock (`directory.repository.ts:21-61`). That is fine at 300 users; watch it as the organisation grows.

## 5. Defects

| Defect ID | Module | Feature | Category | Description | Expected | Actual | Severity | Priority | Reproduction | Evidence | Root cause | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DB-004 | Approvals | Blocked-step recovery (D-098) | Authorization / segregation of duties | An IT Admin (or Super Admin) can move a blocked step on **their own request** with SKIP, or with TAKE_PATH on a choice step. This bypasses that approval level. | "Nobody approves their own request" also applies to IT recovery actions. Only IT staff who are not the requester may SKIP or TAKE_PATH. | `resolveBlockedStep` checks only `isAdmin(actor)`. The engine's `resolveBlocked` refuses the requester for ASSIGN, but not for SKIP, TAKE_PATH or RETRY. The probe shows SKIP by the requester turning a blocked single-step request into APPROVED. It is audited as `REQUEST_UNBLOCKED`. | Medium | P1 | 1) An IT Admin raises a request on a type whose step resolves to nobody (for example their manager is unset, or the group is empty or inactive): the step BLOCKS. 2) The same IT Admin opens the request and chooses "Skip" with a reason. 3) The request moves on or is approved. | Probe DB-P6 in `08_engine_probes_output.txt`; `server/approvals/service.ts:796-803`; `server/engine/engine.ts:690-750` (the requester check exists only at `:719` for ASSIGN); `app/users/actions.ts:200-217` | The self-approval rule was applied to ASSIGN only. | In `resolveBlockedStep`, refuse when `actor.id === request.requesterId` (and when the actor is acting as the requester's delegate) for every action, or require a second IT person. | Open |
| DB-005 | Approvals engine / custom approvals | `onNoApprover: SKIP` | Workflow integrity | When every approval step resolves to nobody, including because the requester is excluded from their own approval, SKIP steps are skipped and the request is APPROVED at submit with **zero decisions**. Custom approvals let ordinary users choose SKIP by default, and the readiness check gives no warning. | A request never reaches APPROVED without at least one independent approval decision. At minimum, the requester is warned before submitting. | The probes show APPROVED with 0 tasks in two cases: REQUESTER_MANAGER with no manager, and a GROUP whose only member is the requester. `step-policy.ts:15` has `onNoApprover … editable: true` by default. Readiness warns only about BLOCKED steps (`readiness.ts:114-119`), never about skipped ones. | Medium | P2 | Custom approval with one step, "Reporting manager", set to "If nobody to approve: Skip", submitted by a user who has no reporting manager: the request is approved immediately. | Probes DB-P4 (`08_…`); `server/engine/engine.ts:264-268`; `server/workflows/step-policy.ts:15, 61`; `server/approvals/readiness.ts:114-119`; `server/approvals/service.ts:813-824` (`checkCustomSpec` catches only steps made of the requester alone) | SKIP is applied per step; nothing checks the instance as a whole. | Refuse (or force BLOCK) when a request would finish APPROVED without any APPROVED approval task. Add a readiness warning for steps that would be skipped for having no approver. Consider making SKIP not editable on custom approvals by default. | Open |
| DB-006 | Approvals | Resubmit after changes | Workflow integrity / record accuracy | When the person chosen in a FORM_FIELD_USER approver field is changed on resubmit, it isn't treated as a route change. With REQUESTING_STEP, the earlier step stays approved by the previously chosen person, while the request's data now names someone else. | A change to an earlier step's approver-selection field restarts that step, or at least forces BEGINNING. | `routeChanged()` compares only `skipIf` and edge conditions. The probe shows step "picked" kept as APPROVED by user 7 after the field was changed to user 4. | Low | P3 | Type with step 1 = "approver chosen in field X", then step 2. Step 2 asks for changes; the requester changes X to another person and resubmits. Step 1 remains approved by the old person. | Probe DB-P3 (`08_…`); `server/engine/conditions.ts:94-100`; `server/approvals/service.ts:722` | Approver sources weren't part of the D-147 route comparison. | Extend `routeChanged` to compare the values of FORM_FIELD_USER fields used by APPROVAL nodes that were reached. | Open |
| DB-007 | Work management | Ad hoc task for several people (D-222) | Atomicity | `quickAddForMany` creates one task per person in separate transactions, then links them with an UPDATE outside any transaction. A failure part-way leaves some people with tasks and some without, and the call still returns ok. A failure of the final UPDATE leaves the copies unlinked. | All copies are created and linked, or none, or the result names who was missed. | The loop `break`s on the first failure and returns `ok: true` "Created for N people". The `assign_group_id` UPDATE uses the pool directly. | Low | P3 | Code review. Make one of the chosen people invalid mid-list (for example deactivated between selection and submit). Only the people before them get tasks. | `server/work/service.ts:871-890` | A per-person create function is reused in a loop. | Run the loop and the link inside one `withTransaction`, or report the people who were skipped. | Open |
