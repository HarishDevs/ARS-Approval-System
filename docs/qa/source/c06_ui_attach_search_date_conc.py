SECTIONS.append(("21. UI/UX Test Cases (incl. loading states)", "UI", "UI/UX", r'''
Loading | Submit shows a working state | SESS(REQ), throttled network | 1) Submit request | — | Button reads "Working…" and is disabled until the reply; no second request on extra clicks | P0 | | Y | R18,R40,C
Loading | Approve, reject, hold, resume, resubmit, withdraw, reopen buttons | Throttled network | 1) Click each | — | Each disabled while pending; message after reply | P1 | | Y | R40
Loading | Upload progress state | 10 MB file, slow network | 1) Attach | — | Button "Working…"; no double upload; message after reply | P2 | | P | R25,R40
Loading | Spinner clears after an error | Server error | 1) Act | — | Button enabled again; error shown in role=alert | P1 | | Y | R40
Messages | Success messages | Each action | 1) Do each | — | Green role=status text matching the action ("Approved.", "Resubmitted…", "File attached.") | P2 | | Y | R40
Messages | Error messages stay next to the field | Invalid form | 1) Submit | — | Field errors under each field; typed values kept (form not reset) | P1 | | Y | R40
Confirm | In-page confirmations | Withdraw, reopen, publish, handover, stop delegation, retire demo, try as, submit template | 1) Click 2) Cancel 3) Click 4) Yes, continue | — | Bar shows the question; Cancel does nothing; Yes runs once; works where pop-ups are blocked | P1 | | Y | R40
Confirm | Confirmation not bypassed by Enter | Withdraw form | 1) Press Enter in the reason field | — | Bar appears; nothing withdrawn until Yes | P2 | | Y | R40
Forms | Number field accepts Indian grouping | Raise | 1) Type 12,50,000 | — | Accepted and shown back with grouping | P2 | | Y | R01
Forms | Date field uses a date picker | DATE field | 1) Open picker | — | Native picker; value YYYY-MM-DD | P3 | | N | R40
Forms | Person field lists active people only | PERSON field | 1) Open list | — | Only active users, "Name (UserID)" | P2 | | Y | R02
Builder | DoA editor add/remove limits keeps ticks right | SESS(IT) | 1) Add a limit 2) Remove a middle limit | — | Adding copies the top band ticks; removing merges two bands (level kept if either ticked) | P1 | Functional | Y | R21
Builder | DoA band headers update live | SESS(IT) | 1) Change limit 1 to 2,00,000 | — | Headers "Up to ₹2,00,000", "₹2,00,001 to …" | P2 | | Y | R21
Builder | Empty DoA band highlighted | SESS(IT) | 1) Untick a whole band | — | Band header red + warning line | P2 | | Y | R21
Builder | Move levels up and down | SESS(IT) | 1) ↑ / ↓ | — | Order changes; first/last buttons disabled | P3 | | Y | R27
Templates | Placeholder buttons insert at the cursor | SESS(SA) | 1) Click "+ Request title" mid-text | — | {{title}} inserted at cursor; preview updates | P3 | | Y | R31
Templates | Live counts and rule hints | SESS(SA) | 1) Type | — | "N of 1,024 characters · K placeholders" or the rule error | P3 | | Y | R31
Layout | Desktop 1366×768 | — | 1) Visit main pages | — | No horizontal scroll; sidebar visible | P2 | | P | R40
Layout | Tablet 768×1024 | — | 1) Visit main pages incl. builder | — | No page-level horizontal scroll; wide tables scroll inside their card | P2 | | P | R40
Layout | Phone 375×812 | — | 1) Raise, approve, comment, attach | — | All doable; no clipped buttons; sidebar hidden | P1 | | P | R40
Browsers | Chrome, Edge, Firefox, Safari (latest) | — | 1) Smoke flow in each | — | Same behaviour; Google popup sign-in works (COOP header) | P1 | Regression | P | R40
Nav | Back button after an action | — | 1) Approve 2) Back | — | No resubmission; page shows the current state | P2 | | Y | R18
Nav | Deep link to a request | Signed out | 1) Open link from email | — | /login?next=… then the request | P1 | | Y | R14
Status | Status pill colours and words | One per status | 1) View | — | Each status has a distinct label; not colour only | P3 | | N | R40
Empty | Empty states | New user | 1) /users, /users/queue, notifications | — | Friendly empty messages, no errors | P3 | | Y | R40
Demo | Demo banner | Try as | 1) Any page | — | Warning banner on every page while a demo person | P2 | | Y | R34
Time | Times shown in India time | — | 1) Compare timeline with DB UTC | — | Displayed IST, 12-hour clock | P3 | | Y | R19
Copy | Plain-language errors | Various errors | 1) Trigger | — | No codes or stack text for non-admins; actionable wording | P3 | | N | R40
Long text | Long titles and comments wrap | 200-char title, 2000-char comment | 1) View | — | Wrap without breaking layout | P3 | | P | R40
Insights | Insights tables readable | Data | 1) /admin/insights | — | Tiles and tables; "under 1 min" for tiny times | P3 | | P | R33
'''))

