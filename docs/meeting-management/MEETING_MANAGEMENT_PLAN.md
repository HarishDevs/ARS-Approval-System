# ARS-CMS Meeting Management: master plan

**From meetings to measurable outcomes.**
Plan only, 10 Nov 2026 (app v1.50.3). No code or database has been changed for this plan. It builds on the owner's Meeting Dashboard blueprint (5 sheets, 41-column register, 3 dashboards, 289 meetings, 16 departments, 18 HODs), the coordinator-driven operating model, and the Task Management gap analysis in `docs/task-management-audit/`.

---

## 1. Purpose and principle

A **coordinator-driven** system in which the Meeting Coordinator plans each meeting, records attendance, minutes, decisions and action items, and follows the resulting work to completion. Every meeting has **one Coordinator and one Meeting Owner** (the same person may hold both). The Coordinator raises the meeting points and the MOM; **the Meeting Owner approves them**. Everything the Coordinator enters or changes is pushed to the participants. Action items become tasks in the **existing ARS-CMS Task Management**, so the employee sees them in My Tasks and the coordinator, HOD and management see live progress against the meeting.

> A meeting is successful when its decisions are implemented, not when it is held.

### Three governing rules (owner, 10 Nov 2026)
1. **Reuse everything CMS already has.** People, departments, designations, reporting lines, HODs, groups, sign-in, permissions, approvals, tasks, calendar, holidays, notifications, files, PDF, search, analytics, audit and AI are taken from the existing Approval Management, Task Management and platform features. Nothing is re-entered, copied or built twice (section 4).
2. **One general meeting format for every meeting.** IDM, intra-department, MD/ED, management, review, production, project, external, critical or any other meeting is recorded in the **same** single format and in one place; the meeting type is a label with optional template text, not a different screen or workflow (section 6A).
3. **Follow-up management lives inside the Meeting module.** Every open point, decision and action item from any meeting is followed up in the meeting system itself, through the follow-up register and follow-up meetings, until it is closed (section 10).

Lifecycle: **Plan → Schedule → Notify → Prepare → Conduct → Record MOM → Approve MOM → Create tasks → Track → Follow up → Close → Analyse.**

### Ownership split

| Meeting Management owns | Task Management (existing) owns |
|---|---|
| Meetings, series, participants, attendance, timings | The task record (one source of truth) |
| Agenda, MOM, MOM versions and approval | Assignee, department, due date, priority |
| Decision register | Status, progress, comments, evidence, completion |
| Action-item references (meeting ↔ task link) | Reassignment, reopening, overdue reminders and escalation |
| Follow-up chain and carry-forward | Completion acknowledgement (3 working days, Task phase 5) |
| Meeting analytics | Task analytics (extended with "from meetings") |

One task record. Several modules read it. Meeting Management never stores its own copy of a task's status.

---

## 2. Scope

**In scope (this plan):** meeting types and categories, scheduling and invitations, calendar, agenda, attendance and actual timings, structured MOM with versions and approval, decision register, MOM-to-task conversion, follow-up meetings with carry-forward, notifications and escalation, five dashboards and a meeting score, legacy import of the existing register, audit.

**Later (phase 5):** AI MOM drafts and action extraction, voice-to-MOM, meeting-room booking, smart scheduling, productivity recommendations, external participants.

**Out of scope:** a second task engine, a second user/department master, video conferencing.

---

## 3. Design decisions (recommended defaults, to be confirmed)

| # | Decision | Recommended (used in this plan) | Why |
|---|---|---|---|
| D1 | MOM method | **Structured MOM inside CMS + PDF export**, with optional attachments (signed copies, presentations) | Decisions and actions must be data, not a file |
| D2 | MOM approval | **Decided (owner, 10 Nov 2026): the Meeting Owner approves**, and approval covers **only the meeting points (agenda) and the MOM** (points, decisions, action items). The Coordinator raises them; the Owner approves or returns with remarks. When the Coordinator is also the Owner, the approval step is recorded as "approved by the owner" on submission (no one waits on themselves) | One clear accountable approver per meeting |
| D3 | Task integration | **Existing CMS Task module** (no separate action-item engine) | One source of truth; already built and tested |
| D4 | Follow-ups | **Manual creation with automatic carry-forward**, plus "suggest next date" from the series frequency | Coordinator stays in control |
| D5 | Access | **Role and department-based**, with a per-meeting confidentiality level (General / Departmental / Management confidential) | Matches existing page access and department model |
| D6 | AI | **Phase 5**, after structured MOM and task links are reliable; always human-verified | Existing AI module (Pico Bot) can be reused then |
| D7 | Coordinator and Owner | **Decided (owner, 10 Nov 2026): exactly one Coordinator and exactly one Meeting Owner per meeting**; the same person may be both. Admin keeps a list of people allowed to act as coordinators (per department) | Clear responsibility: Coordinator runs it, Owner approves it |
| D10 | Selecting people | **Decided (owner, 10 Nov 2026): every people selection is a search-and-select field, never a dropdown.** Coordinator and Owner: search, pick exactly one. Participants, departments, collaborators, action-item owners' collaborators, notify lists: search, pick **many** (chips, removable) | No long dropdowns, no confusion, fast with 300+ employees |
| D8 | Meeting priority | Same names as tasks: **Critical / Most Important / Important / Normal** (owner decision for tasks, 10 Nov 2026) | One vocabulary across CMS |
| D9 | Action completion | Uses the task rules already decided: completion acknowledgement within **3 working days**; delegation without approval | Consistent with Task Management |

