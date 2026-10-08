SECTIONS.append(("26. Performance Test Cases", "Performance", "Performance", r'''
Load | 1 user baseline | Staging, warm | 1) Raise, open request, approve | — | Page p95 < 1.5 s; action p95 < 1 s (proposed targets, A-09) | P1 | | Y | R19
Load | 10 concurrent users | Staging | 1) k6: 10 VUs raise and approve for 10 min | — | p95 < 2 s; 0 errors | P1 | | Y | R09
Load | 100 concurrent users | Staging | 1) k6: 100 VUs mixed actions 15 min | — | p95 < 3 s; error rate < 0.5%; no CONFLICT except true races | P1 | | Y | R09
Load | 1,000 concurrent users (stress) | Staging | 1) Ramp to 1,000 VUs | — | Find the break point; app recovers after load drops; no data corruption | P2 | | Y | R09
Burst | 10,000 requests submitted in 1 hour | Staging | 1) Scripted submits | — | All stored with unique numbers; queue pages stay < 3 s | P2 | | Y | R01
Volume | 10,000 pending approvals for one approver | Seeded data | 1) Open /users/queue | — | Loads < 3 s or is paged (gap R36 if not) | P2 | | Y | R36
Volume | 100,000 historical requests | Seeded data | 1) /users, /admin/insights | — | My requests (LIMIT 200) < 2 s; insights < 5 s (indexes used) | P2 | | Y | R33
Volume | Large audit log (1M rows) | Seeded | 1) /superadmin/audit with filters | — | < 3 s with index on action/time | P3 | | Y | R15
Volume | Large request timeline (500 events) | Seeded | 1) Open request | — | < 2 s | P3 | | Y | R19
Volume | Attachment volume 50 GB in UPLOAD_DIR | Staging disk | 1) Upload/download | — | Unaffected; disk alert set (§42) | P3 | | N | R25
Jobs | Job runner with 5,000 due reminders | Seeded | 1) POST /api/jobs/run | — | Finishes within the cron interval (5 min) or batches; no duplicates | P2 | | Y | R07
Notify | Notification fan-out | Comment on a request with 50 participants | 1) Post | — | Comment saved < 1 s; notifications follow; CEOITBox rate limit respected | P3 | | P | R14
Upload | 5 × 10 MB upload | — | 1) Attach | — | Completes < 30 s on 10 Mbps; memory stable | P3 | | P | R25
DB | Connection pool exhaustion | 10-connection pool | 1) 50 parallel actions | — | Requests wait, none fail with pool errors at normal load | P2 | | Y | R17
Builder | Workflow with 30 levels and 15 DoA levels | SESS(IT) | 1) Create, test, publish | — | Compiles and validates < 1 s | P3 | | Y | R27
Insights | Insights with 100k tasks | Seeded | 1) Load | — | < 5 s | P3 | | Y | R33
'''))