SECTIONS.append(("22. Attachment Test Cases", "Attachments", "Functional", r'''
Upload | Upload each allowed type | Open request | 1) Attach pdf, png, jpg, webp, docx, xlsx, pptx, doc, xls, ppt, csv, txt | Real files | All accepted with the right content_type | P1 | | Y | R25
Upload | Upload 10 MB exactly | — | 1) Attach | 10,485,760 bytes | Accepted | P1 | Boundary | Y | R25
Upload | Upload 10 MB + 1 byte | — | 1) Attach | 10,485,761 bytes | "… is larger than 10 MB." | P1 | Boundary | Y | R25
Upload | Empty file | — | 1) Attach a 0-byte quote.pdf | — | "quote.pdf is empty." | P2 | Boundary | Y | R25
Upload | Empty file box on submit | — | 1) Submit without choosing a file | — | Request submitted normally (no "blob" error) | P0 | Regression | Y | R25,C,N
Upload | Corrupted PDF (wrong magic) | — | 1) Attach | — | "doesn't look like a real PDF file." | P1 | Negative | Y | R25
Upload | 5 files in one upload | — | 1) Attach 5 | — | Accepted; one timeline line listing 5 names | P2 | Boundary | Y | R25
Upload | 6 files in one upload | — | 1) Attach 6 | — | "Add at most 5 files at a time." | P2 | Boundary | Y | R25
Upload | 21st file on a request | 20 attached | 1) Attach 1 | — | "A request can hold at most 20 files (20 already attached)." | P2 | Boundary | Y | R25
Upload | Same file twice | — | 1) Attach quote.pdf twice | — | Both kept (sha256 equal), both listed; record if de-duplication wanted | P3 | | Y | R25
Upload | Unicode file name | — | 1) Attach "कोटेशन final.pdf" | — | Shown and downloaded with the Unicode name (filename* header) | P2 | | Y | R25
Upload | Very long file name | — | 1) 220-char name | — | Cut to 150 keeping ".pdf" | P3 | Boundary | Y | R25
Upload | Upload on resubmit | CHANGES_REQUIRED | 1) Resubmit with a file | — | File stored with round 2 shown | P2 | | Y | R25,R11
Upload | Approver attaches | IN_PROGRESS, SESS(MGR) | 1) Attach signed note | — | Allowed; uploader shown as MGR | P2 | | Y | R25
Download | Download after request closed | APPROVED request | 1) Download | — | Still allowed for participants | P2 | | Y | R25
Storage | File survives a redeploy | Staging | 1) Redeploy 2) Download | — | 200 (UPLOAD_DIR outside the app folder) | P0 | Recovery | N | R25,C
'''))

