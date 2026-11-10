# 01 · Application current state (ARS-CMS, Task Management view)

Audit date: 10 Nov 2026 · App version 1.50.1 · Repository `HarishDevs/ARS-Approval-System`, branch `main`.
Audit only: no application code, database or configuration was changed. Evidence is from reading the source and the migration SQL; items marked *runtime-verified* were also exercised by the automated test suites on 10 Nov 2026 (unit 1,037, integration 348, end-to-end 246, all passing on v1.50.1).

## 1. Platform

| Area | What the code shows | Evidence |
|---|---|---|
| Frontend | Next.js 15.5 (App Router), React 19.1, TypeScript 5.7, Tailwind 3.4 with ARS brand tokens (CSS variables, light/dark themes), lucide icons | `package.json`, `tailwind.config.ts`, `styles/globals.css` |
| Backend | One Next.js app. Server Actions (`app/**/actions.ts`) and route handlers (`app/api/**`); business logic in `server/**`; pure rules unit-tested | `app/`, `server/` |
| Database | MySQL 8 through `mysql2`, hand-written SQL in repositories (no ORM); 53 migrations, 114 `CREATE TABLE`s | `lib/db/client.ts`, `lib/db/transaction.ts`, `lib/db/repositories/*.repository.ts`, `database/migrations/` |
| Migrations | Run automatically on `npm start` (`node scripts/database/migrate.js && … && next start`) | `package.json` scripts |
| Authentication | Google sign-in (Firebase), or User ID / mobile / email + password + WhatsApp one-time code; HMAC-signed session cookie with a server session row | `server/auth/google-sign-in.ts`, `password-sign-in.ts`, `otp-flow.ts`, `lib/session/token.ts`, `server/auth/session.ts` |
| Authorization | Area roles (users / admin / superadmin), page access levels (Hidden / View / Full by everyone, department or person), per-person modules (APPROVAL, TASK, INFORMATION, AI), record-level rules in each service | `server/authorization/policy.ts`, `guards.ts`, `pages.ts`, `page-access.ts`, `server/modules/modules.ts` |
| Roles | `SUPER_ADMIN`, `IT_ADMIN`, `USER`, `EXPORTER` ("Can export"). HOD, manager and team are derived (`departments.hod_user_id`, `users.reporting_manager_id`), not roles | `database/seeds/001_roles.sql`, `types/auth.ts` |
| Files | Private disk storage (`UPLOAD_DIR`, default `storage/uploads`), allow-list + content sniffing, 10 MB each, random names | `server/attachments/service.ts`, `storage.ts`, `server/modules/files.ts` |
| Notifications | In-app inbox, email (Resend), WhatsApp (CEOITBox, template-based), web push; outbox with retry; per-person preferences and quiet hours; admin reminder/escalation rule engine | `server/notifications/**`, `server/push/service.ts`, `app/admin/reminders`, `app/admin/notifications` |
| Scheduled jobs | One entry point: cron calls `POST /api/jobs/run` every 5 minutes; 21+ automations registered | `app/api/jobs/run/route.ts`, `server/ops/automation.ts` |
| Integrations | Resend, CEOITBox, Firebase, Google Calendar (two-way records, ARS owns dates), Google Drive and S3 off-site backups, Salesforce (AI connector), AI providers (Claude, OpenAI, Grok, DeepSeek, Groq, Gemini, NVIDIA) | `server/integrations/**`, `server/calendar/**`, `server/ops/gdrive-backup.ts`, `offsite.ts`, `server/ai/**` |
| Deployment | Documented for GoDaddy Node.js hosting (cPanel) from GitHub `main`; a move to a Linux VPS with Plesk is planned (approval document prepared) | `docs/DEPLOYMENT.md` |
| Quality | Vitest unit + MySQL integration tests, Playwright end-to-end and QA suites; GitHub Actions runs all three on every push | `tests/**`, `.github/workflows` |

## 2. Routes verified (requested list)

