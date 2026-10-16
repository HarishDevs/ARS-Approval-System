# 04 — Workflow and API audit

ARS Approval Platform v1.8.0, audited 16 Oct 2026 (read-only).

**Contents:**
1. The approval engine and its state machine.
2. Ten business workflows traced end to end: user action → validation → Server Action or API → authN/authZ → business logic → database and transaction → notifications → response → audit.
3. The confirmed workflow defects.
4. The full API endpoint inventory.
5. External integration status.

## Summary

| Workflow | Status | Main gap | Tests (all passed 16 Oct 2026) |
|---|---|---|---|
| WF-1 Raise a request from an approval type | Working | Files are saved after the commit (AUD-10); no `audit_logs` row for submit (AUD-12) | approvals.int, readiness.int, session8.int; e2e approval-flow |
| WF-2 Custom approval with ad-hoc levels | Working, governance gap | Can auto-approve with no human decision (AUD-07) | session4.int, v140.int, v180.int; e2e v140-ui, v180 |
| WF-3 Approve / reject / changes (sequential, parallel, ANY_N / ALL) | Working, two engine defects | Delegate double vote (AUD-05); branch rejection under an ANY join (AUD-06); both **runtime-verified** | engine.test, approvals.int, bulk.int; e2e approval-flow, v150 |
| WF-4 Delegation and acting on behalf | Working | Double vote (AUD-05); no scoped delegation | session4.int, delegations.int, v170-a.int |
| WF-5 SLA, escalation, no-approver BLOCK/SKIP | Working (notify-only escalation) | Escalation link opens a 404 for the manager (AUD-09); no timeout actions | session4.int, v140.int, reliability.int |
| WF-6 Withdraw, recall, resubmit, amend, reopen | Working, **P1 defect** | Resubmit keeps skipped DoA levels (AUD-02, **runtime-verified**); resubmit skips readiness (AUD-11) | session5.int, engine-v160.int, amendments.int; no E2E for recall or reopen |
| WF-7 Collaborators, comments, consultation | Working | Comments and consultations not transactional and not through the outbox; consultations never closed | collaborators.int, mentions.int; no E2E for consultation |
| WF-8 Expiry and validity | Informational only | Not enforced (AUD-13) | v170-a.int, e2e v180 |
| WF-9 Attachments | Working, safe | Lost when the request closes at submit (AUD-10); no malware scan; buffered in memory | session6.int, collaborators.int, e2e v161 |
| WF-10 Drafts | Working | One draft per type | drafts.int, e2e v150 |

**APIs:** 25 route handlers. Every one has a server-side check: a session plus an area guard, a signed token, or a constant-time machine secret. Mutations are done through Server Actions; all 93 are guarded. The CSRF protection for Server Actions is Next.js's own origin check; for unsafe `/api/*` calls it is the `Sec-Fetch-Site` gate. There is no public or versioned API and no OpenAPI document. That suits an internal application with no API consumers (see DR-14 in `12`).

**Unused or missing endpoints:**
- None unused.
- The one unused backend export is `isSessionActive`, which only a test uses.
- **Missing protections on costly endpoints:**
  - no rate limit on `GET /api/requests/[id]/summary.pdf` or `GET /api/me/quick` (SEC-09);
  - `GET /api/admin/dashboards/[slug]` lacks the audit and rate limit that report exports have (DEF-05).

---

## Part 1 — Engine and workflow traces

### 0. Architecture in one page

- **Engine.** `server/engine/engine.ts` is pure: definition + state + input in, new state + events out. No DB, no clock.
  - **Node kinds** (`server/engine/types.ts:116`): START, END, APPROVAL (mode APPROVE or WORK), NOTIFY (FYI), SPLIT, JOIN, CONDITION.
  - **Completion rules** (`types.ts:61`): ALL, ANY_ONE and ANY_N, on approval steps and on joins.
- **Instance state machine** (`types.ts:155`).
  - Statuses: `IN_PROGRESS | ON_HOLD | CHANGES_REQUIRED | APPROVED | REJECTED | CANCELLED`.
  - Allowed transitions are enforced by guard clauses at the top of each engine function:

| From | Action | To | Guard (engine.ts) |
|---|---|---|---|
| (new) | `startInstance` | IN_PROGRESS / APPROVED (all steps skipped) | 387-397 |
| IN_PROGRESS | `decide` APPROVE / REJECT / REQUEST_CHANGES | IN_PROGRESS / APPROVED / REJECTED / CHANGES_REQUIRED | 415, 451-474 |
| IN_PROGRESS | `putOnHold`, `askForInformation` | ON_HOLD | 485, 778-785 |
| ON_HOLD | `resume`, `answerInformation` | IN_PROGRESS | 497, 790 |
| CHANGES_REQUIRED | `resubmit` | IN_PROGRESS (round + 1) | 523 |
| IN_PROGRESS / ON_HOLD | `recall` | CHANGES_REQUIRED | 752 |
| IN_PROGRESS / ON_HOLD / CHANGES_REQUIRED | `withdraw` | CANCELLED | 572 |
| APPROVED | `reopen` | IN_PROGRESS (round + 1) | 619 |
| IN_PROGRESS / ON_HOLD | `reassignTask` | same | 641 |
| IN_PROGRESS + BLOCKED step | `resolveBlocked` | same / APPROVED | 691-694 |
| open | `cancelForDeletion` | CANCELLED (+ soft delete) | 597-607 |

- **Service layer.** `server/approvals/service.ts` loads, locks, saves and notifies. Every action on an existing request goes through `mutate()` (`service.ts:546-583`), which does all of this in one transaction:
  - `SELECT … FOR UPDATE` (`approvals.repository.ts:370-373`);
  - an optimistic `state_version` check (`approvals.repository.ts:386-404`);
  - the task projection (`syncTasks`, `:409-438`);
  - the append-only timeline (`appendEvents`, `:482-492`; DB triggers at `database/migrations/202609291201_create_approvals.sql:137-148`);
  - audit for selected events (`afterChange`, `service.ts:589-624`);
  - the outbox rows (`queueMessages`, `service.ts:357-359`).
  
  Delivery happens after the commit (`deliverOutbox`, `service.ts:362-376`), and the job runner retries stale rows (`runOutbox`, `:379-382`).