SECTIONS.append(("23. Search & Filter Test Cases", "Lists", "Functional", r'''
My requests | List order | 5 requests | 1) /users | — | Newest first | P3 | | Y | R36
My requests | More than 200 requests | 205 requests by REQ | 1) /users | — | Latest 200 shown; no paging (gap R36): record | P2 | | Y | R36
Queue | Queue shows only my pending tasks | Mixed | 1) /users/queue | — | Only PENDING tasks for me (and delegators) in the current round | P1 | | Y | R36,R04
Queue | Queue after a decision | — | 1) Approve 2) Return to queue | — | Item gone | P2 | | Y | R36
Search | Search by request number | — | 1) Look for search | — | Not available (gap R36); workaround: open by URL | P3 | | N | R36
Search | Filter by status, date, amount, department, type | — | 1) Look for filters | — | Not available (gap R36) | P3 | | N | R36
Admin | User list search | SESS(IT), many users | 1) Search by name / User ID (if offered) | "kumar" | Case-insensitive partial match; record actual | P3 | | Y | R36
Audit | Audit log filters | SESS(SA) | 1) Filter by action | WORKFLOW_PUBLISHED | Only that action shown | P2 | | Y | R15
Deliveries | Delivery log shows latest 200 | > 200 deliveries | 1) /superadmin/deliveries | — | Latest 200; no body or payload shown | P3 | | Y | R17
Insights | Overdue list | Overdue tasks | 1) /admin/insights | — | Overdue tasks with links, sorted by most overdue | P3 | | Y | R33
Templates | Templates list | SESS(SA) | 1) /superadmin/templates | — | 20 rows with live and newest status | P3 | | Y | R31
DoA | DoA view lists every live type | SESS(IT) | 1) /admin/doa | — | One card per live workflow with bands | P3 | | Y | R21
'''))

SECTIONS.append(("24. Date/Time Test Cases", "Time", "Boundary", r'''
SLA | Raise at 23:59:59 IST Saturday | WF-SLA 2 h | 1) Raise | — | due_at = Monday 02:00 working time equivalent per calendar | P2 | | P | R32
SLA | Raise on a holiday | Holiday today | 1) Raise | — | Clock starts next working day | P2 | | Y | R32
SLA | Month-end and year-end | Raise 31 Dec 23:30 IST | 1) Raise | — | due_at in January computed correctly; request number year = submit year (IST vs UTC check) | P2 | | Y | R32,R01
Number | Request number year at IST midnight | 31 Dec 23:58 IST vs 1 Jan 00:02 IST | 1) Raise both | — | Year follows the defined rule (record UTC vs IST); numbers never collide | P3 | | P | R01
Delegation | Delegation boundary at IST midnight | ends_on today | 1) Act 23:59 IST and 00:01 IST | — | Allowed then refused (India date, not UTC) | P2 | | P | R22
Leap | Leap-year holiday 29 Feb 2028 | — | 1) Add holiday 2028-02-29 | — | Accepted; 2027-02-29 refused | P3 | | Y | R32
Display | Times in the UI | — | 1) Compare DB UTC vs UI | — | IST shown everywhere (timeline, notifications, deliveries) | P3 | UI/UX | Y | R19
OTP | OTP validity boundary | OTP issued | 1) Use at validity - 5 s and + 5 s | — | Accepted then refused | P2 | Security | P | R29
Session | Session at 12 h boundary | — | 1) Use at 11:59 and 12:01 | — | Valid then expired | P3 | Security | P | R29
Calendar | Working days changed to Mon–Fri | SESS(IT) | 1) Save Mon–Fri 2) Raise Friday 17:00 with 2 h | — | New task due Monday | P2 | | Y | R32
Insights | 30/90-day windows | Data at day 29/31 | 1) Insights tiles | — | Counted inside / outside the window exactly | P3 | | Y | R33
Leap | Date field 29 Feb non-leap | DATE field | 1) Submit 2027-02-29 | — | "Enter a date as YYYY-MM-DD." | P3 | Validation | Y | R01
'''))

