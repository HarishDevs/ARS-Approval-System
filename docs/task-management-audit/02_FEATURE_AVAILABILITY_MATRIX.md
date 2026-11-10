# 02 · Feature availability matrix (145 requirements)

Audit only, 10 Nov 2026, v1.50.1. Status is one of **IMPLEMENTED**, **PARTIAL** (partially implemented), **ENHANCE** (requires enhancement), **NOT** (not implemented), **NOT VERIFIED**. A button or menu alone never counts as implemented. Evidence is source and schema; the existing automated suites (all passing) are the runtime evidence where listed in `10_TESTING_AND_ACCEPTANCE_CHECKLIST.md`.

## Summary

| Group | Items | Implemented | Partial | Enhance | Not | Not verified |
|---|---|---|---|---|---|---|
| A Foundation | 13 | 8 | 4 | 1 | 0 | 0 |
| B Categories | 7 | 3 | 2 | 1 | 1 | 0 |
| C Allocation | 9 | 3 | 4 | 0 | 2 | 0 |
| D Scheduling & calendar | 11 | 8 | 2 | 1 | 0 | 0 |
| E Leave & holidays | 8 | 3 | 2 | 0 | 3 | 0 |
| F Execution & monitoring | 15 | 6 | 4 | 0 | 5 | 0 |
| G Meetings / IDM | 12 | 0 | 0 | 0 | 12 | 0 |
| H Daily Work Report | 11 | 0 | 0 | 5 | 6 | 0 |
| I Reports & analytics | 16 | 9 | 6 | 1 | 0 | 0 |
| J Notifications & escalations | 11 | 4 | 1 | 0 | 6 | 0 |
| K Roles & permissions | 14 | 7 | 5 | 1 | 1 | 0 |
| L Database, security, technical | 18 | 7 | 6 | 0 | 5 | 0 |
| **Total** | **145** | **58** | **36** | **10** | **41** | **0** |

## Path key

| Key | Path |
|---|---|
| TM | `server/modules/tasks.ts` |
| TR | `server/modules/task-rules.ts` |
| ST | `server/modules/settings.ts` |
| TL | `server/modules/task-lists.ts` |
| WS | `server/work/service.ts` |
| WSM | `server/work/service-more.ts` |
| WR | `server/work/rules.ts`, `more-rules.ts` |
| TA / WA | `app/users/tasks/actions.ts` / `app/users/work/actions.ts` |
| TC | `features/work/TaskCreator.tsx` |
| TWP | `features/work/TaskWorkPanel.tsx` |
| TF | `features/modules/TaskForms.tsx` |
| TDP | `app/users/tasks/[id]/page.tsx` |
| AN | `lib/db/repositories/analytics-center.repository.ts` + `server/analytics/**` + `features/analytics/CenterScreen.tsx` |
| RR | `server/notifications/rule-model.ts`, `rule-runner.ts` |
| MJ | `server/modules/jobs.ts` (`runModuleReminders`) |
| HS | `server/work/holidays.ts`, `holiday-store.ts` |
| v190 | migration `202610160900_v190.sql` |
| WMG | `202610301000_work_management.sql` |
| WMO | `202610301200_work_more.sql` |
| TKP | `202610301600_task_kinds_permissions.sql` |
| PRI | `202611101200_task_priority_important.sql` |
| NRL | `202610281200_notification_rules.sql` |
| WCAL | `202610011300_working_calendar.sql` |
| DLG | `202610011200_comments_delegation_sla.sql` |

## A. Task Management foundation