SECTIONS.append(("27. Recovery Test Cases", "Recovery", "Recovery", r'''
App | App restart during an action | Staging | 1) Approve 2) Restart Node during the request | — | Either committed fully or not at all; page after restart shows the true state | P0 | | P | R17,C
App | Crash after commit, before notifications | Inject crash after commit | 1) Approve | — | Decision kept; its messages are in notification_outbox and the next job run sends them once (D-QA-06 fixed) | P1 | | P | R17
DB | MySQL restarts | Staging | 1) Restart MySQL 2) Use the app | — | Pool reconnects; errors only during the outage | P0 | | P | R17,C
DB | Deadlock or lock wait timeout | Force lock contention | 1) Two long transactions | — | One retried or clear error; no partial state | P1 | | P | R09
Provider | CEOITBox down for an hour | Block outbound | 1) Run the app 2) Unblock 3) Run jobs | — | Business continues; WhatsApp deliveries retried and sent once | P1 | | P | R17,R18
Provider | Resend down | Block Resend | 1) Same as above | — | Emails retried after recovery | P1 | | P | R17
Network | Browser offline during submit | — | 1) Go offline 2) Submit | — | Clear failure; data stays in the form; resubmit works | P2 | | P | R18
Browser | Browser crash after submit | — | 1) Submit 2) Kill browser 3) Reopen | — | Request exists once; visible in My requests | P2 | | N | R18
Session | Session expires while writing a long comment | 12 h session | 1) Post after expiry | — | Sign-in prompt; text lost (record; consider draft keep) | P3 | | N | R40
Jobs | Cron stops for a day | — | 1) Restart cron | — | Overdue reminders and retries run once on the next run | P2 | | Y | R07
Jobs | Job runner crashes mid-batch | Inject error | 1) Run again | — | Already-claimed reminders not resent; others sent | P2 | | P | R07,R18
Deploy | Deploy while users are active | Staging | 1) Deploy | — | In-flight actions either complete or fail cleanly; old tabs get a reload message | P2 | | N | R17
Disk | UPLOAD_DIR full | Fill disk | 1) Attach | — | Clear error; written partial files removed; no rows | P2 | | P | R25
Restore | Restore DB and files from backup | Staging | 1) Restore 2) Verify sample requests and files | — | Counts and sha256 match | P1 | | N | R19
Cache | Cache or queue failure | — | 1) N/A | — | Not applicable: no Redis or queue (DB-backed limits and retries) | P3 | | N | R17
Migration | Migration fails half-way | Staging | 1) Inject failure in a migration | — | Deploy stops; app not started on a half schema; rerun completes | P2 | | N | R19
'''))