| Route | Exists | File |
|---|---|---|
| /admin/workflows | Yes | `app/admin/workflows/(list)/page.tsx` |
| /admin/workflows/new | Yes | `app/admin/workflows/new/page.tsx` |
| /admin/workflows/[id] | Yes | `app/admin/workflows/[id]/page.tsx` |
| /admin/workflows/compare | **No**: per workflow | `app/admin/workflows/[id]/compare/page.tsx` |
| /admin/workflows/migrate | **No**: per workflow | `app/admin/workflows/[id]/migrate/page.tsx` |
| /admin/workflows/import | Yes | `app/admin/workflows/import/page.tsx` |
| /admin/custom-approval | Yes | `app/admin/custom-approval/page.tsx` |
| /superadmin/settings | Yes | `app/superadmin/settings/page.tsx` |
| /superadmin/ai | Yes | `app/superadmin/ai/page.tsx` |
| /superadmin/salesforce | Yes | `app/superadmin/salesforce/page.tsx` |

## 3. Task Management as it exists today

ARS-CMS **already has a Task Management module** (built from v1.9 to v1.50). Two layers share one `tasks` table:

1. **Typed tasks** (v1.9, D-143): IT defines task types (form fields, who may create, assignment scope, completion evidence, reminders) under Admin → Task types; `server/modules/tasks.ts` (`createTask`, `actOnTask`).
2. **Work layer** (v1.21+, Asana-style): My Tasks with sections, quick add, projects (list / board / calendar), subtasks, dependencies, tags, followers, comments, periodic (recurring) tasks, bulk edit, saved searches; `server/work/**`, `app/users/work/**`, `features/work/**`.

Also linked: approval **work steps** become tasks in the assignee's Task Management (`server/approvals/work-mirror.ts`), with the v1.50.0 Task priority and Task due date options.

| Area | Screens | Server |
|---|---|---|
| My Tasks, Home task section | `app/users/work/my-tasks`, `app/users/(home)` | `server/work/service.ts`, `rules.ts`, `grid.ts` |
| Task page | `app/users/tasks/[id]` | `server/modules/tasks.ts` (`loadTaskFor`, `actOnTask`) |
| Lists: assigned by me, team | `app/users/tasks/assigned`, `app/users/tasks/team` | `server/modules/task-lists.ts` |
| Projects | `app/users/work/projects/**` | `server/work/service.ts`, `service-more.ts` |
| Periodic tasks | `app/users/work/periodic` | `server/work/more-rules.ts`, `on-complete.ts` |
| Search, deleted tasks | `app/users/work/search`, `app/users/work/deleted` | `server/work/rules.ts` |
| Calendar | `app/users/calendar` | `server/calendar/**` |
| Admin: task types, holidays, reminders | `app/admin/task-types/**`, `app/admin/task-holidays`, `app/admin/calendar`, `app/admin/reminders` | `server/modules/config.ts`, `server/work/holiday-store.ts`, `server/notifications/rule-runner.ts` |
| Analytics and reports | `app/admin/analytics`, `app/users/analytics`, `app/admin/reports` | `lib/db/repositories/analytics-center.repository.ts`, `server/reports/module-reports.ts` |

## 4. Task-related tables (existing)

`tasks`, `task_events` (append-only history), `task_item_reminders`, `record_files` (TASK files, GENERAL / EVIDENCE), `module_types` + `module_type_versions` (task types), `projects`, `project_members`, `project_sections`, `task_projects`, `task_followers`, `task_comments`, `work_likes`, `task_dependencies`, `work_tags`, `task_tags`, `project_status_updates`, `project_events`, `work_favourites`, `work_recent_projects`, `my_task_sections`, `my_task_placements`, `work_saved_searches`, `project_fields`, `task_field_values`, `work_digest_sends`, `department_holidays`, `holidays`, `work_views`, `notification_rules`, `notification_rule_sends`. Full columns in `04_DATABASE_GAP_ANALYSIS.md`.

## 5. Not present anywhere in the code or schema

- IDM / meeting management (no meeting, agenda, minutes or action-item tables, routes or services).
- Daily Work Report (only a morning task digest notification and a weekly HOD email about **requests**).
- Employee leave (only Out of office, which covers **approvals**, not tasks).
- Manager acknowledgement of task completion (completion sets `COMPLETED` directly: `NEXT_STATUS.COMPLETE = "COMPLETED"` in `server/modules/task-rules.ts:65`).
- Task delegation (delegation exists for approvals only).
- Checklist items with a completion percentage (subtasks exist instead).

## 6. Limitations of this audit
- Source and schema review plus the automated suites; the production database contents were not inspected.
- Performance figures come from a local load test (`qa/PERFORMANCE_TEST_RESULTS.md`), not the production host.
- No secrets, keys or environment values are reproduced here.