| ID | Requirement | Status | Frontend | Backend / action | DB | Exists | Missing → change |
|---|---|---|---|---|---|---|---|
| A1 | Create task | IMPLEMENTED | TF, `app/users/tasks/new`, TC | TM `createTask`; WS `quickAddTask`; TA `createTaskAction`; WA `quickAddAction` | `tasks` (v190) | Typed create (form fields, files, related request) and quick create | — |
| A2 | Edit and update | IMPLEMENTED | TDP, TWP, `features/work/TaskGrid.tsx` | TM `actOnTask` EDIT; WS `setTaskFields`; WA `taskFieldsAction` | `tasks.row_version` | Optimistic locking; before/after in event payload | — |
| A3 | Delete/archive with recovery and audit | IMPLEMENTED | `app/users/work/deleted` | WS `deleteTask` / `restoreTask` | `tasks.deleted_at`, `deleted_by` (WMG); `task_events` DELETED/RESTORED; `audit_logs` | Soft delete, 30-day restore, audited | No separate "archive" state → add only if archive ≠ delete |
| A4 | Unique task ID | IMPLEMENTED | — | `nextRequestNumber("TSK")` | `tasks.task_no` UNIQUE (v190) | TSK-2026-000123 | — |
| A5 | Title and description | IMPLEMENTED | TF, TC | validation in `createTask` / `quickAddTask` | `tasks.title`, `description` | Lengths checked | — |
| A6 | Clarity and expected deliverables | PARTIAL | TF (type fields) | `parseFormSubmission` | `module_type_versions.form_json`, `tasks.form_data_json` | IT can add custom fields per type; completion evidence rule | No built-in "expected deliverables" → add a standard deliverables field |
| A7 | Priority Critical / High / Medium / Low | ENHANCE | TC, grid, task page | ST `TASK_PRIORITIES`, `PRIORITY_LABEL` | `tasks.priority` ENUM(LOW, NORMAL, IMPORTANT, HIGH, URGENT) (PRI) | Offered today: Critical, Most Important, Important, Normal (owner decision 10 Nov 2026) | Brief asks Critical/High/Medium/Low: **owner decision needed** (labels only, no data change); `rule-model.ts` priority list still lacks IMPORTANT |
| A8 | Category selection | PARTIAL | TF type picker; `app/admin/task-types/**` | TM `createTask(typeId)` | `module_types` (module TASK) | Task types act as categories | Quick add (TC) always uses General → add a type/category picker |
| A9 | Department and employee assignment | PARTIAL | TC assignee picker | TR `mayAssignTo` (scopes) | `tasks.assignee_id`; no department column | Employee assignment | No department-level assignment → add `department_id` or department fan-out |
| A10 | Multiple assignees | PARTIAL | TC (`assigneeIds`) | WS `quickAddForMany` (≤50) | `tasks.assign_group_id` (TKP) | One copy per person, grouped | Not one shared task; not atomic → decide shared vs copies |
| A11 | Status management | IMPLEMENTED | TDP, grid | TR `allowedTaskActions`, `NEXT_STATUS`; TM `actOnTask` | `tasks.status` OPEN / IN_PROGRESS / BLOCKED / COMPLETED / CANCELLED | Server-checked state machine | Review statuses come with F11–F13 |
| A12 | Attachments and comments | IMPLEMENTED | `features/work/CommentThread.tsx`, TDP | WS `addComment`; TM COMMENT with files; `insertRecordFiles` | `task_comments` (WMG); `record_files` TASK (v190) | Threads, mentions, pins, evidence files | — |
| A13 | Activity and history | IMPLEMENTED | TDP history, `features/work/Timeline.tsx` | `appendTaskEvent`, `recordAudit` | `task_events` (append-only) | Every change recorded | — |

## B. Task categories

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| B1 | Periodic tasks | ENHANCE | `app/users/work/periodic`; WSM `setRecurrence`; `more-rules.ts` DAILY/WEEKLY/MONTHLY/YEARLY/AFTER_DONE; `on-complete.ts` `createNextOccurrence`; `tasks.recurrence_json`, `series_id` (WMO) | Next occurrence is created only when the current one is completed → add a scheduled generator so periodic tasks appear on time |
| B2 | Adhoc tasks | IMPLEMENTED | derived kind in `server/work/task-access.ts` (`recurrence_json IS NULL AND series_id IS NULL`); `server/work/access.ts` | Kind is derived, not stored |
| B3 | Project tasks | IMPLEMENTED | `projects`, `project_sections`, `task_projects`, `project_members` (WMG/WMO); `app/users/work/projects/**`; `features/work/ProjectWorkspace.tsx` | — |
| B4 | IDM tasks | NOT | No meeting code or tables | New (see group G) |
| B5 | Approval tasks | IMPLEMENTED | `server/approvals/work-mirror.ts` (`mirrorWorkTasks`); `form_data_json.__approvalWork`; v1.50.0 Task priority / due date on work levels | — |
| B6 | Configurable categories | PARTIAL | Task types (`module_types`, DRAFT/PUBLISHED/ARCHIVED) at `app/admin/task-types/**` | Periodic/adhoc/project/approval/IDM are not one configurable list → add a category attribute |
| B7 | Category-wise reporting | PARTIAL | `server/reports/module-reports.ts` (type column); AN `byType` | No split by periodic/adhoc/project/approval/IDM → add a category dimension |

