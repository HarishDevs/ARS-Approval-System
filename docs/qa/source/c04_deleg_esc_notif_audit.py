SECTIONS.append(("13. Delegation Test Cases", "Delegation", "Functional", r'''
Delegation | Delegate sees delegator's pending task in their queue | Active MGR→finl2b, request at MGR | 1) SESS(finl2b) /users/queue | — | Task listed with "(for Deepa Menon, as their delegate)" | P1 | | Y | R22
Delegation | Delegate rejects | Active delegation | 1) Delegate rejects with reason | — | REJECTED; decided_by delegate, on_behalf_of MGR; requester told | P1 | | Y | R22
Delegation | Delegator can still act during delegation | Active delegation | 1) SESS(MGR) approve | — | Allowed (delegation adds, doesn't remove); decided_by MGR, on_behalf_of null | P1 | | Y | R22
Delegation | Original acts after delegate already approved | Delegate approved | 1) SESS(MGR) POST decide same taskKey | — | Refused (task not pending); one decision only | P0 | Concurrency | Y | R22,R08,C
Delegation | Delegation starts tomorrow | MGR→finl2b from tomorrow | 1) Today: delegate opens request | — | 404; tomorrow (India date) it opens and can be decided | P1 | Boundary | Y | R22,R32
Delegation | Delegation ended yesterday | Ended range | 1) Delegate tries today | — | 404 / refused | P1 | Boundary | Y | R22
Delegation | Delegation on the last day | ends_on = today (IST) | 1) Delegate approves at 23:50 IST | — | Allowed; at 00:01 IST next day refused | P2 | Boundary | P | R22,R32
Delegation | Delegate deactivated | Active delegation; IT deactivates delegate | 1) Delegator's task | — | Delegate can't sign in; delegator still can act; reminders go to delegator only | P1 | | Y | R22
Delegation | Delegate gets reminders | WF-SLA, active delegation | 1) Let MGR's task pass due 2) Run jobs | — | APPROVAL_REMINDER to MGR and finl2b (once each) | P2 | | Y | R22,R07
Delegation | Two people delegate to the same delegate | A→D and B→D | 1) D's queue | — | Both delegators' tasks listed and actionable | P2 | | Y | R22
Delegation | Delegate is also the requester of the task | REQ delegates to MGR? (MGR raises request needing REQ) | 1) Delegate opens own request | — | No decision buttons; POST refused | P0 | Security | Y | R22,C
Delegation | Delegation list shows involving rows | Several delegations | 1) /users/delegation | — | Mine and to-me lists; ended ones marked | P3 | UI/UX | Y | R22
Delegation | Notification on delegation start and end | Create, then stop | 1) Check delegate's notifications | — | Delegate told when set up and when stopped (where built); record if missing (N-17) | P2 | | Y | R22,R14
Delegation | Delegate tries to delegate onward | Delegate creates own delegation D→E | 1) E opens A's task | — | Refused (no chains) | P1 | Security | Y | R22
Delegation | Delegation of a Super Admin's approval | SA has a task; SA delegates | 1) Delegate approves | — | Allowed as for anyone; area rights not delegated (/superadmin still 404 for delegate) | P1 | Security | Y | R22,R30
Delegation | Audit of delegation | Create and stop | 1) /superadmin/audit | — | DELEGATION_CREATED / DELEGATION_ENDED with actor and dates | P2 | | Y | R22,R15
'''))

SECTIONS.append(("14. Escalation Test Cases", "SLA & escalation", "Functional", r'''
SLA | Due time uses working hours | WF-SLA (2 h), raise Sat 17:00 IST, Sun off | 1) Raise 2) DB approval_tasks.due_at | — | due_at = Monday 2 working hours later per calendar (not Sunday) | P1 | | Y | R32,R07
SLA | Holiday skipped | Holiday tomorrow | 1) Raise 23 h before the holiday with a 24 h SLA | — | due_at moves past the holiday | P1 | | Y | R32
SLA | No SLA set | WF-SEQ (no response time) | 1) Raise 2) Run jobs after 3 days | — | No reminder, no escalation | P2 | | Y | R07
Reminder | Reminder at due time | WF-SLA; due_at passed | 1) POST /api/jobs/run | — | APPROVAL_REMINDER to approver (+delegate); task_reminders row REMINDER; email + WhatsApp attempted | P0 | | Y | R07,C
Reminder | Reminder only once | After first reminder | 1) Run jobs 3 times | — | Still one reminder (INSERT IGNORE claim) | P0 | Concurrency | Y | R07,R08,C
Escalation | Escalation at twice the time | escalate_at passed | 1) Run jobs | — | APPROVAL_ESCALATED to approver's manager and IT admins (not to the approver); one task_reminders ESCALATION row | P0 | | Y | R07,C
Escalation | Escalation once only | Escalated | 1) Run jobs again | — | No second escalation | P1 | | Y | R07
Escalation | Approver without a manager | Approver has no manager | 1) Escalation fires | — | IT admins only | P2 | | Y | R07
Escalation | No escalation after approval | Task approved before escalate_at | 1) Run jobs after escalate_at | — | Nothing sent (task not pending) | P0 | | Y | R07,C
Escalation | No escalation after rejection or withdrawal | Request REJECTED / CANCELLED | 1) Run jobs | — | Nothing sent | P1 | | Y | R07
Escalation | No reminder while ON_HOLD | Held before due | 1) Run jobs after due | — | Record behaviour: expected no reminder while held (confirm rule, Q-QA-07) | P2 | | Y | R07,R23
Escalation | Two job runners at once | Due task | 1) Fire /api/jobs/run twice in parallel | — | Exactly one reminder (claim row is unique) | P0 | Concurrency | Y | R07,R09,C
Escalation | Escalation reaches the right manager after a manager change | Approver's manager changed after task creation | 1) Escalate | — | Current manager at escalation time is told | P2 | | Y | R07
SLA | SLA boundary second | due_at = T | 1) Run at T-1 s 2) Run at T+1 s | — | No reminder at T-1 s; reminder at T+1 s | P2 | Boundary | P | R07,R32
SLA | Calendar change applies to new tasks only | Existing task | 1) IT adds holiday affecting due_at 2) Check | — | Existing due_at unchanged; new tasks use it (D-067) | P2 | | Y | R32
Jobs | Cron missing | Cron not configured | 1) Wait past due | — | No reminders (dependency); go-live check must confirm cron (§42) | P1 | Recovery | N | R07
'''))

