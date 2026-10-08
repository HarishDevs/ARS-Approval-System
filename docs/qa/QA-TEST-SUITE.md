# ARS Approval Platform: QA Test Suite

Prepared 8 Oct 2026 for build session 7, commit `a3e5d51`, against the owner's master QA prompt. Updated the same day after the S8-06 defect fixes.
The suite has **600 executable test cases**.

These cases are written for **this application**: its real statuses, roles, screens, Server Actions, MySQL tables, DoA matrix, CEOITBox WhatsApp and Resend email. They are not for a generic system.
- Where the master prompt asks about a feature the platform doesn't have (drafts, admin cancellation, expiry, search, an auditor role), the case **checks the current behaviour** and the gap is listed in §42.
- Behaviour was read from the code: `server/engine`, `server/approvals`, `lib/db/repositories`, `app/**/actions.ts`.

Each test case gives its **Preconditions** as fixture codes (FX-…, WF-…), defined in §7.

The file is generated from `docs/qa/source/` (one compact line per case). To add or change cases, edit those files and run `python docs/qa/source/gen.py docs/qa/QA-TEST-SUITE.md`; the IDs, suites, RTM and counts are recomputed. Before a run, every case's **Status** is `Not run`.

## 1. Application Overview
| Item | Detail |
|---|---|
| Purpose | Replaces 104 Asana approval projects. North star: **multi-level approvals in any custom manner** |
| URL | `approvals.arssteels.net`, one Next.js 15 app on GoDaddy Node.js hosting with MySQL 8 |
| Areas | `/users`: everyone (raise, queue, my requests, custom approvals, delegation, notifications)<br>`/admin`: IT Admin (workflows, DoA view, users, departments, groups, calendar, insights)<br>`/superadmin`: Super Admin only (providers, WhatsApp templates, demo data, deliveries, audit log) |
| Sign-in | Google (Firebase), no OTP. Or User ID + password + WhatsApp OTP. 12-hour server-side session; lockout after 5 wrong passwords for 15 minutes; new-device alert; "This wasn't me" |
| Engine | Node graph: START, APPROVAL, SPLIT, JOIN, CONDITION, END. Completion rules ALL, ANY_ONE and ANY_N. Skip conditions (AND/OR). Approver sources: people, role, group, requester's manager, manager's manager, the requester's department HOD, a named department's HOD, a person field on the form |
| Builder | Levels: one step, parallel steps, a choice (if/otherwise), and a **DoA matrix** per approval type: amount limits × levels with ticks |
| Request lifecycle | Submitted (`IN_PROGRESS`) → `APPROVED` or `REJECTED`. From `IN_PROGRESS` it can also go to `ON_HOLD` (and back), to `CHANGES_REQUIRED` (resubmit starts a new round), or to `CANCELLED` (withdrawn by the requester). The Super Admin can reopen an `APPROVED` request |
| Persistence | Each action is one transaction: lock the request row (`SELECT … FOR UPDATE`), then an optimistic `state_version` check, task sync, append-only `approval_events`, and append-only `audit_logs`. Notifications go out after the commit |
| Notifications | In-app bell, email (Resend), WhatsApp (CEOITBox, Meta-approved templates). Each delivery is logged; temporary failures are retried by the job runner |
| Jobs | `POST /api/jobs/run` with `x-job-secret`, run by cPanel cron every 5 minutes: retries, SLA reminders and escalations |
| Interfaces | Server Actions (POST to page URLs). Route handlers: `/api/auth/{google,password,forgot,set-password,logout,not-me}`, `/api/me/sign-out-everywhere`, `/api/attachments/[id]`, `/api/jobs/run`. Outbound: CEOITBox `/api/v1/whatsapp/sendMessage`, `/messageTemplate/create`, `/getTemplates`, `/syncTemplatesFromMeta`; Resend |

## 2. Assumptions
| # | Assumption | Basis |
|---|---|---|
| A-01 | No "draft request" exists: a request comes into being only when submitted. Draft test cases check that nothing half-made is stored | Code: `submitRequest` creates the request only on submit (§42 Q-QA-01) |
| A-02 | "Cancel" means **withdraw by the requester**. No admin cancel or close exists | D-066 (§42 Q-QA-02) |
| A-03 | Requests don't expire. An unanswered approval gets reminders, then escalation, and stays open | D-067 / F-31 (§42 Q-QA-03) |
| A-04 | Rejection is final. A rejected request can't be resubmitted; the requester raises a new one. "Ask for changes" is the route back | Engine (§42 Q-QA-04) |
| A-05 | The amount DoA thresholds in the prompt (₹10,000 / ₹50,000 / ₹1,00,000) are replaced by the platform's DoA example: **₹1,00,000 / ₹10,00,000 / ₹25,00,000** (demo Purchase & SCM). Every DoA boundary test applies equally to any matrix IT defines | D-074 / D-075 |
| A-06 | The roles are USER, IT_ADMIN and SUPER_ADMIN. "Manager", "HOD" and "Finance" are positions in the directory (reporting line, department HOD, groups), not roles. There's no Auditor or read-only role | D-024 / D-039 (§42 Q-QA-05) |
| A-07 | The public API is the Server Actions and route handlers listed in §1. There's no separate REST API, so API tests replay the browser's POSTs (Next-Action header) and call the route handlers directly | Code |
| A-08 | Test environments are the local Docker MySQL, `ars_approvals_test` (automated) and a staging copy on GoDaddy. CEOITBox tests use a **dedicated test key** and the tester's own number | D-076 |
| A-09 | Performance targets come from the scale of the Asana use (around 1,000 requests a month, about 300 staff). They are proposals until the owner confirms them | §42 Q-QA-08 |

## 3. Scope
**In scope:**
- sign-in and sessions;
- role areas;
- workflow authoring, versioning and test mode;
- the DoA matrix;
- predefined and custom requests;
- every decision (approve, reject, ask for changes, hold, resume);
- resubmit, withdraw and reopen;
- delegation, handover, SLA reminders and escalation, and the working calendar;
- comments and attachments;
- notifications on all three channels, and the WhatsApp template creator;
- audit and event logs, Insights, demo data, security headers and CSP, rate limits, the job runner;
- data integrity and concurrency.

**Out of scope:**
- Meta's own template review times;
- CEOITBox and Resend platform availability, which are only simulated;
- GoDaddy infrastructure;
- the Power BI website.

## 4. Roles & Permissions
| Capability | USER | Approver (position) | Delegate (active) | IT_ADMIN | SUPER_ADMIN | Demo person (via Try as) |
|---|---|---|---|---|---|---|
| Raise predefined or custom request | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See own requests | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See a request they're not part of | ✗ (404, audited) | Only if they have or had a task on it | Only while delegate for a pending task | ✓ all | ✓ all | Same as USER |
| Approve, reject, ask for changes, hold | ✗ | Own pending task, not own request | For the delegator, while active | ✗ unless also the approver | ✗ unless also the approver | As the demo person |
| Resume a held request | ✗ | The approver at the held level | ✓ for the delegator | ✓ | ✓ | — |
| Withdraw | Requester only, while open | ✗ | ✗ | ✗ | ✗ | Requester only |
| Reopen an approved request | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Comment or attach | Anyone who can see the request (attach only while open) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin` (workflows, users, groups, departments, calendar, DoA, insights) | ✗ 404 | ✗ | ✗ | ✓ | ✓ | ✗ (roles forced to USER) |
| Grant or remove SUPER_ADMIN; edit a Super Admin or break-glass account | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `/superadmin` (providers, templates, demo, deliveries, audit) | ✗ 404 | ✗ | ✗ | ✗ 404 | ✓ | ✗ |
| Hand over pending approvals of a leaver | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |

## 5. Workflow Diagram (text)
```
                       ┌──────────── Withdraw (requester) ─────────────┐
                       │                                               ▼
Raise ─► IN_PROGRESS ─► Level 1 ─► Level 2 ─► … ─► Level n ─► APPROVED ─► (Super Admin) Reopen ─► IN_PROGRESS (round+1)
           │    ▲          │ │ │
           │    │          │ │ └─ Reject (reason) ───────────────► REJECTED (final)
           │    │          │ └─── Ask for changes (reason) ──────► CHANGES_REQUIRED ─► Resubmit (requester, round+1) ─► IN_PROGRESS
           │    └─ Resume ─┴───── Hold (optional reason) ────────► ON_HOLD
           └─► CANCELLED ("Withdrawn")
