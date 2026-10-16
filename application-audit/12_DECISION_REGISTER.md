# 12 — Decision register

This register lists:
- the decisions already made that shape future work;
- the decisions the product owner needs to make;
- the open questions, assumptions and unresolved risks found by the audit of 16 Oct 2026.

The project's full decision log stays in `DEVELOPMENT-MEMORY.md` (D-000 to D-142); this file does not replace it.

## A. Architectural decisions in force (from `DEVELOPMENT-MEMORY.md`)

| ID | Decision | Effect on what to build next |
|---|---|---|
| D-000 | North star: multi-level approvals in any custom manner | Engine integrity (REC-02, REC-05, REC-12) comes before new surface area |
| D-001 | One configurable engine as a node graph; no per-department copies | Fixes belong in `server/engine`, not in per-type code |
| D-050 | Engine state stored as JSON plus `state_version`; task projection | Consistency check (REC-34) is needed because of the projection |
| D-055 | The form belongs to the workflow version | Resubmit re-routing (REC-02) must use the request's own version |
| D-012, D-061 | Audit log and comments are append-only (DB triggers) | Retention never purges `audit_logs`, `approval_events` or `request_comments` |
| D-019 | **Approvals are never granted from inside WhatsApp or email** | Approve-by-reply stays out of scope |
| D-004, D-018 | No self sign-up; no shared accounts | Account changes stay admin-only (see DR-03) |
| D-005, D-006, D-025, D-032 | Per-user sign-in method; Google without OTP; password + WhatsApp-only OTP; no step-up OTP | Security fixes work within these methods |
| D-010, D-027, D-028 | GoDaddy Node hosting; the stack mirrors the Power BI site | Single-node design (DR-15); upgrades as a separate project |
| D-034, D-079 | One app, one address, role spaces | — |
| D-037, D-091 | Email via Resend over HTTPS (SMTP blocked) | No SMTP (INT-05) |
| D-057, D-141 | Three-layer visibility; page access managed by the Super Admin | REC-06 tightens page access; REC-09 extends visibility to FYI recipients |
| D-058, D-094, D-130 | Cron-driven job runner with heartbeat | REC-25 adds a lock and splits heavy jobs |
| D-078 | The same person may approve several levels | Separation-of-duties options (REC-15) are opt-in per step |
| D-085 | Approvers must be approver-eligible (designation ticked) | Keep in all fixes |
| D-089 | Loader QA and perf suites outside CI | `10` recommends a nightly or manual run |
| D-113 | `loading.tsx` only on read-only pages (Next 15.5 issue) | Blocks naive skeletons; affects the Next 16 upgrade |
| D-124, D-137 | Feature switches; reports are IT-only | Dashboard CSV should follow the same switches (REC-13, REC-29) |
| D-142 | Inactivity sign-out: 30 min for users and IT; Super Admin exempt | See DR-04 |

## B. Decisions required from the product owner

