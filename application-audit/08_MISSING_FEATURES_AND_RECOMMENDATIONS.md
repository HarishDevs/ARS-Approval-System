# 08 — Missing features and recommendations

These are ranked, evidence-based proposals for ARS Approval Platform v1.8.0, from the audit of 16 Oct 2026.

**Ground rules:**
- Every proposal comes from a finding in this audit (AUD-nn in `06`; source IDs in `03`–`07`) or from an open item in the project's own requirements register.
- Nothing is proposed only because "other apps have it".
- Functionality that already exists is not proposed again.

**Sizes and priorities:**
- **Size:** S ≤ 1 developer-day, M 2–4 days, L 5–9 days, XL ≥ 10 days.
- **Priority:** P0 critical, P1 high, P2 medium, P3 low (definitions in `09`).

**Reuse first.** The codebase already has most of the building blocks the fixes need:

| Building block | Where |
|---|---|
| Route simulation and comparison | `server/approvals/route-compare.ts`, test mode |
| Readiness checks | `server/approvals/readiness.ts` |
| Visibility rule | `lib/db/repositories/visibility.ts` |
| Transactional outbox | `outbox.repository.ts` |
| Claim-based job steps | `server/ops/automation.ts` |
| Audit helper | `recordAudit` |
| Confirm dialogs | `useActionForm` `confirm` |
| Rate limiter | `hitRateLimit` |
| UTC-range date pattern | `audit.repository.ts:132-133` |

---

## 1. Critical bugs and security gaps

### REC-01 — Enforce the contact-change rule in the CSV user import (AUD-01)
- **Problem.** An IT Admin can change another IT Admin's email, WhatsApp number or sign-in method by CSV import, then take over that account.
  - The CSV import never calls `checkContactChange` (`server/import/plan.ts:363-371`).
  - The edit screen does call it (`server/admin/users.ts:125`).
  - Runtime-verified by an audit probe.
- **Proposed behaviour.** The import planner applies the same rule as the edit screen. A row that changes another admin's contact details or sign-in method fails with the same message, unless the actor is the Super Admin.
- **Value:** closes an account-takeover path. **Roles:** IT Admin, Super Admin. **Dependencies:** none.
- **Backend / DB:** call `checkContactChange(snapshot.actor, target, {email, whatsappNumber, signInMethod})` in `planUsers`. No DB change. **Frontend:** none; the existing row error display is used.
- **Security / migration:** none.
- **Size:** S. **Priority:** **P1**.
- **Acceptance criteria:**
  1. An IT Admin importing a new email for another IT Admin gets a row error and no op.
  2. The Super Admin can still do it.
  3. A user's own row is still allowed.
  4. A unit test exists in `tests/import/import-plan.test.ts`.
- **Risk of implementing:** very low. **Risk of not implementing:** insider takeover of an admin account and its approval authority.

### REC-02 — Re-route on resubmit when the values that drive routing change (AUD-02, AUD-11)
- **Problem.** A higher-band DoA level or condition skipped in round 1 stays skipped after the amount is raised on resubmit.
  - `REQUESTING_STEP` keeps APPROVED and SKIPPED nodes (`server/engine/engine.ts:532-538`).
  - Runtime-verified: ₹5,000 → ₹50,00,000 is approved without the CFO.
  - Resubmit also skips the readiness checks (budget BLOCK, unique, duplicates) (`service.ts:646-679`).
- **Proposed behaviour.**
  1. On resubmit with changed values, the server simulates the route with the new values and compares it with the previous route (reusing `compareRoutes`).
  2. If any condition, `skipIf` or DoA outcome changes, the request restarts from the **earliest affected step**, or from the beginning if that is simpler, and keeps its history.
  3. `assessReadiness` (lock: true, excluding itself) runs inside the resubmit transaction.
  4. The requester sees "Routing changed because of your edits: these steps will run again."
- **Value:** restores delegation-of-authority integrity, the platform's core promise. **Roles:** requester, approvers.
- **Dependencies:** owner decision DR-09 (earliest affected step vs. full restart).
- **Backend / DB:** changes to `engine.resubmit` and `service.resubmitRequest`; `request_submission_checks` updated in the same transaction. No schema change.
- **Frontend:** a notice on the resubmit form and the route diff shown on the request page (the component exists in test mode).
- **Security / migration:** no data migration. Requests already in CHANGES_REQUIRED pick up the new behaviour on their next resubmit.
- **Size:** M (2–3 days). **Priority:** **P1**.
- **Acceptance criteria:**
  1. The probe scenario (₹5,000 → ₹50,00,000) now activates the CFO step.
  2. An unchanged amount keeps earlier approvals as today.
  3. Over-budget or duplicate values on resubmit are refused or warned like on first submit.
  4. Unit tests (engine) and integration tests (service) are added.
- **Risk of implementing:** medium. Engine change: rely on the 62 engine unit tests plus new cases. **Risk of not implementing:** approvals above someone's authority look fully approved.

### REC-03 — Stop the bootstrap seed re-granting Super Admin (AUD-03)
- **Problem.** `database/seeds/003_bootstrap_super_admin.sql:11-13` re-adds the roles on every `npm start`.
- **Proposed behaviour.** Grant the roles only when the user row was just created, or only when no active Super Admin exists. Admin edits survive restarts.
- **Value:** privileged access can be revoked durably. **Roles:** Super Admin. **Dependencies:** none.
- **Backend / DB:** change the seed SQL (`WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id)`). **Frontend:** none.
- **Security / migration:** no data change on live; the seed simply stops re-adding.
- **Size:** S. **Priority:** **P1**.
- **Acceptance criteria:** an integration test removes IT_ADMIN from `itadmin`, re-runs the seeds, and the role stays removed. A fresh database still gets the bootstrap Super Admin.
- **Risk of implementing:** low (keep break-glass as the recovery path). **Risk of not implementing:** revocations silently undone on deploy.

