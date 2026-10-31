# Master defect register

ARS-CMS v1.39.0 (commit `0473f25`), audit of 31 Oct 2026. Every defect is **Open**: no fixes were made during the audit (rule 1).

The full fields for each defect (expected, actual, reproduction, evidence, root cause and recommendation) are in the defects table of the report named in the **Source** column. This register is the single list, ordered by priority and then severity.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 1 |
| Medium | 9 |
| Low | 35 |
| **Total defects** | **45** |
| Risks (not defects) | 1 recorded here (PF-R01). More are listed in each report. |

## P0 / P1

| Defect ID | Module | Feature | Category | Description | Severity | Priority | Evidence | Recommendation | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-02 | Super Admin | AI history, AI reports, Data sources, Salesforce pages | Security: broken access control | Four Super Admin pages have no `requireArea("superadmin")` of their own and rely on the layout. A request with the client-navigation header `RSC: 1` gets the page data (200) from anyone, even with a garbage cookie. Exposed: AI conversation titles and times by person, AI usage by person, data-source status, and the connected Salesforce account and its settings. Encrypted secrets are not exposed (they come back `null`). | **High** | **P0** | `TEST_EVIDENCE/SEC/*`; the lead auditor's own reproduction in `TEST_EVIDENCE/BROWSER/SEC-02-lead-repro.txt` | Add `requireArea("superadmin")` to the four pages. Add a unit test that fails when any `app/admin/**` or `app/superadmin/**` page has no own guard. | 05, 10 | Open |
| OPS-07 | Operations | Backup | Disaster recovery | No restore of a real production backup has ever been recorded (go-live gate GL-04 is still open) | Medium | P1 | `17_DISASTER_RECOVERY_AUDIT.md` | Restore a production backup into a scratch database and record the result | 17 | Open |

## P2

| Defect ID | Module | Description | Severity | Source | Status |
|---|---|---|---|---|---|
| DB-004 | Approvals | An IT Admin can **Skip** (or choose the path on) a blocked step of **their own** request; the self-approval check covers only Assign. A probe ended APPROVED. | Medium | 08 | Open |
| DB-005 | Approvals | With "if nobody to approve: skip", a request can be APPROVED at submit with **zero decisions** (no manager; the only member of a group). Custom approvals allow Skip by default, and the pre-submit check gives no warning. | Medium | 08 | Open |
| OPS-08 | Operations | No automatic off-site backup; the off-site copy is a manual weekly download | Medium | 17 | Open |
| OPS-10 | Operations | No RPO/RTO targets and no incident-response procedure | Medium | 17 | Open |
| OPS-03 | CI | The e2e CI job takes 23–29 minutes against a 30-minute timeout | Medium | 16 | Open |
| OPS-04 | CI | Intermittent e2e failures: 2 of the last 10 `main` runs failed on one test; `v1.36.0` was tagged on a failed run | Medium | 16 | Open |
| OPS-12 | Docs | `USER-GUIDE.md` (v1.5.0) gives wrong navigation: Overview, no Inbox, Search and Profile "in the sidebar", "Custom approval" | Medium | 18 | Open |
| FI-D01 | Reports | The weekly HOD report is documented as "Built, off", but no job, switch or template exists | Medium | 01 | Open |
| SEC-01 | Sign-in | `/api/auth/password/start` timing shows whether a User ID exists (unknown about 54–81 ms; existing Google-only account about 21–41 ms) | Low | 04, 10 | Open |
| PF-R01 | Home | Home p95 is 1.86 s (93% of the 2 s budget) at 50 concurrent users (risk) | Low | 11 | Open |

## P3 (Low)