SECTIONS.append(("15. Notification Test Cases", "Notifications", "Integration", r'''
Event | Approval needed → new approver | WF-SEQ | 1) Raise 2) Check MGR's notifications, email, WhatsApp | — | In-app "Approval needed"; email subject "Approval needed: QAS-…"; WhatsApp ars_approval_needed_v1 if live; deliveries SENT | P0 | | P | R14,S,C,N
Event | Next level told after approval | WF-SEQ at MGR | 1) MGR approves | — | HOD gets APPROVAL_NEEDED; requester not spammed per level (N-08 not built: record) | P1 | | Y | R14
Event | Fully approved → requester | Final approval | 1) Check requester | — | REQUEST_APPROVED in-app, email "Approved: …", WhatsApp | P0 | | Y | R14,C
Event | Rejected → requester with reason | Reject | 1) Check | — | REQUEST_REJECTED with the reason in all channels | P0 | | Y | R14
Event | Changes asked → requester | Ask for changes | 1) Check | — | CHANGES_REQUESTED with "What to change" and link | P1 | | Y | R14
Event | Resubmitted → approver at restart level | Resubmit | 1) Check FIN | — | APPROVAL_NEEDED for the new round task | P1 | | Y | R14
Event | On hold → requester | Hold | 1) Check | — | REQUEST_ON_HOLD with reason (or "-" if none on WhatsApp) | P2 | | Y | R14
Event | Withdrawn → pending approvers only | Withdraw at HOD | 1) Check HOD and FIN | — | HOD gets REQUEST_WITHDRAWN; FIN (never activated) gets nothing | P1 | | Y | R14
Event | Reopened → requester | Reopen | 1) Check | — | REQUEST_REOPENED with reason | P2 | | Y | R14
Event | Comment → everyone on the request except the author | Comment by MGR | 1) Check REQ, HOD | — | REQUEST_COMMENT to requester and task holders; not to MGR | P2 | | Y | R14,R26
Event | Request blocked → IT admins | No approver | 1) Raise | — | REQUEST_BLOCKED to every IT admin with the level name and reason | P1 | | Y | R14
Event | Submission receipt to requester | Raise | 1) Check requester's notifications | — | Not sent today (N-06 not built); record gap | P3 | | Y | R14
Content | Deep links require sign-in | Any notification | 1) Open link signed out | — | Sign-in page, then the request; no data in the URL | P1 | Security | Y | R14,R20
Content | WhatsApp values on one line | Reason with new lines | 1) Reject with "Line1\n\nLine2" 2) Inspect payload | — | templateVariables "Line1 Line2"; never empty (uses "-") | P2 | | Y | R14,R31
Failure | Email provider down | Resend key wrong / network blocked | 1) Approve | — | Approval succeeds; delivery FAILED EMAIL_REQUEST_FAILED with next_retry_at; in-app row exists | P0 | Recovery | Y | R17,C
Failure | Email key missing | No Resend key | 1) Trigger event | — | Delivery FAILED EMAIL_NOT_CONFIGURED (not retried); business action committed | P1 | Recovery | Y | R17
Failure | WhatsApp template not live | Template not approved | 1) Trigger | — | Delivery SKIPPED TEMPLATE_NOT_CONFIGURED; email still sent | P1 | | Y | R17,R31
Failure | Recipient has no WhatsApp number | User without number | 1) Trigger | — | SKIPPED NO_WHATSAPP_NUMBER | P2 | | Y | R14
Failure | CEOITBox wallet empty (200 + error) | Simulated reply | 1) Trigger | — | Delivery FAILED CEOITBOX_BLOCKED; not retried | P1 | Integration | Y | R17,R31
Failure | CEOITBox 5xx then recovers | Simulated 503 | 1) Trigger 2) Run jobs after recovery | — | First FAILED CEOITBOX_REQUEST_FAILED retryable; retry SENT; message sent once | P0 | Recovery | Y | R17,R18,C
Failure | Retry limit reached | Always 503 | 1) Run jobs repeatedly | — | Stops after whatsapp.retry_limit; final FAILED, no next_retry_at | P2 | Recovery | Y | R18
Failure | Manual retry from the delivery log | FAILED retryable delivery, SESS(SA) | 1) /superadmin/deliveries 2) Retry now | — | "Sent." or "Still failing…"; audit DELIVERY_RETRIED | P2 | | Y | R17
Duplicate | No duplicate notification on double action | Approve twice quickly | 1) Double-click Approve | — | One APPROVAL_NEEDED for the next approver | P0 | Concurrency | Y | R09,R14,C
Wrong user | Notification to the right person | Group ANY_ONE | 1) Raise WF-GRP | — | Only checker1 and checker2 told; not the requester even if in the group | P1 | | Y | R14,R02
Inactive | Inactive recipient | Approver inactive | 1) Event for them | — | notify() records nothing for inactive users | P2 | | Y | R14
Bell | Unread count after reading | 3 unread | 1) Open one 2) Mark all read | — | Count updates; read_at set | P3 | UI/UX | Y | R14
'''))

