# 08 · Business rules and validation

Rules marked **(existing)** are in the code today; **(proposed)** need building and owner confirmation. All dates are India time; "working day" uses the Working calendar (working days + organisation and department holidays).

## 1. Task lifecycle
| Rule | Status |
|---|---|
| Statuses: Open → In progress → (Blocked) → Completed / Cancelled; Reopen back to Open | existing (`server/modules/task-rules.ts`) |
| Proposed: Open → In progress → **Submitted for review** → Accepted (Completed) / Rejected (back to In progress, revision +1) | proposed |
| Completion evidence per task type: none, note, file, or both | existing |
| Reopen needs a reason (≥3 characters) and the type must allow it | existing |
| Cancel by creator/assigner; assignee only if the type allows | existing |
| Edits use optimistic locking (`row_version`); a stale edit is refused with a reload message | existing |
| Every change writes `task_events` and, where relevant, `audit_logs` | existing |

## 2. Completion acknowledgement (owner's rule)
When an employee submits a task as completed, the responsible manager must acknowledge within **three days**. Proposed rules:
1. Acknowledger = the person who assigned the task; if that is the assignee themself, the assignee's reporting manager; if none, the HOD of the assignee's department; if none, IT. (Owner to confirm.)
2. Recorded: submission time, acknowledgement deadline, decision time, decision (accepted/rejected), rejection remarks (required, ≥10 characters), who decided.
3. Deadline = submission + **3 working days** (proposed: working days, end of day India time; owner to confirm calendar vs working days).
4. Reminders to the acknowledger: on submission, then daily; on the deadline, escalation to the acknowledger's manager and the HOD (configurable via the existing reminder rules).
5. A submitted task is **not** counted as completed in analytics until accepted; on-time is measured on the submission time against the due date applying at submission.
6. Rejection returns the task to In progress, increments the revision number and notifies the employee with the remarks.
7. Self-assigned personal tasks: acknowledgement off by default (per task type setting `requiresAcknowledgement`).

## 3. Allocation, delegation, reallocation
| Rule | Status |
|---|---|
| Who may assign whom: per type `assignScope` (anyone / same department / my team / groups / people) | existing |
| Reassignment requires a reason; history keeps from/to | existing (reason is fixed text in list/bulk edits: to fix) |
| Original assignee is kept permanently on the task | proposed |
| Delegation: the delegate does the work, the original assignee stays accountable; optional manager approval per type | proposed |
| Bulk allocation creates one task per person (grouped), all-or-nothing | proposed (today one by one) |
| Department allocation: task goes to a department queue; the HOD (or anyone they allow) picks it up | proposed |

## 4. Dates, holidays and leave
| Rule | Status |
|---|---|
| Start date ≤ due date | existing |
| Date on a holiday or non-working day: warn, block or allow per setting; suggest next (or previous) working day | existing |
| Holiday added later: optionally notify owners of affected tasks and offer to move them | existing |
| Reminders held on holidays | existing (reminders); proposed for rule engine |
| Default due date counted in working days | proposed (today calendar days) |
| Leave: a task due or starting during the assignee's leave triggers an alert to the assignee's manager and offers reassignment or a cover person | proposed |
| Periodic tasks: next occurrence created on schedule (not only on completion), skipping holidays if set | proposed |

## 5. Overdue, delayed, ageing
| Rule | Status |
|---|---|
| Overdue = open and due date passed | existing |
| Delayed = completed (accepted) after the due date that applied at completion | existing logic uses current due date: fix with a stored snapshot |
| Ageing = days since creation for open tasks, bucketed | existing (analytics) |
| Escalation stages configurable by IT (assignee → manager → manager's manager → HOD → IT) | existing |

## 6. IDM meetings (proposed)
- An IDM needs an organiser, date/time, at least two departments among participants, and an agenda.
- Minutes can be recorded during or after; decisions are separate items; each action item becomes a task (category IDM, linked to the meeting) with an assignee or department and a due date.
- A meeting closes when all action items are completed or carried to a follow-up meeting.

## 7. Daily Work Report (proposed)
- Generated automatically at end of each working day per employee: completed, pending, overdue, new tasks received, tomorrow's plan.
- Employee adds remarks and submits by a cut-off time (e.g. 7 pm, configurable); reminder before cut-off.
- Manager (or HOD) reviews and may comment; reports are kept for history and exportable to Excel/PDF.
- No report on holidays, non-working days or approved leave.

## 8. Validation
- All input validated on the server (zod schemas, lengths, date formats, allowed values); screens validate for convenience only.
- Duplicate prevention: submission key on every create; unique task and meeting numbers; one DWR per person per day (unique index).
- Every list and export respects record visibility; exports are audited.
