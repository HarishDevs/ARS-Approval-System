# Bug fix history (v1.42.1 → v1.43.0 QA pass)

In the order they were fixed. Details, steps to reproduce and root causes are in
`BUG_REGISTER.md`; test results in `REGRESSION_TEST_RESULTS.md`.

| # | IDs | Change | Main files |
|---|---|---|---|
| 1 | QA-OWN-04, 05, 06, 07 | Classic view: Create task as a centred Tally window; Label : value rows wrap; Analytics page bar on phones; logo on one line | `styles/globals.css`, `features/work/TaskCreator.tsx`, `features/analytics/FitPages.tsx`, `features/ui/Brand.tsx` |
| 2 | QA-OWN-08 | 2 px sideways scroll at 320 px from a chart's screen-reader table | `features/home/HomeClient.tsx` |
| 3 | QA-OWN-01, 02, 03 | FYI recipients can open the request; work steps become tasks in Task Management; kind labels and wording | `server/approvals/work-mirror.ts`, `server/modules/tasks.ts`, `features/admin/WorkflowBuilder.tsx`, `features/requests/CustomApprovalForm.tsx` |
| 4 | QA-WF-01 | Parallel any-one / any-N levels shown as done (a step closed as not required maps to Skipped, not Cancelled) on the road and the level map | `server/approvals/step-map.ts` |
| 5 | QA-WF-02, 06, 07, 08, 09 | Work-step task sync after `afterChange`; after Recheck's orphan update; `continue` on a missing type; no false "cancelled by"; backfill job | `server/approvals/work-mirror.ts`, `server/approvals/service.ts`, `server/ops/repair.ts`, `server/ops/automation.ts` |
| 6 | QA-WF-03, QA-SEC-05 | Work-step tasks can't be moved under a task, added to a project, repeated or deleted on their own | `server/work/service.ts`, `server/work/service-more.ts`, `server/work/on-complete.ts` |
| 7 | QA-WF-04 | Monthly repeats keep their day (anchor) and planned day | `server/work/more-rules.ts`, `server/work/on-complete.ts` |
| 8 | QA-WF-05 | Evidence files and dependent tasks when a work-step task is ticked | `server/modules/tasks.ts` |
| 9 | QA-SEC-01 | One confidential rule for page, download and timeline | `server/approvals/confidential.ts`, `server/attachments/service.ts`, `server/approvals/view.ts` |
| 10 | QA-SEC-02 | Try as: integration GETs blocked; no read receipt | `middleware.ts`, `app/users/information/[id]/page.tsx` |
| 11 | QA-SEC-03 | No daily session for privileged accounts | `server/auth/complete-sign-in.ts` |
| 12 | QA-SEC-04, QA-DB-07 | FYI read-only access; FYI in search and lists | `lib/db/repositories/approvals.repository.ts`, `lib/db/repositories/visibility.ts` |
| 13 | QA-DB-01, 05, 06 | Pool size, connect timeout and queue limit; fewer Home queries; activity query by index; counts in SQL | `lib/db/client.ts`, `config/environment.ts`, `features/work/TaskHome.tsx`, `lib/db/repositories/overview.repository.ts` |
| 14 | QA-DB-04 | Share lock on the request before the task number | `server/modules/tasks.ts` |
| 15 | QA-DB-08 | Two indexes, as an optional script (owner approves) | `database/optional/v1421_qa_indexes.sql` |
| 16 | QA-DB-02 (diagnostic only) | Health shows the database clock offset | `server/ops/health.ts` |
| 17 | QA-MOB-01 to 04 | Mobile layout: `mob-` classes, decision bar offset, Pico Bot position, chip scrollbars | `styles/globals.css`, `features/mobile/*`, `features/requests/ActionPanel.tsx` |
| 18 | QA-TST-01, 02 | Test fixes: one Next press in the v142 flow; health checks public in QA-API-01 | `tests/e2e/v142.spec.ts`, `tests/qa-e2e/api-authz.spec.ts` |
| 19 | QA-JRN-01, 02 | Journey: the scene player depends on its queue only; submit writes events before syncing tasks | `features/journey/ARSApprovalJourney.tsx`, `server/approvals/service.ts` |
| 20 | QA-A11Y-03, QA-TST-03 | Journey pill contrast (#15803d, #b91c1c); RA-01 rewritten for the phone tabs | `features/journey/ARSApprovalJourney.tsx`, `tests/e2e/v160-ui.spec.ts` |

Open: **QA-DB-02** (owner checks the live clock offset at `/api/health/deep`; if not 0,
the pool must set the session time zone, a separate change) and **QA-DB-09**
(analytics day filters; deferred, works at today's volume).
