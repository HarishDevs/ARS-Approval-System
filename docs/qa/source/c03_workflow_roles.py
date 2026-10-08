SECTIONS.append(("11. Workflow Test Cases", "Workflow engine", "Functional", r'''
Single | Single-level approve | Demo MD Approval, SESS(REQ) raise, SESS(MD) | 1) Raise 2) MD approves | — | APPROVED after one decision | P0 | | Y | R03,S
Single | Single-level reject | Demo ED Approval | 1) Raise 2) ED rejects with reason | — | REJECTED; reason in notification and timeline | P0 | | Y | R06
Single | Single-level approver inactive at raise | ED deactivated, group ED_OFFICE has only ED | 1) Raise ED Approval | — | Step BLOCKED; IT notified; nobody can approve until IT hands over or fixes the group | P0 | | Y | R02,C
Single | Approver deactivated after the task was created | Request at ED | 1) IT deactivates ED (pending task warning) 2) Handover to MD | — | Task reassigned to MD (TASK_REASSIGNED); MD notified; ED's session revoked | P1 | | Y | R35
Single | Approver changed in the group after the task exists | Task with demo.finctrl | 1) IT swaps group member to another person | — | Existing task stays with the original approver (resolved at activation); new requests use the new member. Documented behaviour | P1 | | Y | R02
Single | Approver signs out before deciding | Request at ED | 1) ED signs out 2) Signs in later 3) Approves | — | Task still PENDING after sign-out; approval works | P2 | | Y | R04
Single | Approver session expires mid-decision | ED session 12 h old | 1) Approve | — | Redirect to sign-in or "Not found."; task unchanged; after sign-in the approve works once | P1 | | Y | R04,R29
Sequential | Levels run in order | WF-SEQ | 1) Raise 2) Check tasks after each approval | — | Only one level PENDING at a time: MGR → HOD → FIN → MD; approval_tasks created only on activation | P0 | | Y | R03,C
Sequential | Later level can't act early | WF-SEQ at MGR, SESS(HOD) | 1) Open request 2) POST decide with a guessed taskKey | — | No buttons for HOD; POST refused (no task for HOD yet) | P0 | Security | Y | R03,C
Sequential | Rejection at level 1 | WF-SEQ | 1) MGR rejects | — | REJECTED; HOD/FIN/MD never get tasks or notifications | P0 | | Y | R06
Sequential | Rejection at level 2 | WF-SEQ | 1) MGR approves 2) HOD rejects | — | REJECTED; MGR's approval kept in history; FIN never activated | P0 | | Y | R06
Sequential | Rejection at the final level | WF-SEQ | 1) MGR, HOD, FIN approve 2) MD rejects | — | REJECTED; all earlier approvals in timeline; requester told | P0 | | Y | R06
Sequential | Changes asked at level 3 restarts at the requesting level | WF-SEQ at FIN | 1) FIN asks for changes 2) REQ resubmits | — | Round 2; FIN task re-created (default restart policy REQUESTING_STEP); MGR and HOD not asked again | P1 | | Y | R11
Sequential | Same person at two levels | WF-SEQ where MGR also in FIN group | 1) Raise 2) MGR approves level 1 | — | Second task for the same person created at FIN level; each decision recorded separately (no auto-approval) | P2 | | Y | R02
Sequential | Requester is also their own HOD | Requester = HOD of their department | 1) Raise WF-SEQ | — | HOD level resolves to nobody eligible → BLOCKED and IT told (or skipped if configured); never self-approved | P0 | Security | Y | R02,C
Sequential | Requester has no manager | REQ manager cleared | 1) Raise WF-SEQ | — | MGR level BLOCKED (IT told) unless set to skip; documented | P1 | | Y | R02
Sequential | Workflow edited while requests are running | WF-SEQ v1 with open request | 1) Publish v2 removing HOD 2) Continue the old request | — | Old request keeps v1 (HOD still required); new requests use v2 | P0 | | Y | R27,C
Parallel | All branches approve (join ALL) | WF-PAR | 1) Raise 2) Sales, Plant, Finance approve in any order | — | Three tasks at once; MD activated only after the third approval | P0 | | Y | R05,C
Parallel | One branch rejects | WF-PAR | 1) Sales approves 2) Plant rejects | — | REJECTED; Finance task closed (NOT_REQUIRED/CANCELLED); MD never activated | P0 | | Y | R05,R06
Parallel | One branch doesn't respond | WF-PAR, SLA set | 1) Two approve 2) Third waits past SLA 3) Run jobs | — | Request waits at the join; reminder then escalation for the silent branch only | P1 | | Y | R05,R07
Parallel | Approvals in different orders give the same result | WF-PAR | 1) Run with orders S-P-F and F-P-S | — | Same final state; join completes once | P2 | | Y | R05
Parallel | Join ANY_ONE | WF-PAR-ANY | 1) Plant approves | — | Join complete; other branch tasks closed NOT_REQUIRED; MD activated | P1 | | Y | R05
Parallel | Join ANY_N = 2 | WF-PAR-2 | 1) Sales approves 2) Finance approves | — | After the 2nd approval the join completes; remaining task closed | P1 | | Y | R05
Parallel | ANY_N with not enough approvers | Step rule ANY_N n=3 on a group of 2 | 1) Raise | — | BLOCKED with "not enough approvers" (IT told) | P1 | | Y | R05,R02
Group | Group ANY_ONE: first approval completes | WF-GRP | 1) checker1 approves | — | Step complete; checker2's task closed NOT_REQUIRED; "Other approvers at … no longer needed" | P0 | | Y | R05
Group | Group ALL: every member must approve | WF-GRP-ALL | 1) checker1 approves 2) check 3) checker2 approves | — | Still waiting after one; complete after both | P1 | | Y | R05
Group | Group member raises on own group | REQ = checker1, WF-GRP | 1) checker1 raises | — | Only checker2 gets a task (requester excluded) | P0 | Security | Y | R02,C
DoA | Band 1 upper edge ₹1,00,000 | WF-DOA, SESS(BUY) | 1) Raise ₹1,00,000 | 100000 | SCM head only | P0 | Boundary | Y | R21,C
DoA | Band 2 lower edge ₹1,00,001 | WF-DOA | 1) Raise | 100001 | SCM head → Finance head | P0 | Boundary | Y | R21,C,N
DoA | Band 2 upper edge ₹10,00,000 | WF-DOA | 1) Raise | 1000000 | SCM head → Finance head | P0 | Boundary | Y | R21
DoA | Band 3 lower edge ₹10,00,001 | WF-DOA | 1) Raise | 1000001 | SCM head → Finance head → ED | P0 | Boundary | Y | R21
DoA | Band 3 upper edge ₹25,00,000 | WF-DOA | 1) Raise | 2500000 | SCM head → Finance head → ED (MD not needed) | P0 | Boundary | Y | R21
DoA | Band 4 ₹25,00,001 | WF-DOA | 1) Raise | 2500001 | All four levels | P0 | Boundary | Y | R21,C
DoA | Non-cumulative band | Matrix: CFO ticked only in middle band | 1) Raise in band 1, 2, 3 | 50k / 2L / 9L | CFO only in the middle band | P1 | | Y | R21
DoA | Amount changed on resubmit moves the band | WF-DOA ₹50,000 at SCM head | 1) SCM head asks for changes 2) REQ resubmits ₹12,00,000 | — | Round 2 routes SCM head → Finance head → ED | P0 | | Y | R21,R11,C
DoA | DoA limits changed while a request runs | Request at Finance head (₹5L) | 1) IT publishes v2 with first limit ₹10L | — | Running request keeps v1 routing; new ₹5L requests skip Finance head | P1 | | Y | R21,R27
DoA | Ordinary level before the DoA | Workflow: Manager level, then DoA | 1) Raise ₹30L | — | Manager first, then the DoA levels for that band | P1 | | Y | R21
Choice | Choice taken | WF-CHO | 1) Raise Nature = Payment | — | Level 1 → Level 2 → Finance head; map shows "Path taken" and other path "Not taken" | P1 | | Y | R03
Choice | Choice not taken | WF-CHO | 1) Raise Nature = Journal entry | — | Level 1 → Finance head (Level 2 not taken) | P1 | | Y | R03
Skip | Skip-when condition | Step "skip when amount ≤ 50,000" | 1) Raise 40,000 | — | Step SKIPPED ("its condition didn't apply"); next level activated | P1 | | Y | R03
Reopen | Reopened request runs from level 1 again | APPROVED WF-SEQ | 1) SA reopens 2) Check tasks | — | Round 2: MGR PENDING; earlier round tasks kept | P1 | | Y | R24
Hold | Hold blocks progress | WF-SEQ at HOD | 1) HOD holds 2) Others try to act | — | Nothing moves until resumed | P2 | | Y | R23
'''))