| Defect ID | Module | Description | Source |
|---|---|---|---|
| UI-D01 | Shell | "Overview" still appears in 4 breadcrumbs, the error-state link and Help text (renamed "Home" in D-236) | 02 |
| UI-D02 | Profile | The Notifications page's browser title is still "Notification settings" | 02 |
| UI-D03 | Super Admin | Settings page title "Settings & providers" against heading "Providers & security" | 02 |
| UI-D04 | Tasks | After creating a task for someone else, the app opens the creator's My Tasks, where the task isn't listed | 02 |
| DB-001 | Projects | Project details are last-writer-wins (`row_version` raised but not checked) | 07 |
| DB-002 | Database | The migration runner has no lock and non-idempotent files; it runs on every start (two processes can collide) | 07 |
| DB-003 | AI | AI conversation retention deletes without checking legal holds, in three statements with no transaction | 07 |
| DB-006 | Approvals | A changed person-field approver on resubmit leaves the earlier step approved by the previous person | 08 |
| DB-007 | Tasks | An ad hoc task for several people isn't atomic; a partial failure still reports success | 08 |
| DB-008 | WhatsApp | CEOITBox HTTP 429 is treated as permanent (never retried) | 09 |
| DB-009 | Notifications | The failed-send retries setting is off by one (3 gives 2; 0 still retries once) | 09 |
| DB-010 | WhatsApp | The timeout is cleared before the body is read, so a stalled body can hang the send | 09 |
| DB-011 | WhatsApp | The local send limit isn't atomic and is shared by OTPs and bulk sends, so a burst can block OTPs | 09 |
| DB-012 | Salesforce | Any token-refresh failure (even a temporary 5xx or 429) forces a manual reconnect | 09 |
| DB-013 | Reports | One failed recipient stops a scheduled report for everyone after them | 09 |
| DB-014 | Notifications | Possible duplicate sends after a crash or a failed status update; no provider idempotency keys | 09 |
| FI-D02 | Analytics | The task analytics "Not tracked" panel says tasks have no dependencies or repeats (both exist) | 01 |
| FI-D03 | Calendar | Google Calendar sync ignores the person's module access (code review only) | 01 |
| FI-D04 | Docs | PLAN-CHECKLIST and FLOWS show finished items as open or planned | 01 |
| FI-D05 | Docs | The requirements register contradicts itself (M4-05 against BB-02; out-of-date "not feasible" reasons) | 01 |
| FI-D06 | Security | The break-glass account alerts only at sign-in, but F-07 requires an alert on every action | 01 |
| OPS-01 | Code | `clsx` and `tailwind-merge` are unused production dependencies | 15 |
| OPS-02 | Code | 30 exports are unused; 115 more are used only by tests | 15 |
| OPS-05 | Release | There is no `v1.34.0` tag, though the release notes list it | 16 |
| OPS-06 | CI | The checkout and setup-node actions target the deprecated Node 20 runtime | 16 |
| OPS-09 | Backup | Backup files are not encrypted and have no checksum | 17 |
| OPS-11 | Monitoring | `/api/health` is 200 even when the job runner is late or never ran; no backup age is reported | 17 |
| OPS-13 | Docs | `README.md` says "Status: v1.4.0" | 18 |
| OPS-14 | Docs | `DEPLOYMENT.md` header, examples and contents list are out of date | 18 |
| OPS-15 | Docs | The automation inventory lists 10 of the 16 jobs | 18 |
| OPS-16 | Docs | `KNOWN_ISSUES.md` stopped at v1.6.0 and lists a fixed issue | 18 |
| OPS-17 | Docs | No current architecture document, ERD or API reference (39 routes undocumented) | 18 |
| OPS-18 | Public web | `/robots.txt` and `/sitemap.xml` redirect to `/login` | 14 |
| OPS-19 | Public web | `/`, `/privacy` and `/terms` have no canonical link or Open Graph tags | 14 |
| OPS-20 | Security | With any cookie, `/admin` and `/superadmin` return a 307 whose body includes the area title, while unknown paths return 404 (goes against D-016; minor information disclosure; related to SEC-02) | 14 |

## Remediation (v1.40.0, 1 Nov 2026)