- **Server actions.** `app/users/actions.ts`, `collab-actions.ts` and `draft-actions.ts` each:
  - re-check the session (`requireApiArea("users")`, `actions.ts:33-40`);
  - parse FormData with hand-written regex and length checks rather than zod; zod is used only for the builder spec (`collab-actions.ts:38`) and the drafts/policy schemas;
  - call the service.
- **Record-level access** has one rule, applied in two places:
  - `isParticipant` (`approvals.repository.ts:630-643`);
  - `visibleToSql` (`lib/db/repositories/visibility.ts:10-20`), used by `loadRequestView` (`server/approvals/view.ts:81-87`) and by the attachment download (`server/attachments/service.ts:129-141`).

---

### (a) Workflow traces

#### WF-1 Raise a request from an approval type
| Stage | Evidence |
|---|---|
| UI | `app/users/new/[workflowId]/page.tsx` (requireArea, published version, drafts, autofill) → `features/requests/RequestForm.tsx` (generates a `submissionKey` UUID; readiness panel `ReadinessPanel.tsx`) |
| Frontend validation | Field hints only. The server is the authority (`readiness.ts:16-21`). |
| Action | `submitRequestAction`, `app/users/actions.ts:54-112`:<br>• files sniffed and size-checked before anything is saved (`prepareFiles`, `server/attachments/service.ts:44-53`);<br>• attachment-field counts come from the real files (`field-files.ts:22-39`). |
| AuthN/Z | Session (`actions.ts:55`).<br>A CUSTOM type is usable only by its owner (`service.ts:446`).<br>No per-type raiser restriction exists (see Gaps). |
| Idempotency | Three layers:<br>• `findBySubmissionKey` before work (`service.ts:440-443`);<br>• a locking re-read inside the transaction (`:463-469`);<br>• the DB unique key `(requester_id, submission_key)` (`database/migrations/202610081300_qa_fixes.sql:6-7`), whose `ER_DUP_ENTRY` is mapped back to the first request (`service.ts:532-535`). |
| Business logic | `assessReadiness` inside the transaction with `lock: true`:<br>• locks the type row first (`readiness.ts:91`);<br>• checks title 3-200 (`:102`), fields (`:104`), DoA and approver fields (`:105-108`), minimum attachments (`:109-111`) and config (`:112-113`);<br>• simulates routing, where a step nobody can approve is a WARNING (`:117-121`);<br>• checks duplicates, unique fields and recent title (`:124-187`) and budget with `FOR UPDATE` (`:190-228`).<br>Blocking items become `FormError`; warnings need acknowledgement (`service.ts:470-487`). Then `startInstance` (`:494`). |
| DB / transaction | All inside one transaction (`service.ts:453-527`):<br>• `nextRequestNumber` (row-locked sequence, `approvals.repository.ts:251-260`);<br>• `insertRequest`, which stamps validity if already APPROVED (`:308-319`);<br>• `syncTasks`, `appendEvents` (SUBMITTED + engine events), `insertRevision`, `insertSubmissionCheck`, duplicate-override audit and amendment row (`service.ts:495-512`). |
| Notifications | `queueMessages` inside the transaction, `announce` after the commit (`service.ts:526, 538`). Message mapping is in `server/approvals/messages.ts` (TASK_CREATED `:40`, NODE_BLOCKED → IT admins `:279`). |
| After commit, outside the transaction | Follow-up link, collaborators and draft deletion (`actions.ts:87-98`), then **attachments in separate transactions** (`actions.ts:103-109`). |
| Response / UI | `redirect(/users/requests/{id}?submitted=1[&files=failed])` (`actions.ts:111`). The page shows a "files failed" banner (`app/users/requests/[id]/page.tsx`, around lines 108-112). |
| Audit | Timeline: SUBMITTED + engine events.<br>`audit_logs`: only `DUPLICATE_WARNING_OVERRIDDEN` / `AMENDMENT_SUBMITTED`. There is **no `REQUEST_SUBMITTED` audit row** (see D-08). |
| Tests | Unit: `tests/engine/engine.test.ts`.<br>Integration: `approvals.int.test.ts` (numbers under concurrency `:90`, hybrid run `:99`), `readiness.int.test.ts` (duplicates, budget, documents, concurrent submits `:108`), `session8.int.test.ts` (submission key).<br>E2E: `approval-flow.spec.ts:41`, `v160-smart-readiness.spec.ts`, `v161-attachments-collaborators.spec.ts:41`. |
| Gaps | **D-05:** files are saved after the commit; a request closed at submit takes no files.<br>**D-08:** no audit row for the submit.<br>No per-type raiser scoping. |

