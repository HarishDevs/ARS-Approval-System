# 06 · UI / UX gap analysis

Principle: Task Management already lives in the sidebar group **Tasks & projects** (Compact view) and the **Tasks Management** module (Classic view), with the ARS brand tokens, light/dark themes and a phone layout. New screens must sit inside that structure, reuse the existing components, and leave the Approval screens unchanged.

## 1. Existing interface capabilities (reuse)

| Capability | Where |
|---|---|
| Sidebar groups, Classic module tabs, phone tab bar | `features/shell/SideNav.tsx`, `Classic.tsx`, `classic-modules.ts`, `features/mobile/MobileTabBar.tsx` |
| My Tasks (sections, list, board, calendar) | `features/work/MyTasks.tsx`, `TaskGrid.tsx`, `TaskCalendar.tsx` |
| Task page with history, comments, files | `app/users/tasks/[id]`, `features/work/TaskWorkPanel.tsx`, `Timeline.tsx`, `CommentThread.tsx` |
| Create task dialog | `features/work/TaskCreator.tsx` |
| Tables with filters, columns, saved views | `features/ui/DataTable.tsx`, `features/requests/RequestListScreen.tsx`, `features/ui/ListToolbar` |
| Bulk tick boxes | `features/ui/BulkSelect.tsx` |
| People and request pickers | `features/ui/PeoplePicker.tsx`, `features/requests/RequestLinkPicker.tsx` |
| Status pills, priority pills, badges | `features/ui/ChoicePill.tsx`, `features/ui/Display.tsx` |
| Analytics boards and charts | `features/analytics/CenterScreen.tsx` |
| Form designer | `features/admin/form-designer/**` |
| Confirm dialogs, toasts, loaders | `features/ui/**` |

## 2. Gaps and required screens

| Requirement | Gap | Proposed screen / change | Placement |
|---|---|---|---|
| Completion acknowledgement (F11–F14) | No review state | "Awaiting my acknowledgement" list + Accept / Reject (remarks) on the task page; "Submitted, awaiting review" banner for the employee | Tasks & projects → **To acknowledge**; task page action panel |
| Checklist (F2/F3) | Subtasks only | Checklist block with % bar on the task page and a % column in lists | Task page |
| Delegation (C3/C6) | None | "Delegate…" action, delegation requests for managers | Task page; **To acknowledge** page can host delegation approvals |
| Category (B6/B7) | Derived | Category picker in Create task; category filter and column | Create task, lists |
| Department allocation (C9) | None | "Assign to department" option + department queue for HOD | Create task; **Department tasks** page for HODs |
| Leave (E1–E4) | Out of office covers approvals | Extend **Out of office** with "On leave" and "Cover my tasks"; manager alert list | Profile → Out of office |
| IDM meetings (G) | None | Meetings list, meeting page (agenda, participants by department, minutes, decisions, action items → tasks), follow-up | New sidebar entry **Meetings (IDM)** inside Tasks & projects |
| Daily Work Report (H) | None | **My daily report** (auto-filled, remarks, plan tomorrow, submit); **Team reports** for managers/HODs (review); history; Excel/PDF | Tasks & projects → **Daily report** |
| Productivity dashboard (I) | Most metrics exist | Department table (users, tasks, on-time %, delayed %, overdue %), HOD column, XLSX/PDF export | Analytics → Tasks board |
| Delayed / ageing in lists (F8/F9) | Analytics only | "Delayed" filter and age column | Task lists |

## 3. Conventions to keep
- Sentence-case headings, short one-line hints (v1.50.0 copy rules), brand pills for status/priority.
- Every list: search, Filter, Sort, Group, Columns, pagination; saved views where lists already have them.
- Both Compact and Classic views, phone layout from 375 px, light and dark themes; no horizontal page scroll.
- Requester/approver navigation rules (v1.49.5) and module visibility (people without the Task module only reach tasks they are on, v1.50.1).