---

## 4. What ARS-CMS already provides (reuse, verified in code)

**Rule: use it, don't rebuild it.** The Meeting module stores only what is new (meetings, points, MOM, decisions, follow-up links). Everything below is read from, or written through, the existing CMS.

| Built already in CMS | How the Meeting module uses it |
|---|---|
| **Users** (active employees, User IDs, email, WhatsApp, photos, designations) | Owner, Coordinator, participants, action owners: picked from the same people (search-and-select) |
| **Departments, HODs, reporting lines, designations, groups** (Admin → Organisation, Users & roles, Groups) | Departments involved, "add whole department", HOD views, escalation to manager / HOD, management group = an existing group |
| **Approval Management** (requests, custom approvals, DoA, workflows, follow-up requests, linked requests) | A decision that needs formal authorisation (e.g. spend) is raised as an **approval request** from the meeting, prefilled from the decision and linked back; its status shows in the meeting. Approval follow-ups and Linked requests work as they do today |
| **Task Management** (tasks, My Tasks, projects, periodic tasks, reminders, escalation, evidence, acknowledgement) | Every action item is a CMS task (section 9); project tasks can be linked; periodic tasks for recurring commitments |
| **Out of office** | Absent participants are shown as away; the Owner's delegate can approve points/MOM while they are away (same rules as approvals) |
| **Working calendar and holidays** | Meeting dates, agenda/MOM deadlines and follow-up dates avoid holidays; next working day suggested |
| **Calendar + Google Calendar** | Meetings appear in the existing CMS calendar and sync to Google Calendar |
| **Notifications** (in-app, email, WhatsApp, push, preferences, quiet hours, rule engine) | All meeting notices and escalations |
| **Files, PDF, Excel import/export, quick search, analytics boards, audit log, AI (Pico Bot)** | Attachments, MOM PDF, legacy import, finding meetings and decisions, dashboards, history, phase-5 AI |
| **Page access, modules, no-access screen, phone and Classic layouts** | Meeting pages follow the same rules and look |

**Not built again:** no meeting-specific user list, department list, coordinator HR data, task tracker, notification system, file store, calendar, approval engine or audit table.

