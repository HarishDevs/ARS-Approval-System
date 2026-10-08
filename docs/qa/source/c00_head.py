EXTRA["head"] = r'''# ARS Approval Platform: QA Test Suite

Prepared 8 Oct 2026 for build session 7, commit `a3e5d51`, against the owner's master QA prompt. Updated the same day after the S8-06 defect fixes.
The suite has **{TOTAL} executable test cases**.

These cases are written for **this application**: its real statuses, roles, screens, Server Actions, MySQL tables, DoA matrix, CEOITBox WhatsApp and Resend email. They are not for a generic system.
- Where the master prompt asks about a feature the platform doesn't have (drafts, admin cancellation, expiry, search, an auditor role), the case **checks the current behaviour** and the gap is listed in §42.
- Behaviour was read from the code: `server/engine`, `server/approvals`, `lib/db/repositories`, `app/**/actions.ts`.

Each test case gives its **Preconditions** as fixture codes (FX-…, WF-…), defined in §7.

The file is generated from `docs/qa/source/` (one compact line per case). To add or change cases, edit those files and run `python docs/qa/source/gen.py docs/qa/QA-TEST-SUITE.md`; the IDs, suites, RTM and counts are recomputed. Before a run, every case's **Status** is `Not run`.

## 1. Application Overview
| Item | Detail |
|---|---|
| Purpose | Replaces 104 Asana approval projects. North star: **multi-level approvals in any custom manner** |
| URL | `approval.arssteels.net`, one Next.js 15 app on GoDaddy Node.js hosting with MySQL 8 |
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
'''

REQS.extend([
    ("R01", "Create and submit a request (predefined and custom)", None),
    ("R02", "The correct approvers are resolved from the directory (manager, HOD, group, role, person field), never the requester", None),
    ("R03", "Levels run in the defined order; a later level can't act early", None),
    ("R04", "Only the current approver (or their active delegate) can decide", None),
    ("R05", "Parallel levels: join ALL / ANY_ONE / ANY_N; ANY_N and ANY_ONE within a step", None),
    ("R06", "A rejection ends the request and closes the other pending tasks", None),
    ("R07", "No response: reminder at the response time, escalation at twice that", None),
    ("R08", "No approver can decide the same task twice", None),
    ("R09", "Concurrent actions leave exactly one consistent outcome", None),
    ("R10", "A submitted request can't be edited, except through changes required → resubmit; an approved request can't be edited", None),
    ("R11", "Changes required → resubmit continues on the same number; rejected is final", None),
    ("R12", "A withdrawn (cancelled) request can't be decided", None),
    ("R13", "Request expiry", "Missing (not built: A-03)"),
    ("R14", "Notifications go to the right people on in-app, email and WhatsApp", None),
    ("R15", "Complete, append-only audit and event trail", None),
    ("R16", "Nobody can open or act on a request they aren't part of (IDOR)", None),
    ("R17", "Provider or API failures never change or undo a business action", None),
    ("R18", "Timeout, retry and idempotency: one business transaction per intent", None),
    ("R19", "Database state matches the UI, notifications and audit", None),
    ("R20", "Security: sessions, CSRF, XSS, injection, headers, rate limits, file upload", None),
    ("R21", "DoA matrix per approval type routes by amount band (D-075)", None),
    ("R22", "Out-of-office delegation (D-018, D-062)", None),
    ("R23", "Hold and resume", None),
    ("R24", "Withdraw (requester) and reopen (Super Admin) (D-066)", None),
    ("R25", "Attachments: types, limits, sniffing, rights, never deleted (D-072)", None),
    ("R26", "Append-only comments visible to everyone on the request", None),
    ("R27", "Workflow authoring, validation, test mode, versions, publish", None),
    ("R28", "Custom approvals: anyone picks anyone, no self-approval", None),
    ("R29", "Sign-in (Google; ID + password + WhatsApp OTP), lockout, new-login alert, This wasn't me", None),
    ("R30", "Role areas /users, /admin, /superadmin (404 for others)", None),
    ("R31", "WhatsApp template creator and CEOITBox integration (D-076)", None),
    ("R32", "Working calendar and SLA times (D-067)", None),
    ("R33", "Insights and reporting (D-069)", None),
    ("R34", "Demo data and Try as (D-071)", None),
    ("R35", "Handover of a leaver's pending approvals (F-16)", None),
    ("R36", "Search, filter, sort and pagination of request lists", "Partially covered (My requests: search, status filter, paging; no date/amount/department filters or IT-wide search)"),
    ("R37", "Save, edit and delete a draft request", "Missing (not built: A-01)"),
    ("R38", "Admin cancel or close of a request", "Missing (not built: A-02)"),
    ("R39", "Auditor or read-only role", "Missing (not built: A-06)"),
    ("R40", "Responsive, accessible UI", None),
])