SECTIONS.append(("12. Role & Permission Test Cases", "Access control", "Security", r'''
Areas | USER opens /admin | SESS(REQ) | 1) Go to /admin | — | Plain 404 page; audit AREA_ACCESS_DENIED (reason MISSING_ROLE) | P0 | | Y | R30,S,C
Areas | USER opens /superadmin | SESS(REQ) | 1) Go to /superadmin | — | 404; audited | P0 | | Y | R30,S,C
Areas | IT Admin opens /superadmin | SESS(IT) | 1) /superadmin/settings | — | 404; audited | P0 | | Y | R30,C
Areas | IT Admin opens /admin | SESS(IT) | 1) /admin | — | 200; nav shows workflows, users, groups, DoA, calendar, insights | P1 | Functional | Y | R30
Areas | Signed-out visitor | No session | 1) /users 2) /admin 3) /api/attachments/1 | — | Pages redirect to /login?next=…; API returns 404 JSON | P0 | | Y | R30,S
Areas | Area switch links only for allowed areas | SESS(IT) | 1) Look at "Switch area" | — | My approvals and Admin only; no Super Admin link | P2 | UI/UX | Y | R30
Actions | USER calls an /admin Server Action | SESS(REQ) | 1) POST createWorkflowAction (replayed) | — | "Not found."; no workflow; audit API_ACCESS_DENIED | P0 | | Y | R30,C
Actions | IT Admin calls a /superadmin action | SESS(IT) | 1) POST saveSettingsAction / loadDemoAction / tryAsAction | — | "Not found." for each; nothing changed | P0 | | Y | R30,C
Records | USER opens another user's request | Request by REQ, SESS(OUT) | 1) /users/requests/{id} | — | 404 identical to a non-existent id; audit REQUEST_ACCESS_DENIED | P0 | | Y | R16,S,C,N
Records | IDOR by id increment | SESS(OUT) | 1) Loop /users/requests/1…N | — | Only own or involved requests open; every other id 404 + audited | P0 | | P | R16,C
Records | Comment on someone else's request | SESS(OUT) | 1) POST commentAction with their requestId | — | "Not found."; no comment | P0 | | Y | R16,C
Records | Download someone else's attachment | SESS(OUT) | 1) GET /api/attachments/{id} | — | 404; audit ATTACHMENT_ACCESS_DENIED | P0 | | Y | R16,R25,C
Records | Former approver keeps read access | MGR approved earlier | 1) SESS(MGR) open later | — | 200 (participant: had a task); can't act any more | P2 | Functional | Y | R16
Records | IT Admin sees every request | SESS(IT) | 1) Open any request | — | 200; no decision buttons unless IT is the approver | P1 | Functional | Y | R16
Users | IT Admin grants SUPER_ADMIN | SESS(IT) | 1) Edit a user, tick SUPER_ADMIN (or POST) | — | Refused: only a Super Admin can grant it; audit failure | P0 | | Y | R30,C
Users | IT Admin edits the Super Admin | SESS(IT) | 1) Edit itadmin | — | Refused | P0 | | Y | R30,C
Users | Deactivate yourself | SESS(SA) | 1) Deactivate own account | — | Refused ("Nobody can deactivate themselves") | P1 | | Y | R30
Users | Remove the last Super Admin | Only one SA | 1) Remove SUPER_ADMIN from itadmin | — | Refused (last active Super Admin) | P0 | | Y | R30,C
Users | Role removal applies immediately | IT signed in | 1) SA removes IT_ADMIN 2) IT refreshes /admin | — | 404 on next request (roles re-read every request) | P0 | | Y | R30,C
Users | Deactivation ends sessions | User signed in | 1) IT deactivates | — | Next request → sign-in; session revoked | P0 | | Y | R29,C
Demo | Demo session never has admin rights | Try as demo.md | 1) Open /admin | — | 404 (demo sessions forced to USER) | P1 | | Y | R34
Workflow | Custom workflow owner only | REQ's custom workflow | 1) SESS(OUT) POST addDraftVersion for it | — | "Workflow not found." | P1 | | Y | R28,R16
Workflow | USER creates a predefined workflow | SESS(REQ) | 1) POST create with kind PREDEFINED | — | "Only the IT team creates predefined approvals." | P0 | | Y | R27,C
Audit | USER reads the audit log | SESS(REQ) | 1) /superadmin/audit | — | 404 | P1 | | Y | R15,R39
Audit | IT reads the audit log | SESS(IT) | 1) /superadmin/audit | — | 404 (Super Admin only); no Auditor role exists (gap R39) | P2 | | Y | R39
Delegation | Create delegation for someone else | SESS(OUT) | 1) POST createDelegation with userId = MGR | — | Refused (only for yourself; IT for others if supported) | P1 | | Y | R22
Delegation | Stop someone else's delegation | SESS(OUT) | 1) POST stopDelegation with their id | — | "Not found." | P1 | | Y | R22
Handover | USER calls handover | SESS(REQ) | 1) POST handoverAction | — | "Not found." | P0 | | Y | R35,C
Jobs | Job runner without secret | — | 1) POST /api/jobs/run without x-job-secret 2) With a wrong one | — | 404/401; nothing runs | P0 | API | Y | R20,C
Providers | Provider key never readable | SESS(SA) | 1) Open Providers & security 2) View page source 3) DevTools network | — | Only Configured / Not configured shown; no key bytes in HTML, JSON or logs | P0 | | P | R20,R31,C
Templates | IT Admin opens the template creator | SESS(IT) | 1) /superadmin/templates | — | 404 | P1 | | Y | R31,R30
'''))