| Need | Existing capability | Where |
|---|---|---|
| Employees, departments, HODs, reporting lines | `users` (department_id, reporting_manager_id, designation_id, module_access), `departments.hod_user_id`, `designations`, `groups` | `lib/db/repositories/admin-users.repository.ts`, `app/admin/organisation`, `app/admin/groups` |
| Sign-in, sessions, roles, page access, modules | Google / password + WhatsApp OTP; areas; Hidden/View/Full by everyone/department/person; modules (APPROVAL, TASK, INFORMATION, AI); "You don't have access" screen | `server/auth/**`, `server/authorization/**`, `server/modules/modules.ts` |
| Tasks (the action-item engine) | `tasks` (task_no, priority, status, assignee, due_at, related_request_id, form_data_json), `task_events`, comments, files with evidence, reassignment, reopen, overdue, reminders, My Tasks, team views, bulk | `server/modules/tasks.ts`, `server/work/**`, `app/users/work/**` |
| Linking a task to a source record | `tasks.form_data_json` markers (`__approvalWork`, `__approvalLink`, `__requestFollowUp`) and the request page Work tasks card (v1.50.3 pattern) | `server/work/service.ts` (`quickAddTask` with relatedRequestId), `server/journey/load.ts` |
| Holidays and working days | Organisation + department holidays, working days, next working day, conflict warnings | `server/work/holidays.ts`, `holiday-store.ts`, Admin → Working calendar |
| Calendar | Month/week/day, Google Calendar push | `server/calendar/**`, `app/users/calendar` |
| Notifications | In-app, email (Resend), WhatsApp (CEOITBox, templates), web push, outbox with retry, preferences, quiet hours; sent after the response (v1.50.2) | `server/notifications/**`, `lib/http/after-response.ts` |
| Reminder and escalation rules | Admin-configured stages (assignee → manager → manager's manager → HOD → IT) | `server/notifications/rule-model.ts`, `rule-runner.ts`, `app/admin/reminders` |
| Forms | Form designer (text, choice, date, person, attachments, conditions) | `features/admin/form-designer/**`, `server/forms/**` |
| Files | Private storage, type sniffing, 10 MB, evidence purpose | `server/attachments/**`, `record_files` |
| Rich text and comments | Task description editor, threaded comments with mentions | `features/work/**` |
| PDF | Branded A4 PDF builder (request summary layout) | `server/pdf/request-summary.ts` |
| Reports and export | Report registry, CSV/XLSX/PDF, audited exports, Excel reader for imports | `server/reports/**`, `server/import/**` |
| Analytics | Boards with department/employee/type/priority/month figures | `server/analytics/**`, `features/analytics/**` |
| Audit | `audit_logs` (append-only triggers) | `lib/db/repositories/audit.repository.ts` |
| Jobs | Cron every 5 min → automation registry | `app/api/jobs/run`, `server/ops/automation.ts` |
| Numbering | `nextRequestNumber(prefix)` (e.g. TSK-2026-000123) | `lib/db/repositories/approvals.repository.ts` |
| AI (phase 5) | Pico Bot, providers, data sources | `server/ai/**` |

---

## 5. Roles and permissions

Roles stay derived from existing data; only the per-meeting **Coordinator** and **Meeting Owner** are new assignments (not new login roles).

| Role | How it is determined | Can do |
|---|---|---|
| Super Admin / Admin (IT) | `SUPER_ADMIN`, `IT_ADMIN` | Configure types, categories, the list of allowed coordinators, scores, legacy import; see everything |
| Management | A configurable group (e.g. MD, ED, directors) in Meeting settings | Organisation-wide dashboards and meetings (read-only unless they are the Meeting Owner) |
| HOD | `departments.hod_user_id` | Department meetings, MOM approval (if configured), department reports, escalations |
| Second level | The HOD's delegate / designation set in settings | Department review and delegated MOM approval |
| **Coordinator** (one per meeting) | Chosen on the meeting from the allowed coordinators (`meeting_coordinators`) | Create, schedule, invite, run, record attendance, **raise meeting points and MOM**, create tasks, follow up, close |
| **Meeting Owner** (one per meeting; may be the Coordinator) | Chosen on the meeting (any active employee, typically the HOD or senior person accountable for the meeting) | **Approve or return the meeting points and the MOM**; sees everything about the meeting |
| Participant | Per meeting (many) | Receive every update, respond, view agenda/MOM, submit discussion points, feedback |
| Action owner | Task assignee | Update the linked task (in Task Management) |

| Operation | Coordinator | Meeting Owner | HOD | Participant | Management | Admin |
|---|---|---|---|---|---|---|
| Create / schedule / reschedule / cancel | ✔ | request only | ✖ | ✖ | ✖ | ✔ |
| Enter meeting points (agenda) and submit for approval | ✔ | ✖ | ✖ | suggest points | ✖ | ✔ |
| **Approve / return meeting points** | ✖ (unless also Owner) | ✔ | ✖ | ✖ | ✖ | ✖ |
| Record attendance and timings | ✔ | ✖ | ✖ | self check-in | ✖ | ✔ |
| Write MOM, decisions, action items and submit | ✔ | ✖ | ✖ | ✖ | ✖ | ✔ |
| **Approve / return MOM** | ✖ (unless also Owner) | ✔ | ✖ | ✖ | ✖ | ✖ |
| Create tasks from approved MOM | ✔ | ✖ | ✖ | ✖ | ✖ | ✔ |
| View meeting | ✔ | ✔ | dept + invited | invited | per confidentiality | ✔ |
| Edit approved points/MOM | new version with reason → Owner re-approves | approves | ✖ | ✖ | ✖ | same as Coordinator |

Approvals in this module are **only** for the meeting points and the MOM, and **only** by the Meeting Owner. Nothing else in the meeting needs approval (scheduling, invitations and attendance are the Coordinator's).

Rules: server-side checks on every action; confidential meetings visible only to invited people, the Owner, the Coordinator, and management if marked; every change audited; approved MOMs are never overwritten.

---

## 6A. One general meeting format (all meetings)

Every meeting, whatever its type, uses the same record and the same screens:

| Block | Always present | Notes |
|---|---|---|
| Header | Title, meeting no., type, category, date/time, duration, mode, venue/link, priority, confidentiality | Type and category are labels (Admin lists); no type has its own form |
| People | Meeting Owner (one), Coordinator (one), participants (many), departments involved (many), guests (optional, names/emails) | Search-and-select |
| Meeting points | Ordered points with presenter and planned minutes | Approved by the Owner |
| Attendance | Present / absent / excused / late, actual start and end | |
| Discussion | Notes per point | Rich text |
| Decisions | Numbered decisions | Decision register |
| Action items | Owner, collaborators, department, priority, due date → CMS task | |
| Open points | Matters to revisit without a task (e.g. "waiting for customer reply") with owner and review date | Followed up like actions |
| Carried forward | Items from the previous meeting in the series | Automatic |
| Attachments, next review | Files; suggested follow-up date | |
| Custom fields (optional) | Extra fields per type using the existing form designer | Only if a type needs them |

Templates per type only pre-fill text (e.g. standard points for a Production & Despatch review); the structure stays the same, so every meeting is recorded, searched, reported and followed up in one place.

## 6. Meeting lifecycle (state machine)

| Status | Entered when | Allowed next | Who |
|---|---|---|---|
| Draft | Coordinator saves without publishing | Scheduled, Cancelled | Coordinator |
| Scheduled | Invitations sent to participants | Rescheduled, In progress, Cancelled | Coordinator |
| Rescheduled | Date/time changed (reason required, participants told) | In progress, Rescheduled, Cancelled | Coordinator |
| In progress | "Start meeting" (actual start time) | Awaiting MOM | Coordinator |
| Awaiting MOM | "End meeting" (actual end time) | MOM submitted | Coordinator |
| MOM submitted | Coordinator submits the MOM to the Meeting Owner | MOM approved, MOM revision | **Meeting Owner** |
| MOM revision | Owner returns with remarks | MOM submitted | Coordinator |
| MOM approved | Owner approves; MOM distributed to participants; tasks created | Closed | Coordinator |
| Closed | Documentation complete (attendance, MOM approved, every action item has a task or is marked "no task") | (reopen by Admin with reason) | Coordinator |
| Cancelled | Cancelled with reason before it starts | — | Coordinator |

**Meeting points (agenda) approval** runs alongside, before the meeting: the Coordinator enters the points and submits them; the Owner approves (points are then circulated to participants) or returns them with remarks. Points status: Draft → Submitted → Approved / Returned. A meeting can't move to *In progress* with points still awaiting approval unless the Owner allows it (setting). If the Coordinator is also the Owner, submitting counts as approval (recorded as such).

**Meeting closure is separate from action closure.** A closed meeting can still have open action items; those are tracked through their tasks and the follow-up chain, never by keeping the meeting open.

Timestamps captured automatically (no manual compliance flags): published, agenda circulated, actual start, actual end, MOM submitted, MOM approved, closed. Duration and duration category are calculated.

---

## 7. Screens and navigation

New sidebar group **Meetings** (Compact view) / **Meeting Management** module (Classic view), for people with a new **MEETING** module (module access, same as Task/Information).

| # | Screen | Purpose | Main users |
|---|---|---|---|
| 1 | **My Meeting Operations** (home for coordinators) | Upcoming meetings, MOM pending, open/overdue linked tasks, today's priorities, quick actions (Create meeting, Enter MOM, Track tasks, Follow up) | Coordinator |
| 2 | **My Meetings** (home for everyone else) | Today's meetings, invitations to answer, agendas to read, my action items (from tasks), upcoming follow-ups | All |
| 3 | **Meeting calendar** | Day/week/month, conflicts, filters by department/type (reuse calendar component) | All |
| 4 | **Schedule meeting** | Type, category, **Meeting Owner** (search, one), **Coordinator** (search, one; defaults to the person creating it), **participants** (search, many; can add a whole department with one pick), departments involved (search, many), date/time, mode, venue/link, priority, confidentiality, recurrence, agenda deadline, template | Coordinator |
| 5 | **Meeting workspace** (one page per meeting, tabbed) | Overview · Agenda · Attendance · MOM · Decisions · Action items · Documents · Follow-ups · History | Coordinator, participants |
| 6 | **MOM editor** | Structured: agenda points → discussion → decisions → action items (task fields inline) → next review; versioning; submit for approval; PDF | Coordinator |
| 7 | **Owner approvals** | Meeting points and MOMs waiting for me as Meeting Owner; approve / return with remarks; side-by-side view of what changed since the last version | Meeting Owners |
| 8 | **Follow-up register** | Every open action item, decision and open point across all meetings, with live task status, filters (meeting, series, department, owner, status, ageing), request update, delay reason, escalate, carry forward, close | Coordinator, Owner, HOD, management |
| 9 | **Follow-up preparation** | Previous meeting summary: decisions, actions (completed / in progress / overdue / not started), delay reasons, department-wise pending, items needing management | Coordinator |
| 10 | **Reports & analytics** | 5 dashboards (section 12), exports | HOD, management |
| 11 | **Meeting settings** (Admin) | Types, categories, allowed coordinators, MOM templates, agenda deadline, reminder timings, score weights, management group, legacy import | Admin |

Conventions: ARS brand tokens, sentence case, short hints, light/dark, Compact + Classic + phone (375 px), pagination and filters on every list, bulk tick boxes where useful. Notifications always carry a direct action (Accept, Read agenda, Approve points, Approve MOM, Update task).

### People selection (owner rule, 10 Nov 2026)
- **No dropdowns for people anywhere in this module.** Every person field is a **search-and-select** box: type a name, User ID, department or designation; matching people appear; click to pick.
- **Single pick** (one person, shown as a chip with ✕ to change): Meeting Owner, Coordinator, action-item owner (the one accountable person).
- **Multiple pick** (chips, each removable; "Add whole department" option): participants, departments involved, action-item collaborators, extra people to notify, follow-up participants.
- Reuses the existing search picker (`features/ui/PeoplePicker.tsx`, already used for collaborators and approvers), extended with: department search and "add everyone in the department", a single-pick mode, inactive people excluded, people without the MEETING module still selectable as participants (they receive the meeting by email/in-app and can open their own meeting page).
- Filters on reports (department, type, owner) also use search boxes, not long dropdowns.

---

## 8. Structured MOM

| Part | Content |
|---|---|
| Header | Meeting no., title, type/category, date, actual start–end, venue/mode, Meeting Owner, Coordinator, approved on / by |
| Attendance | Present / absent / excused / late per participant; departments represented |
| Agenda points | Each with discussion notes (rich text) |
| Decisions | Numbered decisions (decision register: DEC-2026-000123), owner department, linked agenda point |
| Action items | Title, description, responsible department, owner (one accountable person), collaborators (followers), priority, due date, "create task" tick, linked decision |
| Carried-forward items | Pending actions from the previous meeting in the series with current task status and delay reason |
| Next review | Suggested follow-up date/time |
| Attachments | Optional files |

**Versions:** every save after submission creates a version (number, who, when, reason, previous content, approval status). An approved MOM is changed only by a new version with a reason, then re-approved. **Templates** per meeting type (IDM, MD, ED, review…). **PDF** in the ARS layout (reuse the v1.50.0 PDF builder). **Distribution:** approved MOM goes to participants (in-app + email).

---

## 9. Action items ↔ CMS tasks (core integration)

### 9.1 Flow
1. Coordinator enters action items in the MOM (task fields inline).
2. On **MOM approved** (or "Create tasks now" when approval isn't required), the system creates one CMS task per ticked action item, **in one transaction**, through the existing task service (General task type or a dedicated "Meeting action" task type).
3. Each task gets: title, description, assignee, priority, due date (working-day checked), follower = coordinator (+ collaborators), and a source link to the meeting and action item.
4. The task appears in the owner's **My Tasks**; normal notifications, reminders, overdue and escalation rules apply.
5. The meeting's action register reads **status, progress, due date, evidence, completion and acknowledgement live from the task**.

### 9.2 Link design (no duplicate records)
- New table `meeting_action_items` (meeting_id, minutes_version_id, decision_id, title, description, department_id, owner_id, priority, due_on, `task_id` UNIQUE NULL, created_by, created_at, carried_from_action_id).
- On the task: `form_data_json.__meetingAction = { meetingId, actionId }` (same marker pattern as approval work steps), plus a new **`tasks.created_from`** column (`MANUAL`, `MEETING`, `APPROVAL`, `PROJECT`, `SYSTEM`) for management analysis of how work enters the organisation.
- Idempotent: a task is created only when `task_id IS NULL` (row lock + unique constraint), so re-saving or revising a MOM never duplicates tasks.
- The task page shows "From meeting MTG-2026-000045 · action 3" with a link (subject to meeting access).

### 9.3 Behaviour rules
| Situation | Behaviour |
|---|---|
| Task completed (and acknowledged) before follow-up | Shows completed; not carried forward |
| Task overdue | Highlighted; appears in the next meeting's pending list |
| Owner changes / due date changes | Done through the task (reassign / edit with reason); register shows the new values and history |
| MOM revised | New version; existing tasks stay linked; new actions create new tasks only |
| Same action discussed again | Link the existing task (carry-forward), never create another |
| Meeting cancelled | Existing tasks untouched unless the coordinator explicitly cancels them |
| Task deleted/archived | Link kept; register shows "task removed" |
| Coordinator changes | Meeting administration moves; task ownership doesn't |
| Owner lacks the Task module | Still opens the task from the email (v1.50.1 rule) |

---

## 10. Follow-up management (inside the Meeting module)

Follow-up management is a full part of the Meeting module, not a separate application. It covers three kinds of follow-up item from any meeting:

| Item | Where its progress comes from | Closed when |
|---|---|---|
| Action item | The linked CMS task (status, due date, evidence, acknowledgement) | Task completed (and acknowledged) |
| Decision | Its linked actions and, if raised, its approval request | All linked items done, or Owner marks implemented |
| Open point | Coordinator updates in the follow-up register | Coordinator closes it with a note (Owner sees it) |

**Follow-up register** (one screen across all meetings, filtered by series, meeting, department, owner, status, ageing): every open item with current status, days open, revised dates and delay reasons. From here the Coordinator can request an update (notice to the owner), record a delay reason, escalate to the owner's manager / HOD, link the item to the next meeting, or close it.

**Follow-up meetings** carry all open items forward automatically; each is reviewed in the meeting (reviewed / delayed with reason / revised date / escalated / closed). The whole chain stays in one series history.

**Follow-up reminders and dashboard:** items due soon, overdue items, items with repeated date changes, and items open over 30 days, by department and person (section 12, dashboard 4).

### Series and follow-up meetings

- **Meeting series** (`meeting_series`): a recurring review (frequency: one-time, daily, weekly, monthly, quarterly, annual). Each meeting has `series_id` and `parent_meeting_id`.
- **Create follow-up** from any meeting: copies type, participants, departments, Owner and Coordinator (changeable); suggests the next date from frequency (skipping holidays); **carries forward** every open action item (as references to the same tasks).
- **Follow-up preparation report** (screen 9) before the meeting; attachable to the agenda.
- During the follow-up, per carried item: mark reviewed, record delay reason, set revised due date (through the task, with reason), escalate to HOD, or close.
- Series view: the whole chain with decisions and actions across meetings; series closed when no further review is needed.
- Repeated delays tracked by department and owner (count of due-date extensions per task, from `task_events`).

---

## 11. Notifications and escalation

All through the existing notification engine (in-app, email, WhatsApp where a template is approved, push) and the existing rule engine for timed reminders and escalation. Messages are sent after the response (v1.50.2).

**Coordinator entries reach participants (owner rule):** whatever the Coordinator enters or changes is pushed to everyone on the meeting: invitation and any change of date, time, venue, link, owner or participant list; approved meeting points; attachments added; start/end; the approved MOM, decisions and the action items assigned to each person; follow-up scheduled; cancellation. Each update shows on the participant's meeting page as a timeline entry ("Updated by the coordinator: time moved to 3 pm") and is sent as one combined notice per change (not one per field).

| Event | Recipient | Timing (configurable) |
|---|---|---|
| Invitation / rescheduled / cancelled / details changed | Participants, Owner | Immediately |
| Meeting points submitted | Meeting Owner | Immediately; reminder daily |
| Meeting points approved / returned | Coordinator (+ participants when approved) | Immediately |
| Invitation not answered | Participant, then coordinator | 24 h before |
| Agenda deadline approaching / missed | Coordinator, Owner | 24 h before / at deadline |
| Meeting starts soon | Participants | 15 min before |
| MOM not submitted | Coordinator → HOD | 2 h / 24 h after end |
| MOM submitted | Meeting Owner | Immediately; reminder daily |
| MOM returned / approved | Coordinator / participants | Immediately |
| Action assigned | Owner (task notification) | On task creation |
| Action due tomorrow / overdue | Owner → HOD (task rules) | Existing task reminders |
| Follow-up approaching | Participants, coordinator | 2 days before |
| Pending action list for next meeting | Coordinator | When follow-up is scheduled |

---

## 12. Analytics

Five dashboards in Meetings → Reports (scoped: management = all, HOD = department, coordinator = their meetings), with date, department, type and HOD filters and Excel/PDF export.

1. **Management overview:** scheduled, conducted, cancelled, rescheduled, agenda compliance %, MOM on-time %, open/overdue actions, action closure %, meeting hours, department table.
2. **Department performance:** meetings, agenda compliance, on-time start/end %, MOM on time, action completion %, overdue actions, follow-up count, average duration, effectiveness (replaces the existing department scorecard).
3. **Employee and HOD:** meetings attended/organised, hours, actions assigned/completed/overdue, average completion time, MOM approval turnaround, attendance % (replaces HOD hours and the collaboration matrix: HOD × HOD shared meeting hours). Attendance is **not** a productivity score.
4. **Action-item governance:** generated, open/in progress/completed/overdue, by department and owner, ageing (0–3, 4–7, 8–15, 15+ days), repeated extensions, items pending > 30 days, carried forward, monthly trend.
5. **Meeting effectiveness:** meetings with decisions, with actions, action completion %, repeat discussion %, follow-up cycles, feedback rating, meetings without MOM / without outcome.

**Meeting score (configurable 100 points, starting model):** agenda on time 10, started on time 10, ended on time 10, MOM submitted on time 15, MOM approved on time 10, actions completed on time 25, participant feedback 10, follow-up discipline 10. Weights and applicability per type in settings. Only computed from system timestamps; legacy meetings use their imported values, flagged "legacy".

---

## 13. Data model (proposed; additive migrations only)

| Table | Key columns | Notes |
|---|---|---|
| `meeting_types` | code, name, mom_template_id, default_duration, active (approval is always by the Meeting Owner) | Seeded: IDM, Intra Department, Management, MD, ED, Critical, External, Production & Despatch, Project Review, Review, Other |
| `meeting_categories` | code, name, active | Review, Planning, Decision Making, Problem Solving, Training, Brainstorming |
| `meeting_coordinators` | department_id, user_id, active | One or more per department |
| `meeting_series` | series_no, title, frequency, type_id, owner_department_id, status | |
| `meetings` | meeting_no UQ (MTG-2026-000001), title, type_id, category_id, series_id, parent_meeting_id, department_id, **owner_id** (NOT NULL), **coordinator_id** (NOT NULL; may equal owner_id), points_status (DRAFT/SUBMITTED/APPROVED/RETURNED), points_submitted_at, points_decided_at, points_remarks, mode, venue, link, priority, confidentiality, status, scheduled_start, scheduled_end, actual_start, actual_end, agenda_due_at, agenda_circulated_at, cancelled_reason, legacy (bool), legacy_json, row_version, created_by/at, deleted_at | Indexes: (scheduled_start), (department_id, scheduled_start), (series_id), (status), (coordinator_id) |
| `meeting_participants` | meeting_id, user_id NULL, department_id NULL, role (REQUIRED/OPTIONAL), response (PENDING/ACCEPTED/DECLINED/TENTATIVE), response_reason, attendance (PRESENT/ABSENT/EXCUSED/LATE), checked_in_at, agenda_acknowledged_at | (user_id, meeting_id) |
| `meeting_agenda_items` | meeting_id, position, title, owner_id, minutes_planned, submitted_by | Participants can suggest points |
| `meeting_minutes` | meeting_id, version_no, status (DRAFT/SUBMITTED/RETURNED/APPROVED), content_json (structured), change_reason, created_by/at, submitted_at, decided_by/at, decision_remarks | One row per version; approved versions immutable |
| `meeting_decisions` | decision_no UQ, meeting_id, minutes_version_id, agenda_item_id, text, owner_department_id, status, approval_request_id NULL | Decision register; optional link to an approval request |
| `meeting_action_items` | meeting_id, minutes_version_id, decision_id, title, description, department_id, owner_id, priority, due_on, task_id UQ NULL, carried_from_action_id, no_task_reason | Link to `tasks` |
| `meeting_open_points` | meeting_id, text, owner_id, review_on, status (OPEN/CLOSED), closed_note, carried_from_id | Follow-up items without a task |
| `meeting_followup_updates` | item_kind (ACTION/DECISION/OPEN_POINT), item_id, meeting_id, update_kind (REVIEWED/DELAY_REASON/REVISED_DATE/ESCALATED/CLOSED/UPDATE_REQUESTED), note, actor_id, created_at | Append-only follow-up history |
| `meeting_feedback` | meeting_id, user_id, rating 1–5, comment | Phase 4 |
| `meeting_settings` | key, value_json | Score weights, reminder timings, management group, agenda deadline hours |
| `meeting_events` | meeting_id, actor_id, event_type, payload_json, created_at | Append-only history (like `task_events`) |

**Existing tables touched (additive):** `tasks.created_from` ENUM (+ backfill: approval work steps → APPROVAL, project tasks → PROJECT, others → MANUAL); `record_files.entity_type` + 'MEETING'; `module_access` + MEETING; page keys in `server/authorization/pages.ts`; notification event types.

Documents use `record_files` (no separate `meeting_documents` table); approvals use `meeting_minutes` status columns (no separate `meeting_approvals` table); audit uses `audit_logs` + `meeting_events` (no separate audit table), so nothing duplicates what CMS already has.

---

## 14. Legacy data (289 meetings from the Excel register)

- Import through the existing Excel import framework (Admin → Import data, new kind "Meetings"), mapping the 41 columns to `meetings`, participants (HOD checkboxes → participant rows) and document links (stored as links).
- Values imported **as recorded**, marked `legacy = true`; agenda compliance, durations and HOD hours shown as "legacy (manual)" and excluded from system-calculated scores.
- Known spreadsheet issues (agenda compliance, date-range boundaries, HOD duration) are **not** reproduced; the new calculations use timestamps.
- Dry run first (check file → preview → import), as for users and departments.

---

## 15. Security, audit and quality

- Every page and action: `requireArea` + page key + module MEETING + record-level check (participant, department, confidentiality, role).
- Transactions with row locks and `row_version`; task creation idempotent.
- Every status change, MOM version, approval, task creation, carry-forward and escalation written to `meeting_events` and `audit_logs`.
- Dates stored UTC, shown IST; working-day rules for deadlines.
- Files: existing validation and private storage; links checked per viewer.
- Pagination on all lists; indexes listed above.
- Tests per phase: unit (rules: state machine, permissions, score), integration (MySQL: task creation, idempotency, carry-forward, imports), end-to-end (coordinator journey, participant journey, HOD approval, follow-up, dashboards); security review before release; load check on the VPS.

---

## 16. Phased delivery

| Phase | Deliverables | Depends on | Effort* | Acceptance |
|---|---|---|---|---|
| **M0 Foundations** | MEETING module access; page keys; settings; types, categories, coordinators (Admin); `meetings`, participants, series tables; `tasks.created_from` | Task phase 1 (HOD visibility) helpful | M | Admin configures types and coordinators; access rules enforced |
| **M1 Core meetings (P0)** | Schedule, invite/respond, calendar, agenda, attendance, start/end timings, reschedule/cancel with reasons, My Meetings, My Meeting Operations | M0 | L | Coordinator runs a meeting end to end; participants respond; timings captured |
| **M2 MOM and tasks (P0)** | Structured MOM, templates, versions, Meeting Owner approval of points and MOM, decision register, action items → CMS tasks (transactional, idempotent), live status, PDF and distribution | M1; Task phase 5 (acknowledgement) for "verified" completion | L | Approved MOM creates exactly one task per action; status flows back; PDF matches screen |
| **M3 Follow-up and accountability (P0)** | Series, create follow-up, carry-forward, preparation report, delay reasons, escalation rules, notifications set | M2 | M | Pending actions appear automatically in the next meeting; overdue escalates to HOD |
| **M4 Analytics and governance (P1)** | Five dashboards, meeting score, exports, legacy import of 289 meetings, feedback | M3 | M | Dashboards match fixture calculations; legacy data visible and flagged |
| **M5 Intelligence and engagement (P2)** | AI MOM draft and action extraction (human-verified), MOM search, smart follow-up suggestions, room booking, productivity insights | M4; AI module | L | AI drafts accepted/edited by coordinator; nothing saved without confirmation |

*S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks (one developer with Claude; indicative). M0–M3 ≈ 5–7 weeks; M4 ≈ 1–2 weeks; M5 later.

Each phase ships as its own release: additive migrations, tests, release notes, User Guide/Help/tour updates, living files, CI green.

---

## 17. Risks

| Risk | Mitigation |
|---|---|
| Coordinators see it as extra admin | Coordinator home with one-click actions, templates, carry-forward, auto follow-up report; notifications with direct actions |
| Duplicate tasks | Unique `task_id` per action + row lock; carry-forward links, never copies |
| "Completed" without verification | Reuse Task acknowledgement (3 working days) once built |
| Confidential MOMs exposed | Confidentiality level + server checks + audited access; PDFs checked per viewer |
| WhatsApp templates take time | Submit templates to Meta at M1 start; email and in-app work meanwhile |
| Legacy figures questioned | Imported as-is, clearly flagged, excluded from new scores |
| Scope creep (AI, rooms) | Held to M5 |

---

## 18. Open questions for the owner

1. Confirm the remaining decisions in section 3 (D2 approver, D7 one Coordinator + one Owner and D10 search-and-select were decided on 10 Nov 2026). Also: may a Meeting Owner be **anyone**, or only HODs/managers?
2. Who forms the **Management** group (MD, ED, directors…)?
3. Agenda deadline (e.g. 24 h before the meeting) and MOM deadline (e.g. 24 h after) for compliance.
4. Should MOM tasks use the General task type or a dedicated **Meeting action** task type (own settings: evidence required, acknowledgement on)?
5. Who acknowledges meeting action completion: the Coordinator, the **Meeting Owner** (suggested, consistent with MOM approval), or the action owner's manager (the Task acknowledger decision is also still open)?
7. If the Owner returns the meeting points and the meeting time arrives, should the meeting be blocked, or allowed to start with the last approved points?
6. Provide the original Excel register file for the legacy import mapping.

**Next step after approval:** write the M0–M1 implementation specification (screens, actions, migrations, tests) and start development.