### REC-04 — Pin the database session time zone to UTC and assert it (AUD-04)
- **Problem.** No `SET time_zone` on pooled connections (`lib/db/client.ts`), while JS writes UTC and SQL compares with `CURRENT_TIMESTAMP`.
- **Proposed behaviour:**
  1. **First, with no code:** the owner runs `SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();` on production.
  2. Then set `time_zone = '+00:00'` on every pooled connection and in `scripts/database/env.js`.
  3. `/api/health` (or the Super Admin home) reports a mismatch.
- **Value:** correct SLA, overdue, reminder and date-filter behaviour regardless of host settings. **Roles:** everyone.
- **Dependencies:** DR-13, the production time zone check.
- **Backend / DB:** pool `connection` hook; health check. **Frontend:** none.
- **Security / migration:** if production is *not* UTC, existing `DEFAULT CURRENT_TIMESTAMP` values were written in local time. A one-off assessment is needed before any data correction, and no correction runs without owner approval.
- **Size:** S (code); M if production turns out not to be UTC. **Priority:** **P1** until the check is done; then close it or keep it.
- **Acceptance criteria:**
  1. An integration test with the server set to `+05:30` shows overdue and India-date filters unchanged.
  2. The health check shows `dbTimeZone: UTC`.
- **Risk of implementing:** low. **Risk of not implementing:** SLA and dates shifted by hours, if the host isn't UTC.

### REC-05 — One person, one vote per step (AUD-05)
- **Problem.** `decide` (`engine.ts:425-449`) doesn't refuse an actor who has already decided another task on the same node and round. Runtime-verified: a delegate's two votes satisfy ALL.
- **Proposed behaviour.**
  - Refuse with "You've already decided this step".
  - Hide such tasks from the delegate's queue.
  - IT ASSIGN already has the clash check (`engine.ts:650`); reuse it.
- **Value:** separation of duties. **Roles:** approvers, delegates. **Dependencies:** none.
- **Backend / DB:** engine change plus the queue SQL (`PENDING_FOR`). **Frontend:** message only.
- **Security / migration:** none.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** the probe scenario fails with a clear message; a normal delegate-only decision still works; unit and integration tests.
- **Risk of implementing:** low. **Risk of not implementing:** two-person rules met by one person.

### REC-06 — Bind page access to the action, not only to the posting address (AUD-14, SEC-17)
- **Problem.**
  - `checkPageAccess` allows any signed address that maps to no configured page (`server/authorization/page-access.ts:43`).
  - The admin import actions also load on `/superadmin/import`.
  - Shared actions can be posted from a page with Full access.
  - IT's "out of office for someone else" goes through a users-area action.
- **Proposed behaviour:**
  1. Guarded actions and routes declare their page key: `requireApiArea("admin", { page: "admin.import" })`.
  2. For restricted people, an unknown page fails closed.
  3. `users.security` can't be set to View-only (like `neverHidden`).
  4. IT's delegation-for-others moves to an admin action.
- **Value:** makes the v1.8.0 page restrictions trustworthy. **Roles:** restricted users and IT admins.
- **Dependencies:** none. **Backend / DB:** guard signature and about 30 call sites. **Frontend:** none.
- **Security / migration:** none.
- **Size:** M (2 days). **Priority:** P2.
- **Acceptance criteria:** an E2E test marks `admin.import` Hidden for an IT admin; posting the import action to `/superadmin/import` is refused; the same holds for `users.request` View-only via `/users/queue`.
- **Risk of implementing:** medium; it touches many guards, so lean on the guard-action unit test and the E2E suite. **Risk of not implementing:** page restrictions can be sidestepped by anyone who knows how.

### REC-07 — Make the origin lock mandatory in production (AUD-15)
- **Problem.** `ORIGIN_SECRET` is optional (`config/environment.ts:28`). Without it, `CF-Connecting-IP` can be forged at the origin, and every per-IP rate limit is bypassed.
- **Proposed behaviour.** When `NODE_ENV=production`, startup fails if `ORIGIN_SECRET` is missing, or `CF-Connecting-IP` is trusted only when the origin header matched. A Super Admin home tile shows "Origin lock: on/off".
- **Value:** brute-force limits that hold. **Roles:** everyone. **Dependencies:** DR-07; the owner confirms the GoDaddy env and the Cloudflare Transform Rule.
- **Backend / DB:** env schema + `client-ip.ts`. **Frontend:** tile.
- **Security / migration:** the deployment must set the variable *before* the release that requires it.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** a production build without the variable refuses to start, with a clear log line; the origin-lock E2E still passes.
- **Risk of implementing:** a misconfigured deploy won't start (mitigation: release note + checklist). **Risk of not implementing:** weak protection against password and OTP guessing.

## 2. Completion of partially implemented features