#### WF-2 Custom approval with ad-hoc levels
| Stage | Evidence |
|---|---|
| UI | `app/users/custom/page.tsx` → `features/requests/CustomApprovalForm.tsx`.<br>It reuses **the full admin `LevelsEditor`** (`:7, :101`), so the end user gets every builder capability: parallel stages, choices/branches, skip conditions, WORK/FYI steps, approver kinds and "if nobody to approve". |
| Action | `submitCustomAction` (`app/users/collab-actions.ts:33-96`):<br>• zod `builderSpecSchema.safeParse` (`:38`);<br>• files checked first;<br>• fields limited to IT's custom form (`:48-57`). |
| Business logic | `submitCustomRequest` (`service.ts:764-819`):<br>• recent-title duplicate check (`:773-779`);<br>• IT step policy applied, overriding fixed options (`applyStepPolicy`, `server/workflows/step-policy.ts:45-65`);<br>• `checkCustomSpec` blocks a DoA stage and **steps whose PEOPLE are only the requester** (`:751-762`);<br>• `resolveContent` checks approver eligibility (D-085) for named USER sources only (`:156-179`, `approver-rules.ts:47-55`);<br>• full validator (`server/engine/validate.ts`): at least one APPROVE step `:76-77`, no REQUESTER on approve steps `:193-194`, ANY_N bounds `:198-203`, cycles and dead ends `:142-156`. |
| DB / transaction | Three separate transactions: `createWorkflow` (`:191-213`) → `publishVersion` (`:244-248`) → `submitRequest`. A failure or a repeated submit triggers `deleteUnusedWorkflow` (`:805-818`; R-06 mitigation). |
| Authz | The CUSTOM type is owned by the requester (`service.ts:200, 446`). |
| Tests | Integration: `session4.int.test.ts:56,68`, `v140.int.test.ts:171` (no orphan), `v180.int.test.ts:117` (IT set-up applied), `session11.int.test.ts:66` (approvers only).<br>E2E: `v140-ui.spec.ts:127`, `v180.spec.ts:49`. |
| Gaps | **D-02 (P1):** a custom route can finish APPROVED with no human decision. Skip conditions are not stripped (`applyStepPolicy` keeps `skipWhen`), `onNoApprover: SKIP` is user-editable by default (`step-policy.ts:15`), and neither the validator nor `checkCustomSpec` requires at least one approval that can't be skipped.<br>Smaller issues:<br>• the code `CUSTOM_{id}_{ms}` can collide on two submits in the same millisecond (`service.ts:793`), which returns DUPLICATE_CODE;<br>• one `workflow_definitions` row is created per custom request, so the table grows. |

#### WF-3 Approve / reject / send back / request changes (sequential, parallel, ANY_N / ALL)
| Stage | Evidence |
|---|---|
| UI | `app/users/requests/[id]/page.tsx` → `features/requests/ActionPanel.tsx` (`DecisionForm`, `MobileDecisionBar`, `DecisionShortcuts`); queue `app/users/queue/page.tsx`; bulk `features/requests/BulkApprove.tsx`. |
| Action | `decideAction` (`actions.ts:164-188`):<br>• whitelist APPROVE / REJECT / REQUEST_CHANGES / HOLD / INFO (`:155`);<br>• comment ≤ 2000 (`:171`);<br>• reason required except for APPROVE and HOLD (`:172`).<br>Bulk: `bulkApproveAction` (`:332-358`) → `server/approvals/bulk.ts:35-52`, which runs decideTask per item, at most 25, plain APPROVAL tasks only (`:21-33`). |
| AuthZ | In the engine (`decide`, `engine.ts:425-430`): approver or active delegate (`directory.canActFor`, `directory.repository.ts:87-88`, which re-checks the delegate is active and approver-eligible).<br>No self-approval except on WORK steps.<br>WORK steps can't be rejected (`:431`). |
| Concurrency | Row lock + `state_version` (`service.ts:550-558`). A second decider gets "not waiting for you" because the task is no longer PENDING (`engine.ts:419-420`). Tested: `approvals.int.test.ts:173` (any-one race), `engine-v160.int.test.ts:88` (recall vs approval). |
| Rules | Step completion: `evaluateApprovalNode` (`engine.ts:349-367`).<br>• ALL: one reject ends the request (`:458`).<br>• ANY_ONE / ANY_N: reject only when `approved + pending < need` (`:363-366`).<br>Join: `arriveAtJoin` (`:174-189`); early-satisfied joins cancel the open branches (`:193-214`).<br>Changes: closes every pending task and records `openNodeIds` (`:463-474`). |
| DB | `syncTasks` upserts by `(request_id, task_key)`, which is unique (`create_approvals.sql:114`). |
| Notifications / audit | Outbox inside the transaction. `REQUEST_DECIDED` audit with `onBehalfOfUserId` (`service.ts:598-602`). |
| Tests | Unit: `engine.test.ts:61-125` (parallel ALL / ANY_ONE / ANY_N joins, ANY_N steps), `:198-235` (authz, double decide, reasons).<br>Integration: `approvals.int.test.ts:99-207`, `bulk.int.test.ts:42,77`.<br>E2E: `approval-flow.spec.ts:41-80`, `v150.spec.ts:88` (bulk), `:100` (mobile). |
| Gaps | **D-03:** a rejection in one branch ignores the join's ANY rule.<br>**D-04:** a delegate can cast two votes on one step.<br>**R-03:** a retried decision has no idempotency token; a double-submit shows an error rather than "already done". |

#### WF-4 Delegation and acting on behalf
| Stage | Evidence |
|---|---|
| UI | `app/users/delegation/page.tsx`, `features/requests/DelegationForms.tsx` / `DelegationList.tsx`. |
| Action | `createDelegationAction` / `stopDelegationAction` (`collab-actions.ts:117-152`). |
| Logic | `createDelegation` (`server/approvals/collab.ts:109-132`):<br>• self only, unless IT (`:113`);<br>• date rules ≤ 90 days, end not in the past (`:99-107`);<br>• the delegate must be active and approver-eligible (`:117-120`);<br>• overlap is checked under a user-row `FOR UPDATE` (`:123-127`). |
| Runtime | The directory snapshot holds today's delegations (`directory.repository.ts:37-41`).<br>`canActFor` covers one hop only, never a chain (`:87-88`).<br>Queue: `PENDING_FOR` (`approvals.repository.ts:516-526`).<br>The engine sets `onBehalfOf` (`engine.ts:440`); the audit row records it (`service.ts:600`). |
| Pass-on (EN-07) | `delegateTask` (`service.ts:713-730`): max 3 hand-ons, never back to a previous holder, approver-eligible target. |
| Handover / bulk reassign (IT) | `handOverPendingTasks` (`service.ts:829-850`) and `bulkReassign` (`:859-894`), each item through `mutate`. |
| Jobs | `server/jobs/delegations.ts:12-40` audits the start and end once, and on the end tells both people what is back with the person. |
| Tests | Integration: `session4.int.test.ts:75,97`, `delegations.int.test.ts:29`, `v170-a.int.test.ts:135,181`, `engine-v160.int.test.ts:117`.<br>E2E: `v160-ui.spec.ts`, `v160-workspace.spec.ts`, `profile.spec.ts`. |
| Gaps | **D-04:** delegate double vote.<br>Delegation is all-or-nothing: there is no per-type or amount-limited delegation.<br>Delegate visibility ends when the delegation ends: after their task is decided, a delegate keeps access only through `decided_by`, as designed. |

