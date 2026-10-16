# 11 — Implementation tracker

Update this file after every development cycle. Change **Development Status**, fill in **Verification Evidence** (test names, CI run, release tag) and add notes. Keep **Audit Status** as found on 16 Oct 2026, so the starting point stays visible.

**Development statuses:**

| Status | Meaning |
|---|---|
| Not Started | — |
| In Progress | — |
| Blocked | Name the blocker |
| Implemented | Code merged, tests pass |
| Verified | Released and checked live or in UAT |
| Deferred | Give the reason and the owner |

**Audit statuses:**

| Status | Meaning |
|---|---|
| Confirmed — runtime | Reproduced by an audit probe |
| Confirmed — code | Cited lines read and confirmed |
| Potential | Depends on configuration or scale |
| Requirement gap | Not built; traced to the register or the north star |
| Decision | Needs an owner decision first |
| Documentation | — |

Feature and finding IDs refer to `03`–`08`. Each task's full acceptance criteria are in `08` under its REC-nn entry.

## Phase A — Stabilisation

| ID | Feature / Task | Priority | Audit Status | Development Status | Dependencies | Acceptance Criteria | Verification Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| A0 | Owner checks: production DB time zone; `ORIGIN_SECRET` set (DR-13, DR-07) | P1 | Potential | Not Started | Owner GoDaddy access | Answers recorded in DEVELOPMENT-MEMORY | — | No code; about 15 minutes |
| A1 | Re-route on resubmit when routing values change; readiness on resubmit (REC-02; AUD-02, AUD-11; REQ-10) | P1 | Confirmed — runtime (D-01); Confirmed — code (D-07) | Not Started | DR-09 | Probe scenario activates the CFO; unchanged values keep approvals; budget and duplicate rules apply on resubmit | — | Tell approvers in the release note |
| A2 | CSV import enforces the contact-change rule (REC-01; AUD-01; AUTH-15) | P1 | Confirmed — runtime (planner probe) | Not Started | — | IT→IT contact change refused; Super Admin allowed; unit test | — | Quick win |
| A3 | Seed stops re-granting Super Admin (REC-03; AUD-03) | P1 | Confirmed — code | Not Started | — | Removed role survives a restart; fresh DB still bootstraps | — | Quick win |
| A4 | Pin the DB session time zone; health reports it (REC-04; AUD-04) | P1 | Potential | Not Started | A0 | Non-UTC session test unchanged; health shows UTC | — | Grows to M if live isn't UTC |
| A5 | One person, one vote per step (REC-05; AUD-05; WF-06) | P2 | Confirmed — runtime | Not Started | — | Probe scenario refused; queue hides the second task | — | Quick win |
| A6 | Honest outbox and job step status (REC-13 part 1; AUD-08, AUD-17) | P2 | Confirmed — code | Not Started | — | DB error leaves the outbox row unsent; soft failure = FAILED + alert | — | Quick win |
| A7 | Page access bound to actions; fail closed; security page exempt (REC-06; AUD-14, SEC-17; AUTH-13) | P2 | Confirmed — code (line 43); bypass not reproduced | Not Started | — | The two E2E bypass scenarios are refused | — | Touches about 30 guards |
| A8 | Confirmations on high-impact admin actions; demo-data guard (REC-21; AUD-25) | P2 | Confirmed — code | Not Started | — | Each action prompts; demo load refused on a populated DB | — | — |
| A9 | Operational documents up to date (REC-35; AUD-29) | P2 | Documentation | Not Started | — | No outdated version claims; every AUD item in KNOWN_ISSUES; cron item closed | — | Live `/api/health` showed `jobRunner OK` on 16 Oct 2026 |
| A10 | Origin lock required in production (REC-07; AUD-15) | P2 | Potential | Not Started | A0, DR-07 | Production start fails without the secret; origin E2E passes | — | Set the env var before publishing |

## Phase B — Feature completion

| ID | Feature / Task | Priority | Audit Status | Development Status | Dependencies | Acceptance Criteria | Verification Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| B0 | Migration checksum and lock (REC-33; AUD-22) | P2 | Confirmed — code (sub-audit) | Not Started | — | Edited half-applied file refused; concurrent runs serialised | — | Before any new migration |
| B1 | No zero-human-approval outcomes (REC-08; AUD-07; REQ-03) | P2 | Confirmed — code; Decision | Not Started | DR-02 | All-skip custom request refused | — | — |
| B2 | FYI and escalation recipients can open the request (REC-09; AUD-09; REQ-16) | P2 | Confirmed — code (sub-audit) | Not Started | B0 | Recipients open read-only; strangers 404 | — | Additive migration; optional backfill |
| B3 | Attachments saved with the request (REC-10; AUD-10; REQ-18) | P2 | Confirmed — code (sub-audit) | Not Started | — | Auto-approved request keeps its files; write failure rolls back | — | — |
| B4 | Complete audit trail (REC-29; AUD-12; WF-14) | P2 | Confirmed — code (sub-audit) | Not Started | — | Each listed action in the audit CSV | — | Register M4-09, BC-02, BC-06 |
| B5 | Expiry enforced (REC-11; AUD-13; REQ-17) | P2 | Confirmed — code (sub-audit); Decision | Not Started | DR-05 | Expired shown everywhere; amend per DR-05 | — | — |
| B6 | Join rejection semantics per join (REC-12; AUD-06; WF-03) | P2 | Confirmed — runtime; Decision | Not Started | DR-01 | Probe scenario continues with the option; default unchanged | — | — |
| B7 | Notification completeness: report emails, failed receipts, preference groups (REC-13 part 2) | P2 | Confirmed — code (sub-audit) | Not Started | A6 | Visible in Deliveries; opt-outs work | — | — |
| B8 | Phone navigation and dialogs (REC-19; AUD-26, F1) | P2 | Confirmed — code (sub-audit) | Not Started | — | 375 px checks; axe with menu or drawer open | — | — |
| B9 | Usable delivery log; honest counts (REC-32; AUD-28) | P2 | Confirmed — code (sub-audit) | Not Started | — | Filter finds a failed delivery; counts match | — | — |
| B10 | Safeguard for approver contact changes (REC-31; AUD-16) | P2 | Decision | Not Started | DR-03 | Control fires on edit and import | — | — |