SECTIONS.append(("28. Edge Cases", "Edge cases", "Edge", r'''
People | Approver leaves the organisation | Pending tasks | 1) IT deactivates; sees pending count 2) Hand over | — | Warning shows the count; handover moves all tasks; none lost | P0 | | Y | R35,C
People | Approver leaves without handover | Pending task | 1) Deactivate only | — | Refused: "… still has N pending approvals. Hand them over first." (already enforced) | P1 | | Y | R35
People | Requester leaves during approval | Open request | 1) Deactivate requester | — | Approvals continue; requester notifications skipped (inactive) | P2 | | Y | R14
People | Manager changes during approval | Request at MGR | 1) IT changes REQ's manager | — | Existing MGR task stays; resubmission or new requests use the new manager | P2 | | Y | R02
People | Department changes during approval | Request before HOD | 1) Move REQ to another department 2) MGR approves | — | HOD resolved at activation → new department's HOD (document) | P2 | | Y | R02
People | HOD changes during approval | Request before HOD | 1) Change the department HOD 2) Activate HOD level | — | New HOD gets the task | P2 | | Y | R02
People | User promoted to IT Admin mid-request | — | 1) Add IT_ADMIN | — | Can now see all requests; no change to tasks | P3 | | Y | R30
People | Same person at every level | All levels resolve to MD | 1) Raise | — | MD gets one task per level, decided one at a time | P2 | | Y | R02
People | Circular reporting line | A manager of B, B manager of A | 1) IT saves it | — | Refused by the manager check | P1 | Negative | Y | R02
People | User without a manager uses REQUESTER_MANAGERS_MANAGER | — | 1) Raise | — | Level BLOCKED (IT told) or skipped if configured | P2 | | Y | R02
People | Duplicate email or WhatsApp number | — | 1) Create a user with an existing email | — | "This email is already used by another user." | P2 | Validation | Y | R30
Config | Group deactivated while a request waits on it | Pending task from group | 1) Deactivate group | — | Existing tasks unaffected; new requests block (validator flags the workflow) | P2 | | Y | R27
Config | Department deleted? | — | 1) Look for delete | — | Not possible; only inactive | P3 | | Y | R19
Config | Workflow deactivated while requests run | — | 1) Mark inactive | — | Running requests finish; no new requests | P1 | | Y | R27
Config | Missing approval configuration | Workflow with no published version | 1) Raise via URL | — | Refused | P1 | Negative | Y | R27
Config | Approval matrix changed during pending request | — | 1) Publish new DoA | — | Running request keeps its version (see §11) | P1 | | Y | R21
Config | Form field removed in a new version | v2 removes a field | 1) Open an old request | — | Old request still shows its v1 fields | P2 | | Y | R27
Config | Person field approver becomes inactive before activation | — | 1) Raise; deactivate the picked person before their level | — | Level BLOCKED; IT told | P1 | | Y | R02
Amount | Amount exactly on every limit | WF-DOA | 1) See §11 boundaries | — | Covered APP DoA cases | P3 | Boundary | N | R21
Amount | Amount with many decimals | — | 1) 100000.0001 | — | Band 2 (above ₹1,00,000) | P2 | Boundary | Y | R21
Amount | Amount "1,00,000.00" | — | 1) Submit | — | Equals 100000 → band 1 | P2 | Boundary | Y | R21
Choice | Choice value changed on resubmit | WF-CHO | 1) Payment → Journal entry on resubmit | — | Level 2 no longer needed in round 2 | P2 | | Y | R03
Rounds | Resubmit many times | — | 1) 10 rounds of changes | — | Round 11; history complete; performance fine | P3 | | Y | R11
Rounds | Reopen after reopen | — | 1) Reopen twice | — | Rounds increase; each reason in timeline | P3 | | Y | R24
Requests | Request number sequence after a failed submit | — | 1) Cause a failure after the number is taken | — | Gap allowed; never a duplicate | P3 | | Y | R01
Requests | Request deleted externally (DB) | Admin deletes a row | 1) Open request | — | FK prevents delete while tasks exist; app shows 404 if gone | P3 | | N | R19
Delegation | Delegate is deactivated mid-range | — | 1) Deactivate | — | Delegation inert; delegator acts | P2 | | Y | R22
Delegation | Delegation to a user who is the next-level approver | B is HOD; MGR delegates to B | 1) B approves MGR level then HOD level | — | Allowed by design (record: segregation rule wanted? Q-QA-10) | P1 | | Y | R22
Demo | Retire demo staff with pending tasks | Demo tasks pending | 1) Retire | — | Message shows the count; tasks block until handed over | P2 | | Y | R34
Demo | Real staff swapped into groups before retire | — | 1) Swap members 2) Retire | — | New requests go to real people; demo pending tasks need handover | P2 | | Y | R34
Templates | Template edited after approval | Live v1 | 1) Save changed wording | — | Saved as v2 (_v2 name); v1 still sends until v2 approved | P1 | | Y | R31
Templates | Template paused by Meta | Live template paused | 1) Sync | — | Status shows paused; WhatsApp skipped for that event; email continues | P2 | | Y | R31
Templates | Template deleted in CEOITBox | Live template deleted there | 1) Sync | — | "Not found at CEOITBox yet: …"; sending fails 400 → delivery FAILED (record: should auto-disable? Q-QA-11) | P2 | | Y | R31
Templates | Phone ID changed | Wrong x-phone-id | 1) Send | — | Provider error shown in deliveries; nothing else affected | P3 | | Y | R31
Calendar | All days set as non-working | IT unticks all | 1) Save | — | Falls back to plain hours (or refused): record | P3 | | Y | R32
Time | Request raised exactly at a band edge during a limit change | — | 1) Publish new limits while submitting | — | Request uses whichever version was published when it was submitted (consistent) | P3 | | P | R21
Browser | Two users on one computer | — | 1) A signs out 2) B signs in | — | No data of A visible (no-store pages) | P2 | Security | P | R20
Language | Hindi/Tamil text in all fields | — | 1) Raise | — | Stored and shown correctly; WhatsApp values fine | P3 | | Y | R19
Request | Extremely long details 4000 chars with emojis | — | 1) Raise | — | Accepted; byte length handled (utf8mb4) | P3 | Boundary | Y | R01
Expiry | Expired request processed | — | 1) Approve a 6-month-old request | — | Allowed (no expiry: gap R13) | P3 | | Y | R13
'''))