#### WF-5 SLA, escalation and no-approver handling (BLOCK / SKIP)
| Stage | Evidence |
|---|---|
| Config | Per step: `slaHours`, `onNoApprover` (`types.ts:84-87`). Builder schema: `builder.ts:55-61`. Custom policy: `step-policy.ts:12-16`. |
| Due times | `syncTasks` computes `due_at` / `escalate_at` in working hours (`approvals.repository.ts:12-16, 427`).<br>Handover restarts the clock (`restartTaskClock`, `:442-455`).<br>Holds and info requests extend due times (`service.ts:605-610`, `approvals.repository.ts:459-466`). |
| Jobs | `runSlaChecks` (`server/jobs/sla.ts:103-204`): reminder at T, then escalation levels 1-3 up the manager chain (setting 1-3). Due-soon at 75% (`:55-101`).<br>Each notice is claimed with `INSERT IGNORE task_reminders` (`:150-151`).<br>ON_HOLD requests are skipped (`:136`). |
| No approver | `activateApproval` (`engine.ts:264-273`): SKIP or BLOCK; NOT_ENOUGH_APPROVERS always blocks.<br>NODE_BLOCKED tells the IT admins (`messages.ts:279`).<br>IT recovery: `resolveBlockedStep` with ASSIGN / SKIP / RETRY / TAKE_PATH (`service.ts:734-741`, `engine.ts:684-744`).<br>Stuck detection: `server/ops/stuck.ts`. |
| Tests | Integration: `session4.int.test.ts:150`, `v140.int.test.ts:77,114-150,189`, `session5.int.test.ts:76`, `reliability.int.test.ts:61-86`.<br>Unit: `engine.test.ts:183-196`.<br>E2E: `v140-ui.spec.ts:86`. |
| Gaps | Escalation only notifies. There is no automatic action: auto-reassign, auto-approve, auto-reject or skip on timeout.<br>The escalated manager is sent a link they **cannot open** (D-06).<br>No reminders on the requester side (CHANGES_REQUIRED, unanswered INFO): register A15.1-06 is yet to do.<br>The claim is taken before sending (`sla.ts:150-155`), so if the process dies mid-send that notice is lost. Channel retries do exist inside `notify` (`server/notifications/notify.ts:124-177`). |

#### WF-6 Withdraw, recall, amend an approved request, resubmit, reopen
| Stage | Evidence |
|---|---|
| Withdraw | `withdrawAction` (`actions.ts:270-286`) → `withdrawRequest`, requester only (`service.ts:906-911`) → `engine.withdraw` (`:571-592`), allowed from IN_PROGRESS, ON_HOLD or CHANGES_REQUIRED. Budget commitment falls away by status (`readiness.ts:204-208`). |
| Recall (EN-04) | `recallAction` (`actions.ts:363-379`) → `recallRequest` (`service.ts:691-696`) → `engine.recall` (`:751-773`); audited (`service.ts:613-614`). |
| Resubmit | `resubmitAction` (`actions.ts:239-268`) → `resubmitRequest` (`service.ts:646-667`):<br>• requester only;<br>• re-parses the form, DoA amount and approver fields;<br>• policy per type (D-101; default REQUESTING_STEP);<br>• revisions for both rounds (`service.ts:564-567`);<br>• budget re-sync **after and outside** the transaction (`:665, 669-679`). |
| Amend (FN5) | `submitAmendmentAction` (`actions.ts:115-153`) → `submitAmendment` (`server/approvals/amendments.ts:121-144`) → `submitRequest` with `amendment`.<br>`checkAmendment` locks the original `FOR UPDATE`, allows one open amendment and requires a change (`service.ts:403-420`).<br>The DB keeps `uq_request_amendments_amendment` (`202610121100_v160_amendments.sql:16`).<br>Effective values come from the latest approved amendment (`amendments.ts:58-63`). |
| Reopen | Super Admin only (`service.ts:913-918`), from APPROVED (`engine.ts:612-629`). |
| Tests | Integration: `session5.int.test.ts:47,59`, `engine-v160.int.test.ts:74,88`, `approvals.int.test.ts:253`, `request-detail.int.test.ts:58,81`, `amendments.int.test.ts:84-144`.<br>Unit: `engine.test.ts:251-311`.<br>E2E: `approval-flow.spec.ts:60`, `v160-smart-zamend.spec.ts:43,72`, `v172-lists.spec.ts` (withdraw lists). There is no E2E for recall or reopen. |
| Gaps | **D-01 (P1):** DoA / condition bypass on a REQUESTING_STEP resubmit.<br>**D-07:** resubmit skips the readiness checks (budget BLOCK, unique, duplicates).<br>**D-08:** withdraw, reopen, resubmit, hold and resume have no `audit_logs` row; they exist only on the timeline. |

