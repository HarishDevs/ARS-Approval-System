# 13 — Approval, Task and Information modules: implementation register (v1.9.0)

This register records the owner brief "Configurable Approval, Task & Information Management System" (16 Oct 2026). It covers:
1. the audit of what already existed (§1);
2. what was built (§2–§6);
3. how the work was verified (§7);
4. known limitations (§8);
5. the next steps (§9).

**Status values:**
- **Tested — Passed:** automated tests ran and passed on 16 Oct 2026 (local; see §7).
- **Implemented — Not Tested:** built, but no automated test covers it.
- **Not Applicable:** with the reason.
- **Not Started:** with the reason.

## 1. Initial inventory (from the code, before building)

| Area | Existing implementation (v1.8.0) | Missing or incomplete | Change made in v1.9.0 |
|---|---|---|---|
| Approval Management | The graph engine (`server/engine`). Approval types with versioned forms and the builder (`/admin/workflows`), custom approvals with IT set-up (`/admin/custom-approval`), DoA, delegation, SLA and escalation, every list and filter. Approving moves on to the next valid step through the graph (`engine.decide`). | Who may raise a type. Resubmitting with changed values kept skipped levels skipped (audit AUD-02). One person could vote twice on a step (AUD-05). | Raiser scope per type. Re-route on resubmit. One vote per step. No second engine. |
| Task Management | Only the engine's **work steps** inside an approval (`APPROVAL` nodes with `mode: WORK`, event `TASK_ASSIGNED`). There were no independent tasks. | The whole module. | New independent `tasks` with its own lifecycle, pages, configuration, reminders and reports. Work steps stay part of approvals. |
| Information Management | Only **FYI steps** inside an approval (`NOTIFY` nodes, event `REQUEST_FYI`). There were no independent information records. | The whole module. | New `info_items` with recipients (read and acknowledgement kept apart), pages, configuration, reminders and reports. |
| Admin configuration | Approval types (versioned form + graph), custom approval set-up, feature switches, page access (Super Admin). | Task and Information configuration. Some field types (currency, date and time, multi-select, checkbox, radio, URL). Per-field "show in list / searchable / editable". | `module_types` + `module_type_versions` (draft, check, preview, publish, retire, reactivate, versions, history). The same field builder, extended. |
| Notifications | In-app inbox with email and WhatsApp. The bell linked straight to the full page. No category. | Dropdown, categories, category views, record link. | `notifications.category`, `entity_type`, `entity_id`; bell dropdown (latest 10); views on the page. |
| Sidebar and navigation | A flat list. The sidebar scrolled with the page. | Module grouping; independent scrolling. | Section headings; a sticky sidebar that scrolls only when its entries don't fit. Design otherwise unchanged. |

## 2. Architecture and database changes

**Migration:** `database/migrations/202610160900_v190.sql`. It is additive only, so v1.8.0 code runs on it and rollback means republishing v1.8.0.

**New tables:**

| Table | Purpose |
|---|---|
| `module_types`, `module_type_versions` | Type configuration; one published version per type, enforced by a unique generated column |
| `tasks`, `task_events`, `task_item_reminders` | Tasks. Events are append-only, enforced by DB triggers; the reminder table holds the claims |
| `info_items`, `info_targets`, `info_recipients`, `info_events` | Information. Events are append-only; recipients are fixed at publishing |
| `record_files` | Files on tasks and information |

**Changed table:** `notifications` gains `category`, `entity_type`, `entity_id`, and the index `(user_id, id)`.

**Integrity:**
- Every change runs in a transaction with a row lock plus a `row_version` check: a stale page is refused.
- Creating a task is idempotent: a `(created_by, submission_key)` unique key.
- Messages go through the existing transactional outbox and are sent after the commit.
- New dates are UTC instants (`UTC_TIMESTAMP()`, JS Dates), so they don't depend on the database time zone (AUD-04).

**Code locations:**

| Area | Files |
|---|---|
| Pure, unit-tested rules | `server/modules/settings.ts`, `task-rules.ts`, `info-rules.ts`, `task-lists.ts`, `info-lists.ts`, `server/notifications/categories.ts` |
| Services | `server/modules/config.ts`, `tasks.ts`, `information.ts`, `files.ts`, `upload.ts`, `messages.ts`, `jobs.ts` |
| Repositories | `lib/db/repositories/module-types.repository.ts`, `tasks.repository.ts`, `info.repository.ts` |

## 3. Files created or modified

**Created:**