## Phase C — Core enhancements

| ID | Feature / Task | Priority | Audit Status | Development Status | Dependencies | Acceptance Criteria | Verification Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| C1 | Correct numbers at any volume (REC-22; AUD-19, DEF-07, RISK-14) | P2 | Confirmed — code (sub-audit) | Not Started | — | Above-cap test equals uncapped; dashboard equals report | — | — |
| C2 | Separation-of-duties options per step (REC-15) | P2 | Requirement gap (M1.1-25) | Not Started | A5 | Earlier-level approver excluded when on | — | — |
| C3 | Who may raise each type (REC-16) | P2 | Requirement gap | Not Started | DR-12 | Restricted type invisible and refused | — | — |
| C4 | Timeout actions on SLA breach (REC-14) | P2 | Requirement gap | Not Started | B2, DR-10 | Reassign works; idempotent | — | — |
| C5 | Requester-side reminders (REC-17) | P3 | Requirement gap (A15.1-06) | Not Started | — | One reminder per level | — | — |
| C6 | Operational lists (REC-20) | P3 | Requirement gap (A5.x, A10.2-x) | Not Started | D4 recommended | Tab counts equal the lists | — | — |
| C7 | Scoped delegation (REC-18) | P3 | Requirement gap | Not Started | A5 | Out-of-scope task not actionable | — | — |
| C8 | Amount and value analytics (REC-23) | P3 | Requirement gap (A6.5-*) | Not Started | C1, DR-11 | Totals match a manual sum | — | Backfill after a backup |

## Phase D — Scalability and governance

| ID | Feature / Task | Priority | Audit Status | Development Status | Dependencies | Acceptance Criteria | Verification Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| D2 | Scheduled consistency check (REC-34; AUD-24) | P2 | Confirmed — code (sub-audit) | Not Started | — | Seeded mismatch detected and alerted | — | — |
| D3 | Job runner lock; heavy jobs split (REC-25; AUD-18) | P2 | Potential | Not Started | DR-16 | One run + one SKIPPED under concurrency | — | Owner changes the cron lines |
| D4 | Date filters that use indexes (REC-26; AUD-21) | P2 | Confirmed — code (sub-audit) | Not Started | A4 | `EXPLAIN` range scans; tests unchanged; perf recorded | — | — |
| D5 | Faster request pages (REC-27; AUD-27) | P2 | Confirmed — code (sub-audit) | Not Started | — | Query count and time before/after recorded | — | — |
| D6 | Database tidy-ups: outbox index, query shapes, LOWER(), tab counts, prune limit (REC-28) | P3 (outbox index P2) | Confirmed — code (sub-audit) | Not Started | B0 | `EXPLAIN` before/after | — | — |
| D7 | Retention that runs (REC-30; AUD-20) | P2 | Confirmed — code (sub-audit); Decision | Not Started | DR-06, D6 | Dry run equals purge; held rows untouched | — | Irreversible: backup + sign-off |
| D8 | Tests and coverage where thin (REC-36) | P2 | Confirmed (coverage gaps) | Not Started | — | Coverage in CI; thresholds enforced; tests from `10` §3 | — | — |
| D9 | Encrypted off-site backups (REC-37; RISK-06) | P2 | Potential; Decision | Not Started | DR-08 | Restore drill decrypts and verifies | — | Key custody |
| D10 | Request id in logs; optional error tracker (REC-38; OPS-05) | P3 | Confirmed — code (sub-audit) | Not Started | DR-14 | Error traceable by request id | — | Possible external cost |
| D11 | Provider idempotency keys (REC-24; RISK-03) | P3 | Potential | Not Started | — | Same key on retry | — | — |

## Phase E — Advanced

| ID | Feature / Task | Priority | Audit Status | Development Status | Dependencies | Acceptance Criteria | Verification Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| E1 | Daily digest and quiet hours (REC-39; NOT-06, NOT-07) | P3 | Requirement gap | Not Started | B7 | Digest sent once a day; quiet hours respected for non-urgent messages | — | — |
| E2 | Major framework upgrades (REC-40) | P3 | Maintainability | Deferred | Phases A–D | Full regression green on the new versions | — | Separate project |
| E3 | Locations master / custom roles (REC-41; ADM-11, ADM-08) | P3 | Requirement gap; Decision | Deferred | DR-11 | Per the stated business need | — | Only if needed |
| E4 | Selected analytics register items (REC-42) | P3 | Requirement gap (~465 rows) | Deferred | C1, D4 | Per item | — | Choose with the owner |

## P3 backlog (not scheduled; pick up when touching the area)

The source IDs are in `06` §B and `07`. The main ones:
- **Hardening:** SEC-04, SEC-05, SEC-09, SEC-13, SEC-16, SEC-19, SEC-21.
- **Workflow:** R-03 (idempotent decision message), R-04 (consultation unique key, close on finish), R-06 (custom code collision), R-08 (runtime approver eligibility).
- **Database:** F-3 (FK error deleting a type), I-5 (`LOWER()` on login), T-5 (`DEMO` in the `login_logs` enum).
- **UI:** N3, N4, L2, L3, A3 to A6, D1 to D3, M1.