## C. Allocation and assignment

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| C1 | Manager assigns to employees | IMPLEMENTED | TR `mayAssignTo`, `assignScope` MY_TEAM (whole reporting line via `teamOf`); `app/users/tasks/assigned`, `/team` | — |
| C2 | Personal tasks | IMPLEMENTED | WS `quickAddTask` (defaults to self); My Tasks sections (WMG) | — |
| C3 | Task delegation | NOT | Delegation exists for approvals only (`delegations`, DLG) | Add task delegation (delegate acts, owner keeps accountability) |
| C4 | Reallocation | IMPLEMENTED | TM `actOnTask` REASSIGN (type `allowReassign`, scope check, reason); WS `setTaskFields`; bulk ASSIGN | — |
| C5 | Original assignee history | PARTIAL | `task_events` REASSIGN `{from,to}`; `tasks.assigned_by`, `assigned_at` (latest only) | Add `original_assignee_id` or an assignment history table |
| C6 | Delegation approval | NOT | — | Add request → manager approval for delegation |
| C7 | Reassignment reason + audit | PARTIAL | `needsReason("REASSIGN")` in TM; audit `TASK_REASSIGN` | List and bulk reassign use a fixed reason → require a typed reason everywhere |
| C8 | Bulk allocation | PARTIAL | WSM `bulkTasks` (≤200: assign, due, priority…); `quickAddForMany` | Not atomic; no bulk create per department → add bulk allocation |
| C9 | Department-wise allocation | PARTIAL | `assignScope` SAME_DEPARTMENT; project privacy DEPARTMENT; `project_members.member_type` DEPARTMENT | No "assign to a department queue" → add |

## D. Scheduling and calendar

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| D1 | Start date | IMPLEMENTED | TWP start picker; `tasks.starts_on` (v190); start ≤ due checked in WS | Date only (no time) |
| D2 | Due date | IMPLEMENTED | TC, grid, calendar; `tasks.due_at`; type `requireDueDate`, `defaultDueDays` (ST) | Default due counts calendar days → count working days |
| D3 | Calendar view | IMPLEMENTED | `app/users/calendar`; `features/work/TaskCalendar.tsx` (drag to move); `server/calendar/**` | — |
| D4 | Daily / weekly / monthly | IMPLEMENTED | `server/calendar/views.ts` month/week/day; `server/work/period.ts` | Task-only calendar is month view only |
| D5 | Periodic recurrence | ENHANCE | as B1 | Schedule-driven generation needed |
| D6 | Next-day planning | PARTIAL | My Tasks Today/Upcoming sections; morning digest (WSM `runWorkDigest`, `work_digest_sends`) | No "plan tomorrow" record or manager view → add with H6 |
| D7 | Workday-based scheduling | PARTIAL | HS `nearestWorkingDay`; recurrence `skipHolidays`; working days setting | No "due in N working days" arithmetic; reminders use clock hours → add working-day helper |
| D8 | Holiday calendar integration | IMPLEMENTED | `holidays` (WCAL), `department_holidays` (WMO); `app/admin/task-holidays`, `app/admin/calendar`; HS `loadHolidayCalendar` | — |
| D9 | Holiday conflict detection | IMPLEMENTED | `checkHoliday` WARN/BLOCK/OFF in `createTask`, `actOnTask`, `setTaskFields`, bulk due; `features/work/client.tsx` keep/move prompt | Existing tasks re-flagged only if `notifyNewHoliday` is on |
| D10 | Reschedule | IMPLEMENTED | calendar drag, grid editor, bulk DUE, `moveHolidayTasks`; `task_events` EDIT `dueChanged` | No reschedule reason or count |
| D11 | Reminders and notifications | IMPLEMENTED | MJ due-soon (per type `reminderHoursBefore`) and overdue, held on holidays; RR stages | Rule engine is not holiday-aware |