| Layer | Files |
|---|---|
| Migration | `database/migrations/202610160900_v190.sql` |
| Server | `server/modules/*` (10 files), `server/notifications/categories.ts`, `server/approvals/raisers.ts`, `server/reports/module-reports.ts` |
| Repositories | `module-types.repository.ts`, `tasks.repository.ts`, `info.repository.ts` |
| Admin | `app/admin/module-types/actions.ts`, `app/admin/task-types/{page,[id]/page}.tsx`, `app/admin/information-types/{page,[id]/page}.tsx`, `features/admin/ModuleTypeEditor.tsx`, `features/admin/ModuleTypeScreens.tsx` |
| Tasks | `app/users/tasks/{page,assigned/page,team/page,new/page,[id]/page,actions}.tsx\|ts` |
| Information | `app/users/information/{page,sent/page,new/page,[id]/page,actions}.tsx\|ts` |
| UI parts | `features/modules/{TaskForms,TaskListScreen,InfoForms,InfoListScreen,RecordParts}.tsx` |
| API | `app/api/files/[id]/route.ts`, `app/api/me/notifications/route.ts` |
| Shell and forms | `features/shell/NotificationBell.tsx`, `features/requests/MultiChoiceInput.tsx` |
| Tests | `tests/modules/v190-rules.test.ts`, `tests/integration/v190.int.test.ts`, `tests/e2e/v190.spec.ts` |

**Modified:**

| Area | Files |
|---|---|
| Forms | `server/forms/fields.ts`, `server/forms/dynamic.ts`, `features/admin/FormFieldsEditor.tsx`, `features/requests/DynamicFields.tsx` |
| Notifications | `lib/db/repositories/notifications.repository.ts`, `lib/db/repositories/collab.repository.ts`, `server/notifications/{notify,preferences}.ts`, `features/shell/NotificationList.tsx`, `app/users/notifications/page.tsx` |
| Approvals | `server/approvals/service.ts` (outbox, raiser scope, re-route), `server/engine/{engine,conditions,types}.ts`, `server/workflows/{type-settings,builder}.ts`, `app/admin/workflows/actions.ts`, `features/admin/{WorkflowPanels,WorkflowBuilder}.tsx`, `app/admin/workflows/[id]/page.tsx`, `app/users/new/(list)/page.tsx`, `app/users/new/[workflowId]/page.tsx`, `lib/db/repositories/approvals.repository.ts`, `server/approvals/{autofill,follow-up}.ts` |
| Shell, navigation, access, settings | `features/shell/{AppShell,SideNav,nav-icons}.tsx`, `app/users/layout.tsx`, `app/admin/layout.tsx`, `app/admin/(home)/page.tsx`, `server/authorization/pages.ts`, `server/settings/{features,definitions}.ts` |
| Ops and reports | `server/ops/automation.ts`, `server/reports/catalogue.ts`, `lib/db/repositories/audit.repository.ts` |
| Tests | `tests/e2e/v160-ui.spec.ts` (axe now covers the new pages) |

## 4. Security and audit controls

- **Server-side checks on every page, action and API:**
  1. area guard (`requireArea` / `requireApiArea`);
  2. page access (new page keys `users.tasks*`, `users.information*`, `admin.task_types`, `admin.information_types`);
  3. module switch (`features.tasks`, `features.information`);
  4. record rule (`canSeeTask`, `canSeeInfo`);
  5. lifecycle rule (`allowedTaskActions`, `allowedInfoActions`), re-checked inside the locked transaction.
- **Record access:**
  - A task: its creator, assigner and assignee, the assignee's manager (read only) and IT.
  - Information: the sender, IT, and (once published) its recipients. A draft is the sender's alone.
  - Anyone else gets a plain 404, including for file downloads (`/api/files/[id]`); denials are audited.
- **Configuration:** IT Admin and Super Admin only. Settings are validated with zod plus `checkTypeDraft`. A published version is never changed in place, and records keep their version. Every change is audited with before and after values.
- **Audit:** `TASK_*`, `INFO_*` and `MODULE_TYPE_*` audit rows; append-only task and information histories.
- **Notifications:** the bell API reads and marks only the signed-in person's rows. Links resolve only to `/users/` paths (`appPath`). The outbox no longer marks a message sent when nothing was recorded (AUD-08).
- **Data:** no administrator-supplied code is executed. Form rules and formulas use the existing parsers (no eval). URL fields accept only http and https. Uploads use the existing allow-list and type sniffing.

## 5. Requirement register

