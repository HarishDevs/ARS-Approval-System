# Application route inventory

Generated from the code by `scripts/qa/route-inventory.mjs` on 2026-11-01 (ARS-CMS v1.43.0).
Every protection check runs on the server; "guard" lists the checks the file itself calls (or its layout's).

## Summary

| Kind | Count |
|---|---|
| Pages | 133 |
| API routes | 48 |
| Server actions | 173 |

## Pages

### (public root) (1)

| Route | Guard | File |
|---|---|---|
| `/` | none (public) | app/page.tsx |

### admin (45)

| Route | Guard | File |
|---|---|---|
| `/admin` | requireArea("admin") | app/admin/(home)/page.tsx |
| `/admin/ai-analytics` | requireArea("admin") | app/admin/ai-analytics/page.tsx |
| `/admin/ai-rules` | requireArea("admin") | app/admin/ai-rules/page.tsx |
| `/admin/analytics` | requireArea("admin") | app/admin/analytics/page.tsx |
| `/admin/analytics/list` | requireArea("admin") | app/admin/analytics/list/page.tsx |
| `/admin/analytics/metrics` | requireArea("admin") | app/admin/analytics/metrics/page.tsx |
| `/admin/attention` | requireArea("admin") | app/admin/attention/page.tsx |
| `/admin/budgets` | requireArea("admin") | app/admin/budgets/page.tsx |
| `/admin/calendar` | requireArea("admin") | app/admin/calendar/page.tsx |
| `/admin/custom-approval` | requireArea("admin") | app/admin/custom-approval/page.tsx |
| `/admin/dashboards` | requireArea("admin") | app/admin/dashboards/page.tsx |
| `/admin/dashboards/approvers` | requireArea("admin") | app/admin/dashboards/approvers/page.tsx |
| `/admin/dashboards/departments` | requireArea("admin") | app/admin/dashboards/departments/page.tsx |
| `/admin/dashboards/raisers` | requireArea("admin") | app/admin/dashboards/raisers/page.tsx |
| `/admin/dashboards/utilisation` | requireArea("admin") | app/admin/dashboards/utilisation/page.tsx |
| `/admin/doa` | requireArea("admin") | app/admin/doa/page.tsx |
| `/admin/groups` | requireArea("admin") | app/admin/groups/page.tsx |
| `/admin/import` | requireArea("admin") | app/admin/import/page.tsx |
| `/admin/information-types` | requireArea("admin") | app/admin/information-types/page.tsx |
| `/admin/information-types/[id]` | requireArea("admin") | app/admin/information-types/[id]/page.tsx |
| `/admin/insights` | requireArea("admin") | app/admin/insights/page.tsx |
| `/admin/notifications` | requireArea("admin") | app/admin/notifications/page.tsx |
| `/admin/organisation` | requireArea("admin") | app/admin/organisation/page.tsx |
| `/admin/records` | layout: requireArea("admin") | app/admin/records/page.tsx |
| `/admin/records/information` | requireArea("admin") | app/admin/records/information/page.tsx |
| `/admin/records/requests` | requireArea("admin") | app/admin/records/requests/page.tsx |
| `/admin/records/tasks` | requireArea("admin") | app/admin/records/tasks/page.tsx |
| `/admin/reminders` | requireArea("admin") | app/admin/reminders/page.tsx |
| `/admin/reminders/[id]` | requireArea("admin"); notFound() on no access | app/admin/reminders/[id]/page.tsx |
| `/admin/reports` | requireArea("admin"); notFound() on no access; featureOn (feature switch) | app/admin/reports/page.tsx |
| `/admin/reports/[key]` | requireArea("admin"); notFound() on no access; featureOn (feature switch) | app/admin/reports/[key]/page.tsx |
| `/admin/task-holidays` | requireArea("admin") | app/admin/task-holidays/page.tsx |
| `/admin/task-types` | requireArea("admin") | app/admin/task-types/page.tsx |
| `/admin/task-types/[id]` | requireArea("admin") | app/admin/task-types/[id]/page.tsx |
| `/admin/users` | requireArea("admin") | app/admin/users/(list)/page.tsx |
| `/admin/users/[id]` | requireArea("admin"); notFound() on no access | app/admin/users/[id]/page.tsx |
| `/admin/users/new` | requireArea("admin") | app/admin/users/new/page.tsx |
| `/admin/workflows` | requireArea("admin") | app/admin/workflows/(list)/page.tsx |
| `/admin/workflows/[id]` | requireArea("admin"); notFound() on no access | app/admin/workflows/[id]/page.tsx |
| `/admin/workflows/[id]/compare` | requireArea("admin"); notFound() on no access | app/admin/workflows/[id]/compare/page.tsx |
| `/admin/workflows/[id]/migrate` | requireArea("admin"); notFound() on no access | app/admin/workflows/[id]/migrate/page.tsx |
| `/admin/workflows/import` | requireArea("admin") | app/admin/workflows/import/page.tsx |
| `/admin/workflows/new` | requireArea("admin") | app/admin/workflows/new/page.tsx |
| `/admin/workload` | requireArea("admin") | app/admin/workload/page.tsx |
| `/admin/workload/reassign` | requireArea("admin") | app/admin/workload/reassign/page.tsx |

### forgot-password (1)

| Route | Guard | File |
|---|---|---|
| `/forgot-password` | none (public) | app/(public)/forgot-password/page.tsx |

### login (1)

| Route | Guard | File |
|---|---|---|
| `/login` | none (public) | app/(public)/login/page.tsx |

### privacy (1)

| Route | Guard | File |
|---|---|---|
| `/privacy` | none (public) | app/(public)/privacy/page.tsx |

### security (1)

| Route | Guard | File |
|---|---|---|
| `/security/not-me` | none (public) | app/(public)/security/not-me/page.tsx |

### set-password (1)

| Route | Guard | File |
|---|---|---|
| `/set-password` | none (public) | app/(public)/set-password/page.tsx |

### signed-out (1)

| Route | Guard | File |
|---|---|---|
| `/signed-out` | none (public) | app/(public)/signed-out/page.tsx |

### superadmin (21)

| Route | Guard | File |
|---|---|---|
| `/superadmin` | requireArea("superadmin") | app/superadmin/(home)/page.tsx |
| `/superadmin/ai` | requireArea("superadmin") | app/superadmin/ai/page.tsx |
| `/superadmin/ai/data-sources` | requireArea("superadmin") | app/superadmin/ai/data-sources/page.tsx |
| `/superadmin/ai/history` | requireArea("superadmin") | app/superadmin/ai/history/page.tsx |
| `/superadmin/ai/reports` | requireArea("superadmin") | app/superadmin/ai/reports/page.tsx |
| `/superadmin/audit` | requireArea("superadmin") | app/superadmin/audit/page.tsx |
| `/superadmin/automation` | requireArea("superadmin") | app/superadmin/automation/page.tsx |
| `/superadmin/deliveries` | requireArea("superadmin") | app/superadmin/deliveries/page.tsx |
| `/superadmin/demo` | requireArea("superadmin") | app/superadmin/demo/page.tsx |
| `/superadmin/import` | requireArea("superadmin") | app/superadmin/import/page.tsx |
| `/superadmin/integrations` | requireArea("superadmin") | app/superadmin/integrations/page.tsx |
| `/superadmin/integrations/google-calendar` | requireArea("superadmin") | app/superadmin/integrations/google-calendar/page.tsx |
| `/superadmin/logins` | requireArea("superadmin") | app/superadmin/logins/page.tsx |
| `/superadmin/pages` | requireArea("superadmin") | app/superadmin/pages/page.tsx |
| `/superadmin/pages/[key]` | requireArea("superadmin"); notFound() on no access | app/superadmin/pages/[key]/page.tsx |
| `/superadmin/requests` | requireArea("superadmin") | app/superadmin/requests/page.tsx |
| `/superadmin/retention` | requireArea("superadmin") | app/superadmin/retention/page.tsx |
| `/superadmin/salesforce` | requireArea("superadmin") | app/superadmin/salesforce/page.tsx |
| `/superadmin/settings` | requireArea("superadmin") | app/superadmin/settings/page.tsx |
| `/superadmin/templates` | requireArea("superadmin") | app/superadmin/templates/(list)/page.tsx |
| `/superadmin/templates/[code]` | requireArea("superadmin"); notFound() on no access | app/superadmin/templates/[code]/page.tsx |

### terms (1)

| Route | Guard | File |
|---|---|---|
| `/terms` | none (public) | app/(public)/terms/page.tsx |

### try (1)

| Route | Guard | File |
|---|---|---|
| `/try` | none (public) | app/try/page.tsx |

### users (58)

| Route | Guard | File |
|---|---|---|
| `/users` | requireArea("users"); featureOn (feature switch); page access (hidden pages) | app/users/(home)/page.tsx |
| `/users/ai` | layout: requireArea("users") | app/users/ai/page.tsx |
| `/users/ai/assistant` | requireAiPage() | app/users/ai/assistant/page.tsx |
| `/users/ai/data-sources` | layout: requireArea("users") | app/users/ai/data-sources/page.tsx |
| `/users/ai/history` | layout: requireArea("users") | app/users/ai/history/page.tsx |
| `/users/ai/insights` | layout: requireArea("users") | app/users/ai/insights/page.tsx |
| `/users/ai/intelligence` | layout: requireArea("users") | app/users/ai/intelligence/page.tsx |
| `/users/ai/reports` | layout: requireArea("users") | app/users/ai/reports/page.tsx |
| `/users/analytics` | layout: requireArea("users") | app/users/analytics/page.tsx |
| `/users/analytics/list` | layout: requireArea("users") | app/users/analytics/list/page.tsx |
| `/users/analytics/metrics` | layout: requireArea("users") | app/users/analytics/metrics/page.tsx |
| `/users/approvals` | requireArea("users"); page access (hidden pages) | app/users/approvals/page.tsx |
| `/users/approved` | requireArea("users") | app/users/approved/page.tsx |
| `/users/approved-by-me` | requireArea("users") | app/users/approved-by-me/page.tsx |
| `/users/calendar` | requireArea("users") | app/users/calendar/page.tsx |
| `/users/calendar/items/[id]` | requireArea("users"); notFound() on no access | app/users/calendar/items/[id]/page.tsx |
| `/users/collaborating` | requireArea("users") | app/users/collaborating/page.tsx |
| `/users/custom` | requireArea("users"); loadRequestView (record check) | app/users/custom/page.tsx |
| `/users/delegation` | requireArea("users") | app/users/delegation/page.tsx |
| `/users/help` | requireArea("users") | app/users/help/page.tsx |
| `/users/inbox` | requireArea("users") | app/users/inbox/page.tsx |
| `/users/information` | layout: requireArea("users") | app/users/information/page.tsx |
| `/users/information/[id]` | requireArea("users"); notFound() on no access; featureOn (feature switch) | app/users/information/[id]/page.tsx |
| `/users/information/new` | requireArea("users"); notFound() on no access; featureOn (feature switch) | app/users/information/new/page.tsx |
| `/users/information/sent` | layout: requireArea("users") | app/users/information/sent/page.tsx |
| `/users/menu/[module]` | requireArea("users"); notFound() on no access | app/users/menu/[module]/page.tsx |
| `/users/more` | requireArea("users"); page access (hidden pages) | app/users/more/page.tsx |
| `/users/new` | requireArea("users") | app/users/new/(list)/page.tsx |
| `/users/new/[workflowId]` | requireArea("users"); notFound() on no access; featureOn (feature switch) | app/users/new/[workflowId]/page.tsx |
| `/users/notifications` | requireArea("users") | app/users/notifications/page.tsx |
| `/users/notifications/settings` | requireArea("users") | app/users/notifications/settings/page.tsx |
| `/users/people/[id]` | requireArea("users"); notFound() on no access | app/users/people/[id]/page.tsx |
| `/users/profile` | requireArea("users"); notFound() on no access | app/users/profile/page.tsx |
| `/users/profile/calendar` | requireArea("users") | app/users/profile/calendar/page.tsx |
| `/users/profile/devices` | requireArea("users") | app/users/profile/devices/page.tsx |
| `/users/queue` | requireArea("users") | app/users/queue/page.tsx |
| `/users/reports` | requireArea("users"); notFound() on no access | app/users/reports/page.tsx |
| `/users/reports/[key]` | requireArea("users"); notFound() on no access | app/users/reports/[key]/page.tsx |
| `/users/requests` | requireArea("users") | app/users/requests/(list)/page.tsx |
| `/users/requests/[id]` | requireArea("users"); notFound() on no access; loadRequestView (record check); featureOn (feature switch) | app/users/requests/[id]/page.tsx |
| `/users/requests/[id]/amend` | requireArea("users"); notFound() on no access | app/users/requests/[id]/amend/page.tsx |
| `/users/search` | requireArea("users") | app/users/search/page.tsx |
| `/users/security` | requireArea("users") | app/users/security/page.tsx |
| `/users/tasks` | layout: requireArea("users") | app/users/tasks/page.tsx |
| `/users/tasks/[id]` | requireArea("users"); notFound() on no access; featureOn (feature switch) | app/users/tasks/[id]/page.tsx |
| `/users/tasks/assigned` | layout: requireArea("users") | app/users/tasks/assigned/page.tsx |
| `/users/tasks/new` | requireArea("users"); notFound() on no access; featureOn (feature switch) | app/users/tasks/new/page.tsx |
| `/users/tasks/team` | layout: requireArea("users") | app/users/tasks/team/page.tsx |
| `/users/work` | workPage() (users + Tasks) | app/users/work/page.tsx |
| `/users/work/deleted` | workPage() (users + Tasks) | app/users/work/deleted/page.tsx |
| `/users/work/inbox` | workPage() (users + Tasks) | app/users/work/inbox/page.tsx |
| `/users/work/my-tasks` | workPage() (users + Tasks) | app/users/work/my-tasks/page.tsx |
| `/users/work/periodic` | workPage() (users + Tasks) | app/users/work/periodic/page.tsx |
| `/users/work/projects` | workPage() (users + Tasks) | app/users/work/projects/page.tsx |
| `/users/work/projects/[id]` | workPage() (users + Tasks); notFound() on no access | app/users/work/projects/[id]/page.tsx |
| `/users/work/projects/[id]/settings` | workPage() (users + Tasks); notFound() on no access | app/users/work/projects/[id]/settings/page.tsx |
| `/users/work/projects/new` | workPage() (users + Tasks) | app/users/work/projects/new/page.tsx |
| `/users/work/search` | workPage() (users + Tasks) | app/users/work/search/page.tsx |

## API routes

| Route | Methods | Auth checks found | File |
|---|---|---|---|
| `/api/admin/dashboards/[slug]` | GET | requireApiArea("admin", { page: "admin.dashboards" }) | app/api/admin/dashboards/[slug]/route.ts |
| `/api/admin/import/[kind]` | GET | requireApiArea("admin") | app/api/admin/import/[kind]/route.ts |
| `/api/admin/records/[kind]` | GET | requireApiArea("admin", { page: "admin.records" }) | app/api/admin/records/[kind]/route.ts |
| `/api/admin/workflows/[id]/export` | GET | requireApiArea("admin", { page: "admin.workflows" }) | app/api/admin/workflows/[id]/export/route.ts |
| `/api/ai/chat` | POST | requireApiArea("users", { change, page: "users.ai_assistant" }) | app/api/ai/chat/route.ts |
| `/api/ai/conversations` | GET | requireApiArea("users", { change, page: "users.ai_assistant" }) | app/api/ai/conversations/route.ts |
| `/api/ai/conversations/[id]` | GET, PATCH, DELETE | requireApiArea("users", { change, page: "users.ai_assistant" }) | app/api/ai/conversations/[id]/route.ts |
| `/api/analytics/export` | GET | **none found in file (review)** | app/api/analytics/export/route.ts |
| `/api/attachments/[id]` | GET | requireApiArea("users") | app/api/attachments/[id]/route.ts |
| `/api/auth/forgot/complete` | POST | **none found in file (review)** | app/api/auth/forgot/complete/route.ts |
| `/api/auth/forgot/start` | POST | **none found in file (review)** | app/api/auth/forgot/start/route.ts |
| `/api/auth/google` | POST | **none found in file (review)** | app/api/auth/google/route.ts |
| `/api/auth/keep-alive` | POST | **none found in file (review)** | app/api/auth/keep-alive/route.ts |
| `/api/auth/logout` | POST | **none found in file (review)** | app/api/auth/logout/route.ts |
| `/api/auth/not-me` | POST | **none found in file (review)** | app/api/auth/not-me/route.ts |
| `/api/auth/password/resend` | POST | **none found in file (review)** | app/api/auth/password/resend/route.ts |
| `/api/auth/password/start` | POST | **none found in file (review)** | app/api/auth/password/start/route.ts |
| `/api/auth/password/verify` | POST | **none found in file (review)** | app/api/auth/password/verify/route.ts |
| `/api/auth/set-password/complete` | POST | **none found in file (review)** | app/api/auth/set-password/complete/route.ts |
| `/api/auth/set-password/start` | POST | **none found in file (review)** | app/api/auth/set-password/start/route.ts |
| `/api/auth/status` | GET | **none found in file (review)** | app/api/auth/status/route.ts |
| `/api/auth/try/[token]` | GET | **none found in file (review)** | app/api/auth/try/[token]/route.ts |
| `/api/exports/[id]` | GET | requireApiArea("users") | app/api/exports/[id]/route.ts |
| `/api/files/[id]` | GET | requireApiArea("users") | app/api/files/[id]/route.ts |
| `/api/health` | GET | **none found in file (review)** | app/api/health/route.ts |
| `/api/health/deep` | GET | **none found in file (review)** | app/api/health/deep/route.ts |
| `/api/integrations/google-calendar/callback` | GET | requireApiArea("users", { change: false }) | app/api/integrations/google-calendar/callback/route.ts |
| `/api/integrations/google-calendar/connect` | GET | requireApiArea("users", { change: true, page: "users.profile" }) | app/api/integrations/google-calendar/connect/route.ts |
| `/api/integrations/salesforce/callback` | GET | requireApiArea("superadmin") | app/api/integrations/salesforce/callback/route.ts |
| `/api/integrations/salesforce/connect` | GET | requireApiArea("superadmin") | app/api/integrations/salesforce/connect/route.ts |
| `/api/jobs/run` | POST | JOB_RUNNER_SECRET; timingSafeEqual | app/api/jobs/run/route.ts |
| `/api/me/notifications` | GET, POST | requireApiArea("users", { change: false }) | app/api/me/notifications/route.ts |
| `/api/me/quick` | GET | requireApiArea("users") | app/api/me/quick/route.ts |
| `/api/me/sign-out-everywhere` | POST | requireApiArea("users", { change: true }) | app/api/me/sign-out-everywhere/route.ts |
| `/api/push/key` | GET | requireApiArea("users", { change: false }) | app/api/push/key/route.ts |
| `/api/push/resubscribe` | POST | **none found in file (review)** | app/api/push/resubscribe/route.ts |
| `/api/push/status` | POST | requireApiArea("users", { change: false }) | app/api/push/status/route.ts |
| `/api/push/subscribe` | POST | requireApiArea("users", { change: false }) | app/api/push/subscribe/route.ts |
| `/api/push/subscriptions` | GET | requireApiArea("users", { change: false }) | app/api/push/subscriptions/route.ts |
| `/api/push/subscriptions/[id]` | DELETE | requireApiArea("users", { change: false }) | app/api/push/subscriptions/[id]/route.ts |
| `/api/push/test` | POST | requireApiArea("users", { change: false }) | app/api/push/test/route.ts |
| `/api/reports/[key]` | GET | requireApiArea("users") | app/api/reports/[key]/route.ts |
| `/api/requests/[id]/progress` | GET | requireApiArea("users", { change: false }) | app/api/requests/[id]/progress/route.ts |
| `/api/requests/[id]/summary.pdf` | GET | loadRequestView; requireApiArea("users") | app/api/requests/[id]/summary.pdf/route.ts |
| `/api/superadmin/audit` | GET | requireApiArea("superadmin") | app/api/superadmin/audit/route.ts |
| `/api/users/[id]/photo` | GET | requireApiArea("users") | app/api/users/[id]/photo/route.ts |
| `/api/webhooks/ceoitbox` | POST | timingSafeEqual | app/api/webhooks/ceoitbox/route.ts |
| `/api/webhooks/google-calendar` | POST | **none found in file (review)** | app/api/webhooks/google-calendar/route.ts |

## Server actions (173)

| Action | Session check in body | File |
|---|---|---|
| saveAiRuleAction | yes | app/admin/ai-rules/actions.ts |
| recheckRequestAction | yes | app/admin/attention/actions.ts |
| resendRequestMessagesAction | yes | app/admin/attention/actions.ts |
| snoozeStuckAction | yes | app/admin/attention/actions.ts |
| saveBudgetAction | yes | app/admin/budgets/actions.ts |
| holidayAction | yes | app/admin/calendar/actions.ts |
| saveWorkingDaysAction | yes | app/admin/calendar/actions.ts |
| saveCustomApprovalAction | yes | app/admin/custom-approval/actions.ts |
| groupMemberAction | yes | app/admin/groups/actions.ts |
| saveGroupAction | yes | app/admin/groups/actions.ts |
| checkImportAction | yes | app/admin/import/actions.ts |
| runImportAction | yes | app/admin/import/actions.ts |
| createModuleTypeAction | yes | app/admin/module-types/actions.ts |
| moduleTypeCommandAction | yes | app/admin/module-types/actions.ts |
| saveModuleTypeDraftAction | yes | app/admin/module-types/actions.ts |
| previewBroadcastAction | yes | app/admin/notifications/actions.ts |
| sendBroadcastAction | yes | app/admin/notifications/actions.ts |
| saveDepartmentAction | yes | app/admin/organisation/actions.ts |
| saveDesignationAction | yes | app/admin/organisation/actions.ts |
| previewRuleAction | yes | app/admin/reminders/actions.ts |
| ruleCommandAction | yes | app/admin/reminders/actions.ts |
| saveRuleAction | yes | app/admin/reminders/actions.ts |
| departmentHolidayAction | yes | app/admin/task-holidays/actions.ts |
| holidayTasksAction | yes | app/admin/task-holidays/actions.ts |
| saveTaskExtrasAction | yes | app/admin/task-holidays/actions.ts |
| saveTaskHolidaySettingsAction | yes | app/admin/task-holidays/actions.ts |
| createUserAction | yes | app/admin/users/actions.ts |
| handoverAction | yes | app/admin/users/actions.ts |
| tryAsLinkAction | yes | app/admin/users/actions.ts |
| updateUserAction | yes | app/admin/users/actions.ts |
| userCommandAction | yes | app/admin/users/actions.ts |
| createWorkflowAction | yes | app/admin/workflows/actions.ts |
| deleteWorkflowAction | yes | app/admin/workflows/actions.ts |
| promoteCustomAction | yes | app/admin/workflows/actions.ts |
| publishAction | yes | app/admin/workflows/actions.ts |
| restoreVersionAction | yes | app/admin/workflows/actions.ts |
| runMigrationAction | yes | app/admin/workflows/actions.ts |
| saveDraftAction | yes | app/admin/workflows/actions.ts |
| simulateAction | yes | app/admin/workflows/actions.ts |
| updateDetailsAction | yes | app/admin/workflows/actions.ts |
| updateTypeSettingsAction | yes | app/admin/workflows/actions.ts |
| applyImportAction | yes | app/admin/workflows/import/actions.ts |
| previewImportAction | yes | app/admin/workflows/import/actions.ts |
| bulkReassignAction | yes | app/admin/workload/actions.ts |
| backupNowAction | yes | app/superadmin/actions.ts |
| disconnectSalesforceAction | yes | app/superadmin/ai/actions.ts |
| syncSalesforceAction | yes | app/superadmin/ai/actions.ts |
| testProviderAction | yes | app/superadmin/ai/actions.ts |
| testSalesforceAction | yes | app/superadmin/ai/actions.ts |
| resendOutboxAction | yes | app/superadmin/automation/actions.ts |
| runJobsNowAction | yes | app/superadmin/automation/actions.ts |
| retryNowAction | yes | app/superadmin/deliveries/actions.ts |
| loadDemoAction | yes | app/superadmin/demo/actions.ts |
| retireDemoAction | yes | app/superadmin/demo/actions.ts |
| tryAsAction | yes | app/superadmin/demo/actions.ts |
| calendarCommandAction | yes | app/superadmin/integrations/google-calendar/actions.ts |
| saveCalendarConfigAction | yes | app/superadmin/integrations/google-calendar/actions.ts |
| setPageRuleAction | yes | app/superadmin/pages/actions.ts |
| deleteRequestAction | yes | app/superadmin/requests/actions.ts |
| createHoldAction | yes | app/superadmin/retention/actions.ts |
| releaseHoldAction | yes | app/superadmin/retention/actions.ts |
| generatePushKeysAction | yes | app/superadmin/settings/actions.ts |
| saveSettingsAction | yes | app/superadmin/settings/actions.ts |
| testSendAction | yes | app/superadmin/settings/actions.ts |
| saveTemplateDraftAction | yes | app/superadmin/templates/actions.ts |
| submitTemplateAction | yes | app/superadmin/templates/actions.ts |
| syncTemplatesAction | yes | app/superadmin/templates/actions.ts |
| testTemplateAction | yes | app/superadmin/templates/actions.ts |
| addFilesAction | yes | app/users/actions.ts |
| answerInfoAction | yes | app/users/actions.ts |
| bulkApproveAction | yes | app/users/actions.ts |
| checkReadinessAction | yes | app/users/actions.ts |
| decideAction | yes | app/users/actions.ts |
| delegateTaskAction | yes | app/users/actions.ts |
| recallAction | yes | app/users/actions.ts |
| reopenAction | yes | app/users/actions.ts |
| resolveBlockedAction | yes | app/users/actions.ts |
| resubmitAction | yes | app/users/actions.ts |
| resumeAction | yes | app/users/actions.ts |
| submitAmendmentAction | yes | app/users/actions.ts |
| submitRequestAction | yes | app/users/actions.ts |
| withdrawAction | yes | app/users/actions.ts |
| askAction | yes | app/users/ai/actions.ts |
| decideProposalAction | yes | app/users/ai/actions.ts |
| draftTaskTextAction | yes | app/users/ai/actions.ts |
| connectionCommandAction | yes | app/users/calendar-actions.ts |
| deleteCalendarItemAction | yes | app/users/calendar-actions.ts |
| saveCalendarItemAction | yes | app/users/calendar-actions.ts |
| addCollaboratorsAction | yes | app/users/collab-actions.ts |
| answerConsultAction | yes | app/users/collab-actions.ts |
| commentAction | yes | app/users/collab-actions.ts |
| consultAction | yes | app/users/collab-actions.ts |
| createDelegationAction | yes | app/users/collab-actions.ts |
| inboxStateAction | yes | app/users/collab-actions.ts |
| linkAction | yes | app/users/collab-actions.ts |
| markAllReadAction | yes | app/users/collab-actions.ts |
| markReadAction | yes | app/users/collab-actions.ts |
| markUnreadAction | yes | app/users/collab-actions.ts |
| removeCollaboratorAction | yes | app/users/collab-actions.ts |
| stopDelegationAction | yes | app/users/collab-actions.ts |
| submitCustomAction | yes | app/users/collab-actions.ts |
| discardDraftAction | yes | app/users/draft-actions.ts |
| saveDraftAction | yes | app/users/draft-actions.ts |
| dismissOnboardingAction | yes | app/users/help-actions.ts |
| finishTourAction | yes | app/users/help-actions.ts |
| informationAction | yes | app/users/information/actions.ts |
| saveInformationAction | yes | app/users/information/actions.ts |
| saveListColumnsAction | yes | app/users/list-actions.ts |
| savePreferencesAction | yes | app/users/preferences-actions.ts |
| aboutMeAction | yes | app/users/profile-actions.ts |
| removePhotoAction | yes | app/users/profile-actions.ts |
| uploadPhotoAction | yes | app/users/profile-actions.ts |
| dismissInstallInviteAction | yes | app/users/pwa-actions.ts |
| createAlertAction | yes | app/users/report-actions.ts |
| createScheduleAction | yes | app/users/report-actions.ts |
| defaultViewAction | yes | app/users/report-actions.ts |
| deleteViewAction | yes | app/users/report-actions.ts |
| requestExportAction | yes | app/users/report-actions.ts |
| saveViewAction | yes | app/users/report-actions.ts |
| shareViewAction | yes | app/users/report-actions.ts |
| toggleAlertAction | yes | app/users/report-actions.ts |
| toggleScheduleAction | yes | app/users/report-actions.ts |
| updateScheduleAction | yes | app/users/report-actions.ts |
| manageViewAction | yes | app/users/search-actions.ts |
| restoreViewAction | yes | app/users/search-actions.ts |
| saveViewAction | yes | app/users/search-actions.ts |
| createTaskAction | yes | app/users/tasks/actions.ts |
| taskAction | yes | app/users/tasks/actions.ts |
| deleteTemplateAction | yes | app/users/template-actions.ts |
| saveTemplateFromRequestAction | yes | app/users/template-actions.ts |
| saveThemeAction | yes | app/users/theme-actions.ts |
| saveTextSizeAction | yes | app/users/view-actions.ts |
| saveWorkspaceViewAction | yes | app/users/view-actions.ts |
| addFieldAction | yes | app/users/work/actions.ts |
| addSectionAction | yes | app/users/work/actions.ts |
| bulkAction | yes | app/users/work/actions.ts |
| commentAction | yes | app/users/work/actions.ts |
| commentChangeAction | yes | app/users/work/actions.ts |
| completeAction | yes | app/users/work/actions.ts |
| createProjectAction | yes | app/users/work/actions.ts |
| deleteTaskAction | yes | app/users/work/actions.ts |
| deleteViewAction | yes | app/users/work/actions.ts |
| dependencyAction | yes | app/users/work/actions.ts |
| digestChoiceAction | yes | app/users/work/actions.ts |
| fieldValueAction | yes | app/users/work/actions.ts |
| followAction | yes | app/users/work/actions.ts |
| fromTemplateAction | yes | app/users/work/actions.ts |
| likeAction | yes | app/users/work/actions.ts |
| memberAction | yes | app/users/work/actions.ts |
| moveTaskAction | yes | app/users/work/actions.ts |
| myPlaceAction | yes | app/users/work/actions.ts |
| mySectionAction | yes | app/users/work/actions.ts |
| parentAction | yes | app/users/work/actions.ts |
| permissionsAction | yes | app/users/work/actions.ts |
| privacyAction | yes | app/users/work/actions.ts |
| projectCommand | yes | app/users/work/actions.ts |
| quickAddAction | yes | app/users/work/actions.ts |
| quickAddManyAction | yes | app/users/work/actions.ts |
| recurrenceAction | yes | app/users/work/actions.ts |
| removeFieldAction | yes | app/users/work/actions.ts |
| removeStatusAction | yes | app/users/work/actions.ts |
| savedSearchCommand | yes | app/users/work/actions.ts |
| saveSearchAction | yes | app/users/work/actions.ts |
| saveTemplateAction | yes | app/users/work/actions.ts |
| saveViewAction | yes | app/users/work/actions.ts |
| sectionAction | yes | app/users/work/actions.ts |
| statusAction | yes | app/users/work/actions.ts |
| subtaskOrderAction | yes | app/users/work/actions.ts |
| tagAction | yes | app/users/work/actions.ts |
| taskFieldsAction | yes | app/users/work/actions.ts |
| taskProjectAction | yes | app/users/work/actions.ts |
| updateProjectAction | yes | app/users/work/actions.ts |
| updateViewAction | yes | app/users/work/actions.ts |