### REC-08 — No zero-human-approval outcomes for custom approvals (AUD-07)
- **Problem.** A custom route can finish APPROVED at submit with no human decision: skip conditions, or "skip if nobody", both available to requesters (`step-policy.ts:45-65`, `service.ts:751-790`).
- **Proposed behaviour.**
  - A platform invariant: an APPROVED request has at least one APPROVED approval task.
  - The only exception is a predefined type that IT explicitly marks "may auto-approve".
  - For custom approvals, `skipWhen` is stripped and "if nobody" is forced to BLOCK, unless IT's policy allows otherwise.
- **Value:** every ARS approval number means a human approved it. **Roles:** requesters, IT.
- **Dependencies:** **DR-02** (owner decision).
- **Backend / DB:** service check after `startInstance`; a policy flag in the type settings JSON. **Frontend:** custom form hides the skip options; IT set-up gets a toggle.
- **Security / migration:** existing approved requests unchanged.
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:** a custom request whose every step would skip is refused with a clear message; predefined types without the flag behave the same; tests.
- **Risk of implementing:** could block a legitimate "notify-only" use. Mitigation: FYI-only routes aren't approvals; offer "Tell people" instead. **Risk of not implementing:** self-issued approvals.

### REC-09 — FYI and escalation recipients can open what they're sent (AUD-09)
- **Problem.** FYI (NOTIFY) recipients and escalated-to managers get links that return 404 (`messages.ts:192-208`, `sla.ts:172-195`, `visibility.ts:10-20`).
- **Proposed behaviour.**
  - Store these people as request watchers: a new `request_watchers` table, or reuse `request_collaborators` with a `source` column.
  - Add them to both visibility rules.
  - They get read-only access.
- **Value:** FYI and escalation work as promised. **Roles:** FYI recipients, managers. **Dependencies:** none.
- **Backend / DB:** one additive migration; engine events write watchers; `visibleToSql` / `isParticipant` updated. **Frontend:** the request page shows "You're here for your information".
- **Security / migration:** additive; backfill FYI recipients from `approval_events` payloads (read-only query, owner-approved).
- **Size:** M (2–3 days). **Priority:** P2.
- **Acceptance criteria:** an FYI recipient and an escalation manager can open the request from the message link and can't act on it; search shows it to them; tests.
- **Risk of implementing:** widens visibility. Mitigation: read-only, and only people the workflow named. **Risk of not implementing:** two north-star features broken for recipients.

### REC-10 — Save attachments with the request (AUD-10)
- **Problem.**
  - Files are stored after the request commits, so a request that closes at submit loses them.
  - The minimum-documents rule counts the files picked, not the files saved (`app/users/actions.ts:103-111`, `readiness.ts:109`).
- **Proposed behaviour.**
  - Write files to disk first.
  - Insert the attachment rows inside the submit transaction.
  - Clean up the disk files on rollback.
  - If a required document fails, fail the submit.
- **Value:** no approved request without its documents. **Roles:** requesters, approvers. **Dependencies:** none.
- **Backend / DB:** restructure `prepareFiles`/`addAttachments`; no schema change. **Frontend:** remove the "files failed, add them again" path where it can't apply.
- **Security / migration:** the existing allow-list, sniffing and size checks are kept.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** a request that auto-approves at submit keeps its files; a failed file write rolls back the submit; integration test.
- **Risk of implementing:** a longer transaction. Mitigation: disk writes happen before the transaction opens. **Risk of not implementing:** an incomplete record of authority.

### REC-11 — Enforce approval expiry (AUD-13)
- **Problem.** Expiry is a badge and one notice only (`expiry.ts`); amendments and follow-ups ignore it (`amendments.ts:85`).
- **Proposed behaviour.**
  - Lists, reports and exports show **Expired** as a derived state, with an Expired filter. (My approved requests already has a tab; extend it to reports.)
  - Amend and follow-up on an expired approval require a reason or are blocked, per the owner's choice.
  - A second notice is sent on the day it expires.
- **Value:** expired approvals can't be mistaken for valid ones. **Roles:** requesters, IT, auditors.
- **Dependencies:** **DR-05**.
- **Backend / DB:** no new column (`valid_until` exists). Report and catalogue columns. **Frontend:** badges and filters.
- **Security / migration:** none.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** an expired approval shows Expired everywhere; amend behaves per DR-05; tests.
- **Risk of implementing:** low. **Risk of not implementing:** people act on stale approvals.