| Requirement ID | Module | Requirement | Existing Status | Implementation Status | Evidence | Test Result |
|---|---|---|---|---|---|---|
| CFG-001 | Admin | Approval configuration (types, forms, workflows, custom set-up) | Existed | Extended: raiser scope (who may raise) | `server/workflows/type-settings.ts` `raisers`; `features/admin/WorkflowPanels.tsx` | Tested — Passed (int `v190` "who may raise") |
| CFG-002 | Admin | Task configuration (types, versioned form, rules, publish, retire) | Missing | Implemented | `server/modules/config.ts`, `/admin/task-types` | Tested — Passed (int `v190` types; e2e `v190` "IT sets up a task type") |
| CFG-003 | Admin | Information configuration | Missing | Implemented | same, `/admin/information-types` | Tested — Passed (int `v190`) |
| CFG-004 | Admin | Field types: currency, date and time, multi-select, checkbox, radio, URL; list / search / edit flags | Partly (text, number, date, dropdown, person, department) | Implemented (shared by all three modules) | `server/forms/fields.ts`, `FormFieldsEditor.tsx`, `DynamicFields.tsx` | Tested — Passed (unit "new field types"; e2e multi-select) |
| CFG-005 | Admin | Draft, preview, validation, publish, version history, rollback (reactivate / new draft from live) | Missing for tasks and information | Implemented | `ModuleTypeScreens.tsx` | Tested — Passed |
| CFG-006 | Admin | Module on/off; who may create (everyone / departments / people) | Missing | Implemented (`features.tasks`, `features.information`; `access` in settings) | `server/settings/features.ts`, `mayCreate` | Tested — Passed (unit `mayCreate`); switches: Implemented — Not Tested |
| CFG-007 | Admin | Configuration audit history | Partly (audit log) | Implemented (per-type history on its page) | `listAuditForEntity` | Tested — Passed (int audit rows) |
| APR-001 | Approval | Routing follows the active workflow graph (sequential, parallel, conditional, ALL/ANY/ANY-N, delegation, DoA) | Existed | Unchanged; covered by existing tests | `server/engine/engine.ts` | Tested — Passed (existing engine and approval suites) |
| APR-002 | Approval | Approve and continue to the next valid step, comment optional; reject / changes need a reason | Existed (`decide` APPROVE) | Unchanged (no new action needed) | `engine.ts` `decide` | Tested — Passed (existing) |
| APR-003 | Approval | No mandatory level skipped: changed values on resubmit re-route | Broken (AUD-02) | Fixed: restart from the beginning when the route changes | `routeChanged`, `resubmitRequest` | Tested — Passed (unit + int `v190`) |
| APR-004 | Approval | One person can't satisfy a multi-approver step alone | Broken (AUD-05) | Fixed | `engine.decide` `ALREADY_DECIDED` | Tested — Passed (unit) |
| APR-005 | Approval | Who may create each approval type | Missing | Implemented (list filter + server refusal) | `server/approvals/raisers.ts` | Tested — Passed (int) |
| APR-006 | Approval | Notifications not lost or duplicated on retry | Partly (AUD-08) | Fixed: outbox honours `recorded` | `deliverOutbox` | Implemented — Not Tested (no failure-injection test) |
| TSK-001 | Task | Independent task records and lifecycle | Missing | Implemented | `server/modules/tasks.ts`, `task-rules.ts` | Tested — Passed |
| TSK-002 | Task | Pages: My tasks, Assigned by me, Team tasks, New task, Task page with history | Missing | Implemented | `app/users/tasks/*` | Tested — Passed (e2e) |
| TSK-003 | Task | Assignment scope (anyone, same department, team, groups, people); self and IT always | Missing | Implemented | `mayAssignTo` | Tested — Passed (unit, int) |
| TSK-004 | Task | Start, block, unblock, complete (evidence), reopen, cancel, reassign, edit (editable fields), comment, files | Missing | Implemented | `actOnTask` | Tested — Passed (unit, int, e2e); block, cancel and reassign at unit level |
| TSK-005 | Task | Completion records who and when; doesn't approve the related request | Missing | Implemented (separate record; `related_request_id` link only) | `tasks` columns | Tested — Passed (int) |
| TSK-006 | Task | Overdue and due-soon reminders | Missing | Implemented (job step `modules`) | `server/modules/jobs.ts` | Tested — Passed (int) |
| TSK-007 | Task | Search, filters, sort, paging, listed fields | Missing | Implemented | `task-lists.ts`, `TaskListScreen.tsx` | Tested — Passed (unit SQL); UI: Implemented — Not Tested |
| INF-001 | Information | Recipients by person, department, group, everyone; fixed at publishing; sender excluded | Missing | Implemented | `resolveRecipients` | Tested — Passed (unit, int) |
| INF-002 | Information | Draft, publish, withdraw, archive, expiry (derived), edit allowed fields | Missing | Implemented | `information.ts` | Tested — Passed (int: draft, publish, withdraw); archive and edit: Implemented — Not Tested |
| INF-003 | Information | Read and acknowledgement tracked separately; reading doesn't approve or complete anything | Missing | Implemented | `markInfoRead`, `acknowledge` | Tested — Passed (int, e2e) |
| INF-004 | Information | Inbox, Sent by me, details with recipient read / ack table | Missing | Implemented | `app/users/information/*` | Tested — Passed (e2e) |
| INF-005 | Information | Acknowledgement reminders | Missing | Implemented | `runModuleReminders` | Tested — Passed (int) |
| NTF-001 | Notifications | Bell dropdown, latest 10, newest first, type badge, unread counts, Read more | Missing | Implemented | `NotificationBell.tsx`, `/api/me/notifications` | Tested — Passed (e2e) |
| NTF-002 | Notifications | Approval / Task / Information views on the page; Read more keeps the filter and marks nothing | Missing | Implemented | `app/users/notifications/page.tsx` | Tested — Passed (e2e) |
| NTF-003 | Notifications | Notifications linked to their records (category, entity) | Missing | Implemented (older rows: category worked out from the event type) | `categories.ts`, migration | Tested — Passed (unit, int) |
| NTF-004 | Notifications | Only the person's own notifications | Existed | Kept (user id from the session) | `/api/me/notifications` | Tested — Passed (e2e uses the session) |
| NAV-001 | Navigation | Modules in the sidebar (grouped), design kept | Partly | Implemented | `SideNav.tsx`, layouts | Tested — Passed (e2e) |
| NAV-002 | Navigation | Sidebar stays put; scrolls only when its entries overflow; page scrolls independently | Missing | Implemented (CSS: sticky, `h-dvh`, `min-h-0`, `overflow-y-auto`) | `AppShell.tsx` | Tested — Passed (e2e at 1600 px and 520 px heights) |
| SEC-001 | Security | Server-side checks on every page, action and API; record-level access; audit | Existed for approvals | Implemented for the new modules | §4 | Tested — Passed (int strangers refused; e2e 404) |
| RPT-001 | Reporting | Task and information reports | Missing | Implemented (Task register, Task workload, Information register, Outstanding acknowledgements; IT only) | `server/reports/module-reports.ts` | Tested — Passed (int `v190` reports) |
| SRC-001 | Search | Cross-module search | Not built | Not Started: each module has its own list search; a combined search is a later step | — | — |

