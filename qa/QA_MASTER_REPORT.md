# QA master report: ARS-CMS v1.44.0 (1–2 Nov 2026)

The owner's full QA, bug-detection and remediation brief (22 phases), run on the
code from v1.42.1 to v1.44.0, together with the requested features of the same
session: tasks from approvals highlighted (D-270), the phone layout (D-272) and the
approval journey (D-273). Test environment only; nothing was deployed, migrated or
sent to real people.

## Scope

133 pages, 48 API routes, 173 server actions (`APPLICATION_ROUTE_INVENTORY.md`,
generated from the code; every non-public page and API guarded, 0 unguarded actions).

## Result in one table

| Area | Report | Outcome |
|---|---|---|
| Functional | FUNCTIONAL_TEST_RESULTS.md | Every module covered by passing suites; one stated gap (no automated confidential-file download test) |
| Regression | REGRESSION_TEST_RESULTS.md | Unit 891/891, integration 330/330, e2e 227/232 then 13/13 after the fix, QA 32/32 |
| UI / UX | UI_UX_AUDIT.md | Classic, mobile and responsive audits clean after fixes; axe clean in both themes |
| Responsive | RESPONSIVE_TEST_RESULTS.md | 10 widths, every role; 117 mobile checks clean |
| API | API_TEST_RESULTS.md | Signed-out, wrong-role, cross-site and IDOR sweeps all refused |
| Security | SECURITY_AUDIT.md | 5 found (1 P1), all fixed; `npm audit` 0 |
| Performance | PERFORMANCE_TEST_RESULTS.md | No errors up to 50 simultaneous users (p95 ≤ 1.1 s); load shedding from ~100 on one process |
| Bugs | BUG_REGISTER.md, BUG_FIX_HISTORY.md | 40 entries: 0 P0, 3 P1, 14 P2, 23 P3; 38 fixed, 2 open |

## Open items

| ID | Why open | Owner action |
|---|---|---|
| QA-DB-02 (P1 if it applies) | Only the live database can say whether its session clock is UTC | Open `/api/health/deep` on live: `dbClockOffsetMinutes` must be 0 |
| QA-DB-09 (P3) | Analytics day filters can't use indexes at very large volume; fine today | Deferred |

## Owner decisions needed

1. Approve (or not) the optional index script `database/optional/v1421_qa_indexes.sql`.
2. Set `DB_POOL_SIZE` on live.
3. UAT on real phones and of the journey (PLAN V143-15, V144-08).

## Honest limits

Real devices, the providers' actual delivery (email, WhatsApp, push), production
hardware, an external penetration test and a person's screen-reader walkthrough were
not part of this pass. The full e2e suite ran end to end on v1.43.0 (229/229) and
on v1.44.0 (227/232); after the last fix only the affected files were re-run.
