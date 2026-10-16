# 09 — Prioritized development roadmap

Based on the audit of ARS Approval Platform v1.8.0 (16 Oct 2026).

## Priority definitions

| Priority | Meaning |
|---|---|
| **P0 — Critical** | Confirmed security exposure, severe data-integrity problem or production-blocking failure. **None found.** |
| **P1 — High** | Essential workflow gap, major defect, or something that blocks reliable business use. |
| **P2 — Medium** | Significant usability, operational, reporting or maintainability improvement. |
| **P3 — Low** | Optional enhancement or refinement. |

Within each priority, items are ordered by business impact, then dependency, then risk reduction, then effort.

## Effort assumptions

- Estimates are **provisional** developer-days for one developer who knows this codebase, working with an AI coding assistant.
- They **include**:
  - code;
  - unit, integration and E2E tests;
  - the living-file updates (DEVELOPMENT-MEMORY, PLAN-CHECKLIST, FLOWS);
  - a full local regression run.
- They **exclude**: owner decisions, UAT, publishing and waiting on external parties.
- **No calendar dates are promised.** Capacity and owner turnaround are unknown.

## Quick wins and architectural changes

**Quick wins** (≤1 day each, low risk):
- A2 (import rule)
- A3 (seed)
- A4 (time zone pin, once DR-13 is checked)
- A5 (one vote per step)
- A6 (outbox / job status honesty)
- A8 (confirmations and demo guard)
- A9 (docs)
- A10 (origin lock)
- D1 (migration checksum and lock)
- D2 (consistency check)
- D11 (idempotency keys)

**Architectural changes** (design first, more risk):
- A1 (resubmit re-routing in the engine)
- A7 (page-access binding to actions)
- B2 (watchers in the visibility model)
- B3 (attachments inside the submit transaction)
- B6 (join semantics)
- C3 (timeout actions with a system actor)
- D4 (date predicate rewrite)
- E2 (framework upgrades)

---

## Phase A — Stabilisation (release v1.8.1, then v1.8.2) · ≈ 10–12 developer-days

The goal is to close the confirmed P1s and the defects that undermine trust in approvals, without schema migrations, so rollback stays trivial.