### REC-12 — Join rejection semantics, set per join (AUD-06)
- **Problem.** Under an ANY_ONE or ANY_N join, a rejection in one branch ends the whole request (`engine.ts:363-376, 458`). Runtime-verified.
- **Proposed behaviour.**
  - Per join: "a rejection in any branch rejects the request" (today's behaviour, kept as the default for compatibility), or "reject only when the join can no longer be met".
  - The builder exposes the choice on parallel stages.
- **Value:** "any one of these departments" designs work as drawn — the north star's "any custom manner". **Roles:** IT builders, approvers.
- **Dependencies:** **DR-01**.
- **Backend / DB:** engine and builder schema; definitions are JSON, so no migration is needed. **Frontend:** a builder option.
- **Security / migration:** existing versions keep today's behaviour.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** the probe scenario with the new option continues to the Finance branch; the default is unchanged; engine tests.
- **Risk of implementing:** engine complexity. **Risk of not implementing:** workflow designs that silently behave differently from their diagram.

### REC-13 — Notification and job reliability, honestly reported (AUD-08, AUD-17, DEF-06, DEF-08, RISK-11)
- **Problem.**
  - The outbox marks rows sent when nothing was recorded (`service.ts:362-376`).
  - Job steps that swallow errors report OK (`automation.ts:223`).
  - Scheduled-report emails bypass the delivery log and retry (`schedules.ts:219-249`).
  - WhatsApp "failed" receipts are ignored (`receipts.ts:16-25`).
  - 11 event types can't be switched off (`preferences.ts:58-66`).
- **Proposed behaviour.**
  - `deliverOutbox` leaves the row for retry when `summary.recorded` is false.
  - Every job step returns `{status, counts}`.
  - Report emails become deliveries, with retry per recipient.
  - "failed" receipts set FAILED, never downgrading READ.
  - Ungrouped events join groups (optional ones become switchable).
- **Value:** messages aren't silently lost, and failures raise the existing alert. **Roles:** everyone, Super Admin.
- **Dependencies:** none.
- **Backend / DB:** service and job changes; possibly a `report_run_recipients` table (additive). **Frontend:** none (Deliveries already lists rows).
- **Security / migration:** additive.
- **Size:** M (2–3 days). **Priority:** P2.
- **Acceptance criteria:**
  1. A simulated DB error during `notify` leaves the outbox row unsent.
  2. A template-sync failure shows FAILED on Automation and alerts.
  3. A failed receipt shows FAILED.
  4. Tests for each.
- **Risk of implementing:** possible duplicate sends on retry; pair with REC-24. **Risk of not implementing:** lost approvals notices, invisible failures.

## 3. Missing core business functionality

These items are traced to the requirements register or to north-star gaps.

### REC-14 — Timeout actions on SLA breach
- **Problem.** Escalation only notifies (`server/jobs/sla.ts:103-204`). There is no auto-reassign, fallback group, auto-approve or auto-reject. The workflow audit (gap 6) calls this out for the north star.
- **Proposed behaviour.**
  - Per step, at escalation level N, choose one of: notify only (today); reassign to the escalation target; move to a fallback group; auto-approve or auto-reject with a system reason.
  - Every automatic action is audited and shown on the timeline.
- **Value:** stuck approvals resolve without IT intervention. **Roles:** IT builders, approvers, requesters.
- **Dependencies:** REC-09 (escalation recipient visibility); DR-10 (whether auto-approve is ever allowed).
- **Backend / DB:** builder and step schema (JSON); the SLA job calls `mutate` with a system actor; audit rows. **Frontend:** builder options; a timeline label.
- **Security / migration:** a system actor needs a clear audit identity; existing versions keep notify-only.
- **Size:** L (5–7 days). **Priority:** P2.
- **Acceptance criteria:** a configured step reassigns at level 1 and the new approver can act; auto-reject happens only when configured; the job is idempotent under overlapping runs; integration tests.
- **Risk of implementing:** wrong automatic outcomes. Mitigation: off by default, test mode shows the effect. **Risk of not implementing:** approvals stall when people are away and no delegation is set.

### REC-15 — Separation-of-duties options per step
- **Problem.**
  - The same person may approve several levels (D-078 allows it), with no per-step option to forbid it.
  - Register M1.1-25 is Yet to do.
  - REC-05 covers only same-step double votes.
- **Proposed behaviour.** Step options:
  - "must be someone who hasn't approved an earlier level";
  - "not the requester's manager chain" / "only the requester's manager chain";
  - shown in test mode.
- **Value:** configurable governance, true to "any custom manner". **Roles:** IT builders, auditors.
- **Dependencies:** REC-05.
- **Backend / DB:** engine resolve filter; builder JSON. **Frontend:** builder checkboxes.
- **Security / migration:** existing versions unchanged.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** with the option on, an earlier-level approver is excluded from the step (or blocked per the no-approver rule); unit tests.
- **Risk of implementing:** steps with nobody left. Covered by the existing BLOCK/SKIP handling. **Risk of not implementing:** governance relies on people noticing.

### REC-16 — Who may raise a predefined approval type
- **Problem.** Any active user can raise any live predefined type. The workflow audit notes there is no per-type raiser scope.
- **Proposed behaviour.** Per type: everyone (default), or chosen departments, designations, groups or people. The new-request list shows only allowed types, and the server refuses others.
- **Value:** department-specific approvals (e.g. Price Realisation, Finance Internal templates P3-40..43) stay with the right people. **Roles:** requesters, IT.
- **Dependencies:** DR-12.
- **Backend / DB:** type settings JSON, plus a check in `submitRequest` and in `/users/new`. **Frontend:** a type settings section.
- **Security / migration:** default "everyone" keeps today's behaviour.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** a restricted type is invisible and refused for others, including by a direct POST; E2E test.
- **Risk of implementing:** low. **Risk of not implementing:** wrong people raise sensitive types; noise for approvers.

### REC-17 — Reminders to the requester
- **Problem.** Nothing reminds the requester when changes are requested or information is asked (register A15.1-06 Yet to do).
- **Proposed behaviour.** Reminders after N working days, with optional auto-withdraw after M days (off by default).
- **Value:** requests don't sit with the requester forever. **Roles:** requesters.
- **Dependencies:** none.
- **Backend / DB:** an SLA job step reusing `task_reminders` claims (kind values). **Frontend:** settings.
- **Size:** S–M. **Priority:** P3.
- **Acceptance criteria:** a reminder is sent once per level; integration test.
- **Risk of implementing:** reminder noise. Mitigation: opt-out groups (REC-13). **Risk of not implementing:** stale open requests.

### REC-18 — Delegation scoped by type or amount
- **Problem.** Delegation is all-or-nothing and one hop only (`server/approvals/collab.ts:99-141`).
- **Proposed behaviour.** An optional limit by approval type and/or maximum amount. Tasks outside the scope stay with the original approver.
- **Value:** safer out-of-office cover for DoA approvers. **Roles:** approvers, IT.
- **Dependencies:** REC-05.
- **Backend / DB:** additive columns on `delegations`; `canActFor` gets the task context. **Frontend:** delegation form.
- **Size:** M. **Priority:** P3.
- **Acceptance criteria:** a delegate can't act on an out-of-scope task; queue filtering matches; tests.
- **Risk of implementing:** confusion over who holds what. **Risk of not implementing:** over-broad delegations.

## 4. Workflow and usability improvements

### REC-19 — Phone navigation and dialogs (AUD-26, F1)
- **Problem.**
  - The user-space bottom bar appears in the Admin and Super Admin spaces (`AppShell.tsx:139`).
  - The drawer and account menu lack focus handling (`MobileNav.tsx:27-41`, `ProfileMenu.tsx`).
  - `window.confirm` / `alert` sit in `CustomApprovalForm.tsx:130-133`.
- **Proposed behaviour.**
  - Show the bottom bar only in the user space (or give each space its own).
  - The drawer reuses `Dialog variant="drawer"`.
  - The account menu reuses `features/ui/Menu.tsx` (currently unused).
  - The custom form uses `ConfirmDialog`.
  - One nav registry per space feeds the sidebar, palette and bottom bar (UI M2).
- **Value:** usable on phones; fewer accessibility gaps. **Roles:** everyone (admins on phones especially).
- **Dependencies:** none. **Backend / DB:** none. **Frontend:** shell components.
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:**
  1. At 375 px, admin pages show no user links in the bottom bar.
  2. The drawer traps and returns focus.
  3. An axe scan with the drawer or menu open passes.
- **Risk of implementing:** low. **Risk of not implementing:** admins sent out of their space on phones.

### REC-20 — Operational lists that are in the register but not built
- **Problem.** These lists are Yet to do (register A5.1-14/15, A5.2-13/14, A10.2-03/09): due today, due this week, delegated to me, delegated by me, awaiting information, awaiting consultation, requests missing documents.
- **Proposed behaviour.** Add them as quick tabs on the existing `RequestListScreen` and queue filter engine (`server/requests/list-filters.ts`, `queue-filters.ts`). No new screens.
- **Value:** daily work in fewer clicks. **Roles:** requesters, approvers.
- **Dependencies:** REC-26 (sargable dates) is recommended first.
- **Backend / DB:** new tab conditions. **Frontend:** tabs.
- **Size:** M. **Priority:** P3.
- **Acceptance criteria:** each tab's count matches its list; integration tests per tab.
- **Risk of implementing:** low. **Risk of not implementing:** requirement left open.

### REC-21 — Confirmation on high-impact admin actions; guard for demo data (AUD-25)
- **Problem.** These run without confirmation (admin audit §3.3):
  - Load demo data (with no production guard either);
  - remove a provider key;
  - page Hidden for everyone;
  - deactivate a group, department or designation;
  - close an approval type;
  - change working days.
- **Proposed behaviour.**
  - Use the existing `useActionForm` `confirm`, naming the impact.
  - Demo load needs a typed confirmation and is refused when active non-demo users exceed a threshold, or when a "production" setting is on.
- **Value:** prevents one-click damage. **Roles:** IT, Super Admin. **Dependencies:** none.
- **Backend / DB:** demo guard. **Frontend:** confirm options.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** each action asks first; demo load is refused on a populated database; E2E for one.
- **Risk of implementing:** none. **Risk of not implementing:** accidental outages or master-data pollution.

## 5. Reporting and analytics

### REC-22 — Correct numbers at any volume (AUD-19, DEF-07, RISK-14)
- **Problem.**
  - Silent caps make figures wrong once data grows: 50,000 rows in `turnaround_by_step`, 20,000 in `loadQuality` / `loadHistory`.
  - Delegate decisions are credited to different people: to the original approver on the dashboard (`approver_id`), to the delegate in the report (`decided_by`).
  - Cohorts are mixed across reports.
- **Proposed behaviour.**
  - Aggregate in SQL, or show "based on the first N rows" whenever a cap is hit.
  - Pick one attribution rule and one cohort rule, and document them in the metric dictionary.
- **Value:** trustworthy management numbers. **Roles:** IT, management. **Dependencies:** none.
- **Backend / DB:** query rewrites. **Frontend:** a truncation notice.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** a seeded test above the cap gives the same median as the uncapped calculation, or shows the notice; dashboard and report agree for a delegate decision.
- **Risk of implementing:** numbers change and need explaining. **Risk of not implementing:** wrong numbers with no warning.

### REC-23 — Amount and value analytics
- **Problem.** Register A6.5-* and A5.1-28/29 are Yet to do. The amount lives in `form_data_json`; only the budget amount is extracted (`request_submission_checks.request_paise`).
- **Proposed behaviour.**
  - Store the DoA or amount field in an indexed column at submit, then backfill.
  - Add charts: requested vs approved value, value by type and department, threshold proximity.
- **Value:** finance visibility. **Roles:** management, finance.
- **Dependencies:** REC-22; DR-11 (which field is "the amount" per type).
- **Backend / DB:** additive column plus backfill (owner-approved, reversible). **Frontend:** charts in the existing `Charts.tsx`.
- **Size:** M–L. **Priority:** P3.
- **Acceptance criteria:** totals match a manual sum on test data; tests.
- **Risk of implementing:** a backfill on live data needs a backup first. **Risk of not implementing:** the register stays open.

## 6. Automation and integrations

### REC-24 — No duplicate messages on retry (RISK-03)
- **Problem.** A timeout is retryable, but the message may already have been delivered. Resend's `Idempotency-Key` and CEOITBox's `userMessageId` aren't sent (`server/integrations/resend/client.ts:42-56`, `retry-deliveries.ts`).
- **Proposed behaviour.** Send the delivery id as the idempotency key on every attempt.
- **Value:** no double WhatsApp or email. **Roles:** everyone.
- **Dependencies:** check provider support (CEOITBox docs).
- **Backend / DB:** client headers. **Frontend:** none.
- **Size:** S. **Priority:** P3.
- **Acceptance criteria:** a fake-fetch test shows the same key sent on retry.
- **Risk of implementing:** none. **Risk of not implementing:** occasional duplicates.

### REC-25 — One job run at a time; heavy jobs on their own schedule (AUD-18)
- **Problem.**
  - There is no global lock.
  - Backup and template sync aren't claim-safe.
  - All 12 steps run inside one cron HTTP request (`server/ops/automation.ts:209-236`).
- **Proposed behaviour.**
  - Take `GET_LOCK('ars_job_runner', 0)` or a lease row: a second run exits early, recorded as SKIPPED.
  - Backup and exports run on separate cron lines (`/api/jobs/run?only=backup`).
  - The heartbeat is written at the start and at the end.
- **Value:** no double backups, no timeouts. **Roles:** Super Admin.
- **Dependencies:** a cPanel cron change by the owner (DR-16).
- **Backend / DB:** route and automation changes. **Frontend:** the Automation page shows SKIPPED.
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:** two concurrent calls produce one run and one SKIPPED; an integration test.
- **Risk of implementing:** a stale lock. Mitigation: a lease with expiry. **Risk of not implementing:** overlapping heavy work on shared hosting.

## 7. Performance and scalability

### REC-26 — Date filters that use the indexes (AUD-21)
- **Problem.** `DATE(DATE_ADD(col, INTERVAL 330 MINUTE)) BETWEEN ? AND ?` is used everywhere (`analytics.repository.ts:31`, `list-filters.ts:259`, `search.repository.ts:24`, etc.). Because the column is wrapped in a function, the v1.7 indexes can't be used.
- **Proposed behaviour.** Convert India-date ranges to UTC instants in JS and filter with `col >= ? AND col < ?`, reusing the pattern at `audit.repository.ts:132-133`.
- **Value:** lists and analytics stay fast as data grows. **Roles:** everyone.
- **Dependencies:** REC-04 (UTC certainty).
- **Backend / DB:** query helpers. **Frontend:** none.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** `EXPLAIN` shows a range scan on the index; analytics and list tests unchanged; the perf suite is re-run and its numbers recorded.
- **Risk of implementing:** off-by-one at day boundaries. Mitigation: boundary tests. **Risk of not implementing:** gradual slowdown.

### REC-27 — Faster request pages (AUD-27)
- **Problem.**
  - About 16 sequential awaits run on `/users/requests/[id]`, with `listActiveUserOptions` up to 3 times; 14 run on `/users/new/[workflowId]`.
  - Settings are re-read from the database on every call (`server/settings/values.ts:9-15`).
  - The admin layout awaits sequentially.
- **Proposed behaviour.** Run the independent loads in `Promise.all` after the access check, and use React `cache()` per request for people lists, settings and features. No cross-request caching (settings must apply immediately).
- **Value:** faster pages that people use most. **Roles:** everyone. **Dependencies:** none.
- **Backend / DB:** page loaders. **Frontend:** none.
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:** query count and server time before and after, measured with `tests/perf`; E2E unchanged.
- **Risk of implementing:** low. **Risk of not implementing:** latency grows with headcount.

### REC-28 — Database tidy-ups ready for scale (AUD-23, I-3, I-4, I-5, N-1, N-5)
- **Problem.**
  - `notification_outbox.request_id` has no index.
  - The "Approved by me" list and the queue predicates can't use their indexes.
  - `LOWER()` on login lookups defeats the unique index.
  - Tab counts take one query per tab.
  - `pruneOutbox` has no LIMIT.
- **Proposed behaviour.** One additive migration (indexes), plus query rewrites verified with `EXPLAIN`.
- **Value:** scale headroom. **Roles:** everyone.
- **Dependencies:** REC-33 (migration safety) is recommended first.
- **Backend / DB:** additive indexes. **Frontend:** none.
- **Size:** S–M. **Priority:** P3 (P2 for the outbox index).
- **Acceptance criteria:** `EXPLAIN` plans are recorded before and after; tests unchanged.
- **Risk of implementing:** index build time on live. Small tables, so negligible. **Risk of not implementing:** slowdowns later.

## 8. Administration and governance

### REC-29 — Complete the audit trail (AUD-12)
- **Problem.**
  - Submit, withdraw, Super Admin reopen, hold, resume and resubmit are only on the request timeline (`service.ts:589-624`).
  - The approval-type export, dashboard CSV and schedule or alert toggles aren't audited.
  - Some write-plus-audit pairs aren't atomic.
  - Super Admin audit rows omit the IP address.
  - Register M4-09, BC-02 and BC-06 are Yet to do.
- **Proposed behaviour.** Every status-changing engine event and every export writes an `audit_logs` row with the workflow version and before/after values, inside the same transaction, with consistent `sessionId` and IP fields.
- **Value:** a complete audit export for compliance. **Roles:** Super Admin, auditors. **Dependencies:** none.
- **Backend / DB:** service changes; no schema change (`metadata_json`). **Frontend:** audit viewer filters by actor, entity and date (SA-11).
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** each listed action appears in the audit CSV; an integration test per action.
- **Risk of implementing:** larger audit volume. Fine; it is append-only by design. **Risk of not implementing:** audit gaps on privileged actions.

### REC-30 — Retention that actually runs (AUD-20)
- **Problem.** The retention settings only count rows (`server/ops/governance.ts:100-140`). Notifications, deliveries, login logs, OTPs, sessions, tokens, used links, alert events, report runs and export rows are never pruned.
- **Proposed behaviour.**
  - Batched housekeeping (`LIMIT 5000`) that respects legal holds.
  - Security tables (OTPs, sessions, tokens, used links) are pruned after a fixed period, e.g. 90 days.
  - Notifications and deliveries follow `retention.notifications_days`.
  - Audit logs, events and comments are kept forever (D-012).
  - Requests are never purged without an explicit owner decision.
- **Value:** controlled growth and less personal data kept. **Roles:** Super Admin.
- **Dependencies:** **DR-06** (durations); REC-28 (indexes on `created_at`).
- **Backend / DB:** job steps, indexes. **Frontend:** the retention page shows the last purge.
- **Security / migration:** deletion is irreversible, so backup before the first run and owner sign-off.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** a dry run equals the purge count; legal-held rows are untouched; integration tests.
- **Risk of implementing:** irreversible deletion. Mitigation: dry run, backup, sign-off. **Risk of not implementing:** unbounded growth on shared hosting.

### REC-31 — Safeguard for changing an approver's contact details (AUD-16)
- **Problem.** By design, an IT Admin can change any non-admin's email and then sign in as them, including DoA approvers (`user-rules.ts:49-53`).
- **Proposed behaviour (the owner picks one, DR-03):**
  - (a) notify the old email and WhatsApp on any contact change; or
  - (b) require Super Admin approval for approver-eligible users; or
  - (c) both.
- **Value:** insider-risk control on approval authority. **Roles:** IT, Super Admin, approvers.
- **Dependencies:** DR-03.
- **Backend / DB:** rules + notification. **Frontend:** a message on the user edit screen.
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:** the chosen control fires on the edit screen and on import; tests.
- **Risk of implementing:** slows legitimate fixes. **Risk of not implementing:** undetected impersonation of approvers.

### REC-32 — Usable delivery log and honest counts (AUD-28)
- **Problem.**
  - The deliveries log is fixed at the latest 200 with no filter (`app/superadmin/deliveries/page.tsx:21`).
  - The unsent-outbox count stops at 100 but looks like a total.
  - Home tiles cap at 200.
  - Bulk reassign silently caps at 300.
- **Proposed behaviour.**
  - The delivery log gets paging plus filters: status, channel, event, recipient, date.
  - Counts come from `COUNT(*)`.
  - A "showing first N" notice appears wherever a cap remains.
- **Value:** failed messages can be found and fixed. **Roles:** Super Admin, IT.
- **Dependencies:** none.
- **Backend / DB:** repository queries. **Frontend:** the shared `Pagination` component (currently unused).
- **Size:** S–M. **Priority:** P2.
- **Acceptance criteria:** filtering finds a known failed delivery; counts match the database.
- **Risk of implementing:** none. **Risk of not implementing:** operators miss failures.

## 9. Testing, monitoring, backup and operational readiness

### REC-33 — Safe migrations (AUD-22)
- **Problem.**
  - There is no checksum: a half-applied file that is edited resumes at the wrong statement.
  - There is no lock: concurrent starts can apply the same file twice (`scripts/database/migrate.js`).
- **Proposed behaviour.**
  - Store a SHA-256 per file and refuse to resume or skip when it differs.
  - Hold `GET_LOCK('ars_migrate', 60)` around the run.
- **Value:** safe deploys. **Roles:** owner and IT. **Dependencies:** none.
- **Backend / DB:** script change, plus a column on `schema_migrations` (additive, created by the script).
- **Frontend:** none.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** tests show an edited, half-applied file refused, and two concurrent runs serialised.
- **Risk of implementing:** low. **Risk of not implementing:** a corrupted schema after a failed deploy.

### REC-34 — Scheduled consistency check (AUD-24)
- **Problem.** The request `status` and `approval_tasks` copy `state_json`. The repair tool exists because drift has happened (`server/ops/repair.ts:41`).
- **Proposed behaviour.** A daily read-only check compares `state_json` status and pending tasks with the columns and projection. Any mismatch appears on Needs attention and raises an alert; the repair tool is offered.
- **Value:** drift is caught early. **Roles:** IT. **Dependencies:** none.
- **Backend / DB:** a job step. **Frontend:** an attention row type.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** a seeded mismatch is detected and alerted; integration test.
- **Risk of implementing:** none. **Risk of not implementing:** queues silently wrong.

### REC-35 — Bring the operational documents up to date (AUD-29)
- **Problem.**
  - `docs/KNOWN_ISSUES.md` and `docs/SECURITY_AND_AUTHORIZATION_REVIEW.md` are for v1.6.0, and `docs/DEPLOYMENT.md` is for v1.4.0.
  - The cron blocker is still listed (live says `jobRunner OK`).
  - The register contradicts itself (BP1-xx vs M1.1-xx).
  - There are two go-live checklists.
- **Proposed behaviour.**
  - Update all of them to v1.8.x.
  - Record AUD-01..29 in KNOWN_ISSUES.
  - Mark the cron item done.
  - Retire `docs/development/GO_LIVE_CHECKLIST.md`.
  - Fix the register contradiction.
  - Link to `application-audit/`.
- **Value:** decisions taken from accurate documents. **Roles:** owner, IT. **Dependencies:** none.
- **Size:** S. **Priority:** P2.
- **Acceptance criteria:** no document claims a version older than the current release; every open AUD item is listed.
- **Risk of implementing:** none. **Risk of not implementing:** wrong priorities.

### REC-36 — Test coverage where it is thin
- **Problem.** These areas have no direct tests (`10` lists them):
  - the Super Admin UI;
  - CSV import (contact rule);
  - page-access enforcement through actions;
  - the export, audit-CSV and dashboard-CSV routes;
  - groups and type deletion;
  - recall, reopen and consultation E2E.
  - CI also runs no coverage report and sets no thresholds.
- **Proposed behaviour.**
  - Add the missing tests listed in `10`.
  - CI publishes a v8 coverage summary, with thresholds per folder (engine and approvals high, others baseline) that only ratchet up.
- **Value:** regressions caught before release. **Roles:** developers.
- **Dependencies:** none.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** the new tests pass in CI; a coverage summary appears in the CI log; thresholds are enforced.
- **Risk of implementing:** slower CI, about +1 minute. **Risk of not implementing:** regressions in untested admin flows.

### REC-37 — Encrypted, off-site backups (RISK-06)
- **Problem.**
  - Dumps are plain gzip on the same GoDaddy account.
  - The off-site copy is a manual weekly download.
  - Attachment copies are never pruned (`server/ops/backup.ts:127-167`).
  - RTO and RPO are not signed off.
- **Proposed behaviour.**
  - Encrypt dumps with a separate key held outside the app.
  - Automate an off-site copy (provider to be chosen).
  - Align attachment backup pruning with retention.
  - Use async file operations.
- **Value:** recoverability if the host account is lost or compromised. **Roles:** owner, Super Admin.
- **Dependencies:** DR-08 (RTO/RPO, off-site destination, **possible external cost**).
- **Backend / DB:** backup module. **Frontend:** a backup status tile.
- **Size:** M. **Priority:** P2.
- **Acceptance criteria:** the restore drill decrypts and verifies; the off-site copy is listed daily.
- **Risk of implementing:** key management. If the key is lost, the backups are useless; document custody. **Risk of not implementing:** a single point of loss.

### REC-38 — Error tracking and log visibility (OPS-05)
- **Problem.**
  - Logs go only to stdout on GoDaddy, with no aggregation and no error tracker.
  - `logInfo` lacks the request id.
- **Proposed behaviour.**
  - Add the request id to every log line.
  - Optionally ship errors to a tracker (a hosted service may cost money: DR-14).
- **Value:** faster diagnosis. **Roles:** IT.
- **Dependencies:** DR-14.
- **Size:** S (request id); M (tracker). **Priority:** P3.
- **Acceptance criteria:** an error in production can be traced by request id.
- **Risk of implementing:** sending data to a third party; scrub it with the existing redaction. **Risk of not implementing:** slow incident response.

## 10. Optional advanced features (after A–D)

| ID | Proposal | Evidence | Size | Pri | Notes |
|---|---|---|---|---|---|
| REC-39 | Daily digest of pending approvals; per-user quiet hours for non-urgent messages | NOT-06, NOT-07 Not Implemented | M | P3 | Reuse the notification hub; mandatory groups stay immediate. |
| REC-40 | Major dependency upgrades (Next 16, Tailwind 4, zod 4, firebase 13, TypeScript 7) | `01` §6.1 | XL | P3 | A separate project, done after stabilisation. Re-verify the D-113 loading/notFound workaround on Next 16. |
| REC-41 | Locations master; custom roles | ADM-11 Not Implemented; ADM-08 fixed roles | M each | P3 | Only if the business needs them (DR-11). Page access already covers per-person and per-department restrictions. |
| REC-42 | Remaining analytics register items (KPI cards, advanced charts, comparisons; ~465 "Yet to do") | `docs/IMPLEMENTATION_STATUS_REGISTER.md` | XL | P3 | Pick by owner value **after** REC-22 and REC-26, so new numbers are correct and fast. |

## What this audit recommends **not** building yet

1. **Approval by email or WhatsApp reply.** Excluded by decision D-019, and it would weaken authentication.
2. **More analytics KPIs and charts** (REC-42) **before** REC-22 (correct numbers) and REC-26 (fast filters). Otherwise new numbers inherit the same caps and scans.
3. **Framework major upgrades** (REC-40) **during stabilisation**. They change behaviour the app relies on (D-113), so do them as their own project with a full regression run.
4. **ERP or finance integrations and transaction-amount analytics from external systems.** The register marks these Not feasible: no ERP data or access.
5. **Horizontal scaling, object storage or a separate worker service.** The single-node design suits GoDaddy hosting and current volume (DR-15).
6. **Purging business records (requests).** Not until the owner signs off durations and legal-hold policy (DR-06). Security-table pruning (REC-30) can go first.
7. **Custom roles.** Not while page access (v1.8.0) covers the stated need.
