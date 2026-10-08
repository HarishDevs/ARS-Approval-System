EXTRA["smoke"] = "Run after every deploy, about 20 minutes. If any of these fails, the build isn't usable: stop testing and roll back."
EXTRA["sanity"] = "Run after a small change, such as a fix or a setting: the core path plus the most common validation."
EXTRA["regression"] = "Run before every release. Most cases are already automated in CI (Vitest unit, MySQL integration, Playwright e2e); the rest are manual or partly automated. Cases not tagged P0 or P1 run each quarter."
EXTRA["critical"] = "These are the cases whose failure could cause financial loss (wrong DoA routing, approval skipped), unauthorised approval, self-approval, duplicate or lost transactions, data corruption, audit or compliance gaps, or a security breach. All of them must pass before go-live and before every release."

EXTRA["datamatrix"] = r'''
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
'''

EXTRA["rtm_intro"] = "Each requirement's linked cases are listed. **Coverage** means: Covered (3 or more cases), Partially covered (1–2 cases, or a known gap), or Missing (the feature isn't built). Requirements R13, R36–R39 come from the master prompt but aren't built; their cases record the current behaviour."

EXTRA["defects"] = r'''
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
'''

EXTRA["automation"] = r'''
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
'''

EXTRA["summary_tail"] = r'''
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
'''

EXTRA["questions"] = r'''
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
'''

EXTRA["final"] = r'''
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
'''
