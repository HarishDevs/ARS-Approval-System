SECTIONS.append(("9. Validation Test Cases", "Request form", "Validation", r'''
Title | Title empty | WF-SEQ, SESS(REQ) | 1) Leave Title empty 2) Submit request | "" | Field error "Give the request a title of 3 to 200 characters."; no request row; values typed in other fields kept | P1 | | Y | R01
Title | Title 2 characters (below minimum) | WF-SEQ | 1) Submit | "ab" | Same title error; no row | P2 | Boundary | Y | R01
Title | Title exactly 3 characters | WF-SEQ | 1) Submit | "Pen" | Accepted | P2 | Boundary | Y | R01
Title | Title exactly 200 characters | WF-SEQ | 1) Submit | 200 × "a" | Accepted; stored in full | P2 | Boundary | Y | R01
Title | Title 201 characters | WF-SEQ | 1) Submit | 201 × "a" | Title error; no row | P2 | Boundary | Y | R01
Title | Title of spaces only | WF-SEQ | 1) Submit | "     " | Trimmed to empty → title error | P2 | | Y | R01
Title | Leading and trailing spaces trimmed | WF-SEQ | 1) Submit | "  Pump  " | Stored as "Pump" | P3 | | Y | R19
Title | Unicode and emoji title | WF-SEQ | 1) Submit | "क्रेन मोटर — ₹ ✓ 😊" | Stored and shown exactly; email and WhatsApp carry it; no mojibake (utf8mb4) | P2 | | Y | R19
Field | Required field empty | WF-SEQ | 1) Leave Details empty 2) Submit | — | "Details is required." under the field; no row | P1 | | Y | R01,N
Field | Optional field empty | Workflow with optional TEXT | 1) Submit | — | Accepted; field shown as "—" or omitted on the request | P3 | | Y | R01
Number | Amount not a number | WF-SEQ | 1) Submit | "abc" | "Enter a number."; no row | P1 | | Y | R01
Number | Indian grouping and ₹ accepted | WF-SEQ | 1) Submit | "₹ 12,50,000" | Stored as 1250000 | P1 | | Y | R01,R21
Number | Decimal amount | WF-SEQ | 1) Submit | "1500.75" | Stored 1500.75; displayed with Indian grouping | P2 | | Y | R01
Number | Amount over the maximum | WF-SEQ | 1) Submit | "100000000000000" (1e14) | "That number is too large."; no row | P2 | Boundary | Y | R01
Number | Amount at the maximum | WF-SEQ | 1) Submit | 10,000,000,000,000 (1e13) | Accepted | P3 | Boundary | Y | R01
Number | Zero amount | WF-DOA | 1) Submit | 0 | Accepted today; band 1 (SCM head only). Business rule wanted? See D-QA-04 | P2 | Boundary | Y | R21
Number | Negative amount | WF-DOA | 1) Submit | -50000 | Currently accepted and routed to band 1 (fewest approvers): D-QA-04. Expected after fix: "Enter an amount of ₹0 or more." | P1 | Boundary | Y | R21,C,N
Number | Scientific notation | WF-SEQ | 1) Submit | "1e5" | Accepted as 100000 (Number parsing); confirm acceptable | P3 | | Y | R01
Date | Invalid date | Workflow with DATE field | 1) Submit | "2026-02-30" | "Enter a date as YYYY-MM-DD."; no row | P2 | | Y | R01
Date | Past date | DATE field "Needed by" | 1) Submit | 2020-01-01 | Accepted (no min rule); record whether business needs a rule (Q-QA-06) | P3 | | Y | R01
Date | Leap day | DATE field | 1) Submit | 2028-02-29 | Accepted; 2027-02-29 rejected | P3 | Boundary | Y | R01
Text | TEXT at 200 / 201 characters | TEXT field | 1) Submit twice | 200 then 201 chars | 200 accepted; 201 "Use 200 characters or fewer." | P3 | Boundary | Y | R01
Text | LONG_TEXT at 4000 / 4001 | WF-SEQ Details | 1) Submit twice | 4000 then 4001 | 4000 accepted; 4001 "Use 4000 characters or fewer." | P3 | Boundary | Y | R01
Choice | Choice value not in the list | WF-DOA "budgeted" | 1) POST with budgeted = "Maybe" | Tampered FormData | Refused with a field error; no row | P1 | Security | Y | R01,R20
Person | Person field set to an inactive user | Workflow with PERSON field | 1) POST with the id of an inactive user | — | Field error (must be an active user); no row | P1 | | Y | R02
Person | Person field set to a non-numeric id | PERSON field | 1) POST "abc" | — | Field error; no row | P2 | | Y | R01
Comment | Reject comment of spaces only | Request at MGR | 1) Comment "   " 2) Reject | — | "A reason is required."; task still PENDING | P1 | | Y | R06
Comment | Decision comment over 2000 characters | Request at MGR | 1) 2100-char comment 2) Approve | — | Currently stored cut to 2000 without telling the user (D-QA-05); expected after fix: a clear limit message | P3 | Boundary | Y | R26
Comment | Discussion comment over 2000 | Request open | 1) Post 2001 chars | — | "Keep it under 2,000 characters."; nothing stored | P3 | Boundary | Y | R26
Workflow | Prefix and code rules | SESS(IT) | 1) New workflow with prefix "P1" and code "bad code" | — | Prefix "Use 2 to 6 capital letters…"; code "Use 2 to 50 capital letters, numbers or _…"; nothing saved | P2 | | Y | R27
Workflow | Duplicate workflow code | Existing PURCHASE_SCM_APPROVAL | 1) Create another with that code | — | "Another workflow already uses this code."; nothing saved | P2 | | Y | R27
DoA | DoA limits not rising | SESS(IT), new workflow | 1) Limits 10,00,000 then 1,00,000 2) Create | — | "DoA limits must go up from left to right."; nothing saved | P1 | Boundary | Y | R21
DoA | A band with no ticked level | New workflow | 1) Untick every level in one band 2) Create | — | Red band header in the editor and save refused: "Nobody approves in the band …" | P1 | | Y | R21
DoA | DoA amount field not required | New workflow | 1) Untick Required on Amount 2) Create | — | "Make "Amount (₹)" required: the DoA needs it to pick the approvers." | P1 | | Y | R21
DoA | DoA field missing from the form | New workflow | 1) Remove the Amount field 2) Create | — | "The DoA reads "amount", which isn't on the form…" | P1 | | Y | R21
Delegation | Delegation dates | SESS(MGR) | 1) End before start 2) End in the past 3) 91 days 4) Self as delegate | — | Messages: "The end date is before the start date." / "…in the past." / "Keep it to 90 days or fewer." / "You can't be your own delegate." | P2 | | Y | R22
Template | Template wording rules | SESS(SA), template editor | 1) Start with {{title}} 2) End with {{link}} 3) Two side by side 4) {{amount}} | — | Each refused with the matching message; nothing saved | P2 | | Y | R31
'''))