## 6. What was deliberately not done

| Item | Reason |
|---|---|
| A second approval engine; changes to how approvals route | The brief forbids the first; existing behaviour was kept |
| Fully custom task statuses | Statuses are a fixed, validated set with switches (Blocked, reopen, reassign, who may cancel). This keeps reports and reminders reliable |
| Dynamic information audiences | Recipients are fixed at publishing (D-145): an auditable record of who was targeted |
| Comments on information | Not built (the brief says "if supported"). Tasks have comments |
| WhatsApp templates for the new events | They need templates approved in CEOITBox. Until the owner adds them (Super Admin → Templates), these events go in-app and by email |

## 7. Tests executed (16 Oct 2026, local)

| Suite | Result |
|---|---|
| Lint / typecheck | Pass: 0 errors (1 old warning in `app/admin/reports/[key]/page.tsx`) |
| Unit | **451 / 451 passed**, of which 18 are new (`tests/modules/v190-rules.test.ts`) |
| Integration (MySQL 8, fresh database from the migrations) | **202 / 202 passed**, of which 14 are new (`tests/integration/v190.int.test.ts`) |
| E2E (production build) | **97 / 97 passed**, of which 5 are new (`tests/e2e/v190.spec.ts`); axe also scans the 6 new pages |
| QA E2E / origin lock | **27 / 27** / **1 / 1 passed** |

## 8. Known limitations

- **Reminders:** each run reads at most 500 open tasks due within 7 days and 1,000 pending acknowledgements. That is enough for the current size; raise the limits if volume grows.
- **Large audiences:** a publish to more than 25 people sends the first 25 at once; the job runner (every 5 minutes) sends the rest.
- **Task visibility:** a previous assignee loses access after a reassignment (as with approvals, R-07).
- **Database time zone:** older parts of the app still depend on the database time zone (AUD-04). The new modules use UTC throughout.
- **Readiness on resubmit:** resubmitting an approval doesn't re-run the readiness checks (AUD-11). Still open.

## 9. Recommended next steps

1. **Publish:**
   - take a backup first; the migration is additive;
   - then, in Admin, create the first task and information types and publish them;
   - in Super Admin → Templates, add WhatsApp templates for `WORK_TASK_ASSIGNED` and `INFO_PUBLISHED` if wanted.
2. **Remaining Phase A audit items:**
   - AUD-01: the CSV import contact rule;
   - AUD-03: the seed re-grant;
   - AUD-04: time zone;
   - AUD-11: readiness on resubmit;
   - AUD-14: page access by action.
3. **Tests:** a test for the module switches; failure injection for the outbox (APR-006).