SECTIONS.append(("29. Reporting Test Cases", "Insights", "Functional", r'''
Tiles | Open requests count | Data | 1) Compare tile with SELECT COUNT(*) WHERE status IN (IN_PROGRESS, ON_HOLD, CHANGES_REQUIRED) | — | Equal | P2 | Database | Y | R33
Tiles | Overdue approvals count | Data | 1) Compare with PENDING tasks past due_at | — | Equal; red alert when > 0 | P2 | Database | Y | R33,R07
Tiles | Approved in 30 days | Data | 1) Compare | — | Equal | P3 | Database | Y | R33
Tiles | Average time to full approval (90 days) | Data | 1) Compute in SQL | — | Same value (h / days); "—" when none | P3 | Database | Y | R33
Tables | Waiting now by level | Data | 1) Compare | — | Counts per approval type and level match | P2 | | Y | R33
Tables | Time to decide per level | Data | 1) Compare averages and slowest | — | Match SQL | P3 | | Y | R33
Tables | Decisions by person (30 days) | Data | 1) Compare approved/rejected/changes per person | — | Match | P3 | | Y | R33
Tables | Requests by month (6 months) | Data | 1) Compare raised/approved/rejected/withdrawn/open | — | Match | P3 | | Y | R33
Access | Insights for IT only | SESS(REQ) | 1) /admin/insights | — | 404 | P1 | Security | Y | R33,R30
Export | Export reports | — | 1) Look for CSV/PDF export | — | Not built (S8-02 audit export pending; record gap) | P3 | | N | R33
'''))

SECTIONS.append(("30. Mobile Test Cases", "Mobile", "UI/UX", r'''
Phone | Approve from a phone | Android Chrome 375 px | 1) Open link from WhatsApp 2) Sign in 3) Approve | — | Works in ≤ 4 taps after sign-in; buttons ≥ 44 px | P0 | | P | R40,C
Phone | Reject with reason on phone keyboard | iPhone Safari | 1) Reject with reason | — | Keyboard doesn't hide the button; reason saved | P1 | | N | R40
Phone | Raise with a camera photo attachment | Android | 1) Attach → camera | JPG 4 MB | Uploaded; shown | P1 | | N | R25,R40
Phone | Comment on phone | — | 1) Post | — | Works | P2 | | N | R26
Phone | Notifications open the app | WhatsApp link | 1) Tap the link | — | Opens the request after sign-in | P1 | | N | R14
Phone | Slow 3G | Throttled | 1) Approve | — | Working state shown; one decision | P2 | | P | R18
Phone | Offline → online | — | 1) Toggle airplane mode mid-action | — | Clear error; retry works once | P2 | | N | R18
Phone | Rotate screen mid-form | — | 1) Rotate | — | Typed values kept | P3 | | N | R40
Phone | Small screen 320 px | — | 1) Main pages | — | No horizontal page scroll | P3 | | P | R40
Tablet | Builder on a tablet | iPad | 1) Edit a DoA matrix | — | Usable; table scrolls in its card | P3 | | N | R21,R40
'''))

SECTIONS.append(("31. Accessibility Test Cases", "Accessibility", "UI/UX", r'''
Keyboard | Raise and approve with keyboard only | — | 1) Tab through, Enter/Space | — | All actions reachable; visible focus ring | P1 | | P | R40
Keyboard | Tab order follows the visual order | Request page | 1) Tab | — | Logical order | P2 | | N | R40
Labels | Every input has a label | Forms | 1) axe / Lighthouse | — | No missing labels (DoA ticks have aria-labels) | P2 | | Y | R40
Messages | Errors announced | Invalid submit | 1) Screen reader | — | role=alert read; field errors near fields | P2 | | P | R40
Status | Success announced | Action | 1) Screen reader | — | role=status read | P3 | | P | R40
Confirm | In-page confirmation reachable | Withdraw | 1) Keyboard to "Yes, continue" | — | Focusable; announced as alertdialog | P2 | | P | R40
Contrast | Colour contrast | All pages | 1) axe | — | WCAG AA (4.5:1 text) | P2 | | Y | R40
Contrast | Status not by colour alone | Pills, badges | 1) Greyscale view | — | Words carry meaning | P3 | | N | R40
Zoom | 200% zoom | — | 1) Zoom | — | No loss of content or function | P3 | | N | R40
Screen reader | NVDA on request page | — | 1) Read level map | — | Levels, people, statuses understandable | P3 | | N | R40
'''))