#### WF-7 Collaborators, comments, consultation, links
| Stage | Evidence |
|---|---|
| Comments | `commentAction` (`collab-actions.ts:98-115`) → `addComment` (`collab.ts:49-92`): participant check, ≤ 2000 characters, mentions only to people who can see the request (`:31-47`).<br>The insert and the audit are **not in one transaction** (`:57-59`), and notifications go through direct `notify`, not the outbox (`:66, :77`). |
| Collaborators | `addCollaborators` (`collaborators.ts:228-289`): requester or IT, max 20 under a request-row lock, outbox, timeline and audit. `removeCollaborator` (`:291-305`). |
| Consult (EN-06) | `consult` (`consult.ts:109-138`): only the current pending approver or their delegate; consultee active and not the requester. Not transactional, with direct notify.<br>Duplicate-open check by read only (`:118`); there is **no unique key** (`202610110900_v160.sql:29-44`). Answer guarded by a conditional UPDATE (`consult.repository.ts:31-34`). |
| Links / follow-ups | `linkRequests` and `linkFollowUp` (`consult.ts:168-186`) need both sides visible. |
| Tests | Integration: `session4.int.test.ts:137`, `mentions.int.test.ts`, `collaborators.int.test.ts:73-123`, `engine-v160.int.test.ts:135-170`, `v170-a.int.test.ts:193` (confidential fields).<br>E2E: `v150.spec.ts:117`, `v161-attachments-collaborators.spec.ts:41,69`. **No E2E for consultation.** |
| Gaps | Open consultations are never closed when a request finishes (the `WITHDRAWN` status is unused).<br>The consult race can create duplicates.<br>Comments can't be edited (by design) and have no attachments. |