The owner approved fixing every defect ("fix all the defects in one go"). Status after v1.40.0: **Fixed** means changed and covered by a test or a doc check.

**Fixed in code, with tests:**

| Defect | Change | Proof |
|---|---|---|
| SEC-02 | `requireArea` on the 15 admin and superadmin pages that lacked their own; guard test (D-244) | `tests/security/page-guards.test.ts` (fails when a guard is removed) |
| OPS-20 | Middleware: an invalid or expired session cookie on `/admin` or `/superadmin` is redirected before rendering (D-244) | `tests/security/session-cookie-edge.test.ts` |
| DB-004, DB-005 | Engine: no self-skip or self-path; no approval without a decision; readiness warning (D-245) | `tests/engine/no-decision-guards.test.ts` |
| DB-006 | `routeChanged` compares approver fields | same file |
| DB-001 | Project save checks `row_version` | `tests/integration/audit-fixes.int.test.ts` |
| DB-002 | Migration runner `GET_LOCK` | code review; the integration suite runs the migrations |
| DB-003 | AI retention: holds respected, one transaction | `audit-fixes.int.test.ts` |
| DB-007 | Multi-person task: continues, names who was missed, partial-success count | `audit-fixes.int.test.ts` |
| DB-008 to DB-014 | Messaging (D-243) | `tests/notifications/*`, `tests/jobs/delivery-retry-policy.test.ts`, `tests/ai/salesforce-refresh.test.ts`, `tests/analytics/schedule-recipients.test.ts`, `tests/integration/delivery-idempotency.int.test.ts` |
| SEC-01 | No stored password still costs a full hash check | `tests/security/security.test.ts` |
| FI-D01 | Weekly HOD report (D-247) | `tests/reports/hod-weekly.test.ts`, `audit-fixes.int.test.ts` |
| FI-D02 | Analytics wording corrected | code |
| FI-D03 | Calendar sync filters by the person's modules | code review; calendar integration tests still pass |
| FI-D06 | Break-glass actions audited and alerted (throttled) | `tests/security/break-glass-alert.test.ts` |
| UI-D01 to UI-D04 | Names, titles, the task destination | e2e suite |
| PF-R01 | Home task sections stream (Suspense) | the load test is re-run in the release check |
| OPS-09 | `.sha256` on every backup, optional AES-GCM; restore and verify check both | `tests/ops/backup-file.test.ts` |
| OPS-11 | Health: backup age, `degraded`, `/api/health/deep` | e2e v140 |
| OPS-18, OPS-19 | robots, sitemap, canonical, Open Graph | build output |
| OPS-01, OPS-02 | Unused dependencies and 30 unused exports removed | lint and typecheck clean |
| OPS-03, OPS-04, OPS-06 | CI timeout 45 min; one CI-only retry, reported as flaky; actions v5 (Node 24) | the CI run of v1.40.0. The cancelled audit-commit run 41227016909 shows the old limit. |

**Fixed in docs or the release:**

| Defect | Change |
|---|---|
| OPS-05 | Tag `v1.34.0` added at b764c41, with a note in the release notes |
| OPS-12 to OPS-17, FI-D04, FI-D05 | Documentation rewritten or updated (see 18) |

**Built, needs the owner's action:**

| Defect | What is built | What the owner does |
|---|---|---|
| OPS-08 | Off-site copy to S3-compatible storage, encrypted only, failure alerted | Enter the bucket and key, and set `BACKUP_ENCRYPTION_KEY` |
| OPS-07 | Restore and verify tools, plus a drill checklist | Run the drill on a real production backup and record it |
| OPS-10 | Draft RPO/RTO and incident procedure | Approve or adjust it |

## Audit-process note

During the audit the lead auditor's own integration-test run recreated the throw-away test database, which removed the seeded users for a while. Every auditor re-ran the checks that this affected, as recorded in 04–07 and 15–18. No application defect follows from it.