| ID | Question | Options | Audit recommendation | Blocks | Needed by |
|---|---|---|---|---|---|
| DR-01 | In a parallel stage with an "any one / any N" join, what should one branch's rejection do? | (a) End the request (today); (b) end it only when the join can no longer be met; (c) choose per join | **(c)**, with (a) as the default for existing types | REC-12 | Phase B |
| DR-02 | Can a request ever be "Approved" with no human approval? | (a) Never (an invariant); (b) only predefined types IT marks "may auto-approve"; (c) as today | **(b)**. Custom approvals never. | REC-08 | Phase B |
| DR-03 | How should IT changing a user's email, WhatsApp number or sign-in method be controlled? (Today it allows taking over non-admin accounts.) | (a) Notify the old contacts; (b) Super Admin approval for approver-eligible users; (c) both; (d) accept the risk | **(c)** for approver-eligible users, **(a)** for others | REC-31 | Phase B |
| DR-04 | Should the Super Admin have an inactivity limit? (Exempt since D-142; the session lasts 12 h.) | (a) Keep exempt; (b) a longer limit, e.g. 2 h | **(b)**, as a separate setting | — | Phase A or B |
| DR-05 | What does an expired approval mean? | (a) Badge only (today); (b) shown as Expired everywhere, amend or follow-up needs a reason; (c) also blocked | **(b)** | REC-11 | Phase B |
| DR-06 | Retention durations: notifications, deliveries, login and security records; whether requests are ever purged | Durations per category; purge on or off | Security tables 90 days; notifications per the existing setting; **requests never purged** without legal sign-off | REC-30 | Phase D |
| DR-07 | Make the Cloudflare origin lock (`ORIGIN_SECRET`) mandatory in production? | Yes / no | **Yes**. First confirm it is set on GoDaddy. | REC-07 | Phase A |
| DR-08 | Backups: RTO/RPO sign-off, an off-site destination, encryption-key custody | Destination and cost; who holds the key | Sign off RTO/RPO; encrypted off-site daily; key with the owner | REC-37 | Phase D |
| DR-09 | On resubmit after changes that alter routing, restart from where? | (a) The earliest affected step; (b) from the beginning | **(a)**, with a visible route diff | REC-02 | **Phase A (now)** |
| DR-10 | May a step ever auto-approve or auto-reject on SLA timeout? | (a) Reassign / fallback only; (b) also auto-reject; (c) also auto-approve | **(a)** first; (b) per type later; avoid (c) | REC-14 | Phase C |
| DR-11 | Which form field is "the amount" for each type? Is a Locations master needed? Custom roles? | Per type | Name the amount field per type; Locations and custom roles only if a business need is stated | REC-23, REC-41 | Phase C/E |
| DR-12 | Should some predefined types be raisable only by certain departments or people? | Per type | Yes for sensitive types (e.g. Finance Internal, Price Realisation) | REC-16 | Phase C |
| DR-13 | **What time zone does the production MySQL use?** | Run `SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();` | Do it first (5 minutes, no code) | REC-04 | **Phase A (now)** |
| DR-14 | External services for error tracking or log shipping (possible cost) | None / a hosted tracker | Request id first; decide on a tracker after Phase A | REC-38 | Phase D |
| DR-15 | Accept the single-node design (local-disk files, MySQL rate limits, cron over HTTP) for the next 12 months? | Accept / plan to scale out | **Accept**; revisit if headcount or volume grows by an order of magnitude | — | Now |
| DR-16 | Change the cPanel cron lines (heavy jobs on their own schedule) | — | Yes, after REC-25 ships | REC-25 | Phase D |

## C. Open business items carried over from `PLAN-CHECKLIST.md`

These were not created by the audit and remain with the owner:

| Item | What is pending |
|---|---|
| P0-31, P0-32, P0-33, P0-34 | Staff master, departments, request-type list, first-release templates and approvers (business data) |
| P3-40, P3-41, P3-42, P3-43 | Templates to build: HR/Admin/Recruitment, Finance Internal, Price Realisation, IT/Plant/ASP/Branding/Training |
| GL-01 | UAT per template |
| GL-04 | Backup/restore drill on live |
| GL-05 / P1-38 | **Rotate keys and remove development access before full roll-out.** This includes any secret that was shown in screenshots or chat during development; the values are not repeated here. |
| GL-07 | Pilot |
| P8-04 | Switch off the Asana forms |
| BD-6, BD-7 | Business decisions deferred in `docs/KNOWN_ISSUES.md` |

## D. Assumptions made by this audit

1. The production database schema matches the 30 migrations in the repo, all applied. Live reports v1.8.0 and `database: ok`.
2. Organisation size stays in the "hundreds of users" range stated in the project's design. Several scale findings are P3 on that basis.
3. Local test results (Docker MySQL 8.0, production `next build`) represent production behaviour for logic and authorization. They don't represent production performance or GoDaddy-specific limits.
4. CEOITBox, Resend and Firebase behave as their clients and fakes assume. No live provider call was made.
5. Effort estimates in `09` assume:
   - one developer who knows this codebase, working with an AI coding assistant;
   - each estimate includes tests and the living-file updates;
   - estimates exclude owner review and UAT time.

## E. Unresolved risks (accepted or awaiting decisions)

| Risk | Status | Reference |
|---|---|---|
| Insider risk from IT Admins changing approvers' contact details | Awaiting DR-03 | AUD-16 |
| Time zone mismatch on production | Awaiting DR-13 (5-minute check) | AUD-04 |
| Single copy of backups on the hosting account | Awaiting DR-08 | RISK-06 |
| No external penetration test or production-volume load test | Accepted so far (GO_LIVE checklist verdict) | `docs/GO_LIVE_READINESS_CHECKLIST.md` |
| Framework versions a major behind (Next 16, Tailwind 4, zod 4) | Accepted for now; plan REC-40 after stabilisation | `01` §6.1 |
| Super Admin is the single point of administration (also break-glass) | By design (D-003, D-082) | — |
