# 05 · API and backend gap analysis

The app uses **Server Actions** for screens and a small set of **route handlers** (`app/api/**`) for downloads, the command palette, jobs and integrations. New features should follow the same pattern: a pure rules file (unit-tested), a service in `server/**` (transactions, audit, messages), a repository for SQL, and thin actions.

## 1. Existing backend to extend

| Capability | Existing entry points | Extend with |
|---|---|---|
| Create / edit task | `createTaskAction` (`app/users/tasks/actions.ts`) → `createTask`; `quickAddAction`, `taskFieldsAction` (`app/users/work/actions.ts`) → `quickAddTask`, `setTaskFields` | category, department, deliverables, checklist items; submission key on quick add; one action for the full quick-create |
| Task actions | `taskAction` → `actOnTask` (START, BLOCK, UNBLOCK, COMPLETE, REOPEN, CANCEL, REASSIGN, EDIT, COMMENT) | SUBMIT (for review), ACKNOWLEDGE, REJECT, DELEGATE, END_DELEGATION, CHECK / UNCHECK item |
| Bulk | `bulkAction` → `bulkTasks` (`server/work/service-more.ts`) | Bulk allocate (create per person/department), bulk acknowledge |
| Recurrence | `setRecurrence`, `createNextOccurrence` (`server/work/on-complete.ts`) | Scheduled generator automation |
| Lists | `server/modules/task-lists.ts`, `server/work/rules.ts` (search presets) | Filters: delayed, awaiting acknowledgement, delegated to me, department |
| Reminders | `runModuleReminders` (`server/modules/jobs.ts`), rule engine (`server/notifications/rule-runner.ts`) | ACK_DUE reminder, 3-day escalation, leave conflict, DWR reminder; holiday-aware rules |
| Analytics | `analytics-center.repository.ts`, `app/api/analytics/export` | %, HOD grouping, XLSX/PDF export |
| Reports | `server/reports/module-reports.ts`, `app/api/reports/[key]` | DWR and meeting reports |
| Files | `app/api/files/[id]`, `server/modules/files.ts` | Meeting and DWR attachments |
| Quick search | `app/api/me/quick` | Meetings |
| Jobs | `POST /api/jobs/run` → `server/ops/automation.ts` | New automations (see below) |

## 2. New backend required

| Module | Services (proposed) | Actions / routes | Automations |
|---|---|---|---|
| Acknowledgement | `server/work/acknowledgement.ts` (submit, accept, reject, deadline in working days) | task actions SUBMIT / ACKNOWLEDGE / REJECT | `taskAck` (reminders + escalation after 3 working days) |
| Delegation | `server/work/delegation.ts` | DELEGATE, APPROVE_DELEGATION, END_DELEGATION | end expired delegations |
| Checklist | `server/work/checklist.ts` | add / edit / reorder / tick items | — |
| Leave | `server/leave/service.ts` (or extend Out of office) | create / end leave; reassign open tasks for a period | `leaveConflicts` (daily) |
| IDM meetings | `server/meetings/service.ts`, `rules.ts` | create, invite, agenda, minutes, decisions, action items → tasks, follow-up | `meetingReminders` |
| DWR | `server/dwr/service.ts` (generate snapshot, submit, review) | generate, edit remarks, submit, review; `app/api/reports/[key]` keys for export | `dwrGenerate` (end of day), `dwrReminders` |
| Periodic generator | `server/work/periodic-runner.ts` | — | `periodicTasks` (create next occurrence on schedule) |

## 3. Security requirements for every new entry point
- `requireArea` / `requireApiArea` with the page key; record-level checks in the service (never trust hidden ids); `checkPageAccess` covers actions automatically once the page key exists.
- Transactions with `FOR UPDATE` and `row_version` for state changes; audit + typed `task_events`.
- Messages queued in the outbox inside the transaction and sent **after the response** (`lib/http/after-response.ts`, v1.50.2), so a slow email/WhatsApp provider never makes a saved change look failed.
- Rate limits for heavy actions (`server/security/limits.ts`).

## 4. Known backend issues to fix before building on top
| Issue | Where | Fix |
|---|---|---|
| Quick-create makes several separate calls (create → recurrence → priority → action → follow) | `features/work/TaskCreator.tsx` | One server action in one transaction |
| Quick add has no duplicate-submit key | `quickAddTask` (`submissionKey: null`) | Pass a key |
| Bulk changes run one by one, not atomically | `bulkTasks`, `quickAddForMany` | Transaction per batch or clear partial-result reporting |
| Rule engine ignores holidays | `rule-runner.ts` | Hold sends on holidays like `runModuleReminders` |
| Reminder query reads 500 rows without excluding already-sent | `listTasksForReminders` | Exclude claimed reminders in SQL |
| Notification rule priority list lacks IMPORTANT | `server/notifications/rule-model.ts` | Add IMPORTANT |