SECTIONS.append(("10. Negative Test Cases", "Request", "Negative", r'''
Raise | Raise on an unpublished (draft-only) workflow | Workflow with only a draft, SESS(REQ) | 1) POST submit with its workflowId | — | Refused ("not open for requests"); no row | P1 | | Y | R01,R27
Raise | Raise on an inactive workflow | Workflow marked inactive | 1) Open /users/new/{id} 2) POST submit | — | Not listed; POST refused; no row | P1 | | Y | R01
Raise | Raise when no approver resolves | WF-SEQ; REQ's manager removed | 1) Submit | — | Request created; MGR node BLOCKED (never auto-approved); IT admins notified REQUEST_BLOCKED; timeline "is blocked: no eligible approver. IT has been told." | P0 | | Y | R02,C
Raise | Raise when the only approver is the requester | Workflow whose step = PEOPLE [REQ] | 1) SESS(REQ) submit | — | Step BLOCKED (requester never approves own request) or skipped if the step says skip; never APPROVED by the requester | P0 | Security | Y | R02,C
Raise | Raise as an inactive user | User deactivated while signed in | 1) Submit | — | Session no longer valid (active re-read every request) → sign-in page; no row | P0 | Security | Y | R29,C
Approve | Approve a request already APPROVED | APPROVED request | 1) POST decide APPROVE with the old taskKey | — | Refused (task not pending); status unchanged; no new event | P0 | | Y | R08,C
Approve | Approve a REJECTED request | REJECTED request | 1) POST decide APPROVE | — | Refused; status REJECTED; no new event or notification | P0 | | Y | R06,C,N
Approve | Approve a withdrawn request | CANCELLED request | 1) POST decide APPROVE with the cancelled taskKey | — | Refused; status CANCELLED | P0 | | Y | R12,C
Approve | Approve while ON_HOLD | ON_HOLD request | 1) Look for Approve 2) POST decide | — | No decision buttons while on hold; POST refused | P1 | | Y | R23
Approve | Approve while CHANGES_REQUIRED | CHANGES_REQUIRED | 1) POST decide by the approver | — | Refused until resubmitted | P1 | | Y | R11
Approve | Decide with an unknown decision value | Request at MGR | 1) POST decision = "MAYBE" | — | "Not found."; no change | P2 | Security | Y | R20
Approve | Decide with another person's taskKey | Request with HOD task, SESS(MGR) | 1) POST decide with HOD's taskKey | — | Refused (not the approver); task still PENDING | P0 | Security | Y | R04,C
Reject | Reject without reason (UI) | Request at MGR | 1) Reject with empty comment | — | "A reason is required."; nothing changed | P0 | | Y | R06
Reject | Reject without reason (direct POST) | Request at MGR | 1) POST decide REJECT, comment "" | — | "Give a reason."; nothing changed | P0 | Security | Y | R06,C
Changes | Ask for changes without reason | Request at MGR | 1) POST REQUEST_CHANGES, comment "" | — | "Give a reason."; nothing changed | P1 | | Y | R11
Resubmit | Resubmit by someone other than the requester | CHANGES_REQUIRED, SESS(MGR) | 1) POST resubmit | — | "Only the person who raised the request can resubmit it."; no change | P0 | Security | Y | R11,C
Resubmit | Resubmit a request that isn't CHANGES_REQUIRED | IN_PROGRESS | 1) POST resubmit | — | Refused; round unchanged | P1 | | Y | R10
Resubmit | Resubmit a REJECTED request | REJECTED | 1) POST resubmit | — | Refused (rejected is final, A-04) | P1 | | Y | R11
Edit | Edit fields while IN_PROGRESS | IN_PROGRESS, SESS(REQ) | 1) Look for an edit form 2) POST resubmit with new fields | — | No edit form; POST refused; form_data_json unchanged | P0 | | Y | R10,C
Edit | Edit an APPROVED request | APPROVED | 1) POST resubmit | — | Refused; data unchanged | P0 | | Y | R10,C
Withdraw | Withdraw by an approver | Request at MGR, SESS(MGR) | 1) POST withdraw | — | NOT_AUTHORISED; status unchanged | P0 | Security | Y | R24,C
Withdraw | Withdraw an APPROVED request | APPROVED | 1) POST withdraw | — | NOT_OPEN; still APPROVED (no cancel after approval) | P1 | | Y | R24
Withdraw | Withdraw twice | CANCELLED | 1) POST withdraw again | — | NOT_OPEN; one WITHDRAWN event only | P1 | | Y | R24,R08
Reopen | Reopen by IT Admin | APPROVED, SESS(IT) | 1) POST reopen | — | Refused (Super Admin only); status APPROVED | P0 | Security | Y | R24,C
Reopen | Reopen a REJECTED or CANCELLED request | REJECTED | 1) SESS(SA) POST reopen | — | NOT_APPROVED; unchanged | P1 | | Y | R24
Reopen | Reopen without a reason | APPROVED, SESS(SA) | 1) Reopen with empty reason | — | "A reason is required."; unchanged | P1 | | Y | R24
Hold | Resume by someone who isn't at the held level | ON_HOLD at FIN, SESS(MGR) | 1) POST resume | — | Refused; still ON_HOLD | P1 | Security | Y | R23
Hold | Hold a request twice | ON_HOLD | 1) POST hold again | — | Refused; one PUT_ON_HOLD event | P2 | | Y | R23
Custom | Custom approval naming only yourself | SESS(REQ) | 1) Custom with Level 1 People = REQ only 2) Submit | — | "you can't approve your own request. Pick someone else."; no row | P0 | | Y | R28,C
Custom | Custom approval using a DoA matrix (tampered spec) | SESS(REQ) | 1) POST custom spec containing a DOA stage | — | "Custom approvals don't use a DoA matrix…"; no row | P2 | Security | Y | R28
Custom | Custom approval with an inactive person | SESS(REQ) | 1) POST spec with an inactive user id | — | Refused by validation (unknown/inactive user); no row | P1 | | Y | R28
Workflow | Publish a version with errors | Draft with a GROUP that was deactivated | 1) Publish | — | "Fix the errors before publishing."; still draft | P1 | | Y | R27
Workflow | Publish an already published version | Live v1 | 1) POST publish v1 again | — | "Only a draft can be published." | P2 | | Y | R27
Delegation | Delegate acts outside the date range | Delegation starting tomorrow | 1) SESS(delegate) open the delegator's pending request | — | 404 (not a participant yet); POST decide refused | P1 | Security | Y | R22
Delegation | Delegate acts on own request | Delegate = requester of the delegator's task | 1) Delegate tries to approve | — | Hidden in UI; POST refused (no self-approval) | P0 | Security | Y | R22,C
Delegation | Delegation chain | A→B and B→C active | 1) SESS(C) approve A's task | — | Refused (no chains, D-062) | P1 | Security | Y | R22
Delegation | Overlapping delegation | MGR has one active | 1) Create a second overlapping | — | Refused with an overlap message | P2 | | Y | R22
Attach | Attach to a closed request | APPROVED | 1) POST addFiles | quote.pdf | "Files can only be added while the request is open." | P2 | | Y | R25
Attach | Remove an attachment | Request with a file | 1) Look for remove 2) Try DELETE on /api/attachments/{id} | — | No remove action exists; DELETE not allowed (405/404); row and file remain (never deleted, D-072) | P2 | | Y | R25,R15
Template | Submit a template with no draft | SESS(SA), latest already submitted | 1) POST submit | — | "Save a draft first; there is nothing new to submit." | P3 | | Y | R31
Template | Template action by IT Admin | SESS(IT) | 1) POST saveTemplateDraftAction | — | "Not found."; nothing saved | P1 | Security | Y | R31,R30
Demo | Try as a non-demo person | SESS(SA) | 1) POST tryAs with REQ's real id (non-demo) | — | "Only demo people can be tried."; SA session kept | P0 | Security | Y | R34,C
Demo | Try as a demo person who was given IT_ADMIN | Demo person with IT_ADMIN added | 1) Try as | — | "This demo person has admin rights, so it can't be tried…" | P1 | Security | Y | R34
Expiry | Very old open request | Request IN_PROGRESS for 60 days | 1) Run jobs 2) Open the request | — | Stays IN_PROGRESS (no expiry, A-03); reminder and escalation sent once each; record as gap R13 | P3 | | Y | R13
Close | Approved request → Cancelled | APPROVED | 1) Look for cancel or close 2) POST withdraw | — | Not possible (A-02); status APPROVED | P2 | | Y | R38
'''))