SECTIONS.append(("32. End-to-End Test Cases", "End to end", "E2E", r'''
E2E-001 | Successful sequential approval | FX-DEMO, WF-SEQ | 1) REQ raises ₹85,000 with quote.pdf 2) MGR, HOD, FIN, MD approve 3) Check notifications, audit, DB | — | APPROVED; 4 TASK_DECIDED; requester got REQUEST_APPROVED (in-app, email, WhatsApp if live); audit and timeline complete; file downloadable | P0 | | Y | R01,R03,R14,R15,S,C
E2E-002 | Rejection at HOD | WF-SEQ | 1) Raise 2) MGR approves 3) HOD rejects with reason | — | REJECTED; FIN/MD never asked; requester told with reason | P0 | | Y | R06,S,C
E2E-003 | Changes → resubmit → approve | WF-SEQ | 1) Raise 2) MGR asks for changes 3) REQ edits + resubmits 4) All approve | — | Same number, round 2, APPROVED; both rounds in history | P0 | | Y | R11,C
E2E-004 | Submit timeout → retry | WF-SEQ, throttled | 1) Submit, lose reply 2) Retry | — | Exactly one request (D-QA-01 fixed) | P0 | | P | R18,C
E2E-005 | Concurrent approval | WF-GRP | 1) Both checkers approve at once | — | One completion; consistent final state | P0 | | P | R09,C
E2E-006 | Unauthorised approval | WF-SEQ | 1) OUT opens and POSTs approve | — | 404 / refused; audited | P0 | | Y | R16,C
E2E-007 | Delegation | WF-SEQ | 1) MGR delegates to finl2b 2) Raise 3) finl2b approves | — | Workflow continues; "for Deepa Menon" in history | P0 | | Y | R22,C
E2E-008 | Escalation | WF-SLA | 1) Raise 2) Wait past 2× SLA 3) Run jobs | — | Reminder then escalation to manager + IT, once each | P0 | | Y | R07,C
E2E-009 | DoA band 4 purchase | WF-DOA | 1) BUY raises ₹30,00,000 2) SCM head, Finance head, ED, MD approve | — | All four levels in order; APPROVED | P0 | | Y | R21,C
E2E-010 | DoA band change on resubmit | WF-DOA | 1) ₹50,000 2) SCM asks for changes 3) Resubmit ₹12,00,000 | — | Round 2 adds Finance head and ED | P0 | | Y | R21,R11,C
E2E-011 | Parallel review with a rejection | WF-PAR | 1) Two approve, one rejects | — | REJECTED; MD never asked; remaining tasks closed | P1 | | Y | R05,R06
E2E-012 | Withdraw mid-way | WF-SEQ | 1) MGR approves 2) REQ withdraws | — | CANCELLED; HOD told; no further actions possible | P1 | | Y | R24,R12
E2E-013 | Reopen and approve again | APPROVED request | 1) SA reopens 2) All approve again | — | Round 2 APPROVED; history keeps round 1 | P1 | | Y | R24
E2E-014 | Leaver handover | WF-SEQ at MGR | 1) IT deactivates MGR, hands over to finl2b 2) finl2b approves | — | Continues; audit shows handover | P1 | | Y | R35
E2E-015 | New approval type with its own DoA, live | SESS(IT) | 1) Create with DoA 2) Test mode 3) Publish 4) Raise in each band | — | Routing matches the matrix in all bands; DoA view matches | P0 | | Y | R21,R27,C
E2E-016 | WhatsApp template lifecycle | Test key | 1) Draft 2) Submit 3) Meta approves 4) Sync 5) Trigger event | — | Template live; real event sends WhatsApp with right values; delivery SENT | P1 | | P | R31,R14
E2E-017 | Custom approval end to end | SESS(REQ) | 1) Custom: MD then ED 2) Both approve | — | APPROVED; CUS number; owner can view | P1 | | Y | R28
E2E-018 | New user first sign-in and first approval | New Google user | 1) IT creates user 2) First sign-in (alert) 3) Approves a task | — | Alert sent; approval recorded | P1 | | P | R29,R04
'''))