SECTIONS.append(("25. Concurrency Test Cases", "Concurrency", "Concurrency", r'''
Same task | Two approvers of an ANY_ONE step approve at the same moment | WF-GRP | 1) checker1 and checker2 click Approve together | — | One approval completes the step; the other gets "Someone else just changed this request…" or "no longer needed"; one NODE_APPROVED; one next-level notification | P0 | | P | R09,C
Same task | Approve vs reject at the same moment (parallel branches) | WF-PAR | 1) Sales approves while Plant rejects | — | Final state is consistent (REJECTED if the reject commits; never APPROVED with a rejection recorded); state_version +2 at most | P0 | | P | R09,C
Same approver | Same approver, two tabs | Request at MGR | 1) Approve in tab A 2) Approve in tab B | — | Tab B refused; one TASK_DECIDED | P0 | | Y | R09,R08,C
Same approver | Approve in tab A, reject in tab B | Request at MGR | 1) Approve A 2) Reject B | — | B refused; status follows A | P0 | | Y | R09,C
Same request | Same Server Action POST replayed twice | Captured approve POST | 1) Replay 2× with curl | — | Second refused; one event, one notification | P0 | API | Y | R09,R18,C
Repeated | Approve clicked 10 times fast | — | 1) Spam clicks | — | Button disabled after first; one decision | P0 | UI/UX | Y | R09,C
Lock | Row lock serialises actions | Two different actions together (withdraw vs approve) | 1) Fire both | — | One wins; the other refused cleanly (CONFLICT or NOT_OPEN / not pending); never both | P0 | | P | R09,C
Lock | Optimistic check catches lost updates | Simulate stale state_version | 1) Save with old version | — | CONFLICT "Someone else just changed this request. Reload and try again." | P0 | Database | Y | R09,C
Delegation | Delegate and delegator decide together | Active delegation | 1) Both approve at once | — | One decision recorded | P0 | | P | R09,R22,C
Resubmit | Requester resubmits while the approver re-decides | CHANGES_REQUIRED | 1) Fire resubmit and a stale approve | — | Approve refused; resubmit wins | P1 | | P | R09
Reopen | Reopen while a comment is posted | APPROVED | 1) Fire both | — | Both succeed independently (comments don't touch state) | P3 | | P | R09
Handover | Handover while the approver approves | MGR pending | 1) IT hands over while MGR approves | — | Either the approval or the reassignment applies; never both a decision and a live reassigned task | P1 | | P | R09,R35
Publish | Two admins publish two drafts | Drafts v2, v3 | 1) Publish both together | — | Exactly one PUBLISHED (unique index); other error | P1 | Database | P | R09,R27
Numbers | 50 parallel submits | 50 sessions | 1) Submit together | — | 50 unique consecutive numbers, no gaps from collisions | P1 | Performance | Y | R09,R01
Jobs | Job runner and a user approve the same reminder-due task | — | 1) Run jobs while approving | — | No reminder after approval commit; never duplicate | P2 | | P | R09,R07
Demo | Load demo data in two tabs at once | SESS(SA) | 1) Click Load in both | — | No duplicate people or groups (unique codes); one may report errors | P3 | | P | R34
Templates | Sync while submitting | SESS(SA) | 1) Submit and sync together | — | Version rows consistent; no duplicate versions | P3 | | P | R31
Attach | Two uploads hitting the 20-file limit together | 19 attached | 1) Two uploads of 1 file at once | — | At most 20 stored; one may be refused (record if 21 slip through: D-QA-03) | P2 | | P | R09,R25
Users | Role change during an open session | IT signed in | 1) SA removes IT_ADMIN while IT saves a workflow | — | Save refused if role check runs after removal; no half write | P2 | | P | R09,R30
Network | Timeout but backend processed approval | Throttle | 1) Approve, lose reply 2) Reload | — | Page shows approved; retry refused (see §18) | P0 | Recovery | P | R09,R18,C
'''))