#### WF-8 Expiry and validity of approvals
| Stage | Evidence |
|---|---|
| Setting | `validityDays` on the type (`server/workflows/type-settings.ts:24`). |
| Stamp | Set on APPROVED (`approvals.repository.ts:324-338`); cleared when the status leaves APPROVED (`:398`). |
| Display | `expiryState` (`server/approvals/expiry-rules.ts`); `ValidityBadge` on the request page. |
| Job | `runExpiryNotices` (`server/approvals/expiry.ts:19-62`): claims `expiry_notified_at`, then outbox, then audit. **One notice per approval**, either "expiring" or "expired". |
| Tests | Integration: `v170-a.int.test.ts:90,111`. E2E: `v180.spec.ts` (expir*). |
| Gaps | **D-09:** expiry is informational only. The status stays APPROVED, an expired approval can still be amended (`amendments.ts:85` doesn't check expiry) or used as a follow-up source, and there is no "EXPIRED" list or filter. |

#### WF-9 Attachments upload and download
| Stage | Evidence |
|---|---|
| Rules | `server/attachments/files.ts`:<br>• allow-list plus magic-byte sniff (`:46-60, 89-97`);<br>• 10 MB per file, 5 per upload, 20 per request (`:3-5, 100-104`);<br>• safe names (`:68-80`). |
| Upload | `addAttachments` (`server/attachments/service.ts:68-125`), inside one transaction:<br>• request-row lock;<br>• open statuses only (`:23, :89`);<br>• sha256 dedupe;<br>• count check;<br>• random filename `wx`;<br>• timeline + audit.<br>Written files are unlinked on rollback (`:121`). |
| Entry points | Submit / resubmit / custom / amend (requester only, after the request commit): `actions.ts:103-109, 145-150, 256-264`, `collab-actions.ts:88-93`.<br>Later: `addFilesAction` (`actions.ts:307-329`, any participant). |
| Download | `app/api/attachments/[id]/route.ts:10-24` → `openAttachment` (`service.ts:129-141`): same visibility rule, denials audited, path-traversal guard, `nosniff`, sandbox CSP, inline only for images and PDF (`files.ts:108-139`). |
| Tests | Unit: `tests/attachments/files.test.ts`, `tests/workflows/attachment-field.test.ts`.<br>Integration: `session6.int.test.ts:129-166`, `collaborators.int.test.ts:125,142`.<br>E2E: `v161-attachments-collaborators.spec.ts:24-68`. |
| Gaps | **D-05:** files can't be saved on a request that closed at submit, and the required-document rule is satisfied by a count even when saving fails.<br>No malware scanning. Whole files are buffered in memory on upload (`service.ts:50`) and download (`:140`).<br>Files are never deleted, by design (D-072). |

#### WF-10 Drafts
| Stage | Evidence |
|---|---|
| UI | `features/requests/useDraftAutosave.tsx`, used by RequestForm and CustomApprovalForm. |
| Action | `saveDraftAction` / `discardDraftAction` (`app/users/draft-actions.ts:36-66`):<br>• key whitelist `WF:<id>` / `CUSTOM` / `AM:<id>` (`server/drafts/rules.ts:80-85`);<br>• content limits (`:96-110`);<br>• only live predefined types or amendable requests (`draft-actions.ts:27-34`). |
| DB | Optimistic `version` (`drafts.repository.ts:145-165`), scoped by owner, 30-day expiry, pruning (`:204-207`). Deleted after a successful submit (`actions.ts:98, 140`; `collab-actions.ts:83`). |
| Tests | Unit: `tests/drafts/rules.test.ts`. Integration: `drafts.int.test.ts:16-48`. E2E: `v150.spec.ts:31,52`. |
| Gaps | One draft per type per user. Files are not kept (the UI says so). The draft is deleted even when the submit was a repeated key, which is harmless. |

---

## Part 2 — Workflow defects and risks

### (c) Defects and risks

#### Confirmed defects (by code path; not reproduced at runtime)

| ID | Pri | Defect | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| D-01 | **P1** | **DoA / conditional routing bypass on resubmit.** With the default policy REQUESTING_STEP, every node that was APPROVED or SKIPPED in the previous round is kept, including CONDITION nodes and DoA levels skipped by `skipIf`. Only the requesting step and the open branches restart. If the requester raises the amount after being sent back by a step that sits after the skipped level or the condition, the higher-band levels stay skipped. | `server/engine/engine.ts:532-538, 555-560`; `server/approvals/service.ts:646-663` (no check that routing fields changed); DoA levels compiled as `skipIf` (`server/workflows/builder.ts:251-258`). No test changes band on resubmit (`approvals.int.test.ts:263` stays in one band). | A ₹5L request approved at the low band can be resubmitted at ₹50L without CFO/MD approval. This breaks the DoA authority. | On resubmit with changed `formData`: re-simulate, and if the route differs (`compareRoutes` already exists, `server/approvals/route-compare.ts`), force BEGINNING. At minimum, never keep CONDITION or `skipIf`-SKIPPED nodes whose conditions read changed fields. Add unit + int tests. |
| D-02 | **P1** | **A custom approval can become APPROVED with no human decision.** The end user gets the full builder, including `skipWhen` and `onNoApprover: SKIP` (editable by default). `applyStepPolicy` doesn't strip `skipWhen`. `checkCustomSpec` only rejects PEOPLE = requester. The validator only requires an APPROVE node to *exist*. A step that always skips, or that resolves to nobody with SKIP, finishes the request at submit (`startInstance` → END → `INSTANCE_APPROVED`), and validity is stamped. | `features/requests/CustomApprovalForm.tsx:7,101`; `server/workflows/step-policy.ts:15,45-65`; `server/approvals/service.ts:751-762, 783-790`; `server/engine/validate.ts:76-77`; `approvals.repository.ts:317`. | Self-issued "approved" records with an ARS approval number. A governance and SoD failure for the north star. | For CUSTOM: drop `skipWhen` and force BLOCK; or refuse a submit whose `startInstance` result is APPROVED with zero APPROVED tasks. Consider the same guard for predefined types (allow it only when IT ticks "may auto-approve"). |
| D-03 | P2 | **A branch rejection ends the request even when the JOIN is ANY_ONE / ANY_N.** Rejection on an ALL step calls `rejectInstance` directly. On ANY steps, `evaluateApprovalNode` rejects the whole instance when that step can't pass. The join's own rule is never consulted, so "any one of Finance / Legal branches" fails if Legal rejects first. This is inconsistent with step-level ANY semantics, where a rejection doesn't end the request while others can still approve. | `engine.ts:363-366, 369-376, 458`; tests only cover approvals into joins (`tests/engine/engine.test.ts:69-100`). | Wrong outcome for "any of these departments" designs. | Decide the semantics (BD). If ANY: mark the branch failed, and reject only when the join can no longer reach its count. |
| D-04 | P2 | **One person can cast two votes on the same step.** `decide` checks only that the actor is the approver or an active delegate of the task's approver. There is no check that the actor has already decided another task on the same node and round. A delegate who is also a co-approver satisfies ANY_N(2) or ALL alone. `reassignTask` has such a clash check (`engine.ts:650`); `decide` does not. | `engine.ts:425-449`; `directory.repository.ts:87-88`. No test. | Segregation of duties (register M1.1-25 is yet to do). | In `decide`, refuse when `state.tasks` has a decided task with the same `nodeId`, `round` and `decidedBy === actorId`. Also hide such tasks from the delegate's queue (`PENDING_FOR`). |
| D-05 | P2 | **Files are lost when a request closes at submit.** Attachments are saved after the request commits, and `addAttachments` refuses any request that isn't open. A request that finishes on submit (all steps skipped, or D-02) gets `files=failed`, and the banner tells the user to "add them again", which is impossible. Also, the required-document minimum is satisfied by the *count* (`readiness.ts:109`) even when every file then fails to save. | `app/users/actions.ts:103-111`; `server/attachments/service.ts:23,89`; `collab-actions.ts:88-93`. | An approved record without its supporting documents. | Save files inside the submit transaction (write to disk first, then insert rows with the request), or allow requester files on a request created in the same action. Fail the submit if a required document can't be stored. |
| D-06 | P2 | **FYI recipients and escalation managers get deep links they can't open.** NOTIFY recipients are only in the event payload. `isParticipant` / `visibleToSql` don't include them, nor the approver's manager who receives an escalation, so both get 404 (IT admins can open it). | `server/approvals/messages.ts:192-208`; `server/jobs/sla.ts:172-195`; `approvals.repository.ts:630-643`; `lib/db/repositories/visibility.ts:10-20`. | A broken "for your information" and broken escalation, both core north-star promises. | Persist FYI and escalation recipients (e.g. a `request_watchers` table, or reuse collaborators with a source column) and add them to both visibility rules. |
| D-07 | P2 | **Resubmit bypasses readiness policies.** The budget BLOCK policy, the unique-identifier rule and duplicate policies are evaluated only at first submit. A resubmit re-parses the form, the DoA amount and the approver fields only. The budget commitment is updated after the transaction, with errors swallowed. | `service.ts:646-667`, `669-679`; compare `readiness.ts:161-228`. | Over-budget or duplicate identifiers can enter through "send back". | Run `assessReadiness` (lock: true, excluding self) inside the resubmit `mutate`; update `request_submission_checks` in the same transaction. |
| D-08 | P2 | **Lifecycle actions are missing from `audit_logs`.** `afterChange` audits decisions, unblock, info, recall and reassign only. Submit, withdraw, **Super Admin reopen**, hold, resume and resubmit appear only on the request timeline. | `service.ts:589-624`; grep finds no `REQUEST_REOPENED` / `REQUEST_WITHDRAWN` audit action. | The central audit export misses privileged actions. Register M4-09 and BC-02 are yet to do. | Add audit rows (with workflow version and before/after) for every engine event that changes the status. |
| D-09 | P2 | **Approval expiry is not enforced.** It only drives a badge and one notice. The status stays APPROVED, and amendments and follow-ups ignore expiry. | `server/approvals/expiry.ts:19-62`; `amendments.ts:85`; `consult.ts:180-186`. | Expired approvals still look valid in lists and exports. | Add an `EXPIRED` derived status or filter on lists and reports; block amend and follow-up when expired (or require a reason); send a second notice at expiry. |

#### Potential risks

| ID | Pri | Risk | Evidence | Note |
|---|---|---|---|---|
| R-01 | P3 | The whole directory snapshot (all users, roles, groups, delegations) loads inside every locked `mutate` and every submit. | `service.ts:491, 554`; `directory.repository.ts:21-62` | Lock hold time and latency grow with headcount. Cache per request, or load only the sources the definition uses. |
| R-02 | P3 | Side flows bypass the outbox: comments, mentions, consultations, delegation notices, SLA and due-soon notices are sent with direct `notify` after the work is done (and after the SLA claim). | `collab.ts:66,77,151`; `consult.ts:125,152`; `sla.ts:150-195` | Channel retries exist inside `notify`, but a crash between claim and notify loses the notice. |
| R-03 | P3 | Decisions have no idempotency key. A retry after a timeout returns "This approval is not waiting for you". | `engine.ts:419-420`; `actions.ts:164-188` | Correct state, confusing UX. Return "already decided by you" when `decidedBy === actor`. |
| R-04 | P3 | Consultation duplicates: a check-then-insert with no unique key and no transaction. Open consultations stay OPEN after the request closes. | `consult.ts:118-121`; `202610110900_v160.sql:29-44` | Add a unique key or locking; close them on finish. |
| R-05 | P3 | `addComment` inserts and audits outside a transaction. | `collab.ts:57-59` | A comment can exist without its audit row. |
| R-06 | P3 | Custom workflow code `CUSTOM_{id}_{ms}` can collide on near-simultaneous submits with different keys, giving DUPLICATE_CODE. | `service.ts:793` | Add random bytes. |
| R-07 | P3 | After a handover or pass-on, the previous approver loses access: `approval_tasks.approver_id` is overwritten. | `approvals.repository.ts:431-436`; `visibility.ts:13` | Possibly intended; `previousApprovers` sits in state_json only. |
| R-08 | P3 | Approver eligibility is not re-checked at run time for ROLE, GROUP, HOD and manager sources (only for delegates). | `engine.ts:79-122` vs `directory.repository.ts:87-88` | Still open from `docs/APPLICATION_CURRENT_STATE_AUDIT.md` §5. |
| R-09 | P3 | Co-approvers whose tasks close as NOT_REQUIRED (ANY_ONE met) aren't told. | `messages.ts` (no TASKS_CLOSED case) | Their queue just empties. |
| R-10 | P3 | Validation in server actions is hand-written (regex, length) rather than zod schemas. | `actions.ts:42-52, 155-206`; `collab-actions.ts` | Consistent today but easy to drift. A shared zod schema per action would help. |

---

## Part 3 — API endpoint inventory

### 4. API endpoint inventory (all 25 `app/api/**/route.ts`)

| Route | Method | Purpose | Auth | Role / record check | Validation | Rate limit | Idempotency / notes |
|---|---|---|---|---|---|---|---|
| `/api/auth/password/start` | POST | Password check, then send OTP | Public | — | zod | SIGNIN (IP 20, login 10 / 15 min) | Each call issues a new challenge (OTP cooldown 30 s) |
| `/api/auth/password/verify` | POST | OTP → session | Public | Challenge bound to user | zod | CODE (IP 30 / 15 min) | Single-use challenge (conditional UPDATE) |
| `/api/auth/password/resend` | POST | New OTP | Public | Open LOGIN challenge | zod | CODE | Old challenge consumed |
| `/api/auth/google` | POST | Google sign-in | Public | Pre-created account | zod | GOOGLE (IP 30) | — |
| `/api/auth/set-password/start` | POST | Link + new password → OTP | Public + link token | Token user | zod + policy | SET_PASSWORD (IP 10) | — |
| `/api/auth/set-password/complete` | POST | Verify OTP, set password, sign in | Public + token + challenge | challenge.userId === link user | zod | CODE | Token single-use in a transaction |
| `/api/auth/forgot/start` | POST | Start reset (same answer either way) | Public | — | zod | FORGOT (IP 10 / 15 min, login 5 / h) | OTP deferred |
| `/api/auth/forgot/complete` | POST | OTP + new password | Public + challenge | Challenge user | zod | CODE | Challenge single-use |
| `/api/auth/not-me` | POST | Lock account, end sessions | Signed purpose token | Token uid | zod | None | One-time (`used_security_links`) |
| `/api/auth/logout` | POST | Revoke current session | Optional session | — | — | None | Safe to repeat |
| `/api/auth/keep-alive` | POST | Count as activity | Session | Own | — | None | — |
| `/api/auth/status` | GET | Signed-in? Idle seconds left | Session (peek) | Own | — | None | Doesn't count as activity |
| `/api/me/quick` | GET | Command-palette search / recent | `requireApiArea("users")` + page `users.search` | `visibleToSql` | q ≤ 100 chars | None | — |
| `/api/me/sign-out-everywhere` | POST | Revoke all own sessions | `requireApiArea("users",{change:true})` | Own | — | None | Safe to repeat |
| `/api/attachments/[id]` | GET | Download / preview a file | `requireApiArea("users")` + page `users.request` | `canSeeRequest` (denial audited) | `^\d+$` | None | Path containment, sandbox CSP |
| `/api/requests/[id]/summary.pdf` | GET | PDF summary | `requireApiArea("users")` | `loadRequestView` | `^\d+$` | **None** (CPU-heavy) | Audited |
| `/api/reports/[key]` | GET | Report export CSV/XLSX/PDF | `requireApiArea("users")` + `canUseReports` (IT/SA) + `canExport` | Scope re-resolved | Key via catalogue; format allowlist | 20/min/user | Audited |
| `/api/exports/[id]` | GET | Background export download | users + `canUseReports` + `canExport` | `user_id = ?` | `^\d{1,10}$` | None | Audited; file-name regex |
| `/api/admin/dashboards/[slug]` | GET | Dashboard CSV | `requireApiArea("admin")` | — | slug resolved by `dashboardCsv` (null → 404) | None | — |
| `/api/admin/import/[kind]` | GET | Import template / current data CSV | `requireApiArea("admin")` | — | `isImportKind`, type ∈ {template, data} | None | Data download audited |
| `/api/admin/workflows/[id]/export` | GET | Approval-type config JSON | `requireApiArea("admin")` | Inside `exportApprovalType` | `^\d{1,10}$` | None | Returns `error.message` to the client on failure (P3) |
| `/api/superadmin/audit` | GET | Audit-log CSV (≤ 50k rows) | `requireApiArea("superadmin")` | — | Date regex, action `^[A-Z_]{1,80}$` | None | Export audited |
| `/api/jobs/run` | POST | Cron automation runner | `x-job-secret` (constant-time) | — | — | None (secret) | Per-step job records; heartbeat |
| `/api/webhooks/ceoitbox` | POST | WhatsApp delivery receipts | `x-webhook-secret` (constant-time, encrypted setting) | — | ≤ 256 KB, JSON | None | Status updates are naturally idempotent |
| `/api/health` | GET | Uptime probe | Public | — | — | None | Shows version + job-runner state; may trigger an SA alert (once a day) |

Middleware applies to every `/api/*` route except `/api/jobs/` and `/api/webhooks/`: state-changing calls with `Sec-Fetch-Site` cross-site or same-site are refused (`middleware.ts:60-66`). Non-public routes without a session cookie get a 404 (`middleware.ts:71-74`).

---

## Part 4 — External integrations

### 2. Integration status

| Integration | Real / stub | Config | Auth | Error handling | Tests |
|---|---|---|---|---|---|
| CEOITBox WhatsApp API (send, create template, sync, list) | **Real** HTTPS (`server/integrations/ceoitbox/client.ts`) | Super Admin settings: base URL (https enforced), phone id, API key (**encrypted**, `definitions.ts:66`), timeout (default 10 s), rate limit per minute (default 60), retry limit (default 3) | `x-api-key` header, plus `x-phone-id` | Abort timeout → `CEOITBOX_TIMEOUT`. Network/5xx → `REQUEST_FAILED` (retryable). 401 → `UNAUTHORIZED`. 4xx → `REJECTED`. 200-with-error → `BLOCKED`. Provider body redacted in logs. | Unit tests with fake fetch (`tests/jobs/retry-rate-limit.test.ts`, `tests/notifications/template-authoring.test.ts`); integration with a test key (`tests/integration/session8.int.test.ts`). No live calls. |
| CEOITBox delivery-receipt webhook | **Real** | `whatsapp.webhook_secret` (encrypted, at least 24 characters) | Static header secret, constant-time compare (not HMAC) | 404 on a bad secret; 413/400/500 otherwise. Never moves a status backwards. Ignores "failed". | `tests/e2e/v140-api.spec.ts`, `tests/notifications/receipts.test.ts` |
| Resend email | **Real** HTTPS | `email.resend_api_key` (**encrypted**), from address, from name, reply-to | Bearer token | 15 s abort. Any non-2xx → `EMAIL_REQUEST_FAILED` (retryable). Missing key → `EMAIL_NOT_CONFIGURED`. | `tests/jobs/retry-rate-limit.test.ts`, `tests/qa/qa-fixes.test.ts` |
| SMTP | **Not implemented** (GoDaddy blocks SMTP, D-037) | — | — | — | — |
| Firebase Admin (Google sign-in) | **Real** | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` env vars (`.env.example`, values redacted) | Service account | Throws if not configured | Indirect (`tests/helpers/user-fixtures.ts`) |
| cPanel cron → `/api/jobs/run` | **Real** (external) | `JOB_RUNNER_SECRET` env | `x-job-secret` | Per-step isolation; Super Admin alert | `tests/e2e/job-runner.spec.ts`, `tests/integration/reliability.int.test.ts` |
| Cloudflare origin lock | **Real**, optional | `ORIGIN_SECRET` env | `x-ars-origin` header | 403 | `tests/origin/origin-lock.spec.ts` |

Notes:
- Provider keys are stored encrypted with `ENCRYPTION_KEY` (`.env.example` header comment).
- The `.env.example` file was read with values redacted. No other `.env*` file was opened.

---

## Part 5 — Cross-check of existing documentation

### Cross-check of the docs

- **`docs/APPLICATION_CURRENT_STATE_AUDIT.md`** is dated 9 Oct 2026 and covers v1.3.4. Its §5 and §6 "not implemented" items are superseded by its own v1.4.0 update table (lines 35-59):
  - WORK/NOTIFY nodes (`engine.ts:238-254`), BLOCKED recovery (`engine.ts:684-744`), multi-level escalation (`sla.ts:21-47`), R-04 delete via engine (`delete.ts`), R-05..R-09 and queue paging all exist in code now.
  - **Still true:** runtime approver-eligibility for ROLE sources (R-08 above).
  - The doc doesn't mention D-01 to D-09.
- **`docs/KNOWN_ISSUES.md`** lists only UI and ops items (V6-D01..D07, OPS-01). **None of D-01..D-09 is recorded there**, so they are new findings.
- **`docs/IMPLEMENTATION_STATUS_REGISTER.md`** totals 1857 rows: 1326 Implemented, 465 Yet to do, 66 Not feasible (lines 1-8). The yet-to-do rows in this scope fall into these themes:
  1. **Governance:**
     - M1.1-25: workflow integrity, separation of duties, immutable history;
     - M4-09 / BC-02: before/after audit values;
     - BC-06: audit integrity across resubmit, recall, delegation and migration;
     - BB-02: independent permission tests for requester, approver, delegate, consultant, watcher and admin;
     - BJ-12: invalid transitions and recovery.
  2. **Operational lists:** due today or within 7 days; delegated to me / by me; reassigned; awaiting info; awaiting consultation; open amendments; requests missing documents (A5.1-*, A5.2-*, A10.2-03, A10.2-09).
  3. **SLA analytics and indicators:** amber/red SLA (AConditional-02/03); escalation reports (A10.3-15); requester response overdue (A15.1-06); escalation rule alerts (A15.2-08).
  4. **Amount and budget analytics:** A6.5-*.
  5. **Reliability:** FN2-4.1-04 / -08 (inconsistent workflow/assignment states, incomplete transitions); BD-01 monitoring.
  6. **Performance:** A18.5-02 (N+1); A21-06 (no degradation of approval transactions). R-01 is relevant here.
- The register marks "BP1-02/03/04/05/07/08" (stuck detection, duplicates, autofill, amendment, migration, replay) Yet to do in the Part B section, while M1.1-14/15/16/17/19/20 mark the same features Implemented. That is an **internal inconsistency in the register**.
