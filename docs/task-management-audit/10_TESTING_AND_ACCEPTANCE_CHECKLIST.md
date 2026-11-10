# 10 · Testing and acceptance checklist

## 1. Current baseline (10 Nov 2026, v1.50.1)
- Unit: 1,037 tests passing (Vitest).
- Integration (MySQL 8): 348 tests passing, including migrations and backup/restore drill.
- End-to-end (Playwright): 246 tests passing locally; GitHub CI green on all three jobs.
- Task/work coverage today: unit `tests/work/*` (8 files), `tests/modules/v190-rules.test.ts`, `module-access.test.ts`, `tests/workflows/v150-work-options.test.ts`; integration `v190`, `work-management`, `work-more`, `workspace`, `workload`, `ai-task-draft`, `v1501-task-without-module`, `notification-rules`, `v1120-analytics`; e2e `v130-work`, `v131-work-more`, `v139-draft-task`, `v160-workspace`, `v1500-work-links-pdf`, `v1120-analytics`.
- Not covered (features don't exist yet): acknowledgement, delegation, checklist, leave, IDM, DWR.

## 2. Functional tests to add per phase
- [ ] Create task with category, department, deliverables; duplicate submit creates one task
- [ ] Priority labels as decided, in every list, pill, filter and export
- [ ] Department queue: HOD sees and allocates; non-members cannot see
- [ ] Delegate, approve, reject, end delegation; history shows original assignee
- [ ] Reassign requires a reason in every path (task page, list, bulk)
- [ ] Bulk allocation is all-or-nothing
- [ ] Periodic task appears on schedule even if the previous one is still open; skips holidays when set
- [ ] Working-day arithmetic across weekends, organisation and department holidays
- [ ] Leave: task due during leave alerts manager; reassign for a period; history recorded; approval Out of office still works
- [ ] Submit for review → accept; submit → reject with remarks → revision 2 → resubmit → accept
- [ ] Acknowledgement deadline = 3 working days; reminders daily; escalation after deadline; no duplicate sends
- [ ] Checklist add/tick/reorder; % shown; completion rule (optional: all items ticked)
- [ ] IDM: create with two departments, agenda, minutes, decisions, action items to tasks, follow-up; meeting report and PDF
- [ ] DWR: generated per working day, not on holidays/leave; remarks, submit, review; history; Excel/PDF
- [ ] Dashboard department table: users, tasks, on-time %, delayed %, overdue % equal fixture-calculated values

## 3. Integration and regression
- [ ] All existing approval flows unchanged (approval-flow, session, v1495 navigation, custom approvals) – full e2e suite green
- [ ] Approval work steps still create tasks with priority and due date
- [ ] Notification outbox, retries, quiet hours, preferences unchanged
- [ ] Google Calendar sync still pushes due dates
- [ ] Backup/restore drill passes with new tables
- [ ] Migrations additive and re-runnable; rollback notes in each file

## 4. Security
- [ ] Every new page has a page key; Hidden/View-only rules respected; module rule respected
- [ ] Record-level checks on every action (cannot act on a task, meeting or DWR you can't see by changing an id)
- [ ] Acknowledge only by the defined acknowledger; employees cannot acknowledge their own work
- [ ] Exports respect visibility and "Can export"; audited
- [ ] Rate limits on bulk and export
- [ ] No secrets in logs or reports; security review before release

## 5. Non-functional
- [ ] Load test on the VPS: 100 concurrent users, p95 < 2 s for task lists and dashboards
- [ ] New indexes verified with EXPLAIN on production-size data
- [ ] Compact, Classic and phone layouts; light and dark; no horizontal overflow
- [ ] Accessibility checks (axe) on new screens

## 6. Acceptance (owner sign-off per phase)
- [ ] Demo on staging with real department data
- [ ] Release notes, User Guide, Help, tour and first-use checklist updated
- [ ] CI green; owner publishes
