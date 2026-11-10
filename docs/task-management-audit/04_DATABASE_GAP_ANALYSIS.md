# 04 · Database gap analysis

Audit only. **No migration was written or run.** Proposals below are additive and follow the existing conventions (BIGINT UNSIGNED ids, `created_at` / `created_by`, foreign keys to `users`, append-only event tables, migrations run on start).

## 1. Existing tables to reuse

| Table | Key columns | Reuse for |
|---|---|---|
| `users` | id, login_id, name, email, whatsapp_number, department_id, designation_id, reporting_manager_id, module_access, active | Employees, managers (reporting line), headcount |
| `departments` | id, code, name, hod_user_id, active | Department allocation, HOD, department reports |
| `designations` | id, code, name, is_approver | Seniority only (not a task role) |
| `groups`, `group_members` | — | Team-leader teams (if chosen) |
| `roles`, `user_roles` | SUPER_ADMIN, IT_ADMIN, USER, EXPORTER | Unchanged |
| `page_access_rules` | page_key, level, scope | New pages get keys |
| `tasks` | task_no UQ, type_version_id, title, description, priority ENUM(LOW, NORMAL, IMPORTANT, HIGH, URGENT), status ENUM(OPEN, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED), created_by, assignee_id, assigned_by, assigned_at, due_at, starts_on, form_data_json, related_request_id, completed_by/at, completion_note, cancelled_*, row_version, submission_key, parent_task_id, root_task_id, depth, deleted_at/by, recurrence_json, series_id, assign_group_id | Task master |
| `task_events` | task_id, actor_id, event_type, from_status, to_status, body, payload_json, created_at (append-only) | All history incl. new delegation/ack/checklist events |
| `task_comments`, `task_followers`, `task_dependencies`, `task_tags`, `work_tags` | — | As today |
| `record_files` | entity_type (TASK/INFO), entity_id, purpose (GENERAL/EVIDENCE), sha256 | Task files; extend entity_type for MEETING and DWR |
| `module_types`, `module_type_versions` | module, code, name / form_json, settings_json, status | Task types = categories; IDM task type |
| `projects`, `project_members`, `project_sections`, `task_projects`, `project_status_updates` | — | Project tasks |
| `holidays`, `department_holidays` | holiday_on, name / department_id | Working-day rules |
| `delegations` | user_id, delegate_id, starts_on, ends_on, reason, ended_at | Basis for leave cover |
| `notifications`, `notification_deliveries`, `notification_outbox`, `notification_rules`, `notification_rule_sends`, `task_item_reminders`, `work_digest_sends` | — | Notification history and dedupe |
| `audit_logs` | append-only triggers | Admin audit |
| `calendar_items`, `gcal_*` | personal items, Google links | Calendar sync |

## 2. Existing tables needing new columns

| Table | Proposed columns | Why | Index |
|---|---|---|---|
| `tasks` | `category` ENUM('ADHOC','PERIODIC','PROJECT','IDM','APPROVAL') or `category_id` | B6/B7 reporting (today derived) | (category, status) |
| `tasks` | `department_id` NULL FK departments | C9 department allocation; stable department reporting (today uses the person's current department) | (department_id, status, due_at) |
| `tasks` | `original_assignee_id` NULL FK users | C5 | — |
| `tasks` | `submitted_at`, `ack_due_at`, `acknowledged_at`, `acknowledged_by`, `ack_status` ENUM('PENDING','ACCEPTED','REJECTED') | F11–F14 (or keep in `task_acknowledgements` and add only `ack_due_at` for fast queries) | (ack_status, ack_due_at) |
| `tasks` | `due_at_at_completion` DATETIME NULL | I7/I8 exact on-time % | — |
| `tasks` | `revision_no` SMALLINT default 0 | F15 | — |
| `tasks` | `meeting_id` NULL FK | G8 action items | (meeting_id) |
| `tasks.status` ENUM | add `PENDING_REVIEW` (keep existing values) | F11 | — |
| `module_type_versions.settings_json` | `requiresAcknowledgement`, `ackWorkingDays` (3) | Per-type rule | JSON (no DDL) |
| `delegations` | `kind` ENUM('APPROVAL','LEAVE') or a separate leave table | E1 | — |
| `record_files.entity_type` | add 'MEETING', 'DWR' | Attachments | existing |

## 3. New tables required

| Proposed table | Purpose | Key columns | Relationships | Indexes | Retention |
|---|---|---|---|---|---|
| `task_assignments` (optional; `task_events` covers history) | Assignment history incl. original | task_id, assignee_id, assigned_by, reason, from_at, to_at | tasks, users | (task_id), (assignee_id) | Life of task |
| `task_delegations` | C3/C6/L4 | task_id, from_user_id, to_user_id, reason, status (REQUESTED/APPROVED/REJECTED/ENDED), requested_at, decided_by/at | tasks, users | (to_user_id, status) | Life of task |
| `task_acknowledgements` | F11–F14, L5 (one row per submission) | task_id, submitted_by/at, ack_due_at, decided_by/at, decision (ACCEPTED/REJECTED), remarks, escalated_at | tasks, users | (decision, ack_due_at) | Life of task |
| `task_checklist_items` | F2/F3/L6 | task_id, position, text, done, done_by/at | tasks | (task_id, position) | Life of task |
| `employee_leaves` (or extend `delegations`) | E1–E4, E8 | user_id, starts_on, ends_on, kind, cover_user_id, note, created_by | users | (user_id, starts_on, ends_on) | 3+ years |
| `meetings` | G1–G4, G10 | meeting_no UQ, title, kind (IDM), organiser_id, starts_at, ends_at, location/link, status, follow_up_of_id | users, self | (starts_at), (organiser_id) | Permanent |
| `meeting_participants` | G2 | meeting_id, user_id NULL, department_id NULL, role (REQUIRED/OPTIONAL), response | meetings, users, departments | (user_id), (department_id) | Permanent |
| `meeting_agenda_items` | G5 | meeting_id, position, title, owner_id, minutes_planned | meetings | (meeting_id) | Permanent |
| `meeting_minutes` / `meeting_decisions` | G6/G7 | meeting_id, agenda_item_id, kind (NOTE/DECISION), body, recorded_by/at | meetings | (meeting_id) | Permanent, append-only edits |
| (action items) | G8–G11 | Use `tasks` with `meeting_id` and category IDM (no separate table) | tasks | (meeting_id, status) | — |
| `daily_work_reports` | H1–H10 | user_id, report_on (date), status (DRAFT/SUBMITTED/REVIEWED), summary_json (completed/pending/overdue/new snapshot), remarks, submitted_at, reviewed_by/at, review_remarks | users | UQ(user_id, report_on); (report_on, status) | 3+ years |
| `daily_plans` | H6/D6 | user_id, plan_on, task_id, position | users, tasks | (user_id, plan_on) | 1 year |

## 4. Data quality notes
- On-time % must use the due date that applied at completion; today the current `due_at` is used (moving it after completion changes history). Add `due_at_at_completion` (or read it from `task_events`).
- Department figures move when a person changes department; `tasks.department_id` (stamped at creation) fixes this.
- `task_events` triggers are optional in v190 (`database/optional`); confirm they are installed in production for true append-only history.
- Optional performance indexes `database/optional/v1421_qa_indexes.sql` are not applied by default.