SECTIONS.append(("16. Audit Log Test Cases", "Audit", "Database", r'''
Request | Submit is evented | Raise | 1) DB approval_events for the request | — | SUBMITTED + NODE_ACTIVATED + TASK_CREATED rows with actor and timestamp | P0 | | Y | R15,C
Decision | Approve/reject evented with actor | Decide | 1) DB | — | TASK_DECIDED payload: taskId, nodeId, actorId, decision, comment, onBehalfOf | P0 | | Y | R15,C
Decision | Delegate decision shows both people | Delegate approves | 1) DB + timeline | — | actorId = delegate, onBehalfOf = delegator | P1 | | Y | R15,R22
Withdraw | Withdraw evented | Withdraw | 1) DB | — | WITHDRAWN with reason, closedTaskIds, approverIds | P1 | | Y | R15
Reopen | Reopen evented and audited | Reopen | 1) DB | — | REOPENED event with round and reason | P1 | | Y | R15
Workflow | Workflow changes audited | Create, draft, publish | 1) /superadmin/audit | — | WORKFLOW_CREATED, WORKFLOW_VERSION_CREATED, WORKFLOW_PUBLISHED with versionNo | P1 | | Y | R15,R27
Users | User change audited with before/after | Edit a user's manager | 1) Audit log | — | USER_UPDATED metadata before/after values | P1 | | Y | R15
Access | Denied access audited | OUT opens REQ's request | 1) Audit log | — | REQUEST_ACCESS_DENIED, result FAILURE, actor OUT | P0 | Security | Y | R15,R16,C
Attach | Attachment audited | Attach | 1) Audit log | — | REQUEST_FILES_ADDED with names and sha256 | P1 | | Y | R15,R25
Settings | Provider key change audited without the key | SA saves a key | 1) Audit and setting history | — | Change recorded with a fingerprint, never the value | P0 | Security | Y | R15,R20,C
Templates | Template actions audited | Draft, submit, sync, test | 1) Audit log | — | WHATSAPP_TEMPLATE_DRAFTED / SUBMITTED (or SUBMIT_FAILED) / TEMPLATES_SYNCED / TEST_SENT | P2 | | Y | R15,R31
Demo | Try as audited | Try as | 1) Audit log | — | DEMO_TRY_AS with demo session id | P1 | | Y | R15,R34
Tamper | UPDATE on audit_logs blocked | DB user = app user | 1) UPDATE audit_logs SET action='X' WHERE id=1 | — | Trigger error; row unchanged | P0 | Security | Y | R15,C
Tamper | DELETE on audit_logs / approval_events / request_comments blocked | DB | 1) DELETE FROM each | — | Trigger error on each; rows remain | P0 | Security | Y | R15,C
Tamper | Audit log not editable in the UI | SESS(SA) | 1) /superadmin/audit | — | Read-only list with filters; no edit or delete | P1 | | Y | R15
Content | Audit row fields | Any action | 1) DB | — | actor_user_id, action, entity_type/id, result, ip_address (via proxy), session_id, metadata, created time | P1 | | Y | R15
Timeline | Timeline matches events | Request with 6 events | 1) Compare page timeline to approval_events | — | Same order and actors; internal events hidden by design | P1 | | Y | R15,R19
Attachment | Attachment removal | — | 1) Look for removal audit | — | Not applicable: attachments can't be removed (D-072) | P3 | | N | R25
'''))
