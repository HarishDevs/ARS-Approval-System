# Test and release report (v1.5.0)

**Date:** 9 Oct 2026. **Machine:** local Windows PC, MySQL 8 in Docker (the same throw-away database CI uses).
**Not done (by the spec's rules):** no deploy to production; no production migration; no live data touched; no live messages sent. **Live verification has not been performed**; it is in `GO_LIVE_CHECKLIST.md` §4 for the owner.

## Results (final code, version 1.5.0)
| Check | Result | Baseline v1.4.0 |
|---|---|---|
| TypeScript (`tsc --noEmit`) | clean | clean |
| ESLint | clean | clean |
| Unit (vitest) | **328 / 328** (44 files) | 301 |
| Integration (real MySQL) | **97 / 97**, 3 runs in a row | 81 |
| Production build | OK | OK |
| E2E (Playwright, production build) | **47 / 47** | 38 |
| QA suite | **27 / 27** | 27 |
| Origin-lock check | **1 / 1** | 1 |
| `npm audit --omit=dev` | 0 vulnerabilities | 0 |

## New tests by feature
| # | Unit | Integration | E2E (`tests/e2e/v150.spec.ts`) |
|---|---|---|---|
| 1, 13 | help search, details for IT | none | help search and Copy button |
| 2 | tracker summary (3) | none | phone screenshot shows the tracker |
| 3 | draft keys and cleaning (3) | drafts.int (4): owner-only, version conflict, expiry | autosave → restore → discard; submit removes the draft |
| 4 | filters, LIKE escaping (3) | search.int (5): access rule, filters, paging, saved views | found by the requester, not by an outsider |
| 5 | none | none | HOD decides on a 390 px phone (cards, no sideways scroll) |
| 6 | notify preferences (3) | none | choices saved; mandatory locked on |
| 7 | none | bulk.int (2): mixed batch, never twice, work task and stranger refused | manager reviews and approves 2, results per item |
| 8 | delegate eligibility rechecked | delegations.int: start/end logged once | none |
| 9 | mention parsing (3) | mentions.int: once, only visible people, audit | mention shows who wasn't told |
| 10 | PDF text, wrapping, multi-page PDF (3) | none | PDF 200 for the requester, 404 for an outsider, `x-request-id` header |
| 11 | route comparison (2) | test-mode.int: diff vs live, impact count | existing test-mode test still passes |
| 12 | workload maths, handover suggestions (3) | workload.int: due soon once, reminder still follows, numbers | workload page |
| 14 | request-id choice | ops-alerts.int: once a day per kind | error log lines carry `requestId` (seen in the E2E server log) |

## Defects found and fixed during testing
1. **Bulk approval results vanished** once the queue was empty: the panel hid itself with fewer than 2 items left. It now stays visible while it has results to show. Found by E2E.
2. **Test mode wording regression:** the new skip-reason list replaced the old "Skipped: …" line that an existing E2E relies on. The line is restored, with the reasons listed under it. Found by the existing E2E.
3. **Due-soon vs escalation:** a DUE_SOON row would have counted toward the reminder limit and cut off the last escalation. That count now leaves DUE_SOON out. Found in review and covered by workload.int.
4. **Out-of-office backfill:** the first job run after the upgrade would have logged every past delegation. The migration now marks existing rows as already logged.

## Known limits
- **PDF:** Latin-1 text only. ₹ is written "Rs.", other scripts "?" (D-111).
- **No WhatsApp templates** for "mentioned you", "due soon" and Super Admin alerts. They go by inbox and email (D-112).
- **Test mode comparison** compares the route (stages, people, skips, outcome) for the sample entered. It doesn't list field-by-field form or DoA edits.
- **Live:** `/api/health` showed `jobRunner: NEVER` at the baseline. The cron call isn't reaching the app with the right secret (GO_LIVE_CHECKLIST §3).

## Release
- **Version:** 1.5.0, commit and tag `v1.5.0` on `main`, pushed to GitHub.
- **Publishing on GoDaddy:** for the owner, after CI is green.