## E. Leave and holidays

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| E1 | Employee leave information | NOT | Only Out of office (`app/users/delegation`, `delegations` DLG), for approvals | Add a leave record (or extend Out of office with a type) usable by Tasks |
| E2 | Tasks assigned during leave | NOT | No absence check in `createTask` / REASSIGN | Check due/start dates against leave |
| E3 | Alert manager about leave conflicts | NOT | Rules can target ASSIGNEE_MANAGER but there is no leave field | Add leave-conflict event and rule field |
| E4 | Reallocate during leave | PARTIAL | Manual REASSIGN and bulk ASSIGN; rule recipient DELEGATE for notices only | Add "reassign X's open tasks for dates A–B" |
| E5 | Company holiday calendar | IMPLEMENTED | `holidays`, `department_holidays`; Admin → Working calendar / Task holidays | — |
| E6 | Due dates on holidays | IMPLEMENTED | WARN/BLOCK on entry; `upcomingHolidayLoad`; `tellHolidayTasks` | Move and load use organisation holidays only |
| E7 | Next working day rules | IMPLEMENTED | `nearestWorkingDay` NEXT/PREVIOUS; `moveHolidayTasks` (audited `TASKS_MOVED_OFF_HOLIDAY`) | — |
| E8 | Leave-related task history | PARTIAL | Holiday moves in `task_events`/`audit_logs`; Out of office audited | Nothing links leave to tasks → typed events |

## F. Execution and monitoring

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| F1 | To-do list | IMPLEMENTED | `app/users/work/my-tasks`, `features/work/MyTasks.tsx`; sections incl. OVERDUE | — |
| F2 | Checklist | PARTIAL | Subtasks (`parent_task_id`, depth ≤5, WMG) | Subtasks are full tasks → add light checklist items |
| F3 | Checklist completion % | NOT | Only "(n subtasks)" in TWP | Compute and show % |
| F4 | Progress updates | PARTIAL | Comments, START/BLOCK/UNBLOCK, project status updates (project level) | No per-task progress % or structured update |
| F5 | Completion submission | IMPLEMENTED | TM COMPLETE with `completionProblems` (NOTE / FILE / NOTE_AND_FILE); evidence files | Completion is final (no review) |
| F6 | Pending monitoring | IMPLEMENTED | My Tasks, team list, search presets, AN | — |
| F7 | Overdue identification | IMPLEMENTED | TR `isOverdue`; overdue SQL in reports and AN | — |
| F8 | Delayed identification | PARTIAL | AN `x_tasks_late`, `t_days_late` (completed after due) | No delayed flag/filter in task lists |
| F9 | Ageing | IMPLEMENTED | AN `t_aging` buckets | Analytics only |
| F10 | Overdue escalation | IMPLEMENTED | RR TASK rules with stages to manager / manager's manager / HOD / IT; MJ overdue notice | Needs IT to create the rules |
| F11 | Completion acknowledgement | NOT | `NEXT_STATUS.COMPLETE = "COMPLETED"` (TR:65); acknowledgement exists for Information only | Add "submitted for review" status and ACKNOWLEDGE action |
| F12 | Manager rejection with remarks | NOT | Only REOPEN with reason by owner | Add REJECT with remarks → back to in progress |
| F13 | Three-day acknowledgement deadline | NOT | — | `ack_due_at` = submitted + 3 working days |
| F14 | Acknowledgement reminders | NOT | Pattern exists for Information (`INFO_ACK_REMINDER`) | Add reminders and escalation |
| F15 | Reopening and revision history | PARTIAL | REOPEN (type `allowReopen`, reason) with events | No revision number or rework view |

## G. Meetings and IDM (all NOT)

No meeting, agenda, minutes, decision or action-item entity exists (repository-wide search for meeting / MOM / minutes / IDM found nothing in code or migrations).

| ID | Requirement | Status | Reusable starting point |
|---|---|---|---|
| G1 | IDM meeting creation | NOT | New entity; page key in `server/authorization/pages.ts` |
| G2 | Interdepartmental participants | NOT | Patterns: `project_members` (USER/DEPARTMENT), `info_recipients` (USER/DEPARTMENT/GROUP) |
| G3 | Organiser | NOT | `users` |
| G4 | Date and time | NOT | Calendar (`server/calendar/**`); `calendar_items` is personal only |
| G5 | Agenda | NOT | — |
| G6 | Minutes (MOM) | NOT | Rich text editor used by tasks (`features/work`), PDF export (`server/reports/export.ts`) |
| G7 | Discussion and decisions | NOT | Comment threads (`task_comments` pattern) |
| G8 | Tasks from action items | NOT | `createTask` / `quickAddForMany` |
| G9 | Assign action items to departments/employees | NOT | `mayAssignTo`, department lists |
| G10 | Follow-up meetings | NOT | Recurrence helpers (`more-rules.ts`) |
| G11 | Action item closure monitoring | NOT | Task status + overdue logic |
| G12 | Meeting-wise reports | NOT | `server/reports/module-reports.ts` + export |