Level kinds:
- STEP: one or more approvers, rule ALL / ANY_ONE / ANY_N, optional skip-when.
- PARALLEL: branches + join ALL / ANY_ONE / ANY_N.
- CHOICE: if field cond → path A, otherwise → path B.
- DOA: amount bands × levels; unticked bands are skipped.
No eligible approver → node BLOCKED, IT told (never silently approved), unless the step says "skip".
```

## 6. Status Transition Matrix
Rows are the **from** state; columns are the **to** state. ✓ means allowed, with the trigger and who may do it. ✗ means it must be refused; the request stays unchanged and no event is written.

| From \ To | IN_PROGRESS | ON_HOLD | CHANGES_REQUIRED | APPROVED | REJECTED | CANCELLED |
|---|---|---|---|---|---|---|
| (new) | ✓ submit (any active user) | ✗ | ✗ | ✗ | ✗ | ✗ |
| IN_PROGRESS | ✓ approve a non-final level | ✓ hold (current approver) | ✓ ask for changes (current approver, reason) | ✓ final level complete | ✓ reject (current approver, reason) | ✓ withdraw (requester) |
| ON_HOLD | ✓ resume (approver at the held level, IT, SA) | ✗ | ✗ | ✗ | ✗ | ✓ withdraw |
| CHANGES_REQUIRED | ✓ resubmit (requester, round+1) | ✗ | ✗ | ✗ | ✗ | ✓ withdraw |
| APPROVED | ✓ reopen (SUPER_ADMIN, reason, round+1) | ✗ | ✗ | ✗ | ✗ | ✗ (no cancel after approval) |
| REJECTED | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (final) |
| CANCELLED | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (final) |

**The invalid transitions** the master prompt names, and the tests that cover them:
- Cancelled → Approved: APP cases in §11 and §25.
- Rejected → Approved: §11.
- Cancelled → Rejected: §11.
- Approved → Cancelled: §10.
- Completed → Pending: covered by reopen, which is Super Admin only, in §10.

## 7. Test Strategy
**Levels:**
- Unit (Vitest, pure engine and rules);
- Integration (Vitest on a recreated MySQL `ars_approvals_test`);
- E2E (Playwright on a production build on port 3100);
- Manual exploratory, for UX, mobile, accessibility and live providers;
- Non-functional: k6 or Artillery for performance, OWASP ZAP for security.

**Rules applied to every case** (master prompt §43):
- A green UI is never enough: check `approval_requests.status` / `state_version`, the `approval_tasks` rows, `approval_events`, `audit_logs`, `notifications` and `notification_deliveries`.
- Authorisation is tested by direct POST as well as through the UI.

**Fixtures used in the Preconditions column:**
| Code | Definition |
|---|---|
| FX-ENV | App running with a fresh migrated DB; the Super Admin `itadmin` exists; the job runner can be triggered by hand (`POST /api/jobs/run` with the secret) |
| FX-DEMO | /superadmin/demo → Load demo data has been run. 20 demo people (`demo.*`), 7 departments, 8 groups and 12 approval types exist |
| FX-PEOPLE | **REQ** = demo.checker1 (Divya Sharma, Finance, manager demo.finl2a). **MGR** = demo.finl2a (Deepa Menon). **HOD** = demo.finhead (Lakshmi Iyer, HOD of Finance). **FIN** = demo.finctrl (group FIN_CONTROLLER). **MD** = demo.md. **ED** = demo.ed. **OUT** = demo.itexec (no relation). **IT** = qa.it (IT_ADMIN only). **SA** = itadmin (SUPER_ADMIN) |
| WF-SEQ | Predefined "QA Sequential" (prefix QAS): MGR (requester's manager) → HOD (requester's department HOD) → FIN (group FIN_CONTROLLER) → MD (group MD_OFFICE). Form: Amount (₹) NUMBER required; Details LONG_TEXT required. Published v1 |
| WF-PAR | "QA Parallel" (QAP): one PARALLEL level. Branches: Sales head (HOD SALES), Plant head (HOD PLANT), Finance controller (group). Join ALL. Then MD. Variants WF-PAR-ANY (join ANY_ONE) and WF-PAR-2 (ANY_N n=2) |
| WF-GRP | "QA Group" (QAG): one step with group FIN_CHECKERS (demo.checker1, demo.checker2) rule ANY_ONE. Variant WF-GRP-ALL (rule ALL) |
| WF-DOA | Demo **Purchase & SCM Approval** (prefix SCM). DoA matrix on `amount`, limits ₹1,00,000 / ₹10,00,000 / ₹25,00,000. SCM head ticks all bands; Finance head from band 2; ED from band 3; MD in band 4 only. Requester **BUY** = demo.buyer |
| WF-CHO | Demo **Finance Internal**: Level 1 checker (group); a choice on Nature IN {Payment, Vendor advance, Bank transfer} → Level 2; then Finance head |
| WF-SLA | WF-SEQ with "Respond within 2 hours" on the MGR level. Working days Mon–Sat, with a holiday on a known date |
| SESS(x) | A signed-in browser session as person x. Use Try as for demo people, or `node scripts/dev/dev-session.js <login_id>` locally |
| POST(action) | Replay of the Server Action the screen sends: copy the request from DevTools and edit the FormData. "Route" means a plain `fetch` to the route handler |
| DB | Read-only SQL on the environment's database |

**Entry criteria:** the build is green in CI (lint, typecheck, unit, integration, e2e); FX-ENV is ready.

**Exit criteria:**
- every P0 case passes;
- at least 98% of P1 cases pass, and no open Critical or High defect;
- the RTM has no "Missing" row for a built requirement.


## 8. Functional Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-001 | Raise | Raise a predefined request with valid data | FX-DEMO, WF-SEQ, SESS(REQ) | 1) /users/new 2) Pick QA Sequential 3) Title, Amount, Details 4) Submit request | Title "Laptop for new engineer"; Amount 85,000; Details "Replacement" | Redirect to /users/requests/{id}?submitted=1; status pill "In progress"; banner "Submitted as QAS-2026-NNNNNN"; DB approval_requests 1 row status IN_PROGRESS round 1; 1 PENDING task for MGR | P0 | Critical | Functional | Yes | Not run |
| APP-002 | Raise | Request number format and sequence | WF-SEQ, SESS(REQ) | 1) Raise 2 requests one after the other | Valid data | Numbers QAS-<year>-000001 then -000002; uq_approval_requests_no prevents duplicates | P1 | High | Functional | Yes | Not run |
| APP-003 | Raise | Request page shows the level map from the start | WF-SEQ, request just raised | 1) Open the request | — | Levels MGR (Active, Deepa Menon), HOD, FIN, MD (Waiting) in order | P1 | High | Functional | Yes | Not run |
| APP-004 | Raise | Requester sees the request under My requests | WF-SEQ, request raised | 1) /users | — | Row with number, title, status In progress, current level | P1 | High | Functional | Yes | Not run |
| APP-005 | Raise | Approver sees the task in the queue | WF-SEQ, request raised | 1) SESS(MGR) 2) /users/queue | — | Request listed with title link; nobody else (HOD, FIN) has it yet | P0 | Critical | Functional | Yes | Not run |
| APP-006 | Raise | Raise a DoA request in band 1 | FX-DEMO, WF-DOA, SESS(BUY) | 1) Raise Purchase & SCM with ₹50,000 | item, vendor, budgeted Yes, details | Only SCM head task created; map shows Finance head, ED, MD "Not needed at this amount (DoA)" | P0 | Critical | Functional | Yes | Not run |
| APP-007 | Raise | Raise with a person field approver | Workflow with PERSON field "Approver" + step FORM_FIELD_USER | 1) Pick a person in the field 2) Submit | Person = demo.ed | Task created for demo.ed only | P1 | High | Functional | Yes | Not run |
| APP-008 | Raise | Raise a custom approval with two sequential levels | FX-DEMO, SESS(REQ) | 1) /users/custom 2) Title, details 3) Level 1 People = MD; add Level 2 People = ED 4) Submit | — | Request CUS-…; MD task first, ED after MD approves | P1 | High | Functional | Yes | Not run |
| APP-009 | Raise | Custom approval with parallel steps | SESS(REQ) | 1) Custom 2) Add parallel steps: HOD + FIN, join ALL | — | Two PENDING tasks at once | P1 | High | Functional | Yes | Not run |
| APP-010 | Approve | Approve the only pending task at level 1 | Request at MGR, SESS(MGR) | 1) Open request 2) Approve | No comment | Message "Approved."; MGR task APPROVED, decided_by = MGR; HOD task PENDING; timeline "Approved by Deepa Menon at …"; event TASK_DECIDED | P0 | Critical | Functional | Yes | Not run |
| APP-011 | Approve | Approve with a comment | Request at HOD, SESS(HOD) | 1) Type comment 2) Approve | "OK within budget" | Comment stored on the task and shown in the map under the person | P1 | High | Functional | Yes | Not run |
| APP-012 | Approve | Full sequential approval completes the request | WF-SEQ request | 1) MGR, HOD, FIN, MD approve in turn | ₹85,000 | Status APPROVED; closed_at set; requester notified (REQUEST_APPROVED); event INSTANCE_APPROVED | P0 | Critical | Functional | Yes | Not run |
| APP-013 | Reject | Reject with a reason | Request at MGR, SESS(MGR) | 1) Comment 2) Reject | "Not budgeted" | Message "Rejected. The requester has been told."; status REJECTED; other tasks never created; requester gets REQUEST_REJECTED with the reason | P0 | Critical | Functional | Yes | Not run |
| APP-014 | Changes | Ask for changes with a reason | Request at HOD | 1) Comment 2) Ask for changes | "Attach two quotes" | Status CHANGES_REQUIRED; banner "Changes asked: Attach two quotes" for the requester; requester notified | P0 | Critical | Functional | Yes | Not run |
| APP-015 | Resubmit | Requester edits and resubmits | Request CHANGES_REQUIRED, SESS(REQ) | 1) Change Amount 2) Resubmit | 82,000 | Message "Resubmitted. The approvers have been told."; round 2; timeline "Resubmitted (round 2)"; task re-created at the level that asked (default policy) | P0 | Critical | Functional | Yes | Not run |
| APP-016 | Hold | Put on hold | Request at FIN, SESS(FIN) | 1) Optional reason 2) Hold | "Awaiting budget review" | Message "Put on hold."; status ON_HOLD; banner "On hold: …"; requester notified REQUEST_ON_HOLD | P1 | High | Functional | Yes | Not run |
| APP-017 | Hold | Resume a held request | ON_HOLD at FIN, SESS(FIN) | 1) Resume | — | Message "Resumed."; status IN_PROGRESS; FIN task PENDING again | P1 | High | Functional | Yes | Not run |
| APP-018 | Withdraw | Requester withdraws an open request | Request at HOD, SESS(REQ) | 1) Withdraw 2) Yes, continue | Reason "Bought elsewhere" | Status CANCELLED shown "Withdrawn"; pending tasks CANCELLED; approvers notified REQUEST_WITHDRAWN; timeline "Withdrawn by …: Bought elsewhere" | P0 | Critical | Functional | Yes | Not run |
| APP-019 | Reopen | Super Admin reopens an approved request | APPROVED request, SESS(SA) | 1) Reopen 2) Reason 3) Yes, continue | "Vendor price changed" | Status IN_PROGRESS; round+1; first level tasks re-created; requester notified REQUEST_REOPENED; earlier decisions still in timeline | P1 | High | Functional | Yes | Not run |
| APP-020 | View | View a request as requester | Any request, SESS(REQ) | 1) Open /users/requests/{id} | — | Title, number, workflow, requester, status, level map, details, attachments, discussion, timeline shown | P1 | High | Functional | Yes | Not run |
| APP-021 | View | Approval history = timeline in order | Request with 3 decisions | 1) Open request | — | Timeline entries in time order with names and India time; matches approval_events order by id | P1 | High | Functional | Yes | Not run |
| APP-022 | View | Status pill matches DB for every status | One request in each status | 1) Open each | — | Pill text: In progress, On hold, Changes required, Approved, Rejected, Withdrawn = DB status | P1 | High | Functional | Yes | Not run |
| APP-023 | Comment | Post a comment | Request open, SESS(MGR) | 1) Discussion 2) Type 3) Post comment | "Please share the quote" | Comment appears with name and time; requester and other task holders notified REQUEST_COMMENT; audit REQUEST_COMMENTED | P2 | Medium | Functional | Yes | Not run |
| APP-024 | Comment | Comment on a closed request | APPROVED request, SESS(REQ) | 1) Post comment | "Thanks" | Allowed (discussion stays open); no status change | P3 | Low | Functional | Yes | Not run |
| APP-025 | Attach | Attach a file when raising | WF-SEQ, SESS(REQ) | 1) Raise with Attachments = quote.pdf | Real PDF 200 KB | File listed under Attachments with size, uploader, time; timeline "Divya Sharma (demo) attached quote.pdf" | P1 | High | Functional | Yes | Not run |
| APP-026 | Attach | Download an attachment | Request with quote.pdf, SESS(MGR) | 1) Click the file name | — | HTTP 200; Content-Disposition attachment; bytes identical (sha256 matches request_attachments.sha256) | P1 | High | Functional | Yes | Not run |
| APP-027 | Delegation | Create an out-of-office delegation | SESS(MGR) | 1) /users/delegation 2) Delegate = demo.finl2b, dates today–+3 days 3) Save | — | Delegation listed active; delegate and delegator notified | P1 | High | Functional | Yes | Not run |
| APP-028 | Delegation | Delegate approves for the delegator | Active delegation MGR→finl2b; request at MGR | 1) SESS(finl2b) 2) Open request 3) Approve | — | Task APPROVED, decided_by = finl2b, on_behalf_of = MGR; timeline "Approved by Vikram Shetty for Deepa Menon" | P0 | Critical | Functional | Yes | Not run |
| APP-029 | Delegation | End a delegation early | Active delegation | 1) Stop 2) Yes, continue | — | Delegation ended_at set; delegate can no longer see or act | P2 | Medium | Functional | Yes | Not run |
| APP-030 | Handover | IT hands over a leaver's pending approvals | MGR has 2 pending tasks, SESS(IT) | 1) Admin → Users → MGR 2) Handover to finl2b 3) Yes, continue | — | Both tasks re-assigned (TASK_REASSIGNED); finl2b notified "Approval handed to you"; MGR tasks no longer pending | P1 | High | Functional | Yes | Not run |
| APP-031 | Notifications | Bell shows unread count and list | Approver with a new task | 1) Look at bell 2) Open /users/notifications 3) Mark all read | — | Count = unread rows; list newest first with deep links; count 0 after mark all read | P2 | Medium | Functional | Yes | Not run |
| APP-032 | Admin | Create and publish a workflow with a DoA matrix | SESS(IT) | 1) /admin/workflows/new 2) Name, code, prefix 3) Edit limits and ticks 4) Create 5) Publish version 1 6) Yes, continue | Limits 2,00,000 / 10,00,000 | Draft v1 then Live; DoA view shows the bands | P0 | Critical | Functional | Yes | Not run |
| APP-033 | Admin | Test mode shows who would approve | Draft workflow, SESS(IT) | 1) Sample requester = REQ 2) Run test | Amount 15,00,000 | Stages listed with real names; skipped levels listed; nothing saved | P1 | High | Functional | Yes | Not run |
| APP-034 | Admin | Edit a live workflow → new draft version | Live v1, SESS(IT) | 1) Change a level 2) Save as new draft version 3) Publish | — | v2 Live, v1 Archived; existing requests keep v1 (workflow_version_id unchanged) | P0 | Critical | Functional | Yes | Not run |
| APP-035 | Admin | Create an approver group and add members | SESS(IT) | 1) /admin/groups 2) New group 3) Add members | "QA desk", 2 people | Group listed with members; usable in builder | P2 | Medium | Functional | Yes | Not run |
| APP-036 | Admin | Set a department HOD | SESS(IT) | 1) /admin/organisation 2) Edit department 3) HOD = person | — | Saved; new requests to that department HOD go to the new HOD | P1 | High | Functional | Yes | Not run |
| APP-037 | Admin | Create a user | SESS(IT) | 1) /admin/users/new 2) Fill 3) Save | Google sign-in user | User listed active; audit USER_CREATED with after values | P1 | High | Functional | Yes | Not run |
| APP-038 | Admin | Deactivate a user | User without pending tasks, SESS(IT) | 1) Deactivate | — | active = FALSE; sessions revoked; user can't sign in; row never deleted | P1 | High | Functional | Yes | Not run |
| APP-039 | Calendar | Add a holiday | SESS(IT) | 1) /admin/calendar 2) Add holiday | Tomorrow "QA holiday" | Listed; new tasks' due_at skip it | P2 | Medium | Functional | Yes | Not run |
| APP-040 | Insights | Insights page totals | Some requests in each status, SESS(IT) | 1) /admin/insights | — | Open, overdue, approved-30-days tiles equal SQL counts | P2 | Medium | Functional | Partial | Not run |
| APP-041 | DoA view | DoA view lists every live approval type | FX-DEMO, SESS(IT) | 1) /admin/doa | — | Purchase & SCM bands: ≤₹1,00,000 SCM head; ₹1,00,001–₹10,00,000 + Finance head; ₹10,00,001–₹25,00,000 + ED; above + MD | P1 | High | Functional | Yes | Not run |
| APP-042 | Superadmin | Load demo data twice | FX-ENV, SESS(SA) | 1) /superadmin/demo 2) Load demo data 3) Load again | — | First: "Loaded 20 people…12 approval types"; second: "Everything was already loaded; nothing changed." No duplicate rows | P2 | Medium | Functional | Yes | Not run |
| APP-043 | Superadmin | Try as a demo person | FX-DEMO, SESS(SA) | 1) Try as demo.buyer 2) Yes, continue | — | Lands on /users with banner "You're trying the app as Arjun Das (demo)…"; own SA session revoked; audit DEMO_TRY_AS | P2 | Medium | Functional | Yes | Not run |
| APP-044 | Superadmin | Create, submit and sync a WhatsApp template | Test CEOITBox key set, SESS(SA) | 1) /superadmin/templates 2) Open Approval needed 3) Save draft 4) Submit 5) Yes, continue 6) Sync status | — | Status Waiting for Meta → after approval "Live"; findActiveTemplate returns it | P1 | High | Functional | Partial | Not run |
| APP-045 | Superadmin | Send a template test to own number | Live template, SA has WhatsApp number | 1) Send a test to my WhatsApp | — | "Sent … to your WhatsApp."; message arrives with sample values; CEOITBox report shows userMessageId ars-test-… | P2 | Medium | Functional | No | Not run |
| APP-046 | Lists | Draft requests | WF-SEQ, SESS(REQ) | 1) Fill the form 2) Leave the page without submitting 3) Return | — | No request row exists (no draft feature, A-01); nothing in My requests | P3 | Low | Functional | Yes | Not run |
| APP-047 | Lists | Search, filter, sort, paginate My requests | > 200 requests by REQ | 1) /users | — | 25 per page with Newer/Older; search by number or title; status filter; Clear resets (D-QA-11 fixed) | P2 | Medium | Functional | Yes | Not run |
| APP-048 | Lists | Queue order | Approver with 3 tasks | 1) /users/queue | — | Oldest waiting first (or as designed); each row links to the request | P3 | Low | Functional | Yes | Not run |
| APP-049 | Close | Admin cancels or closes a request | Request IN_PROGRESS, SESS(IT) | 1) Look for a cancel or close action | — | None exists (A-02); IT can only hand over; record as gap R38 | P3 | Low | Functional | No | Not run |
| APP-050 | Auth | Sign in with Google | Active Google user, FX-ENV | 1) /login 2) Continue with Google 3) Pick account | — | Lands on /users; session row created; login_logs success; new-device email + WhatsApp alert on a new device | P0 | Critical | Functional | Partial | Not run |
| APP-051 | Auth | Sign in with User ID + password + WhatsApp OTP | Password user with WhatsApp number | 1) User ID + password 2) Enter code from WhatsApp | — | Signed in; OTP single-use; login_logs PASSWORD then OTP rows | P0 | Critical | Functional | Partial | Not run |
| APP-052 | Auth | Sign out | Signed in | 1) Sign out | — | Session revoked; back to /login; browser back can't reach pages | P1 | High | Functional | Yes | Not run |


## 9. Validation Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-053 | Title | Title empty | WF-SEQ, SESS(REQ) | 1) Leave Title empty 2) Submit request | "" | Field error "Give the request a title of 3 to 200 characters."; no request row; values typed in other fields kept | P1 | High | Validation | Yes | Not run |
| APP-054 | Title | Title 2 characters (below minimum) | WF-SEQ | 1) Submit | "ab" | Same title error; no row | P2 | Medium | Boundary | Yes | Not run |
| APP-055 | Title | Title exactly 3 characters | WF-SEQ | 1) Submit | "Pen" | Accepted | P2 | Medium | Boundary | Yes | Not run |
| APP-056 | Title | Title exactly 200 characters | WF-SEQ | 1) Submit | 200 × "a" | Accepted; stored in full | P2 | Medium | Boundary | Yes | Not run |
| APP-057 | Title | Title 201 characters | WF-SEQ | 1) Submit | 201 × "a" | Title error; no row | P2 | Medium | Boundary | Yes | Not run |
| APP-058 | Title | Title of spaces only | WF-SEQ | 1) Submit | "     " | Trimmed to empty → title error | P2 | Medium | Validation | Yes | Not run |
| APP-059 | Title | Leading and trailing spaces trimmed | WF-SEQ | 1) Submit | "  Pump  " | Stored as "Pump" | P3 | Low | Validation | Yes | Not run |
| APP-060 | Title | Unicode and emoji title | WF-SEQ | 1) Submit | "क्रेन मोटर — ₹ ✓ 😊" | Stored and shown exactly; email and WhatsApp carry it; no mojibake (utf8mb4) | P2 | Medium | Validation | Yes | Not run |
| APP-061 | Field | Required field empty | WF-SEQ | 1) Leave Details empty 2) Submit | — | "Details is required." under the field; no row | P1 | High | Validation | Yes | Not run |
| APP-062 | Field | Optional field empty | Workflow with optional TEXT | 1) Submit | — | Accepted; field shown as "—" or omitted on the request | P3 | Low | Validation | Yes | Not run |
| APP-063 | Number | Amount not a number | WF-SEQ | 1) Submit | "abc" | "Enter a number."; no row | P1 | High | Validation | Yes | Not run |
| APP-064 | Number | Indian grouping and ₹ accepted | WF-SEQ | 1) Submit | "₹ 12,50,000" | Stored as 1250000 | P1 | High | Validation | Yes | Not run |
| APP-065 | Number | Decimal amount | WF-SEQ | 1) Submit | "1500.75" | Stored 1500.75; displayed with Indian grouping | P2 | Medium | Validation | Yes | Not run |
| APP-066 | Number | Amount over the maximum | WF-SEQ | 1) Submit | "100000000000000" (1e14) | "That number is too large."; no row | P2 | Medium | Boundary | Yes | Not run |
| APP-067 | Number | Amount at the maximum | WF-SEQ | 1) Submit | 10,000,000,000,000 (1e13) | Accepted | P3 | Low | Boundary | Yes | Not run |
| APP-068 | Number | Zero amount | WF-DOA | 1) Submit | 0 | Accepted (₹0 or more is valid); band 1 (SCM head only). Whether ₹0 is allowed is Q-QA-12 | P2 | Medium | Boundary | Yes | Not run |
| APP-069 | Number | Negative amount | WF-DOA | 1) Submit | -50000 | Refused: "Enter 0 or more." (field minimum) or "Enter an amount of ₹0 or more." (DoA guard, even without a minimum); no row (D-QA-04 fixed) | P1 | High | Boundary | Yes | Not run |
| APP-070 | Number | Scientific notation | WF-SEQ | 1) Submit | "1e5" | Accepted as 100000 (Number parsing); confirm acceptable | P3 | Low | Validation | Yes | Not run |
| APP-071 | Date | Invalid date | Workflow with DATE field | 1) Submit | "2026-02-30" | "Enter a date as YYYY-MM-DD."; no row | P2 | Medium | Validation | Yes | Not run |
| APP-072 | Date | Past date | DATE field "Needed by" | 1) Submit | 2020-01-01 | Accepted (no min rule); record whether business needs a rule (Q-QA-06) | P3 | Low | Validation | Yes | Not run |
| APP-073 | Date | Leap day | DATE field | 1) Submit | 2028-02-29 | Accepted; 2027-02-29 rejected | P3 | Low | Boundary | Yes | Not run |
| APP-074 | Text | TEXT at 200 / 201 characters | TEXT field | 1) Submit twice | 200 then 201 chars | 200 accepted; 201 "Use 200 characters or fewer." | P3 | Low | Boundary | Yes | Not run |
| APP-075 | Text | LONG_TEXT at 4000 / 4001 | WF-SEQ Details | 1) Submit twice | 4000 then 4001 | 4000 accepted; 4001 "Use 4000 characters or fewer." | P3 | Low | Boundary | Yes | Not run |
| APP-076 | Choice | Choice value not in the list | WF-DOA "budgeted" | 1) POST with budgeted = "Maybe" | Tampered FormData | Refused with a field error; no row | P1 | High | Security | Yes | Not run |
| APP-077 | Person | Person field set to an inactive user | Workflow with PERSON field | 1) POST with the id of an inactive user | — | Field error (must be an active user); no row | P1 | High | Validation | Yes | Not run |
| APP-078 | Person | Person field set to a non-numeric id | PERSON field | 1) POST "abc" | — | Field error; no row | P2 | Medium | Validation | Yes | Not run |
| APP-079 | Comment | Reject comment of spaces only | Request at MGR | 1) Comment "   " 2) Reject | — | "A reason is required."; task still PENDING | P1 | High | Validation | Yes | Not run |
| APP-080 | Comment | Decision comment over 2000 characters | Request at MGR | 1) 2100-char comment 2) Approve | — | Refused: "Keep it under 2,000 characters (now 2,100)."; the box also stops at 2,000 (D-QA-05 fixed) | P3 | Low | Boundary | Yes | Not run |
| APP-081 | Comment | Discussion comment over 2000 | Request open | 1) Post 2001 chars | — | "Keep it under 2,000 characters."; nothing stored | P3 | Low | Boundary | Yes | Not run |
| APP-082 | Workflow | Prefix and code rules | SESS(IT) | 1) New workflow with prefix "P1" and code "bad code" | — | Prefix "Use 2 to 6 capital letters…"; code "Use 2 to 50 capital letters, numbers or _…"; nothing saved | P2 | Medium | Validation | Yes | Not run |
| APP-083 | Workflow | Duplicate workflow code | Existing PURCHASE_SCM_APPROVAL | 1) Create another with that code | — | "Another workflow already uses this code."; nothing saved | P2 | Medium | Validation | Yes | Not run |
| APP-084 | DoA | DoA limits not rising | SESS(IT), new workflow | 1) Limits 10,00,000 then 1,00,000 2) Create | — | "DoA limits must go up from left to right."; nothing saved | P1 | High | Boundary | Yes | Not run |
| APP-085 | DoA | A band with no ticked level | New workflow | 1) Untick every level in one band 2) Create | — | Red band header in the editor and save refused: "Nobody approves in the band …" | P1 | High | Validation | Yes | Not run |
| APP-086 | DoA | DoA amount field not required | New workflow | 1) Untick Required on Amount 2) Create | — | "Make "Amount (₹)" required: the DoA needs it to pick the approvers." | P1 | High | Validation | Yes | Not run |
| APP-087 | DoA | DoA field missing from the form | New workflow | 1) Remove the Amount field 2) Create | — | "The DoA reads "amount", which isn't on the form…" | P1 | High | Validation | Yes | Not run |
| APP-088 | Delegation | Delegation dates | SESS(MGR) | 1) End before start 2) End in the past 3) 91 days 4) Self as delegate | — | Messages: "The end date is before the start date." / "…in the past." / "Keep it to 90 days or fewer." / "You can't be your own delegate." | P2 | Medium | Validation | Yes | Not run |
| APP-089 | Template | Template wording rules | SESS(SA), template editor | 1) Start with {{title}} 2) End with {{link}} 3) Two side by side 4) {{amount}} | — | Each refused with the matching message; nothing saved | P2 | Medium | Validation | Yes | Not run |


## 10. Negative Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-090 | Raise | Raise on an unpublished (draft-only) workflow | Workflow with only a draft, SESS(REQ) | 1) POST submit with its workflowId | — | Refused ("not open for requests"); no row | P1 | High | Negative | Yes | Not run |
| APP-091 | Raise | Raise on an inactive workflow | Workflow marked inactive | 1) Open /users/new/{id} 2) POST submit | — | Not listed; POST refused; no row | P1 | High | Negative | Yes | Not run |
| APP-092 | Raise | Raise when no approver resolves | WF-SEQ; REQ's manager removed | 1) Submit | — | Request created; MGR node BLOCKED (never auto-approved); IT admins notified REQUEST_BLOCKED; timeline "is blocked: no eligible approver. IT has been told." | P0 | Critical | Negative | Yes | Not run |
| APP-093 | Raise | Raise when the only approver is the requester | Workflow whose step = PEOPLE [REQ] | 1) SESS(REQ) submit | — | Step BLOCKED (requester never approves own request) or skipped if the step says skip; never APPROVED by the requester | P0 | Critical | Security | Yes | Not run |
| APP-094 | Raise | Raise as an inactive user | User deactivated while signed in | 1) Submit | — | Session no longer valid (active re-read every request) → sign-in page; no row | P0 | Critical | Security | Yes | Not run |
| APP-095 | Approve | Approve a request already APPROVED | APPROVED request | 1) POST decide APPROVE with the old taskKey | — | Refused (task not pending); status unchanged; no new event | P0 | Critical | Negative | Yes | Not run |
| APP-096 | Approve | Approve a REJECTED request | REJECTED request | 1) POST decide APPROVE | — | Refused; status REJECTED; no new event or notification | P0 | Critical | Negative | Yes | Not run |
| APP-097 | Approve | Approve a withdrawn request | CANCELLED request | 1) POST decide APPROVE with the cancelled taskKey | — | Refused; status CANCELLED | P0 | Critical | Negative | Yes | Not run |
| APP-098 | Approve | Approve while ON_HOLD | ON_HOLD request | 1) Look for Approve 2) POST decide | — | No decision buttons while on hold; POST refused | P1 | High | Negative | Yes | Not run |
| APP-099 | Approve | Approve while CHANGES_REQUIRED | CHANGES_REQUIRED | 1) POST decide by the approver | — | Refused until resubmitted | P1 | High | Negative | Yes | Not run |
| APP-100 | Approve | Decide with an unknown decision value | Request at MGR | 1) POST decision = "MAYBE" | — | "Not found."; no change | P2 | Medium | Security | Yes | Not run |
| APP-101 | Approve | Decide with another person's taskKey | Request with HOD task, SESS(MGR) | 1) POST decide with HOD's taskKey | — | Refused (not the approver); task still PENDING | P0 | Critical | Security | Yes | Not run |
| APP-102 | Reject | Reject without reason (UI) | Request at MGR | 1) Reject with empty comment | — | "A reason is required."; nothing changed | P0 | Critical | Negative | Yes | Not run |
| APP-103 | Reject | Reject without reason (direct POST) | Request at MGR | 1) POST decide REJECT, comment "" | — | "Give a reason."; nothing changed | P0 | Critical | Security | Yes | Not run |
| APP-104 | Changes | Ask for changes without reason | Request at MGR | 1) POST REQUEST_CHANGES, comment "" | — | "Give a reason."; nothing changed | P1 | High | Negative | Yes | Not run |
| APP-105 | Resubmit | Resubmit by someone other than the requester | CHANGES_REQUIRED, SESS(MGR) | 1) POST resubmit | — | "Only the person who raised the request can resubmit it."; no change | P0 | Critical | Security | Yes | Not run |
| APP-106 | Resubmit | Resubmit a request that isn't CHANGES_REQUIRED | IN_PROGRESS | 1) POST resubmit | — | Refused; round unchanged | P1 | High | Negative | Yes | Not run |
| APP-107 | Resubmit | Resubmit a REJECTED request | REJECTED | 1) POST resubmit | — | Refused (rejected is final, A-04) | P1 | High | Negative | Yes | Not run |
| APP-108 | Edit | Edit fields while IN_PROGRESS | IN_PROGRESS, SESS(REQ) | 1) Look for an edit form 2) POST resubmit with new fields | — | No edit form; POST refused; form_data_json unchanged | P0 | Critical | Negative | Yes | Not run |
| APP-109 | Edit | Edit an APPROVED request | APPROVED | 1) POST resubmit | — | Refused; data unchanged | P0 | Critical | Negative | Yes | Not run |
| APP-110 | Withdraw | Withdraw by an approver | Request at MGR, SESS(MGR) | 1) POST withdraw | — | NOT_AUTHORISED; status unchanged | P0 | Critical | Security | Yes | Not run |
| APP-111 | Withdraw | Withdraw an APPROVED request | APPROVED | 1) POST withdraw | — | NOT_OPEN; still APPROVED (no cancel after approval) | P1 | High | Negative | Yes | Not run |
| APP-112 | Withdraw | Withdraw twice | CANCELLED | 1) POST withdraw again | — | NOT_OPEN; one WITHDRAWN event only | P1 | High | Negative | Yes | Not run |
| APP-113 | Reopen | Reopen by IT Admin | APPROVED, SESS(IT) | 1) POST reopen | — | Refused (Super Admin only); status APPROVED | P0 | Critical | Security | Yes | Not run |
| APP-114 | Reopen | Reopen a REJECTED or CANCELLED request | REJECTED | 1) SESS(SA) POST reopen | — | NOT_APPROVED; unchanged | P1 | High | Negative | Yes | Not run |
| APP-115 | Reopen | Reopen without a reason | APPROVED, SESS(SA) | 1) Reopen with empty reason | — | "A reason is required."; unchanged | P1 | High | Negative | Yes | Not run |
| APP-116 | Hold | Resume by someone who isn't at the held level | ON_HOLD at FIN, SESS(MGR) | 1) POST resume | — | Refused; still ON_HOLD | P1 | High | Security | Yes | Not run |
| APP-117 | Hold | Hold a request twice | ON_HOLD | 1) POST hold again | — | Refused; one PUT_ON_HOLD event | P2 | Medium | Negative | Yes | Not run |
| APP-118 | Custom | Custom approval naming only yourself | SESS(REQ) | 1) Custom with Level 1 People = REQ only 2) Submit | — | "you can't approve your own request. Pick someone else."; no row | P0 | Critical | Negative | Yes | Not run |
| APP-119 | Custom | Custom approval using a DoA matrix (tampered spec) | SESS(REQ) | 1) POST custom spec containing a DOA stage | — | "Custom approvals don't use a DoA matrix…"; no row | P2 | Medium | Security | Yes | Not run |
| APP-120 | Custom | Custom approval with an inactive person | SESS(REQ) | 1) POST spec with an inactive user id | — | Refused by validation (unknown/inactive user); no row | P1 | High | Negative | Yes | Not run |
| APP-121 | Workflow | Publish a version with errors | Draft with a GROUP that was deactivated | 1) Publish | — | "Fix the errors before publishing."; still draft | P1 | High | Negative | Yes | Not run |
| APP-122 | Workflow | Publish an already published version | Live v1 | 1) POST publish v1 again | — | "Only a draft can be published." | P2 | Medium | Negative | Yes | Not run |
| APP-123 | Delegation | Delegate acts outside the date range | Delegation starting tomorrow | 1) SESS(delegate) open the delegator's pending request | — | 404 (not a participant yet); POST decide refused | P1 | High | Security | Yes | Not run |
| APP-124 | Delegation | Delegate acts on own request | Delegate = requester of the delegator's task | 1) Delegate tries to approve | — | Hidden in UI; POST refused (no self-approval) | P0 | Critical | Security | Yes | Not run |
| APP-125 | Delegation | Delegation chain | A→B and B→C active | 1) SESS(C) approve A's task | — | Refused (no chains, D-062) | P1 | High | Security | Yes | Not run |
| APP-126 | Delegation | Overlapping delegation | MGR has one active | 1) Create a second overlapping | — | Refused with an overlap message | P2 | Medium | Negative | Yes | Not run |
| APP-127 | Attach | Attach to a closed request | APPROVED | 1) POST addFiles | quote.pdf | "Files can only be added while the request is open." | P2 | Medium | Negative | Yes | Not run |
| APP-128 | Attach | Remove an attachment | Request with a file | 1) Look for remove 2) Try DELETE on /api/attachments/{id} | — | No remove action exists; DELETE not allowed (405/404); row and file remain (never deleted, D-072) | P2 | Medium | Negative | Yes | Not run |
| APP-129 | Template | Submit a template with no draft | SESS(SA), latest already submitted | 1) POST submit | — | "Save a draft first; there is nothing new to submit." | P3 | Low | Negative | Yes | Not run |
| APP-130 | Template | Template action by IT Admin | SESS(IT) | 1) POST saveTemplateDraftAction | — | "Not found."; nothing saved | P1 | High | Security | Yes | Not run |
| APP-131 | Demo | Try as a non-demo person | SESS(SA) | 1) POST tryAs with REQ's real id (non-demo) | — | "Only demo people can be tried."; SA session kept | P0 | Critical | Security | Yes | Not run |
| APP-132 | Demo | Try as a demo person who was given IT_ADMIN | Demo person with IT_ADMIN added | 1) Try as | — | "This demo person has admin rights, so it can't be tried…" | P1 | High | Security | Yes | Not run |
| APP-133 | Expiry | Very old open request | Request IN_PROGRESS for 60 days | 1) Run jobs 2) Open the request | — | Stays IN_PROGRESS (no expiry, A-03); reminder and escalation sent once each; record as gap R13 | P3 | Low | Negative | Yes | Not run |
| APP-134 | Close | Approved request → Cancelled | APPROVED | 1) Look for cancel or close 2) POST withdraw | — | Not possible (A-02); status APPROVED | P2 | Medium | Negative | Yes | Not run |


## 11. Workflow Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-135 | Single | Single-level approve | Demo MD Approval, SESS(REQ) raise, SESS(MD) | 1) Raise 2) MD approves | — | APPROVED after one decision | P0 | Critical | Functional | Yes | Not run |
| APP-136 | Single | Single-level reject | Demo ED Approval | 1) Raise 2) ED rejects with reason | — | REJECTED; reason in notification and timeline | P0 | Critical | Functional | Yes | Not run |
| APP-137 | Single | Single-level approver inactive at raise | ED deactivated, group ED_OFFICE has only ED | 1) Raise ED Approval | — | Step BLOCKED; IT notified; nobody can approve until IT hands over or fixes the group | P0 | Critical | Functional | Yes | Not run |
| APP-138 | Single | Approver deactivated after the task was created | Request at ED | 1) IT deactivates ED (pending task warning) 2) Handover to MD | — | Task reassigned to MD (TASK_REASSIGNED); MD notified; ED's session revoked | P1 | High | Functional | Yes | Not run |
| APP-139 | Single | Approver changed in the group after the task exists | Task with demo.finctrl | 1) IT swaps group member to another person | — | Existing task stays with the original approver (resolved at activation); new requests use the new member. Documented behaviour | P1 | High | Functional | Yes | Not run |
| APP-140 | Single | Approver signs out before deciding | Request at ED | 1) ED signs out 2) Signs in later 3) Approves | — | Task still PENDING after sign-out; approval works | P2 | Medium | Functional | Yes | Not run |
| APP-141 | Single | Approver session expires mid-decision | ED session 12 h old | 1) Approve | — | Redirect to sign-in or "Not found."; task unchanged; after sign-in the approve works once | P1 | High | Functional | Yes | Not run |
| APP-142 | Sequential | Levels run in order | WF-SEQ | 1) Raise 2) Check tasks after each approval | — | Only one level PENDING at a time: MGR → HOD → FIN → MD; approval_tasks created only on activation | P0 | Critical | Functional | Yes | Not run |
| APP-143 | Sequential | Later level can't act early | WF-SEQ at MGR, SESS(HOD) | 1) Open request 2) POST decide with a guessed taskKey | — | No buttons for HOD; POST refused (no task for HOD yet) | P0 | Critical | Security | Yes | Not run |
| APP-144 | Sequential | Rejection at level 1 | WF-SEQ | 1) MGR rejects | — | REJECTED; HOD/FIN/MD never get tasks or notifications | P0 | Critical | Functional | Yes | Not run |
| APP-145 | Sequential | Rejection at level 2 | WF-SEQ | 1) MGR approves 2) HOD rejects | — | REJECTED; MGR's approval kept in history; FIN never activated | P0 | Critical | Functional | Yes | Not run |
| APP-146 | Sequential | Rejection at the final level | WF-SEQ | 1) MGR, HOD, FIN approve 2) MD rejects | — | REJECTED; all earlier approvals in timeline; requester told | P0 | Critical | Functional | Yes | Not run |
| APP-147 | Sequential | Changes asked at level 3 restarts at the requesting level | WF-SEQ at FIN | 1) FIN asks for changes 2) REQ resubmits | — | Round 2; FIN task re-created (default restart policy REQUESTING_STEP); MGR and HOD not asked again | P1 | High | Functional | Yes | Not run |
| APP-148 | Sequential | Same person at two levels | WF-SEQ where MGR also in FIN group | 1) Raise 2) MGR approves level 1 | — | Second task for the same person created at FIN level; each decision recorded separately (no auto-approval) | P2 | Medium | Functional | Yes | Not run |
| APP-149 | Sequential | Requester is also their own HOD | Requester = HOD of their department | 1) Raise WF-SEQ | — | HOD level resolves to nobody eligible → BLOCKED and IT told (or skipped if configured); never self-approved | P0 | Critical | Security | Yes | Not run |
| APP-150 | Sequential | Requester has no manager | REQ manager cleared | 1) Raise WF-SEQ | — | MGR level BLOCKED (IT told) unless set to skip; documented | P1 | High | Functional | Yes | Not run |
| APP-151 | Sequential | Workflow edited while requests are running | WF-SEQ v1 with open request | 1) Publish v2 removing HOD 2) Continue the old request | — | Old request keeps v1 (HOD still required); new requests use v2 | P0 | Critical | Functional | Yes | Not run |
| APP-152 | Parallel | All branches approve (join ALL) | WF-PAR | 1) Raise 2) Sales, Plant, Finance approve in any order | — | Three tasks at once; MD activated only after the third approval | P0 | Critical | Functional | Yes | Not run |
| APP-153 | Parallel | One branch rejects | WF-PAR | 1) Sales approves 2) Plant rejects | — | REJECTED; Finance task closed (NOT_REQUIRED/CANCELLED); MD never activated | P0 | Critical | Functional | Yes | Not run |
| APP-154 | Parallel | One branch doesn't respond | WF-PAR, SLA set | 1) Two approve 2) Third waits past SLA 3) Run jobs | — | Request waits at the join; reminder then escalation for the silent branch only | P1 | High | Functional | Yes | Not run |
| APP-155 | Parallel | Approvals in different orders give the same result | WF-PAR | 1) Run with orders S-P-F and F-P-S | — | Same final state; join completes once | P2 | Medium | Functional | Yes | Not run |
| APP-156 | Parallel | Join ANY_ONE | WF-PAR-ANY | 1) Plant approves | — | Join complete; other branch tasks closed NOT_REQUIRED; MD activated | P1 | High | Functional | Yes | Not run |
| APP-157 | Parallel | Join ANY_N = 2 | WF-PAR-2 | 1) Sales approves 2) Finance approves | — | After the 2nd approval the join completes; remaining task closed | P1 | High | Functional | Yes | Not run |
| APP-158 | Parallel | ANY_N with not enough approvers | Step rule ANY_N n=3 on a group of 2 | 1) Raise | — | BLOCKED with "not enough approvers" (IT told) | P1 | High | Functional | Yes | Not run |
| APP-159 | Group | Group ANY_ONE: first approval completes | WF-GRP | 1) checker1 approves | — | Step complete; checker2's task closed NOT_REQUIRED; "Other approvers at … no longer needed" | P0 | Critical | Functional | Yes | Not run |
| APP-160 | Group | Group ALL: every member must approve | WF-GRP-ALL | 1) checker1 approves 2) check 3) checker2 approves | — | Still waiting after one; complete after both | P1 | High | Functional | Yes | Not run |
| APP-161 | Group | Group member raises on own group | REQ = checker1, WF-GRP | 1) checker1 raises | — | Only checker2 gets a task (requester excluded) | P0 | Critical | Security | Yes | Not run |
| APP-162 | DoA | Band 1 upper edge ₹1,00,000 | WF-DOA, SESS(BUY) | 1) Raise ₹1,00,000 | 100000 | SCM head only | P0 | Critical | Boundary | Yes | Not run |
| APP-163 | DoA | Band 2 lower edge ₹1,00,001 | WF-DOA | 1) Raise | 100001 | SCM head → Finance head | P0 | Critical | Boundary | Yes | Not run |
| APP-164 | DoA | Band 2 upper edge ₹10,00,000 | WF-DOA | 1) Raise | 1000000 | SCM head → Finance head | P0 | Critical | Boundary | Yes | Not run |
| APP-165 | DoA | Band 3 lower edge ₹10,00,001 | WF-DOA | 1) Raise | 1000001 | SCM head → Finance head → ED | P0 | Critical | Boundary | Yes | Not run |
| APP-166 | DoA | Band 3 upper edge ₹25,00,000 | WF-DOA | 1) Raise | 2500000 | SCM head → Finance head → ED (MD not needed) | P0 | Critical | Boundary | Yes | Not run |
| APP-167 | DoA | Band 4 ₹25,00,001 | WF-DOA | 1) Raise | 2500001 | All four levels | P0 | Critical | Boundary | Yes | Not run |
| APP-168 | DoA | Non-cumulative band | Matrix: CFO ticked only in middle band | 1) Raise in band 1, 2, 3 | 50k / 2L / 9L | CFO only in the middle band | P1 | High | Functional | Yes | Not run |
| APP-169 | DoA | Amount changed on resubmit moves the band | WF-DOA ₹50,000 at SCM head | 1) SCM head asks for changes 2) REQ resubmits ₹12,00,000 | — | Round 2 routes SCM head → Finance head → ED | P0 | Critical | Functional | Yes | Not run |
| APP-170 | DoA | DoA limits changed while a request runs | Request at Finance head (₹5L) | 1) IT publishes v2 with first limit ₹10L | — | Running request keeps v1 routing; new ₹5L requests skip Finance head | P1 | High | Functional | Yes | Not run |
| APP-171 | DoA | Ordinary level before the DoA | Workflow: Manager level, then DoA | 1) Raise ₹30L | — | Manager first, then the DoA levels for that band | P1 | High | Functional | Yes | Not run |
| APP-172 | Choice | Choice taken | WF-CHO | 1) Raise Nature = Payment | — | Level 1 → Level 2 → Finance head; map shows "Path taken" and other path "Not taken" | P1 | High | Functional | Yes | Not run |
| APP-173 | Choice | Choice not taken | WF-CHO | 1) Raise Nature = Journal entry | — | Level 1 → Finance head (Level 2 not taken) | P1 | High | Functional | Yes | Not run |
| APP-174 | Skip | Skip-when condition | Step "skip when amount ≤ 50,000" | 1) Raise 40,000 | — | Step SKIPPED ("its condition didn't apply"); next level activated | P1 | High | Functional | Yes | Not run |
| APP-175 | Reopen | Reopened request runs from level 1 again | APPROVED WF-SEQ | 1) SA reopens 2) Check tasks | — | Round 2: MGR PENDING; earlier round tasks kept | P1 | High | Functional | Yes | Not run |
| APP-176 | Hold | Hold blocks progress | WF-SEQ at HOD | 1) HOD holds 2) Others try to act | — | Nothing moves until resumed | P2 | Medium | Functional | Yes | Not run |


## 12. Role & Permission Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-177 | Areas | USER opens /admin | SESS(REQ) | 1) Go to /admin | — | Plain 404 page; audit AREA_ACCESS_DENIED (reason MISSING_ROLE) | P0 | Critical | Security | Yes | Not run |
| APP-178 | Areas | USER opens /superadmin | SESS(REQ) | 1) Go to /superadmin | — | 404; audited | P0 | Critical | Security | Yes | Not run |
| APP-179 | Areas | IT Admin opens /superadmin | SESS(IT) | 1) /superadmin/settings | — | 404; audited | P0 | Critical | Security | Yes | Not run |
| APP-180 | Areas | IT Admin opens /admin | SESS(IT) | 1) /admin | — | 200; nav shows workflows, users, groups, DoA, calendar, insights | P1 | High | Functional | Yes | Not run |
| APP-181 | Areas | Signed-out visitor | No session | 1) /users 2) /admin 3) /api/attachments/1 | — | Pages redirect to /login?next=…; API returns 404 JSON | P0 | Critical | Security | Yes | Not run |
| APP-182 | Areas | Area switch links only for allowed areas | SESS(IT) | 1) Look at "Switch area" | — | My approvals and Admin only; no Super Admin link | P2 | Medium | UI/UX | Yes | Not run |
| APP-183 | Actions | USER calls an /admin Server Action | SESS(REQ) | 1) POST createWorkflowAction (replayed) | — | "Not found."; no workflow; audit API_ACCESS_DENIED | P0 | Critical | Security | Yes | Not run |
| APP-184 | Actions | IT Admin calls a /superadmin action | SESS(IT) | 1) POST saveSettingsAction / loadDemoAction / tryAsAction | — | "Not found." for each; nothing changed | P0 | Critical | Security | Yes | Not run |
| APP-185 | Records | USER opens another user's request | Request by REQ, SESS(OUT) | 1) /users/requests/{id} | — | 404 identical to a non-existent id; audit REQUEST_ACCESS_DENIED | P0 | Critical | Security | Yes | Not run |
| APP-186 | Records | IDOR by id increment | SESS(OUT) | 1) Loop /users/requests/1…N | — | Only own or involved requests open; every other id 404 + audited | P0 | Critical | Security | Partial | Not run |
| APP-187 | Records | Comment on someone else's request | SESS(OUT) | 1) POST commentAction with their requestId | — | "Not found."; no comment | P0 | Critical | Security | Yes | Not run |
| APP-188 | Records | Download someone else's attachment | SESS(OUT) | 1) GET /api/attachments/{id} | — | 404; audit ATTACHMENT_ACCESS_DENIED | P0 | Critical | Security | Yes | Not run |
| APP-189 | Records | Former approver keeps read access | MGR approved earlier | 1) SESS(MGR) open later | — | 200 (participant: had a task); can't act any more | P2 | Medium | Functional | Yes | Not run |
| APP-190 | Records | IT Admin sees every request | SESS(IT) | 1) Open any request | — | 200; no decision buttons unless IT is the approver | P1 | High | Functional | Yes | Not run |
| APP-191 | Users | IT Admin grants SUPER_ADMIN | SESS(IT) | 1) Edit a user, tick SUPER_ADMIN (or POST) | — | Refused: only a Super Admin can grant it; audit failure | P0 | Critical | Security | Yes | Not run |
| APP-192 | Users | IT Admin edits the Super Admin | SESS(IT) | 1) Edit itadmin | — | Refused | P0 | Critical | Security | Yes | Not run |
| APP-193 | Users | Deactivate yourself | SESS(SA) | 1) Deactivate own account | — | Refused ("Nobody can deactivate themselves") | P1 | High | Security | Yes | Not run |
| APP-194 | Users | Remove the last Super Admin | Only one SA | 1) Remove SUPER_ADMIN from itadmin | — | Refused (last active Super Admin) | P0 | Critical | Security | Yes | Not run |
| APP-195 | Users | Role removal applies immediately | IT signed in | 1) SA removes IT_ADMIN 2) IT refreshes /admin | — | 404 on next request (roles re-read every request) | P0 | Critical | Security | Yes | Not run |
| APP-196 | Users | Deactivation ends sessions | User signed in | 1) IT deactivates | — | Next request → sign-in; session revoked | P0 | Critical | Security | Yes | Not run |
| APP-197 | Demo | Demo session never has admin rights | Try as demo.md | 1) Open /admin | — | 404 (demo sessions forced to USER) | P1 | High | Security | Yes | Not run |
| APP-198 | Workflow | Custom workflow owner only | REQ's custom workflow | 1) SESS(OUT) POST addDraftVersion for it | — | "Workflow not found." | P1 | High | Security | Yes | Not run |
| APP-199 | Workflow | USER creates a predefined workflow | SESS(REQ) | 1) POST create with kind PREDEFINED | — | "Only the IT team creates predefined approvals." | P0 | Critical | Security | Yes | Not run |
| APP-200 | Audit | USER reads the audit log | SESS(REQ) | 1) /superadmin/audit | — | 404 | P1 | High | Security | Yes | Not run |
| APP-201 | Audit | IT reads the audit log | SESS(IT) | 1) /superadmin/audit | — | 404 (Super Admin only); no Auditor role exists (gap R39) | P2 | Medium | Security | Yes | Not run |
| APP-202 | Delegation | Create delegation for someone else | SESS(OUT) | 1) POST createDelegation with userId = MGR | — | Refused (only for yourself; IT for others if supported) | P1 | High | Security | Yes | Not run |
| APP-203 | Delegation | Stop someone else's delegation | SESS(OUT) | 1) POST stopDelegation with their id | — | "Not found." | P1 | High | Security | Yes | Not run |
| APP-204 | Handover | USER calls handover | SESS(REQ) | 1) POST handoverAction | — | "Not found." | P0 | Critical | Security | Yes | Not run |
| APP-205 | Jobs | Job runner without secret | — | 1) POST /api/jobs/run without x-job-secret 2) With a wrong one | — | 404/401; nothing runs | P0 | Critical | API | Yes | Not run |
| APP-206 | Providers | Provider key never readable | SESS(SA) | 1) Open Providers & security 2) View page source 3) DevTools network | — | Only Configured / Not configured shown; no key bytes in HTML, JSON or logs | P0 | Critical | Security | Partial | Not run |
| APP-207 | Templates | IT Admin opens the template creator | SESS(IT) | 1) /superadmin/templates | — | 404 | P1 | High | Security | Yes | Not run |


## 13. Delegation Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-208 | Delegation | Delegate sees delegator's pending task in their queue | Active MGR→finl2b, request at MGR | 1) SESS(finl2b) /users/queue | — | Task listed with "(for Deepa Menon, as their delegate)" | P1 | High | Functional | Yes | Not run |
| APP-209 | Delegation | Delegate rejects | Active delegation | 1) Delegate rejects with reason | — | REJECTED; decided_by delegate, on_behalf_of MGR; requester told | P1 | High | Functional | Yes | Not run |
| APP-210 | Delegation | Delegator can still act during delegation | Active delegation | 1) SESS(MGR) approve | — | Allowed (delegation adds, doesn't remove); decided_by MGR, on_behalf_of null | P1 | High | Functional | Yes | Not run |
| APP-211 | Delegation | Original acts after delegate already approved | Delegate approved | 1) SESS(MGR) POST decide same taskKey | — | Refused (task not pending); one decision only | P0 | Critical | Concurrency | Yes | Not run |
| APP-212 | Delegation | Delegation starts tomorrow | MGR→finl2b from tomorrow | 1) Today: delegate opens request | — | 404; tomorrow (India date) it opens and can be decided | P1 | High | Boundary | Yes | Not run |
| APP-213 | Delegation | Delegation ended yesterday | Ended range | 1) Delegate tries today | — | 404 / refused | P1 | High | Boundary | Yes | Not run |
| APP-214 | Delegation | Delegation on the last day | ends_on = today (IST) | 1) Delegate approves at 23:50 IST | — | Allowed; at 00:01 IST next day refused | P2 | Medium | Boundary | Partial | Not run |
| APP-215 | Delegation | Delegate deactivated | Active delegation; IT deactivates delegate | 1) Delegator's task | — | Delegate can't sign in; delegator still can act; reminders go to delegator only | P1 | High | Functional | Yes | Not run |
| APP-216 | Delegation | Delegate gets reminders | WF-SLA, active delegation | 1) Let MGR's task pass due 2) Run jobs | — | APPROVAL_REMINDER to MGR and finl2b (once each) | P2 | Medium | Functional | Yes | Not run |
| APP-217 | Delegation | Two people delegate to the same delegate | A→D and B→D | 1) D's queue | — | Both delegators' tasks listed and actionable | P2 | Medium | Functional | Yes | Not run |
| APP-218 | Delegation | Delegate is also the requester of the task | REQ delegates to MGR? (MGR raises request needing REQ) | 1) Delegate opens own request | — | No decision buttons; POST refused | P0 | Critical | Security | Yes | Not run |
| APP-219 | Delegation | Delegation list shows involving rows | Several delegations | 1) /users/delegation | — | Mine and to-me lists; ended ones marked | P3 | Low | UI/UX | Yes | Not run |
| APP-220 | Delegation | Notification on delegation start and end | Create, then stop | 1) Check delegate's notifications | — | Delegate told when set up and when stopped (where built); record if missing (N-17) | P2 | Medium | Functional | Yes | Not run |
| APP-221 | Delegation | Delegate tries to delegate onward | Delegate creates own delegation D→E | 1) E opens A's task | — | Refused (no chains) | P1 | High | Security | Yes | Not run |
| APP-222 | Delegation | Delegation of a Super Admin's approval | SA has a task; SA delegates | 1) Delegate approves | — | Allowed as for anyone; area rights not delegated (/superadmin still 404 for delegate) | P1 | High | Security | Yes | Not run |
| APP-223 | Delegation | Audit of delegation | Create and stop | 1) /superadmin/audit | — | DELEGATION_CREATED / DELEGATION_ENDED with actor and dates | P2 | Medium | Functional | Yes | Not run |


## 14. Escalation Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-224 | SLA | Due time uses working hours | WF-SLA (2 h), raise Sat 17:00 IST, Sun off | 1) Raise 2) DB approval_tasks.due_at | — | due_at = Monday 2 working hours later per calendar (not Sunday) | P1 | High | Functional | Yes | Not run |
| APP-225 | SLA | Holiday skipped | Holiday tomorrow | 1) Raise 23 h before the holiday with a 24 h SLA | — | due_at moves past the holiday | P1 | High | Functional | Yes | Not run |
| APP-226 | SLA | No SLA set | WF-SEQ (no response time) | 1) Raise 2) Run jobs after 3 days | — | No reminder, no escalation | P2 | Medium | Functional | Yes | Not run |
| APP-227 | Reminder | Reminder at due time | WF-SLA; due_at passed | 1) POST /api/jobs/run | — | APPROVAL_REMINDER to approver (+delegate); task_reminders row REMINDER; email + WhatsApp attempted | P0 | Critical | Functional | Yes | Not run |
| APP-228 | Reminder | Reminder only once | After first reminder | 1) Run jobs 3 times | — | Still one reminder (INSERT IGNORE claim) | P0 | Critical | Concurrency | Yes | Not run |
| APP-229 | Escalation | Escalation at twice the time | escalate_at passed | 1) Run jobs | — | APPROVAL_ESCALATED to approver's manager and IT admins (not to the approver); one task_reminders ESCALATION row | P0 | Critical | Functional | Yes | Not run |
| APP-230 | Escalation | Escalation once only | Escalated | 1) Run jobs again | — | No second escalation | P1 | High | Functional | Yes | Not run |
| APP-231 | Escalation | Approver without a manager | Approver has no manager | 1) Escalation fires | — | IT admins only | P2 | Medium | Functional | Yes | Not run |
| APP-232 | Escalation | No escalation after approval | Task approved before escalate_at | 1) Run jobs after escalate_at | — | Nothing sent (task not pending) | P0 | Critical | Functional | Yes | Not run |
| APP-233 | Escalation | No escalation after rejection or withdrawal | Request REJECTED / CANCELLED | 1) Run jobs | — | Nothing sent | P1 | High | Functional | Yes | Not run |
| APP-234 | Escalation | No reminder while ON_HOLD | Held before due | 1) Run jobs after due | — | No reminder while ON_HOLD (SLA job only checks IN_PROGRESS requests) | P2 | Medium | Functional | Yes | Not run |
| APP-235 | Escalation | Two job runners at once | Due task | 1) Fire /api/jobs/run twice in parallel | — | Exactly one reminder (claim row is unique) | P0 | Critical | Concurrency | Yes | Not run |
| APP-236 | Escalation | Escalation reaches the right manager after a manager change | Approver's manager changed after task creation | 1) Escalate | — | Current manager at escalation time is told | P2 | Medium | Functional | Yes | Not run |
| APP-237 | SLA | SLA boundary second | due_at = T | 1) Run at T-1 s 2) Run at T+1 s | — | No reminder at T-1 s; reminder at T+1 s | P2 | Medium | Boundary | Partial | Not run |
| APP-238 | SLA | Calendar change applies to new tasks only | Existing task | 1) IT adds holiday affecting due_at 2) Check | — | Existing due_at unchanged; new tasks use it (D-067) | P2 | Medium | Functional | Yes | Not run |
| APP-239 | Jobs | Cron missing | Cron not configured | 1) Wait past due | — | No reminders (dependency); go-live check must confirm cron (§42) | P1 | High | Recovery | No | Not run |


## 15. Notification Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-240 | Event | Approval needed → new approver | WF-SEQ | 1) Raise 2) Check MGR's notifications, email, WhatsApp | — | In-app "Approval needed"; email subject "Approval needed: QAS-…"; WhatsApp ars_approval_needed_v1 if live; deliveries SENT | P0 | Critical | Integration | Partial | Not run |
| APP-241 | Event | Next level told after approval | WF-SEQ at MGR | 1) MGR approves | — | HOD gets APPROVAL_NEEDED; requester not spammed per level (N-08 not built: record) | P1 | High | Integration | Yes | Not run |
| APP-242 | Event | Fully approved → requester | Final approval | 1) Check requester | — | REQUEST_APPROVED in-app, email "Approved: …", WhatsApp | P0 | Critical | Integration | Yes | Not run |
| APP-243 | Event | Rejected → requester with reason | Reject | 1) Check | — | REQUEST_REJECTED with the reason in all channels | P0 | Critical | Integration | Yes | Not run |
| APP-244 | Event | Changes asked → requester | Ask for changes | 1) Check | — | CHANGES_REQUESTED with "What to change" and link | P1 | High | Integration | Yes | Not run |
| APP-245 | Event | Resubmitted → approver at restart level | Resubmit | 1) Check FIN | — | APPROVAL_NEEDED for the new round task | P1 | High | Integration | Yes | Not run |
| APP-246 | Event | On hold → requester | Hold | 1) Check | — | REQUEST_ON_HOLD with reason (or "-" if none on WhatsApp) | P2 | Medium | Integration | Yes | Not run |
| APP-247 | Event | Withdrawn → pending approvers only | Withdraw at HOD | 1) Check HOD and FIN | — | HOD gets REQUEST_WITHDRAWN; FIN (never activated) gets nothing | P1 | High | Integration | Yes | Not run |
| APP-248 | Event | Reopened → requester | Reopen | 1) Check | — | REQUEST_REOPENED with reason | P2 | Medium | Integration | Yes | Not run |
| APP-249 | Event | Comment → everyone on the request except the author | Comment by MGR | 1) Check REQ, HOD | — | REQUEST_COMMENT to requester and task holders; not to MGR | P2 | Medium | Integration | Yes | Not run |
| APP-250 | Event | Request blocked → IT admins | No approver | 1) Raise | — | REQUEST_BLOCKED to every IT admin with the level name and reason | P1 | High | Integration | Yes | Not run |
| APP-251 | Event | Submission receipt to requester | Raise | 1) Check requester's notifications | — | Not sent today (N-06 not built); record gap | P3 | Low | Integration | Yes | Not run |
| APP-252 | Content | Deep links require sign-in | Any notification | 1) Open link signed out | — | Sign-in page, then the request; no data in the URL | P1 | High | Security | Yes | Not run |
| APP-253 | Content | WhatsApp values on one line | Reason with new lines | 1) Reject with "Line1\n\nLine2" 2) Inspect payload | — | templateVariables "Line1 Line2"; never empty (uses "-") | P2 | Medium | Integration | Yes | Not run |
| APP-254 | Failure | Email provider down | Resend key wrong / network blocked | 1) Approve | — | Approval succeeds; delivery FAILED EMAIL_REQUEST_FAILED with next_retry_at; in-app row exists | P0 | Critical | Recovery | Yes | Not run |
| APP-255 | Failure | Email key missing | No Resend key | 1) Trigger event | — | Delivery FAILED EMAIL_NOT_CONFIGURED (not retried); business action committed | P1 | High | Recovery | Yes | Not run |
| APP-256 | Failure | WhatsApp template not live | Template not approved | 1) Trigger | — | Delivery SKIPPED TEMPLATE_NOT_CONFIGURED; email still sent | P1 | High | Integration | Yes | Not run |
| APP-257 | Failure | Recipient has no WhatsApp number | User without number | 1) Trigger | — | SKIPPED NO_WHATSAPP_NUMBER | P2 | Medium | Integration | Yes | Not run |
| APP-258 | Failure | CEOITBox wallet empty (200 + error) | Simulated reply | 1) Trigger | — | Delivery FAILED CEOITBOX_BLOCKED; not retried | P1 | High | Integration | Yes | Not run |
| APP-259 | Failure | CEOITBox 5xx then recovers | Simulated 503 | 1) Trigger 2) Run jobs after recovery | — | First FAILED CEOITBOX_REQUEST_FAILED retryable; retry SENT; message sent once | P0 | Critical | Recovery | Yes | Not run |
| APP-260 | Failure | Retry limit reached | Always 503 | 1) Run jobs repeatedly | — | Stops after whatsapp.retry_limit; final FAILED, no next_retry_at | P2 | Medium | Recovery | Yes | Not run |
| APP-261 | Failure | Manual retry from the delivery log | FAILED retryable delivery, SESS(SA) | 1) /superadmin/deliveries 2) Retry now | — | "Sent." or "Still failing…"; audit DELIVERY_RETRIED | P2 | Medium | Integration | Yes | Not run |
| APP-262 | Duplicate | No duplicate notification on double action | Approve twice quickly | 1) Double-click Approve | — | One APPROVAL_NEEDED for the next approver | P0 | Critical | Concurrency | Yes | Not run |
| APP-263 | Wrong user | Notification to the right person | Group ANY_ONE | 1) Raise WF-GRP | — | Only checker1 and checker2 told; not the requester even if in the group | P1 | High | Integration | Yes | Not run |
| APP-264 | Inactive | Inactive recipient | Approver inactive | 1) Event for them | — | notify() records nothing for inactive users | P2 | Medium | Integration | Yes | Not run |
| APP-265 | Bell | Unread count after reading | 3 unread | 1) Open one 2) Mark all read | — | Count updates; read_at set | P3 | Low | UI/UX | Yes | Not run |


## 16. Audit Log Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-266 | Request | Submit is evented | Raise | 1) DB approval_events for the request | — | SUBMITTED + NODE_ACTIVATED + TASK_CREATED rows with actor and timestamp | P0 | Critical | Database | Yes | Not run |
| APP-267 | Decision | Approve/reject evented with actor | Decide | 1) DB | — | TASK_DECIDED payload: taskId, nodeId, actorId, decision, comment, onBehalfOf | P0 | Critical | Database | Yes | Not run |
| APP-268 | Decision | Delegate decision shows both people | Delegate approves | 1) DB + timeline | — | actorId = delegate, onBehalfOf = delegator | P1 | High | Database | Yes | Not run |
| APP-269 | Withdraw | Withdraw evented | Withdraw | 1) DB | — | WITHDRAWN with reason, closedTaskIds, approverIds | P1 | High | Database | Yes | Not run |
| APP-270 | Reopen | Reopen evented and audited | Reopen | 1) DB | — | REOPENED event with round and reason | P1 | High | Database | Yes | Not run |
| APP-271 | Workflow | Workflow changes audited | Create, draft, publish | 1) /superadmin/audit | — | WORKFLOW_CREATED, WORKFLOW_VERSION_CREATED, WORKFLOW_PUBLISHED with versionNo | P1 | High | Database | Yes | Not run |
| APP-272 | Users | User change audited with before/after | Edit a user's manager | 1) Audit log | — | USER_UPDATED metadata before/after values | P1 | High | Database | Yes | Not run |
| APP-273 | Access | Denied access audited | OUT opens REQ's request | 1) Audit log | — | REQUEST_ACCESS_DENIED, result FAILURE, actor OUT | P0 | Critical | Security | Yes | Not run |
| APP-274 | Attach | Attachment audited | Attach | 1) Audit log | — | REQUEST_FILES_ADDED with names and sha256 | P1 | High | Database | Yes | Not run |
| APP-275 | Settings | Provider key change audited without the key | SA saves a key | 1) Audit and setting history | — | Change recorded with a fingerprint, never the value | P0 | Critical | Security | Yes | Not run |
| APP-276 | Templates | Template actions audited | Draft, submit, sync, test | 1) Audit log | — | WHATSAPP_TEMPLATE_DRAFTED / SUBMITTED (or SUBMIT_FAILED) / TEMPLATES_SYNCED / TEST_SENT | P2 | Medium | Database | Yes | Not run |
| APP-277 | Demo | Try as audited | Try as | 1) Audit log | — | DEMO_TRY_AS with demo session id | P1 | High | Database | Yes | Not run |
| APP-278 | Tamper | UPDATE on audit_logs blocked | DB user = app user | 1) UPDATE audit_logs SET action='X' WHERE id=1 | — | Trigger error; row unchanged | P0 | Critical | Security | Yes | Not run |
| APP-279 | Tamper | DELETE on audit_logs / approval_events / request_comments blocked | DB | 1) DELETE FROM each | — | Trigger error on each; rows remain | P0 | Critical | Security | Yes | Not run |
| APP-280 | Tamper | Audit log not editable in the UI | SESS(SA) | 1) /superadmin/audit | — | Read-only list with filters; no edit or delete | P1 | High | Database | Yes | Not run |
| APP-281 | Content | Audit row fields | Any action | 1) DB | — | actor_user_id, action, entity_type/id, result, ip_address (via proxy), session_id, metadata, created time | P1 | High | Database | Yes | Not run |
| APP-282 | Timeline | Timeline matches events | Request with 6 events | 1) Compare page timeline to approval_events | — | Same order and actors; internal events hidden by design | P1 | High | Database | Yes | Not run |
| APP-283 | Attachment | Attachment removal | — | 1) Look for removal audit | — | Not applicable: attachments can't be removed (D-072) | P3 | Low | Database | No | Not run |


## 17. API Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-284 | Attachments | GET /api/attachments/{id} valid | Participant session | 1) GET | — | 200; headers Content-Disposition attachment, X-Content-Type-Options nosniff, Cache-Control private no-store, CSP sandbox | P0 | Critical | API | Yes | Not run |
| APP-285 | Attachments | Non-numeric id | Session | 1) GET /api/attachments/abc | — | 404 JSON {success:false, error NOT_FOUND} | P2 | Medium | API | Yes | Not run |
| APP-286 | Attachments | Non-existing id | Session | 1) GET /api/attachments/999999 | — | 404 same body as forbidden | P1 | High | API | Yes | Not run |
| APP-287 | Attachments | No session | — | 1) GET | — | 404 (middleware) | P0 | Critical | API | Yes | Not run |
| APP-288 | Attachments | Wrong method | Session | 1) POST / DELETE /api/attachments/1 | — | 405; nothing changed | P2 | Medium | API | Yes | Not run |
| APP-289 | Attachments | Path traversal via id | Session | 1) GET /api/attachments/..%2F..%2Fetc | — | 404; storage path never taken from the URL | P0 | Critical | Security | Yes | Not run |
| APP-290 | Jobs | POST /api/jobs/run correct secret | FX-ENV | 1) POST with x-job-secret | — | 200 with a report (retries, reminders, escalations) | P1 | High | API | Yes | Not run |
| APP-291 | Jobs | Wrong or missing secret | — | 1) POST without / with wrong secret | — | 401 or 404; nothing processed | P0 | Critical | Security | Yes | Not run |
| APP-292 | Jobs | GET instead of POST | — | 1) GET /api/jobs/run | — | 405 | P3 | Low | API | Yes | Not run |
| APP-293 | Auth | POST /api/auth/password wrong password | Password user | 1) POST wrong | — | Generic failure (no hint whether the User ID exists); failed_login_count +1; login_logs row | P0 | Critical | Security | Yes | Not run |
| APP-294 | Auth | Lockout after threshold | Password user | 1) 5 wrong passwords | — | Locked 15 min (setting); ACCOUNT_LOCKED alert; correct password refused while locked | P0 | Critical | Security | Yes | Not run |
| APP-295 | Auth | Unknown User ID | — | 1) POST /api/auth/password with unknown id | — | Same generic answer and timing as a wrong password | P1 | High | Security | Partial | Not run |
| APP-296 | Auth | OTP wrong or reused | Valid challenge | 1) Wrong code 2) Correct code 3) Reuse it | — | Wrong refused; correct signs in; reuse refused | P0 | Critical | Security | Yes | Not run |
| APP-297 | Auth | OTP expired | Challenge older than validity | 1) Submit code | — | Refused; new code needed | P1 | High | Security | Yes | Not run |
| APP-298 | Auth | Rate limit sign-in | — | 1) 50 attempts in a minute from one IP | — | 429-style refusal after the limit (rate_limit_hits) | P1 | High | Security | Yes | Not run |
| APP-299 | Auth | Forgot password for unknown user | — | 1) POST /api/auth/forgot | — | Same neutral message as for a real user; nothing sent | P1 | High | Security | Yes | Not run |
| APP-300 | Auth | Set-password link reused or expired | Used link | 1) Open again | — | Refused; password unchanged | P1 | High | Security | Yes | Not run |
| APP-301 | Auth | Google token invalid | — | 1) POST /api/auth/google with a fake token | — | Refused; no session | P0 | Critical | Security | Yes | Not run |
| APP-302 | Auth | Google account not created by admin | Valid Google, no user row | 1) Sign in | — | Refused with "not set up" message; no auto-creation | P0 | Critical | Security | Partial | Not run |
| APP-303 | Auth | This wasn't me | New-login alert link | 1) Open link | — | All sessions revoked; account locked; Super Admin told SECURITY_ALERT | P1 | High | Security | Partial | Not run |
| APP-304 | Auth | Sign out everywhere | Two sessions | 1) POST /api/me/sign-out-everywhere | — | Both sessions revoked | P1 | High | API | Yes | Not run |
| APP-305 | Actions | Server Action with malformed FormData | SESS(MGR) | 1) POST decideAction without requestId | — | "Not found."; no change | P2 | Medium | API | Yes | Not run |
| APP-306 | Actions | Server Action with huge payload | SESS(REQ) | 1) POST submit with 60 MB | — | Rejected by the 52 MB body limit; no request | P2 | Medium | API | Yes | Not run |
| APP-307 | Actions | Manipulated requestId/taskKey | SESS(MGR) | 1) POST decide for request X with task of request Y | — | Refused (task not on that request) | P0 | Critical | Security | Yes | Not run |
| APP-308 | Actions | Manipulated workflowId | SESS(REQ) | 1) POST submit with an inactive or custom workflow of someone else | — | Refused; no row | P1 | High | Security | Yes | Not run |
| APP-309 | Actions | SQL injection in fields | SESS(REQ) | 1) Title "x'); DROP TABLE users;--" | — | Stored literally (parameterised queries); tables intact | P0 | Critical | Security | Yes | Not run |
| APP-310 | Actions | XSS in fields and comments | SESS(REQ) | 1) Title/comment "<img src=x onerror=alert(1)>" | — | Rendered as text everywhere (page, email, WhatsApp); no script runs; CSP would block inline anyway | P0 | Critical | Security | Yes | Not run |
| APP-311 | Actions | Cross-site Server Action (CSRF) | Logged in; evil origin page | 1) Form POST from another origin | — | Refused by Next.js origin check; no change | P0 | Critical | Security | Partial | Not run |
| APP-312 | Actions | Stale page (old build) action id | After a deploy | 1) Submit a form from a tab opened before deploy | — | Clear error and reload advice; no partial write | P2 | Medium | Recovery | No | Not run |
| APP-313 | CEOITBox | sendMessage success | Test key, own number | 1) Template test send | — | Body {id, waMessageId}; delivery SENT with providerReference | P1 | High | Integration | Partial | Not run |
| APP-314 | CEOITBox | 401 bad key | Wrong key saved | 1) Sync status | — | "CEOITBox refused the API key (401)…"; nothing changed | P1 | High | Integration | Yes | Not run |
| APP-315 | CEOITBox | 400 Meta rejection | Wrong template name | 1) Send | — | CEOITBOX_REJECTED with Meta detail; not retried | P1 | High | Integration | Yes | Not run |
| APP-316 | CEOITBox | 200 with error object | Simulated | 1) Send | — | CEOITBOX_BLOCKED; not retried | P1 | High | Integration | Yes | Not run |
| APP-317 | CEOITBox | Timeout | Simulated slow reply > timeout | 1) Send | — | CEOITBOX_TIMEOUT after whatsapp.ceoitbox_timeout_ms; retried later | P1 | High | Integration | Yes | Not run |
| APP-318 | CEOITBox | create template payload | Submit | 1) Inspect the outbound body | — | {name, language "en", category, components [BODY text {{n}} + example.body_text [[samples]], FOOTER?]} | P1 | High | Integration | Yes | Not run |
| APP-319 | CEOITBox | getTemplates pagination | > 100 templates at CEOITBox | 1) Sync | — | All pages read (up to 20 × 100); statuses applied by name | P3 | Low | Integration | Partial | Not run |
| APP-320 | CEOITBox | API key never in URL | Any call | 1) Inspect outbound requests | — | Key only in x-api-key header; never apiKey= in the URL | P0 | Critical | Security | Yes | Not run |
| APP-321 | CEOITBox | Rate limit per minute | whatsapp.ceoitbox_rate_limit_per_minute = 2 | 1) Trigger 3 sends in a minute | — | Third CEOITBOX_RATE_LIMITED, retried later | P2 | Medium | API | Yes | Not run |
| APP-322 | Resend | Email send failure codes | Wrong key | 1) Trigger | — | EMAIL_REQUEST_FAILED / NOT_CONFIGURED logged; business action committed | P1 | High | Integration | Yes | Not run |
| APP-323 | Headers | Security headers on every response | — | 1) curl -I /login, /users, /api/attachments/1 | — | CSP with nonce, X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, Permissions-Policy, COOP same-origin-allow-popups; no X-Powered-By | P0 | Critical | Security | Yes | Not run |


## 18. API Timeout & Retry Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-324 | Submit | Submit retried after a client timeout | SESS(REQ); throttle network so the response is lost | 1) Submit 2) Server commits 3) Browser times out 4) User submits again | — | One request: the retry carries the same form key and returns the first request (submission_key unique per requester); count in approval_requests = 1 (D-QA-01 fixed) | P0 | Critical | Concurrency | Partial | Not run |
| APP-325 | Submit | Double-click Submit | SESS(REQ) | 1) Double-click Submit request | — | Button disabled after first click ("Working…"); one request | P0 | Critical | Concurrency | Yes | Not run |
| APP-326 | Submit | Two tabs submit the same form | SESS(REQ) | 1) Same data in 2 tabs 2) Submit both | — | Second tab: "You raised “…” as … a few minutes ago…" with the tick "This is a separate request"; one request unless ticked (D-QA-02 fixed) | P1 | High | Concurrency | Yes | Not run |
| APP-327 | Decide | Approve retried after timeout (processed) | Request at MGR | 1) Approve; drop response 2) Approve again | — | Second attempt refused (task not pending) or "Someone else just changed this request…"; one TASK_DECIDED; one notification | P0 | Critical | Concurrency | Yes | Not run |
| APP-328 | Decide | Reject retried after 500 | Simulate 500 after commit | 1) Reject 2) Retry | — | One rejection event; second refused | P0 | Critical | Recovery | Partial | Not run |
| APP-329 | Withdraw | Withdraw retried | — | 1) Withdraw, lose reply 2) Withdraw again | — | NOT_OPEN on retry; one WITHDRAWN event | P1 | High | Concurrency | Yes | Not run |
| APP-330 | Resubmit | Resubmit retried | CHANGES_REQUIRED | 1) Resubmit, lose reply 2) Resubmit again | — | Second refused (no longer CHANGES_REQUIRED); round incremented once | P1 | High | Concurrency | Yes | Not run |
| APP-331 | Attach | Upload retried after timeout | Open request | 1) Attach, lose reply 2) Attach same file again | — | Second upload: "Nothing new to attach. Already attached, so not added again: quote.pdf."; one row (D-QA-03 fixed) | P2 | Medium | Concurrency | Yes | Not run |
| APP-332 | Delivery | Delivery retry after 502/503/504 | Simulated provider errors | 1) Trigger 2) Run jobs | — | Retried with back-off 2,4,8… min up to retry_limit; one SENT at most | P1 | High | Recovery | Yes | Not run |
| APP-333 | Delivery | Send succeeded but recording failed | DB fails after provider 200 | 1) Trigger | — | Not marked FAILED, so not resent (notify keeps send and record apart) | P1 | High | Recovery | Partial | Not run |
| APP-334 | Delivery | No retry on 400/401 | Provider 400 | 1) Trigger 2) Run jobs | — | Not retried (non-retryable code) | P1 | High | Concurrency | Yes | Not run |
| APP-335 | Template | Submit template retried | Lost reply after CEOITBox created it | 1) Submit again | — | Second create may fail at CEOITBox as duplicate name; app shows the provider message; sync then finds it (no duplicate rows) | P2 | Medium | Integration | Partial | Not run |
| APP-336 | Jobs | Job runner overlap | Two cron runs overlap | 1) Two POSTs together | — | Reminders claimed once; deliveries retried once (attempt counts consistent) | P1 | High | Concurrency | Yes | Not run |
| APP-337 | Network | Reconnect mid-session | Offline then online | 1) Go offline 2) Approve 3) Online and retry | — | Clear error while offline; one decision after retry | P2 | Medium | Concurrency | Partial | Not run |


## 19. Database Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-338 | Request | Request row correct | Raise | 1) SELECT approval_requests | — | requester_id, workflow_version_id (published), title, form_data_json (typed values), status IN_PROGRESS, round 1, state_version 1, submitted_at | P0 | Critical | Database | Yes | Not run |
| APP-339 | Tasks | Task rows mirror the engine state | After each decision | 1) Compare approval_tasks to state_json tasks | — | Same ids, statuses, approver, decided_by, comment, round | P0 | Critical | Database | Yes | Not run |
| APP-340 | Tasks | Due and escalate times | WF-SLA | 1) SELECT due_at, escalate_at | — | Match the working calendar computation | P2 | Medium | Database | Yes | Not run |
| APP-341 | Version | state_version increments by one per change | Several actions | 1) Watch state_version | — | +1 per committed action; never skips or repeats | P1 | High | Database | Yes | Not run |
| APP-342 | Rollback | Failure inside the transaction rolls back | Inject DB error after saveRequestState | 1) Approve | — | Request row, tasks, events all unchanged; no notification sent | P0 | Critical | Recovery | Partial | Not run |
| APP-343 | Rollback | Attachment DB insert fails | Inject error | 1) Attach | — | Written files deleted; no rows; clear error | P1 | High | Recovery | Partial | Not run |
| APP-344 | Unique | Duplicate request_no impossible | — | 1) INSERT duplicate request_no | — | Unique constraint error | P1 | High | Database | Yes | Not run |
| APP-345 | Unique | One published version per workflow | — | 1) Try to publish two versions | — | uq_workflow_versions_one_published prevents two | P1 | High | Database | Yes | Not run |
| APP-346 | Unique | One task key per request | — | 1) INSERT duplicate (request_id, task_key) | — | Rejected | P2 | Medium | Database | Yes | Not run |
| APP-347 | FK | Foreign keys | — | 1) Insert a task for a missing request / user | — | FK error | P2 | Medium | Database | Yes | Not run |
| APP-348 | Null | Required columns not null | — | 1) Insert request without title | — | Error | P3 | Low | Database | Yes | Not run |
| APP-349 | Users | Users never deleted | — | 1) Deactivate via UI 2) SELECT | — | Row present with active = 0; history keeps names | P1 | High | Database | Yes | Not run |
| APP-350 | Charset | utf8mb4 round-trip | — | 1) Hindi + emoji title | — | Same bytes back from DB | P2 | Medium | Database | Yes | Not run |
| APP-351 | Time | Timestamps in UTC, shown in IST | — | 1) Compare DB and UI | — | DB UTC; UI India time | P2 | Medium | Database | Yes | Not run |
| APP-352 | Notifications | notifications and deliveries rows | Event | 1) SELECT | — | One notification per recipient; one delivery per channel with status and failure_code | P1 | High | Database | Yes | Not run |
| APP-353 | Settings | Secrets stored encrypted | Saved key | 1) SELECT system_settings value | — | AES-GCM ciphertext, never plain | P0 | Critical | Security | Yes | Not run |
| APP-354 | Attach | Stored path not under web root | Attachment | 1) Check UPLOAD_DIR and stored_path | — | Path relative to UPLOAD_DIR, random name, no extension, outside public/ | P0 | Critical | Security | Yes | Not run |
| APP-355 | Templates | Template versions consistent | Creator use | 1) SELECT whatsapp_templates | — | At most one ACTIVE+APPROVED per code; retired older; variables rows in position order | P1 | High | Database | Yes | Not run |
| APP-356 | Consistency | Status counts = Insights | Data present | 1) SQL counts vs /admin/insights | — | Equal | P2 | Medium | Database | Yes | Not run |
| APP-357 | Backup | Restore keeps integrity | Backup and restore staging DB | 1) Restore 2) Open requests | — | All requests, tasks, files (UPLOAD_DIR in backup) consistent | P1 | High | Recovery | No | Not run |
| APP-358 | DB down | Database unavailable on submit | Stop MySQL | 1) Submit | — | "Couldn't submit. Please try again."; nothing partial; works after restart | P0 | Critical | Recovery | Partial | Not run |
| APP-359 | DB down | Database unavailable on approve | Stop MySQL | 1) Approve | — | "Something went wrong…"; task still pending after restart | P0 | Critical | Recovery | Partial | Not run |


## 20. Security Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-360 | Session | Cookie flags | Signed in on HTTPS | 1) Inspect ars_session | — | HttpOnly, Secure, SameSite=Lax, Path=/, 12 h | P0 | Critical | Security | Yes | Not run |
| APP-361 | Session | Tampered cookie | — | 1) Change one character of the cookie | — | Treated as signed out (HMAC fails) | P0 | Critical | Security | Yes | Not run |
| APP-362 | Session | Forged uid in cookie payload | — | 1) Edit payload uid, keep signature | — | Rejected | P0 | Critical | Security | Yes | Not run |
| APP-363 | Session | Revoked session cookie reused | Signed out | 1) Replay old cookie | — | Rejected (server-side session row revoked) | P0 | Critical | Security | Yes | Not run |
| APP-364 | Session | Session expiry | 12 h old | 1) Use the app | — | Sign-in page | P1 | High | Security | Yes | Not run |
| APP-365 | Session | Session fixation | — | 1) Set a cookie before sign-in 2) Sign in | — | New session id issued on sign-in | P1 | High | Security | Partial | Not run |
| APP-366 | Authz | Horizontal escalation via requestId | SESS(OUT) | 1) Replay MGR's decide action with own cookie | — | Refused | P0 | Critical | Security | Yes | Not run |
| APP-367 | Authz | Vertical escalation via roles in the request | SESS(REQ) | 1) Add roles=SUPER_ADMIN to any FormData | — | Ignored; roles only from the DB | P0 | Critical | Security | Yes | Not run |
| APP-368 | Authz | Hidden field tampering on user form | SESS(IT) | 1) POST user update with roles including SUPER_ADMIN | — | Refused (only SA grants it) | P0 | Critical | Security | Yes | Not run |
| APP-369 | XSS | Stored XSS in workflow names, field labels, group names | SESS(IT) | 1) Use "<script>alert(1)</script>" in each | — | Shown as text to all users; CSP blocks inline script | P0 | Critical | Security | Yes | Not run |
| APP-370 | XSS | XSS in attachment file name | — | 1) Upload "<img src=x onerror=alert(1)>.pdf" | — | Name cleaned (<, > removed); shown as text; download header safe | P1 | High | Security | Yes | Not run |
| APP-371 | XSS | XSS in template wording preview | SESS(SA) | 1) Body with HTML | — | Preview shows text, not HTML | P2 | Medium | Security | Yes | Not run |
| APP-372 | Upload | Executable renamed to .pdf | — | 1) Upload MZ… named invoice.pdf | — | "invoice.pdf doesn't look like a real PDF file."; nothing stored | P0 | Critical | Security | Yes | Not run |
| APP-373 | Upload | HTML or SVG upload | — | 1) Upload page.html / image.svg | — | Type not allowed | P0 | Critical | Security | Yes | Not run |
| APP-374 | Upload | Polyglot PDF with script | — | 1) Upload a PDF containing JS | — | Accepted as PDF but always downloaded (attachment, sandbox CSP, nosniff); never rendered inline by the app | P1 | High | Security | Partial | Not run |
| APP-375 | Upload | Zip bomb as .xlsx | — | 1) Upload a crafted ZIP .xlsx | — | Stored as-is (≤10 MB), never unpacked by the server | P2 | Medium | Security | No | Not run |
| APP-376 | Upload | Path traversal in file name | — | 1) Upload "../../etc/passwd.txt" | — | Stored name random; display name "passwd.txt" | P0 | Critical | Security | Yes | Not run |
| APP-377 | Headers | Clickjacking | — | 1) Frame the app in another site | — | Blocked (X-Frame-Options DENY, frame-ancestors) | P1 | High | Security | Yes | Not run |
| APP-378 | Headers | CSP nonce per request | — | 1) Load twice; compare nonce | — | Different each time; no unsafe-inline for scripts | P1 | High | Security | Yes | Not run |
| APP-379 | Info | Stack details hidden | Force an error | 1) Trigger a server error | — | Generic message; no stack, SQL or provider names to non-Super-Admins | P0 | Critical | Security | Partial | Not run |
| APP-380 | Info | 404 vs 403 indistinguishable | — | 1) Compare /admin as USER and a random URL | — | Same 404 page (areas not confirmed) | P1 | High | Security | Yes | Not run |
| APP-381 | Secrets | Secrets absent from the repo and client bundle | — | 1) Grep build output and git for keys | — | Only public Firebase config; no Resend/CEOITBox key, SESSION_SECRET or ENCRYPTION_KEY | P0 | Critical | Security | Yes | Not run |
| APP-382 | Secrets | Logs don't contain keys or OTPs | — | 1) Trigger failures 2) Read server log | — | No x-api-key, OTP codes, passwords or cookie values | P0 | Critical | Security | Partial | Not run |
| APP-383 | Password | Password hashing | Set password | 1) SELECT password_hash | — | scrypt hash; never plain | P0 | Critical | Security | Yes | Not run |
| APP-384 | Brute force | OTP brute force | Challenge | 1) 20 wrong codes | — | Challenge locked after the limit; rate limit applies | P0 | Critical | Security | Yes | Not run |
| APP-385 | Break-glass | Break-glass outside its window | Break-glass account, window closed | 1) Sign in | — | Refused; inside the window: allowed + BREAK_GLASS_USED alert | P1 | High | Security | Partial | Not run |
| APP-386 | Enumeration | User ID enumeration on forgot password | — | 1) Compare replies for real and fake IDs | — | Identical text and similar timing | P1 | High | Security | Partial | Not run |
| APP-387 | Injection | Header injection in email subject | Title with CR/LF | 1) Raise "A\r\nBcc: x@y" | — | Subject one line; no extra headers | P1 | High | Security | Yes | Not run |
| APP-388 | Injection | Formula injection in future CSV export | — | 1) Title "=HYPERLINK(...)" | — | No export yet; when built, escape leading = + - @ (§42) | P3 | Low | Security | No | Not run |
| APP-389 | Dependencies | Known vulnerable packages | — | 1) npm audit --production | — | No high or critical issues open | P2 | Medium | Security | Yes | Not run |
| APP-390 | TLS | HTTPS only | Live | 1) http:// → | — | Redirect to https; HSTS | P1 | High | Security | Yes | Not run |


## 21. UI/UX Test Cases (incl. loading states)



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-391 | Loading | Submit shows a working state | SESS(REQ), throttled network | 1) Submit request | — | Button reads "Working…" and is disabled until the reply; no second request on extra clicks | P0 | Critical | UI/UX | Yes | Not run |
| APP-392 | Loading | Approve, reject, hold, resume, resubmit, withdraw, reopen buttons | Throttled network | 1) Click each | — | Each disabled while pending; message after reply | P1 | High | UI/UX | Yes | Not run |
| APP-393 | Loading | Upload progress state | 10 MB file, slow network | 1) Attach | — | Button "Working…"; no double upload; message after reply | P2 | Medium | UI/UX | Partial | Not run |
| APP-394 | Loading | Spinner clears after an error | Server error | 1) Act | — | Button enabled again; error shown in role=alert | P1 | High | UI/UX | Yes | Not run |
| APP-395 | Messages | Success messages | Each action | 1) Do each | — | Green role=status text matching the action ("Approved.", "Resubmitted…", "File attached.") | P2 | Medium | UI/UX | Yes | Not run |
| APP-396 | Messages | Error messages stay next to the field | Invalid form | 1) Submit | — | Field errors under each field; typed values kept (form not reset) | P1 | High | UI/UX | Yes | Not run |
| APP-397 | Confirm | In-page confirmations | Withdraw, reopen, publish, handover, stop delegation, retire demo, try as, submit template | 1) Click 2) Cancel 3) Click 4) Yes, continue | — | Bar shows the question; Cancel does nothing; Yes runs once; works where pop-ups are blocked | P1 | High | UI/UX | Yes | Not run |
| APP-398 | Confirm | Confirmation not bypassed by Enter | Withdraw form | 1) Press Enter in the reason field | — | Bar appears; nothing withdrawn until Yes | P2 | Medium | UI/UX | Yes | Not run |
| APP-399 | Forms | Number field accepts Indian grouping | Raise | 1) Type 12,50,000 | — | Accepted and shown back with grouping | P2 | Medium | UI/UX | Yes | Not run |
| APP-400 | Forms | Date field uses a date picker | DATE field | 1) Open picker | — | Native picker; value YYYY-MM-DD | P3 | Low | UI/UX | No | Not run |
| APP-401 | Forms | Person field lists active people only | PERSON field | 1) Open list | — | Only active users, "Name (UserID)" | P2 | Medium | UI/UX | Yes | Not run |
| APP-402 | Builder | DoA editor add/remove limits keeps ticks right | SESS(IT) | 1) Add a limit 2) Remove a middle limit | — | Adding copies the top band ticks; removing merges two bands (level kept if either ticked) | P1 | High | Functional | Yes | Not run |
| APP-403 | Builder | DoA band headers update live | SESS(IT) | 1) Change limit 1 to 2,00,000 | — | Headers "Up to ₹2,00,000", "₹2,00,001 to …" | P2 | Medium | UI/UX | Yes | Not run |
| APP-404 | Builder | Empty DoA band highlighted | SESS(IT) | 1) Untick a whole band | — | Band header red + warning line | P2 | Medium | UI/UX | Yes | Not run |
| APP-405 | Builder | Move levels up and down | SESS(IT) | 1) ↑ / ↓ | — | Order changes; first/last buttons disabled | P3 | Low | UI/UX | Yes | Not run |
| APP-406 | Templates | Placeholder buttons insert at the cursor | SESS(SA) | 1) Click "+ Request title" mid-text | — | {{title}} inserted at cursor; preview updates | P3 | Low | UI/UX | Yes | Not run |
| APP-407 | Templates | Live counts and rule hints | SESS(SA) | 1) Type | — | "N of 1,024 characters · K placeholders" or the rule error | P3 | Low | UI/UX | Yes | Not run |
| APP-408 | Layout | Desktop 1366×768 | — | 1) Visit main pages | — | No horizontal scroll; sidebar visible | P2 | Medium | UI/UX | Partial | Not run |
| APP-409 | Layout | Tablet 768×1024 | — | 1) Visit main pages incl. builder | — | No page-level horizontal scroll; wide tables scroll inside their card | P2 | Medium | UI/UX | Partial | Not run |
| APP-410 | Layout | Phone 375×812 | — | 1) Raise, approve, comment, attach | — | All doable; no clipped buttons; sidebar hidden | P1 | High | UI/UX | Partial | Not run |
| APP-411 | Browsers | Chrome, Edge, Firefox, Safari (latest) | — | 1) Smoke flow in each | — | Same behaviour; Google popup sign-in works (COOP header) | P1 | High | Regression | Partial | Not run |
| APP-412 | Nav | Back button after an action | — | 1) Approve 2) Back | — | No resubmission; page shows the current state | P2 | Medium | UI/UX | Yes | Not run |
| APP-413 | Nav | Deep link to a request | Signed out | 1) Open link from email | — | /login?next=… then the request | P1 | High | UI/UX | Yes | Not run |
| APP-414 | Status | Status pill colours and words | One per status | 1) View | — | Each status has a distinct label; not colour only | P3 | Low | UI/UX | No | Not run |
| APP-415 | Empty | Empty states | New user | 1) /users, /users/queue, notifications | — | Friendly empty messages, no errors | P3 | Low | UI/UX | Yes | Not run |
| APP-416 | Demo | Demo banner | Try as | 1) Any page | — | Warning banner on every page while a demo person | P2 | Medium | UI/UX | Yes | Not run |
| APP-417 | Time | Times shown in India time | — | 1) Compare timeline with DB UTC | — | Displayed IST, 12-hour clock | P3 | Low | UI/UX | Yes | Not run |
| APP-418 | Copy | Plain-language errors | Various errors | 1) Trigger | — | No codes or stack text for non-admins; actionable wording | P3 | Low | UI/UX | No | Not run |
| APP-419 | Long text | Long titles and comments wrap | 200-char title, 2000-char comment | 1) View | — | Wrap without breaking layout | P3 | Low | UI/UX | Partial | Not run |
| APP-420 | Insights | Insights tables readable | Data | 1) /admin/insights | — | Tiles and tables; "under 1 min" for tiny times | P3 | Low | UI/UX | Partial | Not run |


## 22. Attachment Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-421 | Upload | Upload each allowed type | Open request | 1) Attach pdf, png, jpg, webp, docx, xlsx, pptx, doc, xls, ppt, csv, txt | Real files | All accepted with the right content_type | P1 | High | Functional | Yes | Not run |
| APP-422 | Upload | Upload 10 MB exactly | — | 1) Attach | 10,485,760 bytes | Accepted | P1 | High | Boundary | Yes | Not run |
| APP-423 | Upload | Upload 10 MB + 1 byte | — | 1) Attach | 10,485,761 bytes | "… is larger than 10 MB." | P1 | High | Boundary | Yes | Not run |
| APP-424 | Upload | Empty file | — | 1) Attach a 0-byte quote.pdf | — | "quote.pdf is empty." | P2 | Medium | Boundary | Yes | Not run |
| APP-425 | Upload | Empty file box on submit | — | 1) Submit without choosing a file | — | Request submitted normally (no "blob" error) | P0 | Critical | Regression | Yes | Not run |
| APP-426 | Upload | Corrupted PDF (wrong magic) | — | 1) Attach | — | "doesn't look like a real PDF file." | P1 | High | Negative | Yes | Not run |
| APP-427 | Upload | 5 files in one upload | — | 1) Attach 5 | — | Accepted; one timeline line listing 5 names | P2 | Medium | Boundary | Yes | Not run |
| APP-428 | Upload | 6 files in one upload | — | 1) Attach 6 | — | "Add at most 5 files at a time." | P2 | Medium | Boundary | Yes | Not run |
| APP-429 | Upload | 21st file on a request | 20 attached | 1) Attach 1 | — | "A request can hold at most 20 files (20 already attached)." | P2 | Medium | Boundary | Yes | Not run |
| APP-430 | Upload | Same file twice | — | 1) Attach quote.pdf twice | — | Second time: "Already attached, so not added again"; one copy kept | P3 | Low | Functional | Yes | Not run |
| APP-431 | Upload | Unicode file name | — | 1) Attach "कोटेशन final.pdf" | — | Shown and downloaded with the Unicode name (filename* header) | P2 | Medium | Functional | Yes | Not run |
| APP-432 | Upload | Very long file name | — | 1) 220-char name | — | Cut to 150 keeping ".pdf" | P3 | Low | Boundary | Yes | Not run |
| APP-433 | Upload | Upload on resubmit | CHANGES_REQUIRED | 1) Resubmit with a file | — | File stored with round 2 shown | P2 | Medium | Functional | Yes | Not run |
| APP-434 | Upload | Approver attaches | IN_PROGRESS, SESS(MGR) | 1) Attach signed note | — | Allowed; uploader shown as MGR | P2 | Medium | Functional | Yes | Not run |
| APP-435 | Download | Download after request closed | APPROVED request | 1) Download | — | Still allowed for participants | P2 | Medium | Functional | Yes | Not run |
| APP-436 | Storage | File survives a redeploy | Staging | 1) Redeploy 2) Download | — | 200 (UPLOAD_DIR outside the app folder) | P0 | Critical | Recovery | No | Not run |


## 23. Search & Filter Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-437 | My requests | List order | 5 requests | 1) /users | — | Newest first | P3 | Low | Functional | Yes | Not run |
| APP-438 | My requests | More than 200 requests | 205 requests by REQ | 1) /users | — | Paged 25 at a time; all reachable (D-QA-11 fixed) | P2 | Medium | Functional | Yes | Not run |
| APP-439 | Queue | Queue shows only my pending tasks | Mixed | 1) /users/queue | — | Only PENDING tasks for me (and delegators) in the current round | P1 | High | Functional | Yes | Not run |
| APP-440 | Queue | Queue after a decision | — | 1) Approve 2) Return to queue | — | Item gone | P2 | Medium | Functional | Yes | Not run |
| APP-441 | Search | Search by request number | > 1 request | 1) /users/requests 2) Search the number | SEI-2026-000004 | Exactly that request | P2 | Medium | Functional | Yes | Not run |
| APP-442 | Search | Filter by status; partial and literal search | Requests in several statuses | 1) Status = Approved 2) Search "valve" 3) Search "%" | — | Only approved shown; partial match; "%" matches nothing (wildcards literal). Date, amount, department, type filters not built (R36 partial) | P2 | Medium | Functional | Yes | Not run |
| APP-443 | Admin | User list search | SESS(IT), many users | 1) Search by name / User ID (if offered) | "kumar" | Case-insensitive partial match; record actual | P3 | Low | Functional | Yes | Not run |
| APP-444 | Audit | Audit log filters | SESS(SA) | 1) Filter by action | WORKFLOW_PUBLISHED | Only that action shown | P2 | Medium | Functional | Yes | Not run |
| APP-445 | Deliveries | Delivery log shows latest 200 | > 200 deliveries | 1) /superadmin/deliveries | — | Latest 200; no body or payload shown | P3 | Low | Functional | Yes | Not run |
| APP-446 | Insights | Overdue list | Overdue tasks | 1) /admin/insights | — | Overdue tasks with links, sorted by most overdue | P3 | Low | Functional | Yes | Not run |
| APP-447 | Templates | Templates list | SESS(SA) | 1) /superadmin/templates | — | 20 rows with live and newest status | P3 | Low | Functional | Yes | Not run |
| APP-448 | DoA | DoA view lists every live type | SESS(IT) | 1) /admin/doa | — | One card per live workflow with bands | P3 | Low | Functional | Yes | Not run |


## 24. Date/Time Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-449 | SLA | Raise at 23:59:59 IST Saturday | WF-SLA 2 h | 1) Raise | — | due_at = Monday 02:00 working time equivalent per calendar | P2 | Medium | Boundary | Partial | Not run |
| APP-450 | SLA | Raise on a holiday | Holiday today | 1) Raise | — | Clock starts next working day | P2 | Medium | Boundary | Yes | Not run |
| APP-451 | SLA | Month-end and year-end | Raise 31 Dec 23:30 IST | 1) Raise | — | due_at in January computed correctly; request number year = submit year (IST vs UTC check) | P2 | Medium | Boundary | Yes | Not run |
| APP-452 | Number | Request number year at IST midnight | 31 Dec 23:58 IST vs 1 Jan 00:02 IST | 1) Raise both | — | Year follows the defined rule (record UTC vs IST); numbers never collide | P3 | Low | Boundary | Partial | Not run |
| APP-453 | Delegation | Delegation boundary at IST midnight | ends_on today | 1) Act 23:59 IST and 00:01 IST | — | Allowed then refused (India date, not UTC) | P2 | Medium | Boundary | Partial | Not run |
| APP-454 | Leap | Leap-year holiday 29 Feb 2028 | — | 1) Add holiday 2028-02-29 | — | Accepted; 2027-02-29 refused | P3 | Low | Boundary | Yes | Not run |
| APP-455 | Display | Times in the UI | — | 1) Compare DB UTC vs UI | — | IST shown everywhere (timeline, notifications, deliveries) | P3 | Low | UI/UX | Yes | Not run |
| APP-456 | OTP | OTP validity boundary | OTP issued | 1) Use at validity - 5 s and + 5 s | — | Accepted then refused | P2 | Medium | Security | Partial | Not run |
| APP-457 | Session | Session at 12 h boundary | — | 1) Use at 11:59 and 12:01 | — | Valid then expired | P3 | Low | Security | Partial | Not run |
| APP-458 | Calendar | Working days changed to Mon–Fri | SESS(IT) | 1) Save Mon–Fri 2) Raise Friday 17:00 with 2 h | — | New task due Monday | P2 | Medium | Boundary | Yes | Not run |
| APP-459 | Insights | 30/90-day windows | Data at day 29/31 | 1) Insights tiles | — | Counted inside / outside the window exactly | P3 | Low | Boundary | Yes | Not run |
| APP-460 | Leap | Date field 29 Feb non-leap | DATE field | 1) Submit 2027-02-29 | — | "Enter a date as YYYY-MM-DD." | P3 | Low | Validation | Yes | Not run |


## 25. Concurrency Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-461 | Same task | Two approvers of an ANY_ONE step approve at the same moment | WF-GRP | 1) checker1 and checker2 click Approve together | — | One approval completes the step; the other gets "Someone else just changed this request…" or "no longer needed"; one NODE_APPROVED; one next-level notification | P0 | Critical | Concurrency | Partial | Not run |
| APP-462 | Same task | Approve vs reject at the same moment (parallel branches) | WF-PAR | 1) Sales approves while Plant rejects | — | Final state is consistent (REJECTED if the reject commits; never APPROVED with a rejection recorded); state_version +2 at most | P0 | Critical | Concurrency | Partial | Not run |
| APP-463 | Same approver | Same approver, two tabs | Request at MGR | 1) Approve in tab A 2) Approve in tab B | — | Tab B refused; one TASK_DECIDED | P0 | Critical | Concurrency | Yes | Not run |
| APP-464 | Same approver | Approve in tab A, reject in tab B | Request at MGR | 1) Approve A 2) Reject B | — | B refused; status follows A | P0 | Critical | Concurrency | Yes | Not run |
| APP-465 | Same request | Same Server Action POST replayed twice | Captured approve POST | 1) Replay 2× with curl | — | Second refused; one event, one notification | P0 | Critical | API | Yes | Not run |
| APP-466 | Repeated | Approve clicked 10 times fast | — | 1) Spam clicks | — | Button disabled after first; one decision | P0 | Critical | UI/UX | Yes | Not run |
| APP-467 | Lock | Row lock serialises actions | Two different actions together (withdraw vs approve) | 1) Fire both | — | One wins; the other refused cleanly (CONFLICT or NOT_OPEN / not pending); never both | P0 | Critical | Concurrency | Partial | Not run |
| APP-468 | Lock | Optimistic check catches lost updates | Simulate stale state_version | 1) Save with old version | — | CONFLICT "Someone else just changed this request. Reload and try again." | P0 | Critical | Database | Yes | Not run |
| APP-469 | Delegation | Delegate and delegator decide together | Active delegation | 1) Both approve at once | — | One decision recorded | P0 | Critical | Concurrency | Partial | Not run |
| APP-470 | Resubmit | Requester resubmits while the approver re-decides | CHANGES_REQUIRED | 1) Fire resubmit and a stale approve | — | Approve refused; resubmit wins | P1 | High | Concurrency | Partial | Not run |
| APP-471 | Reopen | Reopen while a comment is posted | APPROVED | 1) Fire both | — | Both succeed independently (comments don't touch state) | P3 | Low | Concurrency | Partial | Not run |
| APP-472 | Handover | Handover while the approver approves | MGR pending | 1) IT hands over while MGR approves | — | Either the approval or the reassignment applies; never both a decision and a live reassigned task | P1 | High | Concurrency | Partial | Not run |
| APP-473 | Publish | Two admins publish two drafts | Drafts v2, v3 | 1) Publish both together | — | Exactly one PUBLISHED (unique index); other error | P1 | High | Database | Partial | Not run |
| APP-474 | Numbers | 50 parallel submits | 50 sessions | 1) Submit together | — | 50 unique consecutive numbers, no gaps from collisions | P1 | High | Performance | Yes | Not run |
| APP-475 | Jobs | Job runner and a user approve the same reminder-due task | — | 1) Run jobs while approving | — | No reminder after approval commit; never duplicate | P2 | Medium | Concurrency | Partial | Not run |
| APP-476 | Demo | Load demo data in two tabs at once | SESS(SA) | 1) Click Load in both | — | No duplicate people or groups (unique codes); one may report errors | P3 | Low | Concurrency | Partial | Not run |
| APP-477 | Templates | Sync while submitting | SESS(SA) | 1) Submit and sync together | — | Version rows consistent; no duplicate versions | P3 | Low | Concurrency | Partial | Not run |
| APP-478 | Attach | Two uploads hitting the 20-file limit together | 19 attached | 1) Two uploads of 1 file at once | — | Exactly 20 stored; the other upload refused with the limit message (count taken under the request lock, D-QA-03 fixed) | P2 | Medium | Concurrency | Partial | Not run |
| APP-479 | Users | Role change during an open session | IT signed in | 1) SA removes IT_ADMIN while IT saves a workflow | — | Save refused if role check runs after removal; no half write | P2 | Medium | Concurrency | Partial | Not run |
| APP-480 | Network | Timeout but backend processed approval | Throttle | 1) Approve, lose reply 2) Reload | — | Page shows approved; retry refused (see §18) | P0 | Critical | Recovery | Partial | Not run |


## 26. Performance Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-481 | Load | 1 user baseline | Staging, warm | 1) Raise, open request, approve | — | Page p95 < 1.5 s; action p95 < 1 s (proposed targets, A-09) | P1 | High | Performance | Yes | Not run |
| APP-482 | Load | 10 concurrent users | Staging | 1) k6: 10 VUs raise and approve for 10 min | — | p95 < 2 s; 0 errors | P1 | High | Performance | Yes | Not run |
| APP-483 | Load | 100 concurrent users | Staging | 1) k6: 100 VUs mixed actions 15 min | — | p95 < 3 s; error rate < 0.5%; no CONFLICT except true races | P1 | High | Performance | Yes | Not run |
| APP-484 | Load | 1,000 concurrent users (stress) | Staging | 1) Ramp to 1,000 VUs | — | Find the break point; app recovers after load drops; no data corruption | P2 | Medium | Performance | Yes | Not run |
| APP-485 | Burst | 10,000 requests submitted in 1 hour | Staging | 1) Scripted submits | — | All stored with unique numbers; queue pages stay < 3 s | P2 | Medium | Performance | Yes | Not run |
| APP-486 | Volume | 10,000 pending approvals for one approver | Seeded data | 1) Open /users/queue | — | Loads < 3 s or is paged (gap R36 if not) | P2 | Medium | Performance | Yes | Not run |
| APP-487 | Volume | 100,000 historical requests | Seeded data | 1) /users, /admin/insights | — | My requests (LIMIT 200) < 2 s; insights < 5 s (indexes used) | P2 | Medium | Performance | Yes | Not run |
| APP-488 | Volume | Large audit log (1M rows) | Seeded | 1) /superadmin/audit with filters | — | < 3 s with index on action/time | P3 | Low | Performance | Yes | Not run |
| APP-489 | Volume | Large request timeline (500 events) | Seeded | 1) Open request | — | < 2 s | P3 | Low | Performance | Yes | Not run |
| APP-490 | Volume | Attachment volume 50 GB in UPLOAD_DIR | Staging disk | 1) Upload/download | — | Unaffected; disk alert set (§42) | P3 | Low | Performance | No | Not run |
| APP-491 | Jobs | Job runner with 5,000 due reminders | Seeded | 1) POST /api/jobs/run | — | Finishes within the cron interval (5 min) or batches; no duplicates | P2 | Medium | Performance | Yes | Not run |
| APP-492 | Notify | Notification fan-out | Comment on a request with 50 participants | 1) Post | — | Comment saved < 1 s; notifications follow; CEOITBox rate limit respected | P3 | Low | Performance | Partial | Not run |
| APP-493 | Upload | 5 × 10 MB upload | — | 1) Attach | — | Completes < 30 s on 10 Mbps; memory stable | P3 | Low | Performance | Partial | Not run |
| APP-494 | DB | Connection pool exhaustion | 10-connection pool | 1) 50 parallel actions | — | Requests wait, none fail with pool errors at normal load | P2 | Medium | Performance | Yes | Not run |
| APP-495 | Builder | Workflow with 30 levels and 15 DoA levels | SESS(IT) | 1) Create, test, publish | — | Compiles and validates < 1 s | P3 | Low | Performance | Yes | Not run |
| APP-496 | Insights | Insights with 100k tasks | Seeded | 1) Load | — | < 5 s | P3 | Low | Performance | Yes | Not run |


## 27. Recovery Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-497 | App | App restart during an action | Staging | 1) Approve 2) Restart Node during the request | — | Either committed fully or not at all; page after restart shows the true state | P0 | Critical | Recovery | Partial | Not run |
| APP-498 | App | Crash after commit, before notifications | Inject crash after commit | 1) Approve | — | Decision kept; its messages are in notification_outbox and the next job run sends them once (D-QA-06 fixed) | P1 | High | Recovery | Partial | Not run |
| APP-499 | DB | MySQL restarts | Staging | 1) Restart MySQL 2) Use the app | — | Pool reconnects; errors only during the outage | P0 | Critical | Recovery | Partial | Not run |
| APP-500 | DB | Deadlock or lock wait timeout | Force lock contention | 1) Two long transactions | — | One retried or clear error; no partial state | P1 | High | Recovery | Partial | Not run |
| APP-501 | Provider | CEOITBox down for an hour | Block outbound | 1) Run the app 2) Unblock 3) Run jobs | — | Business continues; WhatsApp deliveries retried and sent once | P1 | High | Recovery | Partial | Not run |
| APP-502 | Provider | Resend down | Block Resend | 1) Same as above | — | Emails retried after recovery | P1 | High | Recovery | Partial | Not run |
| APP-503 | Network | Browser offline during submit | — | 1) Go offline 2) Submit | — | Clear failure; data stays in the form; resubmit works | P2 | Medium | Recovery | Partial | Not run |
| APP-504 | Browser | Browser crash after submit | — | 1) Submit 2) Kill browser 3) Reopen | — | Request exists once; visible in My requests | P2 | Medium | Recovery | No | Not run |
| APP-505 | Session | Session expires while writing a long comment | 12 h session | 1) Post after expiry | — | Sign-in prompt; text lost (record; consider draft keep) | P3 | Low | Recovery | No | Not run |
| APP-506 | Jobs | Cron stops for a day | — | 1) Restart cron | — | Overdue reminders and retries run once on the next run | P2 | Medium | Recovery | Yes | Not run |
| APP-507 | Jobs | Job runner crashes mid-batch | Inject error | 1) Run again | — | Already-claimed reminders not resent; others sent | P2 | Medium | Recovery | Partial | Not run |
| APP-508 | Deploy | Deploy while users are active | Staging | 1) Deploy | — | In-flight actions either complete or fail cleanly; old tabs get a reload message | P2 | Medium | Recovery | No | Not run |
| APP-509 | Disk | UPLOAD_DIR full | Fill disk | 1) Attach | — | Clear error; written partial files removed; no rows | P2 | Medium | Recovery | Partial | Not run |
| APP-510 | Restore | Restore DB and files from backup | Staging | 1) Restore 2) Verify sample requests and files | — | Counts and sha256 match | P1 | High | Recovery | No | Not run |
| APP-511 | Cache | Cache or queue failure | — | 1) N/A | — | Not applicable: no Redis or queue (DB-backed limits and retries) | P3 | Low | Recovery | No | Not run |
| APP-512 | Migration | Migration fails half-way | Staging | 1) Inject failure in a migration | — | Deploy stops; app not started on a half schema; rerun completes | P2 | Medium | Recovery | No | Not run |


## 28. Edge Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-513 | People | Approver leaves the organisation | Pending tasks | 1) IT deactivates; sees pending count 2) Hand over | — | Warning shows the count; handover moves all tasks; none lost | P0 | Critical | Edge | Yes | Not run |
| APP-514 | People | Approver leaves without handover | Pending task | 1) Deactivate only | — | Refused: "… still has N pending approvals. Hand them over first." (already enforced) | P1 | High | Edge | Yes | Not run |
| APP-515 | People | Requester leaves during approval | Open request | 1) Deactivate requester | — | Approvals continue; requester notifications skipped (inactive) | P2 | Medium | Edge | Yes | Not run |
| APP-516 | People | Manager changes during approval | Request at MGR | 1) IT changes REQ's manager | — | Existing MGR task stays; resubmission or new requests use the new manager | P2 | Medium | Edge | Yes | Not run |
| APP-517 | People | Department changes during approval | Request before HOD | 1) Move REQ to another department 2) MGR approves | — | HOD resolved at activation → new department's HOD (document) | P2 | Medium | Edge | Yes | Not run |
| APP-518 | People | HOD changes during approval | Request before HOD | 1) Change the department HOD 2) Activate HOD level | — | New HOD gets the task | P2 | Medium | Edge | Yes | Not run |
| APP-519 | People | User promoted to IT Admin mid-request | — | 1) Add IT_ADMIN | — | Can now see all requests; no change to tasks | P3 | Low | Edge | Yes | Not run |
| APP-520 | People | Same person at every level | All levels resolve to MD | 1) Raise | — | MD gets one task per level, decided one at a time | P2 | Medium | Edge | Yes | Not run |
| APP-521 | People | Circular reporting line | A manager of B, B manager of A | 1) IT saves it | — | Refused by the manager check | P1 | High | Negative | Yes | Not run |
| APP-522 | People | User without a manager uses REQUESTER_MANAGERS_MANAGER | — | 1) Raise | — | Level BLOCKED (IT told) or skipped if configured | P2 | Medium | Edge | Yes | Not run |
| APP-523 | People | Duplicate email or WhatsApp number | — | 1) Create a user with an existing email | — | "This email is already used by another user." | P2 | Medium | Validation | Yes | Not run |
| APP-524 | Config | Group deactivated while a request waits on it | Pending task from group | 1) Deactivate group | — | Existing tasks unaffected; new requests block (validator flags the workflow) | P2 | Medium | Edge | Yes | Not run |
| APP-525 | Config | Department deleted? | — | 1) Look for delete | — | Not possible; only inactive | P3 | Low | Edge | Yes | Not run |
| APP-526 | Config | Workflow deactivated while requests run | — | 1) Mark inactive | — | Running requests finish; no new requests | P1 | High | Edge | Yes | Not run |
| APP-527 | Config | Missing approval configuration | Workflow with no published version | 1) Raise via URL | — | Refused | P1 | High | Negative | Yes | Not run |
| APP-528 | Config | Approval matrix changed during pending request | — | 1) Publish new DoA | — | Running request keeps its version (see §11) | P1 | High | Edge | Yes | Not run |
| APP-529 | Config | Form field removed in a new version | v2 removes a field | 1) Open an old request | — | Old request still shows its v1 fields | P2 | Medium | Edge | Yes | Not run |
| APP-530 | Config | Person field approver becomes inactive before activation | — | 1) Raise; deactivate the picked person before their level | — | Level BLOCKED; IT told | P1 | High | Edge | Yes | Not run |
| APP-531 | Amount | Amount exactly on every limit | WF-DOA | 1) See §11 boundaries | — | Covered APP DoA cases | P3 | Low | Boundary | No | Not run |
| APP-532 | Amount | Amount with many decimals | — | 1) 100000.0001 | — | Band 2 (above ₹1,00,000) | P2 | Medium | Boundary | Yes | Not run |
| APP-533 | Amount | Amount "1,00,000.00" | — | 1) Submit | — | Equals 100000 → band 1 | P2 | Medium | Boundary | Yes | Not run |
| APP-534 | Choice | Choice value changed on resubmit | WF-CHO | 1) Payment → Journal entry on resubmit | — | Level 2 no longer needed in round 2 | P2 | Medium | Edge | Yes | Not run |
| APP-535 | Rounds | Resubmit many times | — | 1) 10 rounds of changes | — | Round 11; history complete; performance fine | P3 | Low | Edge | Yes | Not run |
| APP-536 | Rounds | Reopen after reopen | — | 1) Reopen twice | — | Rounds increase; each reason in timeline | P3 | Low | Edge | Yes | Not run |
| APP-537 | Requests | Request number sequence after a failed submit | — | 1) Cause a failure after the number is taken | — | Gap allowed; never a duplicate | P3 | Low | Edge | Yes | Not run |
| APP-538 | Requests | Request deleted externally (DB) | Admin deletes a row | 1) Open request | — | FK prevents delete while tasks exist; app shows 404 if gone | P3 | Low | Edge | No | Not run |
| APP-539 | Delegation | Delegate is deactivated mid-range | — | 1) Deactivate | — | Delegation inert; delegator acts | P2 | Medium | Edge | Yes | Not run |
| APP-540 | Delegation | Delegation to a user who is the next-level approver | B is HOD; MGR delegates to B | 1) B approves MGR level then HOD level | — | Allowed by design (record: segregation rule wanted? Q-QA-10) | P1 | High | Edge | Yes | Not run |
| APP-541 | Demo | Retire demo staff with pending tasks | Demo tasks pending | 1) Retire | — | Message shows the count; tasks block until handed over | P2 | Medium | Edge | Yes | Not run |
| APP-542 | Demo | Real staff swapped into groups before retire | — | 1) Swap members 2) Retire | — | New requests go to real people; demo pending tasks need handover | P2 | Medium | Edge | Yes | Not run |
| APP-543 | Templates | Template edited after approval | Live v1 | 1) Save changed wording | — | Saved as v2 (_v2 name); v1 still sends until v2 approved | P1 | High | Edge | Yes | Not run |
| APP-544 | Templates | Template paused by Meta | Live template paused | 1) Sync | — | Status shows paused; WhatsApp skipped for that event; email continues | P2 | Medium | Edge | Yes | Not run |
| APP-545 | Templates | Template deleted in CEOITBox | Live template deleted there | 1) Sync | — | "Not found at CEOITBox yet: …"; sending fails 400 → delivery FAILED (record: should auto-disable? Q-QA-11) | P2 | Medium | Edge | Yes | Not run |
| APP-546 | Templates | Phone ID changed | Wrong x-phone-id | 1) Send | — | Provider error shown in deliveries; nothing else affected | P3 | Low | Edge | Yes | Not run |
| APP-547 | Calendar | All days set as non-working | IT unticks all | 1) Save | — | Falls back to plain hours (or refused): record | P3 | Low | Edge | Yes | Not run |
| APP-548 | Time | Request raised exactly at a band edge during a limit change | — | 1) Publish new limits while submitting | — | Request uses whichever version was published when it was submitted (consistent) | P3 | Low | Edge | Partial | Not run |
| APP-549 | Browser | Two users on one computer | — | 1) A signs out 2) B signs in | — | No data of A visible (no-store pages) | P2 | Medium | Security | Partial | Not run |
| APP-550 | Language | Hindi/Tamil text in all fields | — | 1) Raise | — | Stored and shown correctly; WhatsApp values fine | P3 | Low | Edge | Yes | Not run |
| APP-551 | Request | Extremely long details 4000 chars with emojis | — | 1) Raise | — | Accepted; byte length handled (utf8mb4) | P3 | Low | Boundary | Yes | Not run |
| APP-552 | Expiry | Expired request processed | — | 1) Approve a 6-month-old request | — | Allowed (no expiry: gap R13) | P3 | Low | Edge | Yes | Not run |


## 29. Reporting Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-553 | Tiles | Open requests count | Data | 1) Compare tile with SELECT COUNT(*) WHERE status IN (IN_PROGRESS, ON_HOLD, CHANGES_REQUIRED) | — | Equal | P2 | Medium | Database | Yes | Not run |
| APP-554 | Tiles | Overdue approvals count | Data | 1) Compare with PENDING tasks past due_at | — | Equal; red alert when > 0 | P2 | Medium | Database | Yes | Not run |
| APP-555 | Tiles | Approved in 30 days | Data | 1) Compare | — | Equal | P3 | Low | Database | Yes | Not run |
| APP-556 | Tiles | Average time to full approval (90 days) | Data | 1) Compute in SQL | — | Same value (h / days); "—" when none | P3 | Low | Database | Yes | Not run |
| APP-557 | Tables | Waiting now by level | Data | 1) Compare | — | Counts per approval type and level match | P2 | Medium | Functional | Yes | Not run |
| APP-558 | Tables | Time to decide per level | Data | 1) Compare averages and slowest | — | Match SQL | P3 | Low | Functional | Yes | Not run |
| APP-559 | Tables | Decisions by person (30 days) | Data | 1) Compare approved/rejected/changes per person | — | Match | P3 | Low | Functional | Yes | Not run |
| APP-560 | Tables | Requests by month (6 months) | Data | 1) Compare raised/approved/rejected/withdrawn/open | — | Match | P3 | Low | Functional | Yes | Not run |
| APP-561 | Access | Insights for IT only | SESS(REQ) | 1) /admin/insights | — | 404 | P1 | High | Security | Yes | Not run |
| APP-562 | Export | Export reports | — | 1) Look for CSV/PDF export | — | Not built (S8-02 audit export pending; record gap) | P3 | Low | Functional | No | Not run |


## 30. Mobile Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-563 | Phone | Approve from a phone | Android Chrome 375 px | 1) Open link from WhatsApp 2) Sign in 3) Approve | — | Works in ≤ 4 taps after sign-in; buttons ≥ 44 px | P0 | Critical | UI/UX | Partial | Not run |
| APP-564 | Phone | Reject with reason on phone keyboard | iPhone Safari | 1) Reject with reason | — | Keyboard doesn't hide the button; reason saved | P1 | High | UI/UX | No | Not run |
| APP-565 | Phone | Raise with a camera photo attachment | Android | 1) Attach → camera | JPG 4 MB | Uploaded; shown | P1 | High | UI/UX | No | Not run |
| APP-566 | Phone | Comment on phone | — | 1) Post | — | Works | P2 | Medium | UI/UX | No | Not run |
| APP-567 | Phone | Notifications open the app | WhatsApp link | 1) Tap the link | — | Opens the request after sign-in | P1 | High | UI/UX | No | Not run |
| APP-568 | Phone | Slow 3G | Throttled | 1) Approve | — | Working state shown; one decision | P2 | Medium | UI/UX | Partial | Not run |
| APP-569 | Phone | Offline → online | — | 1) Toggle airplane mode mid-action | — | Clear error; retry works once | P2 | Medium | UI/UX | No | Not run |
| APP-570 | Phone | Rotate screen mid-form | — | 1) Rotate | — | Typed values kept | P3 | Low | UI/UX | No | Not run |
| APP-571 | Phone | Small screen 320 px | — | 1) Main pages | — | No horizontal page scroll | P3 | Low | UI/UX | Partial | Not run |
| APP-572 | Tablet | Builder on a tablet | iPad | 1) Edit a DoA matrix | — | Usable; table scrolls in its card | P3 | Low | UI/UX | No | Not run |


## 31. Accessibility Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-573 | Keyboard | Raise and approve with keyboard only | — | 1) Tab through, Enter/Space | — | All actions reachable; visible focus ring | P1 | High | UI/UX | Partial | Not run |
| APP-574 | Keyboard | Tab order follows the visual order | Request page | 1) Tab | — | Logical order | P2 | Medium | UI/UX | No | Not run |
| APP-575 | Labels | Every input has a label | Forms | 1) axe / Lighthouse | — | No missing labels (DoA ticks have aria-labels) | P2 | Medium | UI/UX | Yes | Not run |
| APP-576 | Messages | Errors announced | Invalid submit | 1) Screen reader | — | role=alert read; field errors near fields | P2 | Medium | UI/UX | Partial | Not run |
| APP-577 | Status | Success announced | Action | 1) Screen reader | — | role=status read | P3 | Low | UI/UX | Partial | Not run |
| APP-578 | Confirm | In-page confirmation reachable | Withdraw | 1) Keyboard to "Yes, continue" | — | Focusable; announced as alertdialog | P2 | Medium | UI/UX | Partial | Not run |
| APP-579 | Contrast | Colour contrast | All pages | 1) axe | — | WCAG AA (4.5:1 text) | P2 | Medium | UI/UX | Yes | Not run |
| APP-580 | Contrast | Status not by colour alone | Pills, badges | 1) Greyscale view | — | Words carry meaning | P3 | Low | UI/UX | No | Not run |
| APP-581 | Zoom | 200% zoom | — | 1) Zoom | — | No loss of content or function | P3 | Low | UI/UX | No | Not run |
| APP-582 | Screen reader | NVDA on request page | — | 1) Read level map | — | Levels, people, statuses understandable | P3 | Low | UI/UX | No | Not run |


## 32. End-to-End Test Cases



| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-583 | E2E-001 | Successful sequential approval | FX-DEMO, WF-SEQ | 1) REQ raises ₹85,000 with quote.pdf 2) MGR, HOD, FIN, MD approve 3) Check notifications, audit, DB | — | APPROVED; 4 TASK_DECIDED; requester got REQUEST_APPROVED (in-app, email, WhatsApp if live); audit and timeline complete; file downloadable | P0 | Critical | E2E | Yes | Not run |
| APP-584 | E2E-002 | Rejection at HOD | WF-SEQ | 1) Raise 2) MGR approves 3) HOD rejects with reason | — | REJECTED; FIN/MD never asked; requester told with reason | P0 | Critical | E2E | Yes | Not run |
| APP-585 | E2E-003 | Changes → resubmit → approve | WF-SEQ | 1) Raise 2) MGR asks for changes 3) REQ edits + resubmits 4) All approve | — | Same number, round 2, APPROVED; both rounds in history | P0 | Critical | E2E | Yes | Not run |
| APP-586 | E2E-004 | Submit timeout → retry | WF-SEQ, throttled | 1) Submit, lose reply 2) Retry | — | Exactly one request (D-QA-01 fixed) | P0 | Critical | E2E | Partial | Not run |
| APP-587 | E2E-005 | Concurrent approval | WF-GRP | 1) Both checkers approve at once | — | One completion; consistent final state | P0 | Critical | E2E | Partial | Not run |
| APP-588 | E2E-006 | Unauthorised approval | WF-SEQ | 1) OUT opens and POSTs approve | — | 404 / refused; audited | P0 | Critical | E2E | Yes | Not run |
| APP-589 | E2E-007 | Delegation | WF-SEQ | 1) MGR delegates to finl2b 2) Raise 3) finl2b approves | — | Workflow continues; "for Deepa Menon" in history | P0 | Critical | E2E | Yes | Not run |
| APP-590 | E2E-008 | Escalation | WF-SLA | 1) Raise 2) Wait past 2× SLA 3) Run jobs | — | Reminder then escalation to manager + IT, once each | P0 | Critical | E2E | Yes | Not run |
| APP-591 | E2E-009 | DoA band 4 purchase | WF-DOA | 1) BUY raises ₹30,00,000 2) SCM head, Finance head, ED, MD approve | — | All four levels in order; APPROVED | P0 | Critical | E2E | Yes | Not run |
| APP-592 | E2E-010 | DoA band change on resubmit | WF-DOA | 1) ₹50,000 2) SCM asks for changes 3) Resubmit ₹12,00,000 | — | Round 2 adds Finance head and ED | P0 | Critical | E2E | Yes | Not run |
| APP-593 | E2E-011 | Parallel review with a rejection | WF-PAR | 1) Two approve, one rejects | — | REJECTED; MD never asked; remaining tasks closed | P1 | High | E2E | Yes | Not run |
| APP-594 | E2E-012 | Withdraw mid-way | WF-SEQ | 1) MGR approves 2) REQ withdraws | — | CANCELLED; HOD told; no further actions possible | P1 | High | E2E | Yes | Not run |
| APP-595 | E2E-013 | Reopen and approve again | APPROVED request | 1) SA reopens 2) All approve again | — | Round 2 APPROVED; history keeps round 1 | P1 | High | E2E | Yes | Not run |
| APP-596 | E2E-014 | Leaver handover | WF-SEQ at MGR | 1) IT deactivates MGR, hands over to finl2b 2) finl2b approves | — | Continues; audit shows handover | P1 | High | E2E | Yes | Not run |
| APP-597 | E2E-015 | New approval type with its own DoA, live | SESS(IT) | 1) Create with DoA 2) Test mode 3) Publish 4) Raise in each band | — | Routing matches the matrix in all bands; DoA view matches | P0 | Critical | E2E | Yes | Not run |
| APP-598 | E2E-016 | WhatsApp template lifecycle | Test key | 1) Draft 2) Submit 3) Meta approves 4) Sync 5) Trigger event | — | Template live; real event sends WhatsApp with right values; delivery SENT | P1 | High | E2E | Partial | Not run |
| APP-599 | E2E-017 | Custom approval end to end | SESS(REQ) | 1) Custom: MD then ED 2) Both approve | — | APPROVED; CUS number; owner can view | P1 | High | E2E | Yes | Not run |
| APP-600 | E2E-018 | New user first sign-in and first approval | New Google user | 1) IT creates user 2) First sign-in (alert) 3) Approves a task | — | Alert sent; approval recorded | P1 | High | E2E | Partial | Not run |


## 33. Smoke Suite

Run after every deploy, about 20 minutes. If any of these fails, the build isn't usable: stop testing and roll back.

**24 cases:** APP-001, APP-003–APP-005, APP-010, APP-012–APP-015, APP-020, APP-032, APP-050–APP-052, APP-135, APP-177–APP-178, APP-181, APP-185, APP-240, APP-284, APP-323, APP-583–APP-584

| Test Case ID | Scenario | Priority |
|---|---|---|
| APP-001 | Raise a predefined request with valid data | P0 |
| APP-003 | Request page shows the level map from the start | P1 |
| APP-004 | Requester sees the request under My requests | P1 |
| APP-005 | Approver sees the task in the queue | P0 |
| APP-010 | Approve the only pending task at level 1 | P0 |
| APP-012 | Full sequential approval completes the request | P0 |
| APP-013 | Reject with a reason | P0 |
| APP-014 | Ask for changes with a reason | P0 |
| APP-015 | Requester edits and resubmits | P0 |
| APP-020 | View a request as requester | P1 |
| APP-032 | Create and publish a workflow with a DoA matrix | P0 |
| APP-050 | Sign in with Google | P0 |
| APP-051 | Sign in with User ID + password + WhatsApp OTP | P0 |
| APP-052 | Sign out | P1 |
| APP-135 | Single-level approve | P0 |
| APP-177 | USER opens /admin | P0 |
| APP-178 | USER opens /superadmin | P0 |
| APP-181 | Signed-out visitor | P0 |
| APP-185 | USER opens another user's request | P0 |
| APP-240 | Approval needed → new approver | P0 |
| APP-284 | GET /api/attachments/{id} valid | P0 |
| APP-323 | Security headers on every response | P0 |
| APP-583 | Successful sequential approval | P0 |
| APP-584 | Rejection at HOD | P0 |


## 34. Sanity Suite

Run after a small change, such as a fix or a setting: the core path plus the most common validation.

**18 cases:** APP-001, APP-005–APP-006, APP-010, APP-013–APP-015, APP-018, APP-025, APP-061, APP-069, APP-096, APP-163, APP-185, APP-240, APP-323, APP-325, APP-425

| Test Case ID | Scenario | Priority |
|---|---|---|
| APP-001 | Raise a predefined request with valid data | P0 |
| APP-005 | Approver sees the task in the queue | P0 |
| APP-006 | Raise a DoA request in band 1 | P0 |
| APP-010 | Approve the only pending task at level 1 | P0 |
| APP-013 | Reject with a reason | P0 |
| APP-014 | Ask for changes with a reason | P0 |
| APP-015 | Requester edits and resubmits | P0 |
| APP-018 | Requester withdraws an open request | P0 |
| APP-025 | Attach a file when raising | P1 |
| APP-061 | Required field empty | P1 |
| APP-069 | Negative amount | P1 |
| APP-096 | Approve a REJECTED request | P0 |
| APP-163 | Band 2 lower edge ₹1,00,001 | P0 |
| APP-185 | USER opens another user's request | P0 |
| APP-240 | Approval needed → new approver | P0 |
| APP-323 | Security headers on every response | P0 |
| APP-325 | Double-click Submit | P0 |
| APP-425 | Empty file box on submit | P0 |


## 35. Regression Suite

Run before every release. Most cases are already automated in CI (Vitest unit, MySQL integration, Playwright e2e); the rest are manual or partly automated. Cases not tagged P0 or P1 run each quarter.

**361 cases** (every P0 and P1 case, plus cases tagged for regression): APP-001–APP-022, APP-025–APP-028, APP-030, APP-032–APP-034, APP-036–APP-038, APP-041, APP-044, APP-050–APP-053, APP-061, APP-063–APP-064, APP-069, APP-076–APP-077, APP-079, APP-084–APP-087, APP-090–APP-099, APP-101–APP-116, APP-118, APP-120–APP-121, APP-123–APP-125, APP-130–APP-132, APP-135–APP-139, APP-141–APP-147, APP-149–APP-154, APP-156–APP-175, APP-177–APP-181, APP-183–APP-188, APP-190–APP-200, APP-202–APP-213, APP-215, APP-218, APP-221–APP-222, APP-224–APP-225, APP-227–APP-230, APP-232–APP-233, APP-235, APP-239–APP-245, APP-247, APP-250, APP-252, APP-254–APP-256, APP-258–APP-259, APP-262–APP-263, APP-266–APP-275, APP-277–APP-282, APP-284, APP-286–APP-287, APP-289–APP-291, APP-293–APP-304, APP-307–APP-311, APP-313–APP-318, APP-320, APP-322–APP-330, APP-332–APP-334, APP-336, APP-338–APP-339, APP-341–APP-345, APP-349, APP-352–APP-355, APP-357–APP-370, APP-372–APP-374, APP-376–APP-387, APP-390–APP-392, APP-394, APP-396–APP-397, APP-402, APP-410–APP-411, APP-413, APP-421–APP-423, APP-425–APP-426, APP-436, APP-439, APP-461–APP-470, APP-472–APP-474, APP-480–APP-483, APP-497–APP-502, APP-510, APP-513–APP-514, APP-521, APP-526–APP-528, APP-530, APP-540, APP-543, APP-561, APP-563–APP-565, APP-567, APP-573, APP-583–APP-600


## 36. Critical Business Test Suite

These are the cases whose failure could cause financial loss (wrong DoA routing, approval skipped), unauthorised approval, self-approval, duplicate or lost transactions, data corruption, audit or compliance gaps, or a security breach. All of them must pass before go-live and before every release.

**144 cases:** APP-001, APP-005–APP-006, APP-010, APP-012–APP-013, APP-015, APP-018, APP-028, APP-032, APP-034, APP-069, APP-092–APP-097, APP-101, APP-103, APP-105, APP-108–APP-110, APP-113, APP-118, APP-124, APP-131, APP-137, APP-142–APP-143, APP-149, APP-151–APP-152, APP-161–APP-163, APP-167, APP-169, APP-177–APP-179, APP-183–APP-188, APP-191–APP-192, APP-194–APP-196, APP-199, APP-204–APP-206, APP-211, APP-218, APP-227–APP-229, APP-232, APP-235, APP-240, APP-242, APP-254, APP-259, APP-262, APP-266–APP-267, APP-273, APP-275, APP-278–APP-279, APP-287, APP-289, APP-291, APP-293–APP-294, APP-296, APP-301–APP-302, APP-307, APP-309–APP-311, APP-320, APP-323–APP-325, APP-327–APP-328, APP-338–APP-339, APP-342, APP-353–APP-354, APP-358–APP-363, APP-366–APP-369, APP-372–APP-373, APP-376, APP-379, APP-381–APP-384, APP-391, APP-425, APP-436, APP-461–APP-469, APP-480, APP-497, APP-499, APP-513, APP-563, APP-583–APP-592, APP-597

| Test Case ID | Scenario | Priority |
|---|---|---|
| APP-001 | Raise a predefined request with valid data | P0 |
| APP-005 | Approver sees the task in the queue | P0 |
| APP-006 | Raise a DoA request in band 1 | P0 |
| APP-010 | Approve the only pending task at level 1 | P0 |
| APP-012 | Full sequential approval completes the request | P0 |
| APP-013 | Reject with a reason | P0 |
| APP-015 | Requester edits and resubmits | P0 |
| APP-018 | Requester withdraws an open request | P0 |
| APP-028 | Delegate approves for the delegator | P0 |
| APP-032 | Create and publish a workflow with a DoA matrix | P0 |
| APP-034 | Edit a live workflow → new draft version | P0 |
| APP-069 | Negative amount | P1 |
| APP-092 | Raise when no approver resolves | P0 |
| APP-093 | Raise when the only approver is the requester | P0 |
| APP-094 | Raise as an inactive user | P0 |
| APP-095 | Approve a request already APPROVED | P0 |
| APP-096 | Approve a REJECTED request | P0 |
| APP-097 | Approve a withdrawn request | P0 |
| APP-101 | Decide with another person's taskKey | P0 |
| APP-103 | Reject without reason (direct POST) | P0 |
| APP-105 | Resubmit by someone other than the requester | P0 |
| APP-108 | Edit fields while IN_PROGRESS | P0 |
| APP-109 | Edit an APPROVED request | P0 |
| APP-110 | Withdraw by an approver | P0 |
| APP-113 | Reopen by IT Admin | P0 |
| APP-118 | Custom approval naming only yourself | P0 |
| APP-124 | Delegate acts on own request | P0 |
| APP-131 | Try as a non-demo person | P0 |
| APP-137 | Single-level approver inactive at raise | P0 |
| APP-142 | Levels run in order | P0 |
| APP-143 | Later level can't act early | P0 |
| APP-149 | Requester is also their own HOD | P0 |
| APP-151 | Workflow edited while requests are running | P0 |
| APP-152 | All branches approve (join ALL) | P0 |
| APP-161 | Group member raises on own group | P0 |
| APP-162 | Band 1 upper edge ₹1,00,000 | P0 |
| APP-163 | Band 2 lower edge ₹1,00,001 | P0 |
| APP-167 | Band 4 ₹25,00,001 | P0 |
| APP-169 | Amount changed on resubmit moves the band | P0 |
| APP-177 | USER opens /admin | P0 |
| APP-178 | USER opens /superadmin | P0 |
| APP-179 | IT Admin opens /superadmin | P0 |
| APP-183 | USER calls an /admin Server Action | P0 |
| APP-184 | IT Admin calls a /superadmin action | P0 |
| APP-185 | USER opens another user's request | P0 |
| APP-186 | IDOR by id increment | P0 |
| APP-187 | Comment on someone else's request | P0 |
| APP-188 | Download someone else's attachment | P0 |
| APP-191 | IT Admin grants SUPER_ADMIN | P0 |
| APP-192 | IT Admin edits the Super Admin | P0 |
| APP-194 | Remove the last Super Admin | P0 |
| APP-195 | Role removal applies immediately | P0 |
| APP-196 | Deactivation ends sessions | P0 |
| APP-199 | USER creates a predefined workflow | P0 |
| APP-204 | USER calls handover | P0 |
| APP-205 | Job runner without secret | P0 |
| APP-206 | Provider key never readable | P0 |
| APP-211 | Original acts after delegate already approved | P0 |
| APP-218 | Delegate is also the requester of the task | P0 |
| APP-227 | Reminder at due time | P0 |
| APP-228 | Reminder only once | P0 |
| APP-229 | Escalation at twice the time | P0 |
| APP-232 | No escalation after approval | P0 |
| APP-235 | Two job runners at once | P0 |
| APP-240 | Approval needed → new approver | P0 |
| APP-242 | Fully approved → requester | P0 |
| APP-254 | Email provider down | P0 |
| APP-259 | CEOITBox 5xx then recovers | P0 |
| APP-262 | No duplicate notification on double action | P0 |
| APP-266 | Submit is evented | P0 |
| APP-267 | Approve/reject evented with actor | P0 |
| APP-273 | Denied access audited | P0 |
| APP-275 | Provider key change audited without the key | P0 |
| APP-278 | UPDATE on audit_logs blocked | P0 |
| APP-279 | DELETE on audit_logs / approval_events / request_comments blocked | P0 |
| APP-287 | No session | P0 |
| APP-289 | Path traversal via id | P0 |
| APP-291 | Wrong or missing secret | P0 |
| APP-293 | POST /api/auth/password wrong password | P0 |
| APP-294 | Lockout after threshold | P0 |
| APP-296 | OTP wrong or reused | P0 |
| APP-301 | Google token invalid | P0 |
| APP-302 | Google account not created by admin | P0 |
| APP-307 | Manipulated requestId/taskKey | P0 |
| APP-309 | SQL injection in fields | P0 |
| APP-310 | XSS in fields and comments | P0 |
| APP-311 | Cross-site Server Action (CSRF) | P0 |
| APP-320 | API key never in URL | P0 |
| APP-323 | Security headers on every response | P0 |
| APP-324 | Submit retried after a client timeout | P0 |
| APP-325 | Double-click Submit | P0 |
| APP-327 | Approve retried after timeout (processed) | P0 |
| APP-328 | Reject retried after 500 | P0 |
| APP-338 | Request row correct | P0 |
| APP-339 | Task rows mirror the engine state | P0 |
| APP-342 | Failure inside the transaction rolls back | P0 |
| APP-353 | Secrets stored encrypted | P0 |
| APP-354 | Stored path not under web root | P0 |
| APP-358 | Database unavailable on submit | P0 |
| APP-359 | Database unavailable on approve | P0 |
| APP-360 | Cookie flags | P0 |
| APP-361 | Tampered cookie | P0 |
| APP-362 | Forged uid in cookie payload | P0 |
| APP-363 | Revoked session cookie reused | P0 |
| APP-366 | Horizontal escalation via requestId | P0 |
| APP-367 | Vertical escalation via roles in the request | P0 |
| APP-368 | Hidden field tampering on user form | P0 |
| APP-369 | Stored XSS in workflow names, field labels, group names | P0 |
| APP-372 | Executable renamed to .pdf | P0 |
| APP-373 | HTML or SVG upload | P0 |
| APP-376 | Path traversal in file name | P0 |
| APP-379 | Stack details hidden | P0 |
| APP-381 | Secrets absent from the repo and client bundle | P0 |
| APP-382 | Logs don't contain keys or OTPs | P0 |
| APP-383 | Password hashing | P0 |
| APP-384 | OTP brute force | P0 |
| APP-391 | Submit shows a working state | P0 |
| APP-425 | Empty file box on submit | P0 |
| APP-436 | File survives a redeploy | P0 |
| APP-461 | Two approvers of an ANY_ONE step approve at the same moment | P0 |
| APP-462 | Approve vs reject at the same moment (parallel branches) | P0 |
| APP-463 | Same approver, two tabs | P0 |
| APP-464 | Approve in tab A, reject in tab B | P0 |
| APP-465 | Same Server Action POST replayed twice | P0 |
| APP-466 | Approve clicked 10 times fast | P0 |
| APP-467 | Row lock serialises actions | P0 |
| APP-468 | Optimistic check catches lost updates | P0 |
| APP-469 | Delegate and delegator decide together | P0 |
| APP-480 | Timeout but backend processed approval | P0 |
| APP-497 | App restart during an action | P0 |
| APP-499 | MySQL restarts | P0 |
| APP-513 | Approver leaves the organisation | P0 |
| APP-563 | Approve from a phone | P0 |
| APP-583 | Successful sequential approval | P0 |
| APP-584 | Rejection at HOD | P0 |
| APP-585 | Changes → resubmit → approve | P0 |
| APP-586 | Submit timeout → retry | P0 |
| APP-587 | Concurrent approval | P0 |
| APP-588 | Unauthorised approval | P0 |
| APP-589 | Delegation | P0 |
| APP-590 | Escalation | P0 |
| APP-591 | DoA band 4 purchase | P0 |
| APP-592 | DoA band change on resubmit | P0 |
| APP-597 | New approval type with its own DoA, live | P0 |


## 37. Test Data Matrix

### People (from the demo data, FX-DEMO, plus two QA accounts)
| Role in tests | User ID | Name | Department / reports to | Used for |
|---|---|---|---|---|
| Normal user / requester (REQ) | demo.checker1 | Divya Sharma (demo) | Finance → Deepa Menon | Raising WF-SEQ; group member of FIN_CHECKERS |
| Requester for DoA (BUY) | demo.buyer | Arjun Das (demo) | Purchase & SCM → Farhan Ali | WF-DOA |
| Manager (MGR) | demo.finl2a | Deepa Menon (demo) | Finance → Lakshmi Iyer | Level 1 of WF-SEQ |
| HOD (HOD) | demo.finhead | Lakshmi Iyer (demo) | HOD of Finance | Level 2 |
| Finance (FIN) | demo.finctrl | Prakash Nair (demo) | group FIN_CONTROLLER | Level 3 |
| Final approver (MD) | demo.md | Arvind Rao (demo) | group MD_OFFICE | Level 4 |
| ED | demo.ed | Meera Kapoor (demo) | group ED_OFFICE | DoA band 3 and above |
| SCM head | demo.scmhead | Farhan Ali (demo) | HOD of Purchase & SCM | DoA level 1 |
| Delegated approver | demo.finl2b | Vikram Shetty (demo) | Finance | Delegate for MGR |
| Unauthorised user (OUT) | demo.itexec | Imran Khan (demo) | IT | IDOR and permission tests |
| Admin (IT) | qa.it | QA IT Admin | IT_ADMIN only | Admin tests (create in /admin/users) |
| Super Admin (SA) | itadmin | IT Admin (Super Admin) | SUPER_ADMIN | Reopen, providers, templates, demo |
| Inactive user | qa.inactive | QA Inactive | deactivated | Sign-in and approver-inactive tests |
| User without a manager | demo.md | Arvind Rao | no manager | REQUESTER_MANAGER resolution |
| User with several managers | — | — | Not possible: one reporting manager per user (record) | — |
| Duplicate user | qa.dup | — | same email as qa.it | Unique-email test |

### Amounts (DoA bands of WF-DOA: limits ₹1,00,000 / ₹10,00,000 / ₹25,00,000)
| Amount | Expected band | Expected levels |
|---|---|---|
| ₹0 | 1 (today; see D-QA-04) | SCM head |
| ₹1 | 1 | SCM head |
| ₹99,999 | 1 | SCM head |
| ₹1,00,000 | 1 (upper limit is inclusive) | SCM head |
| ₹1,00,001 | 2 | SCM head → Finance head |
| ₹9,99,999 | 2 | SCM head → Finance head |
| ₹10,00,000 | 2 | SCM head → Finance head |
| ₹10,00,001 | 3 | + ED |
| ₹24,99,999 | 3 | + ED |
| ₹25,00,000 | 3 | + ED |
| ₹25,00,001 | 4 | + ED → MD |
| ₹1,00,000.01 (decimal) | 2 | SCM head → Finance head |
| ₹10,000,000,000,000 (1e13, maximum) | 4 | all |
| ₹1e14 | refused: "That number is too large." | — |
| −₹50,000 (negative) | **today band 1, the fewest approvers (D-QA-04)**; should be refused | — |
| "abc" | refused: "Enter a number." | — |

The prompt's own sample thresholds (₹9,999 / ₹10,000 / ₹10,001 / ₹49,999 / ₹50,000 / ₹50,001 / ₹99,999 / ₹1,00,000 / ₹1,00,001) are tested by building a QA matrix with limits ₹10,000 / ₹50,000 / ₹1,00,000 (cases APP DoA in §11, with the limits swapped). The expected bands follow the same inclusive rule.


## 38. Requirement Traceability Matrix

Each requirement's linked cases are listed. **Coverage** means: Covered (3 or more cases), Partially covered (1–2 cases, or a known gap), or Missing (the feature isn't built). Requirements R13, R36–R39 come from the master prompt but aren't built; their cases record the current behaviour.

| Requirement ID | Requirement | Test Case IDs | Coverage | Status |
|---|---|---|---|---|
| R01 | Create and submit a request (predefined and custom) | APP-001–APP-002, APP-004, APP-053–APP-058, APP-061–APP-067, APP-070–APP-076, APP-078, APP-090–APP-091, APP-308, APP-399, APP-451–APP-452, APP-460, APP-474, APP-485, APP-537, APP-551, APP-583 | Covered | Not run |
| R02 | The correct approvers are resolved from the directory (manager, HOD, group, role, person field), never the requester | APP-005, APP-007, APP-035–APP-036, APP-077, APP-092–APP-093, APP-137, APP-139, APP-148–APP-150, APP-158, APP-161, APP-263, APP-401, APP-516–APP-518, APP-520–APP-522, APP-530 | Covered | Not run |
| R03 | Levels run in the defined order; a later level can't act early | APP-003, APP-005, APP-010, APP-012, APP-135, APP-142–APP-143, APP-172–APP-174, APP-534, APP-583 | Covered | Not run |
| R04 | Only the current approver (or their active delegate) can decide | APP-010, APP-101, APP-140–APP-141, APP-307, APP-439, APP-600 | Covered | Not run |
| R05 | Parallel levels: join ALL / ANY_ONE / ANY_N; ANY_N and ANY_ONE within a step | APP-009, APP-152–APP-160, APP-593 | Covered | Not run |
| R06 | A rejection ends the request and closes the other pending tasks | APP-013, APP-079, APP-096, APP-102–APP-103, APP-136, APP-144–APP-146, APP-153, APP-584, APP-593 | Covered | Not run |
| R07 | No response: reminder at the response time, escalation at twice that | APP-154, APP-216, APP-224, APP-226–APP-237, APP-239, APP-290, APP-475, APP-491, APP-506–APP-507, APP-554, APP-590 | Covered | Not run |
| R08 | No approver can decide the same task twice | APP-095, APP-112, APP-211, APP-228, APP-327, APP-346, APP-463 | Covered | Not run |
| R09 | Concurrent actions leave exactly one consistent outcome | APP-235, APP-262, APP-336, APP-341, APP-461–APP-475, APP-478–APP-480, APP-482–APP-484, APP-500, APP-587 | Covered | Not run |
| R10 | A submitted request can't be edited, except through changes required → resubmit; an approved request can't be edited | APP-034, APP-106, APP-108–APP-109 | Covered | Not run |
| R11 | Changes required → resubmit continues on the same number; rejected is final | APP-014–APP-015, APP-099, APP-104–APP-105, APP-107, APP-147, APP-169, APP-330, APP-433, APP-535, APP-585, APP-592 | Covered | Not run |
| R12 | A withdrawn (cancelled) request can't be decided | APP-018, APP-097, APP-594 | Covered | Not run |
| R13 | Request expiry | APP-133, APP-552 | Missing (not built: A-03) | Not run |
| R14 | Notifications go to the right people on in-app, email and WhatsApp | APP-012, APP-031, APP-220, APP-240–APP-253, APP-257, APP-262–APP-265, APP-352, APP-413, APP-492, APP-515, APP-567, APP-583, APP-598 | Covered | Not run |
| R15 | Complete, append-only audit and event trail | APP-021, APP-038, APP-128, APP-200, APP-223, APP-266–APP-282, APP-349, APP-444, APP-488, APP-583 | Covered | Not run |
| R16 | Nobody can open or act on a request they aren't part of (IDOR) | APP-185–APP-190, APP-198, APP-273, APP-286–APP-287, APP-308, APP-366, APP-588 | Covered | Not run |
| R17 | Provider or API failures never change or undo a business action | APP-254–APP-256, APP-258–APP-259, APP-261, APP-322, APP-332–APP-333, APP-342, APP-358–APP-359, APP-445, APP-494, APP-497–APP-499, APP-501–APP-502, APP-508, APP-511 | Covered | Not run |
| R18 | Timeout, retry and idempotency: one business transaction per intent | APP-002, APP-259–APP-260, APP-312, APP-315, APP-317, APP-324–APP-337, APP-344, APP-391, APP-412, APP-465, APP-480, APP-501, APP-503–APP-504, APP-507, APP-568–APP-569, APP-586 | Covered | Not run |
| R19 | Database state matches the UI, notifications and audit | APP-020–APP-022, APP-059–APP-060, APP-282, APP-338–APP-339, APP-341–APP-342, APP-347–APP-348, APP-350–APP-352, APP-357, APP-417, APP-455, APP-481, APP-489, APP-510, APP-512, APP-525, APP-538, APP-550 | Covered | Not run |
| R20 | Security: sessions, CSRF, XSS, injection, headers, rate limits, file upload | APP-076, APP-100, APP-205–APP-206, APP-252, APP-275, APP-289, APP-291–APP-292, APP-298, APP-305–APP-306, APP-309–APP-311, APP-320, APP-323, APP-353, APP-360–APP-363, APP-365, APP-369–APP-371, APP-377–APP-379, APP-381–APP-382, APP-387, APP-389–APP-390, APP-549 | Covered | Not run |
| R21 | DoA matrix per approval type routes by amount band (D-075) | APP-006, APP-032, APP-041, APP-064, APP-068–APP-069, APP-084–APP-087, APP-162–APP-171, APP-402–APP-404, APP-448, APP-528, APP-531–APP-533, APP-548, APP-572, APP-591–APP-592, APP-597 | Covered | Not run |
| R22 | Out-of-office delegation (D-018, D-062) | APP-027–APP-029, APP-088, APP-123–APP-126, APP-202–APP-203, APP-208–APP-223, APP-268, APP-453, APP-469, APP-539–APP-540, APP-589 | Covered | Not run |
| R23 | Hold and resume | APP-016–APP-017, APP-098, APP-116–APP-117, APP-176, APP-234 | Covered | Not run |
| R24 | Withdraw (requester) and reopen (Super Admin) (D-066) | APP-018–APP-019, APP-110–APP-115, APP-175, APP-329, APP-536, APP-594–APP-595 | Covered | Not run |
| R25 | Attachments: types, limits, sniffing, rights, never deleted (D-072) | APP-025–APP-026, APP-127–APP-128, APP-188, APP-274, APP-283–APP-285, APP-288, APP-306, APP-331, APP-343, APP-354, APP-370, APP-372–APP-376, APP-393, APP-421–APP-436, APP-478, APP-490, APP-493, APP-509, APP-565 | Covered | Not run |
| R26 | Append-only comments visible to everyone on the request | APP-011, APP-023–APP-024, APP-080–APP-081, APP-249, APP-566 | Covered | Not run |
| R27 | Workflow authoring, validation, test mode, versions, publish | APP-032–APP-034, APP-082–APP-083, APP-090, APP-121–APP-122, APP-151, APP-170, APP-199, APP-271, APP-345, APP-405, APP-473, APP-495, APP-524, APP-526–APP-527, APP-529, APP-597 | Covered | Not run |
| R28 | Custom approvals: anyone picks anyone, no self-approval | APP-008–APP-009, APP-118–APP-120, APP-198, APP-599 | Covered | Not run |
| R29 | Sign-in (Google; ID + password + WhatsApp OTP), lockout, new-login alert, This wasn't me | APP-050–APP-052, APP-094, APP-141, APP-196, APP-293–APP-304, APP-364, APP-383–APP-386, APP-456–APP-457, APP-600 | Covered | Not run |
| R30 | Role areas /users, /admin, /superadmin (404 for others) | APP-037–APP-038, APP-130, APP-177–APP-184, APP-191–APP-195, APP-207, APP-222, APP-367–APP-368, APP-380, APP-479, APP-519, APP-523, APP-561 | Covered | Not run |
| R31 | WhatsApp template creator and CEOITBox integration (D-076) | APP-044–APP-045, APP-089, APP-129–APP-130, APP-206–APP-207, APP-253, APP-256, APP-258, APP-276, APP-313–APP-321, APP-335, APP-355, APP-371, APP-406–APP-407, APP-447, APP-477, APP-543–APP-546, APP-598 | Covered | Not run |
| R32 | Working calendar and SLA times (D-067) | APP-039, APP-212, APP-214, APP-224–APP-225, APP-237–APP-238, APP-340, APP-449–APP-451, APP-454, APP-458, APP-547 | Covered | Not run |
| R33 | Insights and reporting (D-069) | APP-040, APP-356, APP-388, APP-420, APP-446, APP-459, APP-487, APP-496, APP-553–APP-562 | Covered | Not run |
| R34 | Demo data and Try as (D-071) | APP-042–APP-043, APP-131–APP-132, APP-197, APP-277, APP-416, APP-476, APP-541–APP-542 | Covered | Not run |
| R35 | Handover of a leaver's pending approvals (F-16) | APP-030, APP-138, APP-204, APP-472, APP-513–APP-514, APP-596 | Covered | Not run |
| R36 | Search, filter, sort and pagination of request lists | APP-047–APP-048, APP-437–APP-443, APP-486 | Partially covered (My requests: search, status filter, paging; no date/amount/department filters or IT-wide search) | Not run |
| R37 | Save, edit and delete a draft request | APP-046 | Missing (not built: A-01) | Not run |
| R38 | Admin cancel or close of a request | APP-049, APP-134 | Missing (not built: A-02) | Not run |
| R39 | Auditor or read-only role | APP-200–APP-201 | Missing (not built: A-06) | Not run |
| R40 | Responsive, accessible UI | APP-391–APP-398, APP-400, APP-408–APP-411, APP-414–APP-415, APP-418–APP-419, APP-505, APP-563–APP-565, APP-570–APP-582 | Covered | Not run |


## 39. Defect Risk Scenarios
These were found by reading the code before execution. **Status as of 8 Oct 2026 (S8-06):** the code defects are fixed, each with regression tests; two findings were already handled; three are policy choices waiting for the owner.

| ID | Defect title | Module | Scenario | Expected behaviour | Behaviour found | Severity | Business impact | Fix / status |
|---|---|---|---|---|---|---|---|---|
| D-QA-04 | Negative amount took the lowest DoA band | Forms / DoA | Requester enters −₹50,00,000 | Refused | Was accepted and routed to band 1 (one approver instead of four) | Critical | Approval-level bypass | **Fixed:** NUMBER fields have a minimum (0 for amounts), and a server-side DoA guard refuses any negative DoA amount. Tests: qa-fixes.test, session8.int, session7 e2e |
| D-QA-01 | Duplicate request on retry after a timeout | Submit | Server commits, the reply is lost, the user submits again | One request | A second request was created | High | Duplicate approvals or spend | **Fixed:** a one-time form key (`submission_key`, unique per requester); a repeat returns the first request, including when two copies race. Tests: session8.int |
| D-QA-06 | Notifications lost on a crash between commit and send | Notifications | Process dies after the decision commits | Messages still go out | Messages were lost | Medium | Requests waiting silently | **Fixed:** notification outbox written in the same transaction; sent after the commit, and leftovers sent by the job runner (claimed, sent once). Tests: session8.int |
| D-QA-03 | Attachment limit race and duplicate uploads | Attachments | Two uploads at 19 files, or a retried upload | ≤ 20; no duplicates | 21 possible; the same file stored twice | Low | Clutter, limit bypass | **Fixed:** count and duplicate check (sha256) run under the request-row lock; duplicates are skipped and reported. Tests: session8.int |
| D-QA-02 | Same request raised twice from two tabs | Submit | The same title on the same type within 10 minutes | Ask first | Two requests | Medium | Duplicate approvals | **Fixed:** "You raised … a few minutes ago" with a "This is a separate request" tick; checked after the form is valid. Tests: session8.int, session7 e2e |
| D-QA-11 | Request lists capped at 200 with no search | Lists | Older requests needed | Search, filter, paging | Only the latest 200 | Medium | Usability, audit | **Fixed for My requests:** search by number or title, status filter, 25 per page. Date, amount and department filters, and an IT-wide search, remain open (R36 partial). Tests: session8.int, e2e |
| D-QA-05 | Long comments and reasons cut silently | Decisions | 2,100-character comment | Clear limit | Saved cut to 2,000 / 500 | Low | Lost audit text | **Fixed:** refused with the limit shown; the box also stops at 2,000 |
| D-QA-09 | Live template deleted or paused at CEOITBox | WhatsApp | Removed in the dashboard | App stops using it | Stayed "Live" until a manual sync | Low | Failed WhatsApp sends | **Fixed:** the job runner syncs from Meta once a day (if a key and named templates exist). Tests: session8.int |
| D-QA-15 | Line breaks in email subjects | Email | Title with CR/LF | One-line subject | Depended on Resend | Low | Header spoofing | **Fixed:** CR/LF stripped before sending. Tests: qa-fixes.test |
| D-QA-12 | Confirmations blocked by browsers | UI | Pop-up confirm blocked | Action runs after confirming | Action silently cancelled | High | Submit to Meta looked dead | **Fixed 8 Oct (S7-F3):** in-page confirm bar |
| D-QA-07 | Tasks stuck with a deactivated approver | Users | Deactivate with pending approvals | Blocked | **Already handled:** refused with "Hand them over first" | — | — | No change needed; test case updated |
| D-QA-13 | Reminders while on hold | SLA | Held request passes its due time | No reminder | **Already handled:** the SLA job only reads IN_PROGRESS requests | — | — | No change needed; test case updated |
| D-QA-08 | Delegate can approve two consecutive levels | Delegation | MGR delegates to the HOD | Owner rule | Allowed | Medium (policy) | Four-eyes weakened | **Waiting for the owner (Q-QA-10)** |
| D-QA-14 | Same person approves several levels | Workflow | One person at two levels | Owner rule | Asked twice, approves twice | Low (policy) | Four-eyes weakened | **Waiting for the owner (Q-QA-10)** |
| D-QA-10 | No expiry for stale requests | Lifecycle | Open for months | Owner rule | Stays open | Low (policy) | Clutter | **Waiting for the owner (Q-QA-03)** |

**Areas reviewed and found sound:**
- double approval and double-click;
- self-approval;
- IDOR on requests and files;
- concurrent approvals (row lock and version check);
- reminder duplication;
- unauthorised areas;
- append-only audit, events and comments;
- provider failures never roll back business actions.


## 40. Automation Recommendations
| Area | Automate? | Tool | Why |
|---|---|---|---|
| Engine rules, DoA bands, conditions, status transitions | **Yes**, already in place (Vitest, 209 unit tests) | Vitest | Pure functions: fast, deterministic, the highest value per test |
| Workflow + DB: decisions, locking, rights, delegation, SLA claims, attachments, templates | **Yes**, partly in place (43 MySQL integration tests) | Vitest on `ars_approvals_test` | Proves the DB state, not just the UI. Extend with the §11 boundaries and the §25 races (`Promise.all` on two actions) |
| Browser flows: smoke, permissions, confirmations | **Yes**, partly in place (14 Playwright tests) | Playwright | Catches UI wiring bugs like the "blob" upload and the blocked confirm. Add the §32 E2E cases |
| API and Server Action tampering, IDOR loops | **Yes** | Playwright request API, or a small Node script replaying captured actions | Repetitive and security-critical |
| Concurrency and idempotency | **Partial** | Integration tests with parallel promises; k6 for real races | Exact timing is hard in the UI; the server-side guarantees are testable |
| Provider failures (CEOITBox, Resend) | **Yes** | Stubbed `fetch` (as in session7.int) | Real providers can't be broken on demand |
| Live provider checks (Meta approval, real WhatsApp delivery) | **No**, manual on staging | — | Needs real accounts, a wallet and a phone |
| Performance | **Yes** | k6 or Artillery on staging | Repeatable baselines per release |
| Security scanning | **Partial** | OWASP ZAP baseline + manual checks | Automated scans find headers and XSS; logic flaws need a person |
| Mobile, accessibility, visual layout | **Partial** | axe/Lighthouse in CI; manual on devices | Contrast and labels can be automated; usability can't |
| Recovery (crashes, restores, deploys) | **No**, run as manual drills | — | Infrastructure-level, done rarely |


## 41. QA Coverage Summary

### By test type

| Test type | Test Cases |
|---|---:|
| Functional | 132 |
| Security | 111 |
| UI/UX | 53 |
| Boundary | 43 |
| Database | 35 |
| Negative | 32 |
| Recovery | 32 |
| Edge | 32 |
| Concurrency | 28 |
| Integration | 28 |
| Validation | 24 |
| E2E | 18 |
| Performance | 17 |
| API | 13 |
| Regression | 2 |
| **Total** | **600** |

### By section

| Section | Test Cases |
|---|---:|
| 8. Functional Test Cases | 52 |
| 9. Validation Test Cases | 37 |
| 10. Negative Test Cases | 45 |
| 11. Workflow Test Cases | 42 |
| 12. Role & Permission Test Cases | 31 |
| 13. Delegation Test Cases | 16 |
| 14. Escalation Test Cases | 16 |
| 15. Notification Test Cases | 26 |
| 16. Audit Log Test Cases | 18 |
| 17. API Test Cases | 40 |
| 18. API Timeout & Retry Test Cases | 14 |
| 19. Database Test Cases | 22 |
| 20. Security Test Cases | 31 |
| 21. UI/UX Test Cases (incl. loading states) | 30 |
| 22. Attachment Test Cases | 16 |
| 23. Search & Filter Test Cases | 12 |
| 24. Date/Time Test Cases | 12 |
| 25. Concurrency Test Cases | 20 |
| 26. Performance Test Cases | 16 |
| 27. Recovery Test Cases | 16 |
| 28. Edge Cases | 40 |
| 29. Reporting Test Cases | 10 |
| 30. Mobile Test Cases | 10 |
| 31. Accessibility Test Cases | 10 |
| 32. End-to-End Test Cases | 18 |
| **Total** | **600** |

### Totals

| Measure | Count |
|---|---:|
| Total test cases | 600 |
| P0 (Critical) | 160 |
| P1 (High) | 201 |
| P2 (Medium) | 153 |
| P3 (Low) | 86 |
| Automation candidates (Yes) | 487 |
| Partial automation | 80 |
| Manual only (No) | 33 |
| Smoke suite | 24 |
| Sanity suite | 18 |
| Regression suite | 361 |
| Critical business suite | 144 |


### Critical risks
1. ~~D-QA-04 negative amounts~~, ~~D-QA-01 duplicate on retry~~, ~~D-QA-06 lost notifications~~: **fixed 8 Oct 2026 (S8-06).**
2. Cron must be confirmed on GoDaddy, or reminders, escalations, retries, the outbox and the daily template sync never run.
3. UPLOAD_DIR must be outside the app folder and in the backup, or attachments are lost on redeploy.
4. Policy gaps waiting for the owner: segregation of duties (Q-QA-10) and request expiry (Q-QA-03).

### Missing requirements (not built, from the master prompt)
- Drafts (R37).
- Admin cancel or close (R38).
- Request expiry (R13).
- Search beyond My requests (by date, amount, department or type), and an IT-wide request search (R36, partly built).
- Auditor or read-only role (R39).
- Report export.
- A submission receipt notification (N-06).
- A per-level "approved so far" notification to the requester (N-08).
- Delegation start and end notifications (N-17, to verify).



## 42. Open Questions / Missing Requirements
| ID | Question for the owner | Why it matters | Affects |
|---|---|---|---|
| Q-QA-01 | Do requesters need **drafts** (save and finish later)? | Not built; the prompt expects it | R37 |
| Q-QA-02 | Should IT or the Super Admin be able to **cancel or close** a request, for example a duplicate? Should an approved request ever be cancellable? | Only the requester can withdraw today, and only while open | R38 |
| Q-QA-03 | Should requests **expire** (auto-withdraw after N days without a decision)? | They stay open forever today | R13, D-QA-10 |
| Q-QA-04 | Can a **rejected** request be resubmitted, or must people raise a new one? | Rejected is final today; "ask for changes" is the route back | R11 |
| Q-QA-05 | Is an **Auditor or read-only** role needed (view all requests and the audit log, no admin rights)? | Only IT Admin and Super Admin see everything | R39 |
| Q-QA-06 | Any date rules (no past "needed by" dates, maximum future)? | Dates are free today | Validation |
| Q-QA-07 | ~~Should reminders pause while on hold?~~ They already do (the SLA job only reads IN_PROGRESS) | Answered by the code | D-QA-13 |
| Q-QA-08 | Performance targets: users, requests per day, acceptable response times? | The proposed targets in §26 need sign-off | §26 |
| Q-QA-09 | ~~Must IT hand over before deactivating?~~ Already enforced: deactivation is refused while approvals wait | Answered by the code | D-QA-07 |
| Q-QA-10 | **Segregation of duties:** may one person approve two levels (directly or as a delegate)? | Allowed today | D-QA-08, D-QA-14 |
| Q-QA-11 | If a WhatsApp template is deleted at CEOITBox, should the app switch it off automatically? | Sends fail until the next sync | D-QA-09 |
| Q-QA-12 | Are **zero** amounts valid in DoA approvals, or must they be more than ₹0? | Affects the D-QA-04 fix | R21 |


## 43. Final Recommendations
1. **Done (S8-06):** the code defects D-QA-01 to -06, -09, -11 and -15 are fixed, with regression tests. Run the §33 Smoke and §36 Critical suites to confirm on staging.
2. **Run the Smoke and Critical suites on staging** with the demo data and the CEOITBox test key, then again on production right after go-live, using a real requester and approver pair.
3. **Automate next:**
   - the §11 DoA boundary cases and the §25 race cases as integration tests;
   - the §12 permission tampering as a Playwright request suite;
   - the §32 E2E list.
   These add about 60 automated checks to the current 266 (209 unit, 43 integration, 14 e2e).
4. **Before relying on WhatsApp:**
   - confirm the cron job;
   - plan the outbox (D-QA-06), so notifications survive a crash.
5. **Owner decisions:** get answers to Q-QA-01 to Q-QA-12 and turn each answer into a requirement and test cases. Nine of them are policy choices, not bugs.
6. **Each release:**
   - keep `Status` updated in this file (Pass, Fail with defect ID, Blocked) or in a copy of it;
   - re-run the generator if cases are added, so the IDs, coverage counts and RTM stay correct.