| Order | Item | Feature / finding IDs | Dependencies | Deliverables | Acceptance criteria | Effort (d) | Testing |
|---|---|---|---|---|---|---|---|
| A0 | **Owner checks (no code):** production DB time zone; `ORIGIN_SECRET` set on GoDaddy | DR-13, DR-07 → AUD-04, AUD-15 | Owner access to GoDaddy | Recorded answers in DEVELOPMENT-MEMORY | Both answers recorded | 0 (owner, ~15 min) | — |
| A1 | Re-route on resubmit when routing values change; readiness on resubmit | REC-02 → AUD-02 (P1), AUD-11; REQ-10 | DR-09 | Engine and service change, route-diff notice, readiness inside the resubmit transaction | Probe scenario (₹5,000 → ₹50 lakh) activates the CFO; unchanged values keep approvals; over-budget or duplicate on resubmit handled like first submit | 2.5–3 | Engine unit cases; integration (band change, budget, unique); E2E resubmit with an amount change |
| A2 | Contact-change rule in the CSV import | REC-01 → AUD-01 (P1); AUTH-15 | — | `planUsers` check | IT→IT email change refused; Super Admin allowed | 0.5 | Unit (`import-plan.test.ts`); integration import run |
| A3 | Seed no longer re-grants Super Admin | REC-03 → AUD-03 (P1) | — | Seed SQL | A removed role survives a restart; a fresh DB still gets a bootstrap admin | 0.5 | Integration (re-run seeds) |
| A4 | Pin the DB session time zone; health reports it | REC-04 → AUD-04 (P1 potential) | A0 | Pool hook, env.js, health field | Integration on `+05:30` shows overdue and date filters unchanged | 0.5–1 (+ M if live isn't UTC) | Integration with a non-UTC session |
| A5 | One person, one vote per step | REC-05 → AUD-05; WF-06 | — | Engine check + queue SQL | Probe scenario refused with a clear message | 1 | Engine unit; integration delegate case |
| A6 | Honest outbox and job status | REC-13 (part 1) → AUD-08, AUD-17 | — | `deliverOutbox` honours `recorded`; steps return `{status}` | Simulated DB error leaves the row unsent; template-sync failure = FAILED + alert | 1 | Unit (notify deps); integration (automation) |
| A7 | Page access bound to actions; fail closed on unknown pages; security page exempt | REC-06 → AUD-14, SEC-17; AUTH-13 | — | Guard option `page`, ~30 call sites, admin delegation action | E2E: Hidden `admin.import` can't be used via `/superadmin/import`; View `users.request` can't decide via `/users/queue` | 2 | Guard-action unit; new E2E cases; full E2E |
| A8 | Confirmations on high-impact admin actions; demo-data guard | REC-21 → AUD-25 | — | `confirm` options; guarded demo load | Each action prompts; demo load refused on a populated DB | 0.5–1 | E2E (one), unit (guard) |
| A9 | Documents up to date | REC-35 → AUD-29 | — | KNOWN_ISSUES, SECURITY review, GO_LIVE, DEPLOYMENT, register fix; links to `application-audit/` | No doc claims an old version; every open AUD item listed | 1 | Review |
| A10 | Origin lock required in production | REC-07 → AUD-15 | A0, DR-07 | Env rule + IP trust rule + status tile | Production build without the secret refuses to start; origin E2E passes | 0.5 | Origin-lock E2E; unit (`client-ip`) |

**Deployment and rollback (Phase A):**
- There are no migrations.
- **Before publishing:** take a backup (GL-04 drill recommended).
- **If anything fails:** republish tag `v1.8.0`.
- **A10:** set the variable on GoDaddy *before* publishing.
- **A1** changes the behaviour of requests currently in "Changes required". Tell the approvers in the release note.

## Phase B — Feature completion (release v1.9.0) · ≈ 21–23 developer-days

| Order | Item | IDs | Dependencies | Deliverables | Acceptance criteria | Effort (d) | Testing |
|---|---|---|---|---|---|---|---|
| B0 | Safe migrations (moved forward because B2 adds a migration) | REC-33 → AUD-22 | — | Checksum + lock in `migrate.js` | Edited half-applied file refused; concurrent runs serialised | 1 | Script tests (integration) |
| B1 | No zero-human-approval outcomes | REC-08 → AUD-07; REQ-03 | DR-02 | Service invariant, type flag, custom form tidy | All-skip custom request refused | 1.5 | Unit + integration + E2E (custom) |
| B2 | FYI and escalation recipients can open the request | REC-09 → AUD-09; REQ-16 | B0 | `request_watchers` (additive), visibility rules, read-only view | FYI recipient and escalation manager open the link; can't act | 3 | Integration (visibility), E2E (FYI link) |
| B3 | Attachments saved with the request | REC-10 → AUD-10; REQ-18 | — | Restructured submit file flow | Auto-approved-at-submit request keeps its files; failed write rolls back | 2.5 | Integration; E2E |
| B4 | Complete audit trail | REC-29 → AUD-12; WF-14 | — | Audit rows for lifecycle events and exports; atomic write+audit; audit viewer filters | Each listed action appears in the audit CSV | 2.5 | Integration per action |
| B5 | Expiry enforced | REC-11 → AUD-13; REQ-17 | DR-05 | Expired state in lists/reports; amend rule; second notice | Expired shows everywhere; amend per DR-05 | 2 | Integration; E2E |
| B6 | Join rejection semantics per join | REC-12 → AUD-06; WF-03 | DR-01 | Engine + builder option | Probe scenario continues with the new option; default unchanged | 2.5 | Engine unit; builder E2E |
| B7 | Notification completeness | REC-13 (part 2) → DEF-06, DEF-08, RISK-11; NOT-05, NOT-10, RPT-06 | A6 | Report emails as deliveries, failed receipts, preference groups | Each case visible in Deliveries; opt-outs work | 2 | Unit + integration |
| B8 | Phone navigation and dialogs | REC-19 → AUD-26, F1 | — | Shell nav registry, drawer, account menu, confirm dialog | 375 px checks; axe with menu or drawer open | 1.5 | E2E + axe |
| B9 | Usable delivery log; honest counts | REC-32 → AUD-28; SA-05, SA-06 | — | Paging, filters, true counts | Known failed delivery found by filter | 1.5 | Integration + E2E |
| B10 | Safeguard for approver contact changes | REC-31 → AUD-16 | DR-03 | Notification and/or Super Admin approval | Control fires on edit and import | 1.5 | Unit + integration |

**Deployment and rollback (Phase B):**
- One additive migration (B2), plus the B0 script change.
- Republishing `v1.8.x` works on the new schema.
- Back up before publishing.
- The B2 backfill of FYI recipients is a separate, owner-approved, reversible step.

## Phase C — Core enhancements (release v1.10.0) · ≈ 26–28 developer-days

| Order | Item | IDs | Dependencies | Deliverables | Acceptance criteria | Effort (d) | Testing |
|---|---|---|---|---|---|---|---|
| C1 | Correct numbers at any volume | REC-22 → AUD-19, DEF-07, RISK-14; RPT-01 | — | SQL aggregation / truncation notices; one attribution and cohort rule | Above-cap test matches uncapped; dashboard = report | 3 | Integration (seeded volume) |
| C2 | Separation-of-duties options per step | REC-15 | A5 | Builder options + engine filter | Earlier-level approver excluded when on | 3 | Engine unit; E2E builder |
| C3 | Who may raise each type | REC-16 | DR-12 | Type settings + server check + list filter | Restricted type invisible and refused (incl. direct POST) | 3 | Integration + E2E |
| C4 | Timeout actions on SLA breach | REC-14 | B2, DR-10 | Step options, system actor, audit | Reassign at level 1 works; idempotent under overlap | 6 | Integration (SLA job); E2E |
| C5 | Requester-side reminders | REC-17 | — | SLA job step | One reminder per level | 1.5 | Integration |
| C6 | Operational lists | REC-20 | D4 recommended | Quick tabs on existing lists | Tab counts = lists | 3 | Integration per tab |
| C7 | Scoped delegation | REC-18 | A5 | Delegation scope by type or amount | Out-of-scope task not actionable | 3 | Unit + integration |
| C8 | Amount and value analytics | REC-23 | C1, DR-11 | Amount column + backfill + charts | Totals match a manual sum | 4 | Integration |

**Deployment and rollback (Phase C):**
- Additive columns only: the C7 delegation scope and the C8 amount column.
- The C8 backfill runs after a backup, with owner approval.
- Every new option is off by default, so behaviour is unchanged until IT turns it on.

## Phase D — Scalability and governance (can interleave with C) · ≈ 20–21 developer-days

| Order | Item | IDs | Dependencies | Deliverables | Acceptance criteria | Effort (d) | Testing |
|---|---|---|---|---|---|---|---|
| D1 | (Delivered as B0) | — | — | — | — | — | — |
| D2 | Scheduled consistency check | REC-34 → AUD-24 | — | Job step + attention row | Seeded mismatch detected and alerted | 1 | Integration |
| D3 | Job runner lock; heavy jobs split | REC-25 → AUD-18 | DR-16 | Lease or `GET_LOCK`, `?only=` routes, start/end heartbeat | Concurrent calls → one run + one SKIPPED | 2 | Integration |
| D4 | Date filters that use indexes | REC-26 → AUD-21 | A4 | UTC-range helpers across repositories | `EXPLAIN` range scans; tests unchanged; perf suite re-run and recorded | 2.5 | Integration + perf suite |
| D5 | Faster request pages | REC-27 → AUD-27 | — | `Promise.all` + `cache()` | Query count and time before/after recorded | 1.5 | E2E + perf |
| D6 | Database tidy-ups | REC-28 → AUD-23, I-3, I-4, I-5, N-1, N-5 | B0 | Additive indexes + query rewrites | `EXPLAIN` before/after recorded | 1.5 | Integration |
| D7 | Retention that runs | REC-30 → AUD-20; SA-08 | DR-06, D6 | Batched, hold-aware pruning | Dry run = purge; held rows untouched | 3 | Integration |
| D8 | Tests and coverage where thin | REC-36 | — | Tests listed in `10`; CI coverage + thresholds | Coverage summary in CI; thresholds enforced | 4 | CI |
| D9 | Encrypted off-site backups | REC-37 | DR-08 | Encryption, off-site copy, pruning, async fs | Restore drill decrypts and verifies | 3 | Integration (backup) |
| D10 | Request id in logs; optional error tracker | REC-38 | DR-14 | Logger change; tracker integration | Error traceable by request id | 1–2 | Unit |
| D11 | Provider idempotency keys | REC-24 | — | Headers on retries | Same key on retry (fake fetch) | 0.5 | Unit |

**Deployment and rollback (Phase D):**
- D7 deletes data irreversibly. Back up first, get owner sign-off, and run a dry run on live before the first purge.
- D9 needs key custody agreed first.
- The other items are additive.

## Phase E — Advanced capabilities (after A–D, by owner value)

| Order | Item | IDs | Dependencies | Effort | Notes |
|---|---|---|---|---|---|
| E1 | Daily digest and quiet hours | REC-39; NOT-06, NOT-07 | B7 | M (3–4 d) | Mandatory messages stay immediate |
| E2 | Major framework upgrades | REC-40 | Phase A–D done; full regression | XL (10+ d) | Separate project; re-verify D-113 behaviour |
| E3 | Locations master / custom roles | REC-41; ADM-11, ADM-08 | DR-11 | M each | Only with a stated business need |
| E4 | Selected analytics register items | REC-42 | C1, D4 | XL (choose by value) | Pick from the ~465 "Yet to do" rows with the owner |

---

## Recommended order at a glance

1. **A0** owner checks (time zone, origin secret)
2. **A1** resubmit re-routing
3. **A2 + A3** import rule and seed fix (same release)
4. **A4, A5, A6** time zone pin, one vote per step, honest outbox and job status
5. **A7** page-access binding
6. **A8, A9, A10** confirmations, documents, origin lock
7. **B0 → B10**
8. **C1 → C8**, interleaved with **D2 → D11**
9. **E**

## Testing requirements common to every release

1. **Locally, before each push** (project rule): lint, typecheck, unit, integration, E2E, QA and origin configs.
2. **CI green** on the tagged commit.
3. **A regression test** for each fixed AUD item (listed in `10`).
4. **After publishing:** `/api/health` shows the new version, `database ok` and `jobRunner OK`, followed by the live smoke test in `docs/GO_LIVE_READINESS_CHECKLIST.md` §4.