## H. Daily Work Report

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| H1 | DWR generation | NOT | Nearest: morning digest notification (WSM `runWorkDigest`) | New `daily_work_reports` store and service |
| H2 | Completed summary | ENHANCE | `tasks.completed_at`, `completion_note`; `task_events` | Per-day summary query |
| H3 | Pending summary | ENHANCE | open statuses (TR) | Per-day snapshot |
| H4 | Overdue summary | ENHANCE | digest uses `due_at < now` | Per-day snapshot |
| H5 | New tasks received | ENHANCE | `tasks.assigned_at` (WMG), used by digest | Per-day snapshot |
| H6 | Next-day plan | NOT | My Tasks sections only | Plan record per person per day |
| H7 | Employee remarks | NOT | — | Report-level remarks |
| H8 | Manager review | NOT | `reporting_manager_id`, `teamOf` can drive the reviewer | Review workflow |
| H9 | Department-wise DWR | NOT | HOD weekly email covers **requests** only (`server/reports/hod-weekly.ts`) | Department roll-up |
| H10 | Historical DWR | NOT | `work_digest_sends` stores only send times | Stored reports |
| H11 | Excel and PDF export | ENHANCE | `server/reports/export.ts` (CSV/XLSX/PDF), `app/api/reports/[key]/route.ts` | Add DWR report keys |

## I. Reports and analytics

On-time / delayed use `tasks.due_at` and `tasks.completed_at` (v190). Reliability limit: the **current** due date is used, so moving a due date after completion changes the result; tasks without a due date are excluded.

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| I1 | Management dashboard | IMPLEMENTED | Analytics boards (overview, tasks, employees, departments, trends…) `app/admin/analytics`, AN | — |
| I2 | Department-wise dashboard | IMPLEMENTED | AN `departmentRows` | Uses the person's current department |
| I3 | Employee-wise dashboard | IMPLEMENTED | AN `employeeRows`; `task_workload` report | — |
| I4 | HOD-wise dashboard | PARTIAL | DEPARTMENT scope for HODs (`server/analytics/scope.ts`) | No HOD column/grouping |
| I5 | Total employee count | PARTIAL | `people` per department | No organisation total tile |
| I6 | Total tasks | IMPLEMENTED | `x_tasks_created` | — |
| I7 | On-time completion % | ENHANCE | `t_on_time` | Snapshot due date at completion for exact results |
| I8 | Delayed completion % | PARTIAL | `x_tasks_late`, `t_days_late` | No % metric |
| I9 | Overdue % | PARTIAL | `x_tasks_overdue` (count) | No % metric |
| I10 | Pending count | IMPLEMENTED | `x_tasks_open` | — |
| I11 | Completed count | IMPLEMENTED | `x_tasks_completed` | — |
| I12 | Category-wise analysis | IMPLEMENTED | "By task type" (CenterScreen) | Category dimension comes with B6/B7 |
| I13 | Priority-wise analysis | IMPLEMENTED | "By priority" | — |
| I14 | Monthly trends | IMPLEMENTED | `r_monthly`, `taskTrend` | — |
| I15 | Date and department filters | PARTIAL | Period / custom range (`server/analytics/periods.ts`); department filter organisation scope (`query.ts`) | Department filter on task boards not verified |
| I16 | Excel and PDF exports | PARTIAL | Reports: CSV/XLSX/PDF; analytics boards: CSV only (`app/api/analytics/export`) | Add XLSX/PDF to analytics |

## J. Notifications and escalations

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| J1 | New assignment | IMPLEMENTED | `taskMessages.assigned` (`server/modules/messages.ts`), event WORK_TASK_ASSIGNED | — |
| J2 | Delegation | NOT | No task delegation (C3) | With C3 |
| J3 | Reassignment | IMPLEMENTED | REASSIGN notifies new assignee, creator, previous assignee | — |
| J4 | Upcoming due | IMPLEMENTED | MJ DUE_SOON; RR DUE-anchored stages | Clock hours, not working hours |
| J5 | Overdue | IMPLEMENTED | MJ OVERDUE; RR escalation; digest | — |
| J6 | Leave conflict | NOT | Depends on E1–E3 | — |
| J7 | Completion submission | PARTIAL | WORK_TASK_COMPLETED to creator/assigner | No "submitted for review" notice |
| J8 | Acknowledgement pending reminder | NOT | Information module only | With F11–F14 |
| J9 | Three-day escalation | NOT | RR could do it once an ack state exists | With F13 |
| J10 | IDM meeting reminders | NOT | — | With G |
| J11 | DWR submission reminders | NOT | — | With H |

## K. Roles and permissions

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| K1 | Super Admin | IMPLEMENTED | `SUPER_ADMIN`; `/superadmin`; exempt from page/module rules | — |
| K2 | Admin | IMPLEMENTED | `IT_ADMIN`; `/admin`; `isAdminActor` | — |
| K3 | Department HOD | PARTIAL | `departments.hod_user_id`; HOD analytics scope | HOD has no task rights by department |
| K4 | Manager | PARTIAL | `users.reporting_manager_id`; `teamOf` (whole line); `managesAssignee` | Derived, not a role; fine to keep derived |
| K5 | Team Leader | ENHANCE | Same chain; `groups` and assign scope GROUPS | No distinct construct → decide groups vs reporting line |
| K6 | Employee | IMPLEMENTED | `USER` + `users.module_access` | — |
| K7 | Role-based access control | PARTIAL | Areas, page levels, modules, per-type settings | No role→permission matrix |
| K8 | Department-level restrictions | PARTIAL | Page access by department; type access DEPARTMENTS; SAME_DEPARTMENT scope | HOD can't see department tasks unless they report to them |
| K9 | Employee-level restrictions | IMPLEMENTED | Page access by user, modules, `canSeeTask`; v1.50.1 people without the module see only their own tasks | — |
| K10 | Task creation permissions | IMPLEMENTED | type `access` checked by `mayCreate` (ST) | — |
| K11 | Allocation permissions | IMPLEMENTED | `assignScope` + `mayAssignTo` | — |
| K12 | Acknowledgement permissions | NOT | No acknowledge action for tasks | With F11 |
| K13 | Report access permissions | PARTIAL | `canExport` (EXPORTER role); reports for IT/Super Admin only (`canUseReports`); analytics scoped | HOD/manager report access |
| K14 | Administrative audit logs | IMPLEMENTED | `audit_logs` (append-only triggers), `/superadmin/audit` | — |

## L. Database, security and technical

| ID | Requirement | Status | Evidence | Missing → change |
|---|---|---|---|---|
| L1 | Task master | IMPLEMENTED | `tasks` (v190 + WMG/WMO/TKP/PRI) | — |
| L2 | Assignment history | PARTIAL | `task_events` REASSIGN `{from,to}` | Dedicated history table (C5) |
| L3 | Status history | IMPLEMENTED | `task_events.from_status/to_status` | — |
| L4 | Delegation history | NOT | — | `task_delegations` |
| L5 | Acknowledgement records | NOT | — | `task_acknowledgements` |
| L6 | Checklist records | NOT | Subtasks only | `task_checklist_items` |
| L7 | Meeting and MOM tables | NOT | — | Meeting tables |
| L8 | DWR tables | NOT | `work_digest_sends` is a send log only | DWR tables |
| L9 | Notification history | IMPLEMENTED | `notifications`, `notification_deliveries`, `notification_outbox`, `notification_rule_sends`, `task_item_reminders` | Retention not reviewed |
| L10 | Role-permission mapping | PARTIAL | `roles`/`user_roles`, `page_access_rules`, `module_access`, type settings | No permissions table |
| L11 | Data validation | IMPLEMENTED | zod schemas, `parseFormSubmission`, date/holiday checks, `mayAssignTo` | — |
| L12 | Duplicate prevention | PARTIAL | `uq_tasks_submission(created_by, submission_key)` in `createTask` | Quick add passes no key → pass one |
| L13 | API security and authorization | IMPLEMENTED | `requireArea` / `requireApiArea`, `checkPageAccess`, record rules, rate limits; security review 5 Nov 2026 found no critical/high issues | — |
| L14 | Transaction handling | PARTIAL | `withTransaction` + `FOR UPDATE` + `row_version` | Quick-create path makes several calls; bulk ops not atomic |
| L15 | Audit trail | IMPLEMENTED | `audit_logs`, `task_events`, `project_events` | — |
| L16 | Backup and recovery | IMPLEMENTED | daily encrypted backup, Drive/S3 off-site, `scripts/database/restore.js`, restore drill in CI | — |
| L17 | Performance and scalability | PARTIAL | indexes on `tasks`; load test 50 concurrent users OK | Reminder query LIMIT 500 can starve; optional indexes not applied |
| L18 | Automated test coverage | PARTIAL | ~17 unit, 10 integration, 8 end-to-end files for tasks/work/analytics | Nothing for acknowledgement, delegation, checklist, IDM, DWR (not built) |
