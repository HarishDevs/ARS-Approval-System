# ARS Approval Platform — Unified Claude Code Master Implementation Prompt
## Comprehensive Feature Audit, Build Plan, Analytics, Governance, Reliability, Recovery and Acceptance Register

> **Purpose:** This is the single consolidated prompt for auditing, improving, testing and documenting the existing ARS Approval Platform. Use it as the controlling implementation specification together with `APPLICATION_CURRENT_STATE_AUDIT.md` and the actual repository.

---

# 1. Role and Overall Objective

Act as the senior application architect, full-stack engineer, workflow-engine specialist, security reviewer, QA engineer and implementation owner for the **existing ARS Approval Platform**.

Audit the current application and repository first. Then preserve working functionality, fix verified in-scope defects, and implement missing or incomplete requirements described in this prompt. Deliver a functioning, tested and auditable extension—not mockups, placeholders, disconnected pages or hard-coded demonstrations.

The work must cover the existing application’s user experience, approval workflow engine, business features, analytics, reporting, reliability, automation recovery, security, governance, testing and operational readiness.

## 1.1 Existing core enhancement scope

Audit and implement each item below wherever it is missing, incomplete or defective:

1. Personalized **My Work** dashboard.
2. Visual approval tracker and request lifecycle timeline.
3. Autosave, draft recovery and smart forms.
4. Global search and saved views.
5. Mobile-first, responsive approval experience.
6. Notification preferences and delivery tracking.
7. Bulk approval workspace with eligibility validation and safe execution.
8. Intelligent delegation, absence management and safe reassignment.
9. Comments, mentions and collaboration controls.
10. Downloadable approval summary PDF.
11. Advanced workflow simulation and version comparison.
12. Approver workload balancing and configurable SLA alerts.
13. Submission readiness checker.
14. Stuck-request detection.
15. Duplicate request detection.
16. Smart form autofill.
17. Approved-request amendment with immutable original history.
18. Department scorecards.
19. Workflow migration assistant.
20. Safe workflow replay and recovery.
21. Configuration promotion between controlled environments.
22. Retention and legal hold.
23. Centralized failed-automation recovery with safe Retry/Resend/Reprocess actions wherever applicable.
24. Comprehensive role-based analytics, dashboards, KPI cards, graphs, comparisons, reports, pending/overdue/SLA analytics, conditional formatting and operational intelligence.
25. Enterprise reliability, governance, workflow integrity, separation of duties, immutable history, monitoring, backup/recovery and controlled release.

For all items, first establish whether the existing implementation genuinely works end-to-end. Do not duplicate working capabilities. A partly implemented feature is classified as **Yet to do** until its remaining required behavior is completed and verified.

## 1.2 Preserve the existing product and architecture

- Inspect and respect the actual repository, framework, database, API contracts, deployment architecture and design system.
- Preserve existing working capabilities and backward compatibility.
- Reuse current authentication, authorization, workflow, notification, job, audit, export and integration infrastructure wherever practical.
- Do not replace the application or approval engine merely to simplify implementation.
- Do not change workflow business rules merely to make reporting easier.
- Preserve existing request records, historical approval decisions, workflow versions and audit trails.
- Avoid unnecessary new dependencies and services.
- Do not fabricate test data in production, fabricate metric values, or simulate external integrations as successful.
- Keep the core approval workflow available even if analytics or a noncritical reporting service fails.

---

# 2. Mandatory Audit-First Execution

Before editing code:

1. Read `APPLICATION_CURRENT_STATE_AUDIT.md` completely.
2. Inspect the repository structure and relevant source files, routes, components, services, APIs, database schema, migrations, background jobs, scheduled jobs, notifications, integrations, permissions and tests.
3. Verify each statement in the audit against the actual implementation. The audit document may be incomplete or stale.
4. Establish the current build, test, security and performance baseline.
5. Trace each requirement in this prompt to actual code, configuration, source data and test evidence.
6. Identify existing working behavior, defects, missing functionality, partial functionality, data gaps, external dependencies and policy decisions.
7. Prepare an incremental implementation plan with dependencies, acceptance criteria, tests and rollback/recovery notes.
8. Begin implementation only after the inventory and plan are sufficiently grounded in the repository.

Do not infer implementation status from a route name, UI control, database field, comment, mock response or successful build alone. Verify end-to-end behavior.

## 2.1 Required audit and handover documents

Create or update these documents using repository conventions. If equivalent documents already exist, update those rather than creating redundant files.

- `APPLICATION_CURRENT_STATE_AUDIT.md`
- `IMPLEMENTATION_STATUS_REGISTER.md`
- `IMPLEMENTATION_PLAN.md`
- `ANALYTICS_CURRENT_STATE_AUDIT.md`
- `ANALYTICS_METRIC_DICTIONARY.md`
- `ANALYTICS_TEST_MATRIX.md`
- `ANALYTICS_LIMITATIONS_AND_DATA_GAPS.md`
- `AUTOMATION_INVENTORY_AND_RECOVERY.md`
- `SECURITY_AND_AUTHORIZATION_REVIEW.md`
- `BACKUP_RESTORE_AND_ROLLBACK.md`
- `IMPLEMENTATION_REPORT.md`
- `GO_LIVE_READINESS_CHECKLIST.md`

Adapt filenames only if an existing repository convention requires it, and record the actual locations.

---

# 3. Mandatory Implementation Status Register

## 3.1 Exact status values

For **every atomic requirement** in this master prompt and its detailed addenda, create and maintain a status row with these columns:

| Requirement ID | Feature / Requirement | Confirmation Status | Evidence / Code Reference | Action Required | Test Evidence / Result | Blocker / Feasibility Reason |
|---|---|---|---|---|---|---|

Use only these exact values in the **Confirmation Status** column:

- **Implemented**
- **Yet to do**
- **Not feasible**

Do not leave the final register with unknown, assumed or unverified statuses. During discovery, you may use a temporary working state, but the final register must use the three exact values above after the audit.

### Implemented

Mark a requirement **Implemented** only when repository inspection and appropriate tests demonstrate that the required behavior exists and works end-to-end.

- Leave the working implementation unchanged unless a separately verified defect or security issue requires correction.
- Do not rewrite it for stylistic preference.
- Record evidence: file/module, route/API, configuration, test, or other verifiable reference.
- If it has a known defect, missing acceptance criterion or incomplete edge case, classify it as **Yet to do** instead.

### Yet to do

Use **Yet to do** when a requirement is absent, incomplete, broken, untested, only mocked, inaccessible through the actual product, or not fully compliant with the acceptance criteria.

- Build or complete it.
- Fix the in-scope defect.
- Add or update automated tests.
- Verify the feature end-to-end.
- Update the status to **Implemented** only after evidence supports the change.
- Do not mark an item complete merely because its code compiles or its UI renders.

### Not feasible

Use **Not feasible** only when a requirement cannot be delivered safely or truthfully within the current technical, data, permission, policy or external-system constraints.

- Never use this status merely because the work is large or inconvenient.
- Record the precise reason and evidence.
- Identify the missing prerequisite, owner or external dependency.
- State whether a safe alternative, partial capability or future path exists.
- Keep all Not feasible items in a **separate section and separate table** in `IMPLEMENTATION_STATUS_REGISTER.md` and `IMPLEMENTATION_REPORT.md`.
- Do not implement a fake substitute or fabricate data to make the requirement appear complete.
- Reassess feasibility if the required dependency becomes available.

### Partial implementations

A partially implemented requirement is **Yet to do** until all applicable acceptance criteria are satisfied. Preserve working parts and implement only the missing or defective portions.

### Status and build behavior

1. Audit first.
2. Record the initial status for every atomic requirement.
3. Leave verified **Implemented** features unchanged.
4. Build or fix every **Yet to do** feature that can be safely completed within the authorized scope.
5. Place **Not feasible** items in a separate section, with reasons and next steps.
6. Update the register as implementation progresses.
7. Final status must reflect actual test evidence, not intention.
8. If a feature was attempted but remains incomplete, it stays **Yet to do**, and the report must explain what remains.

## 3.2 Initial feature-group confirmation matrix

Use this as the top-level summary, and create detailed atomic rows for every individual feature and requirement under each group. The Confirmation Status cells must be filled after the repository audit.

| ID | Feature Group | Confirmation Status | Evidence / Action |
|---|---|---|---|
| F01 | Personalized My Work dashboard |  |  |
| F02 | Visual approval tracker and lifecycle timeline |  |  |
| F03 | Autosave, draft recovery and smart forms |  |  |
| F04 | Global search and saved views |  |  |
| F05 | Mobile-first responsive approval UX and accessibility |  |  |
| F06 | Notification preferences and delivery tracking |  |  |
| F07 | Bulk approval workspace |  |  |
| F08 | Delegation, absence management and workload balancing |  |  |
| F09 | Comments, mentions and collaboration |  |  |
| F10 | Downloadable approval summary PDF |  |  |
| F11 | Workflow simulation and version comparison |  |  |
| F12 | Configurable SLA, reminders, escalations and alerts |  |  |
| F13 | Submission readiness checker |  |  |
| F14 | Stuck-request detection |  |  |
| F15 | Duplicate request detection |  |  |
| F16 | Smart form autofill |  |  |
| F17 | Approved-request amendment |  |  |
| F18 | Department scorecards |  |  |
| F19 | Workflow migration assistant |  |  |
| F20 | Safe workflow replay and recovery |  |  |
| F21 | Configuration promotion |  |  |
| F22 | Retention and legal hold |  |  |
| F23 | Failed automation recovery and Retry/Resend controls |  |  |
| F24 | Requester analytics and reports |  |  |
| F25 | Approver analytics and reports |  |  |
| F26 | Admin analytics and reports |  |  |
| F27 | Super Admin analytics and reports |  |  |
| F28 | KPI cards, graphs, comparisons and conditional formatting |  |  |
| F29 | Pending, overdue, aging and SLA analytics |  |  |
| F30 | Saved analytics views, filters and drill-down |  |  |
| F31 | Exports, PDFs and scheduled reports |  |  |
| F32 | Alerting and notification analytics |  |  |
| F33 | Workflow integrity and separation of duties |  |  |
| F34 | Immutable history and version integrity |  |  |
| F35 | Monitoring, health checks and operational observability |  |  |
| F36 | Backup, restore and disaster recovery |  |  |
| F37 | Controlled release, feature flags and rollback |  |  |
| F38 | Security, privacy and auditability |  |  |
| F39 | Automated, end-to-end, regression and resilience testing |  |  |
| F40 | Documentation, readiness review and handover |  |  |

The table above is only a summary. **Do not use it instead of the atomic requirement register.** Every individual requirement in the detailed sections must be independently classified, with evidence.

---

# 4. Workflow, Security, Data Integrity and Release Non-Negotiables

Apply these rules throughout every feature:

- Enforce the workflow state machine on the server.
- Preserve supported Sequential, Parallel, Any-One, Any-One Sequence, Selected Parallel, Any-N-of-M and supported Custom/Hybrid patterns.
- Validate conditional branches, rejection, return/resubmission, reopening, cancellation, recall and parallel completion rules.
- Enforce self-approval restrictions, conflict-of-interest policies and eligibility checks.
- Validate requester, approver, delegate, consultant, watcher and administrator permissions independently.
- Prevent privilege escalation, circular delegation, duplicate decisions and unauthorized workflow transitions.
- Revalidate permissions and workflow state at the time of every consequential action.
- Preserve immutable decision history and reconstructable approval paths.
- Record important changes with actor, action, timestamp, record reference, workflow/configuration version and relevant before/after values.
- Never repair a workflow by silently rewriting historical decisions.
- Use safe idempotent retries and reconciliation before repeating operations with side effects.
- Protect reset/session tokens, secrets and sensitive information from API responses, logs and errors.
- Do not enable approval by email or WhatsApp reply unless separately approved by the business and security owners.
- Do not perform destructive operations, mass record changes, irreversible data migrations, production retention deletion, backup overwrites or production deployment without explicit authorization.
- Use feature flags or equivalent controls when appropriate, but never as a substitute for server-side authorization.
- Keep development, testing and production configurations separated.
- Do not claim production readiness based only on visual appearance or a successful build.

---

# 5. Detailed Implementation Addenda

The following two addenda are part of this single master prompt. Treat their requirements as mandatory scope, subject to the status and feasibility rules above. Where requirements overlap, consolidate the implementation and tests rather than creating duplicate services or UI. Preserve all unique requirements.



## Addendum A — Analytics, Dashboards, Reports, KPI Cards, SLA and Operational Intelligence

# ARS Approval Platform — Comprehensive Analytics, Dashboards, Reports, KPI Cards, SLA, Pending/Overdue and Operational Intelligence Addendum

## 1. Objective and Implementation Mandate

You are working on the **existing ARS Approval Platform**. Implement a comprehensive, role-aware analytics and reporting capability covering:

- Requester dashboards and personal request analytics.
- Approver dashboards, assigned workload and decision analytics.
- Admin dashboards for workflow operations, departmental performance and governance.
- Super Admin dashboards for platform-wide health, configuration, security and operational reliability.
- Interactive KPI cards, charts, graphs, tables, comparisons, aging analysis, pending and overdue classifications, SLA analytics, conditional formatting, saved views, drill-down and exports.
- Downloadable reports, scheduled reports and authorized alerts/notifications.
- Data quality, metric definitions, auditability, performance, automated testing and implementation documentation.

This addendum extends the existing application. It does not authorize replacing the current application, introducing an unrelated reporting architecture, or redesigning the approval engine unnecessarily.

### Mandatory execution principles

1. Inspect `APPLICATION_CURRENT_STATE_AUDIT.md`, the complete relevant repository structure, existing routes, components, services, database schema, APIs, permissions, workflow engine, notification infrastructure, background jobs and tests before making changes.
2. Validate the audit against the actual code and runtime configuration. The audit document may be incomplete or outdated.
3. Produce an implementation inventory distinguishing:
   - Existing and working capabilities to reuse.
   - Existing capabilities requiring correction.
   - Missing capabilities requiring implementation.
   - Metrics unavailable from current data.
   - Capabilities requiring approved schema or configuration changes.
4. Preserve existing workflows, approval decisions, role permissions, data integrity, architecture, integrations and backward compatibility.
5. Use the existing design system, authentication, authorization, database access patterns, charting libraries, API conventions, notification services and export utilities wherever suitable.
6. Do not fabricate metrics, infer missing timestamps, silently change historical records, or display unavailable values as zero.
7. Keep **pending**, **overdue**, **SLA-breached**, **blocked**, **failed automation**, and **awaiting requester action** as distinct concepts.
8. Implement in small, verifiable phases. Run relevant tests after every phase and regression tests before completion.
9. Do not perform destructive database operations, mass changes to existing approval records, irreversible migrations or production deployment without explicit authorization.
10. Do not silently expand the scope of a metric beyond what the available data supports.
11. Complete implementation and verification autonomously within the approved repository and environment. If an essential decision, permission, production credential or destructive action requires authorization, document the blocker and continue with safe, independent work.
12. Maintain a traceable relationship between requirements, implementation, tests, evidence and outstanding limitations.

---

## 2. Mandatory Audit and Discovery Phase

Before modifying code, inspect the following.

### 2.1 Application and architecture inventory

Identify:

- Frontend framework, routes, layouts, shared components and design system.
- Backend framework, API routing, business services and background workers.
- Database technology, schema, migration mechanism, indexes and transaction boundaries.
- Authentication, sessions, roles, permissions, organizational hierarchy and department mapping.
- Existing request, approval, workflow, task, comment, attachment and audit-log models.
- Existing workflow patterns, including Sequential, Parallel, Any-One, Any-One Sequence, Selected Parallel, Any-N-of-M and supported hybrid/custom workflows.
- Existing DoA amount bands, approval levels, workflow versions and escalation rules.
- Existing SLA definitions, if any, including business calendars, holidays, pause conditions and escalation thresholds.
- Existing dashboard, chart, report, export, search, saved-view and notification components.
- Existing email, in-app, push or other notification channels and delivery tracking.
- Existing scheduler, cron jobs, queues, retries, idempotency mechanisms and job monitoring.
- Existing ERP or external integrations and whether they provide authoritative transaction amounts or statuses.
- Existing observability, error logging, security events, backup and recovery mechanisms.
- Existing automated tests, test fixtures, development data and deployment process.

### 2.2 Data dictionary discovery

Map each potential metric to its actual source.

At minimum, investigate the availability and quality of:

- Request identifier and request type.
- Requester identity, department, plant or business unit.
- Request creation, submission, approval, rejection, withdrawal and cancellation timestamps.
- Current request status and status-transition history.
- Workflow identifier, workflow version and stage identifier.
- Approver assignment, assignment history and decision timestamps.
- Parallel approval group membership and decision rules.
- Due dates, SLA targets, business calendars and pause/resume events.
- Request amount, currency, budget information and authoritative financial source.
- Comments, information requests, responses, resubmissions and amendments.
- Delegation, reassignment, absence and escalation events.
- Automation execution, failure, retry, reconciliation and recovery history.
- Notification creation, delivery attempts, provider receipts and failures.
- Integration request identifiers, responses, reconciliation states and transaction references.
- Duplicate-detection signals and confirmed duplicate outcomes.
- User activity, access events and role changes.
- Workflow configuration changes, promotion events and migration results.
- Scheduled report executions, delivery attempts and retention outcomes.
- Backup, restore and infrastructure monitoring results where available.

For each field, document whether it is authoritative, derived, optional, historically complete, indexed, access-controlled and suitable for analytics.

### 2.3 Audit deliverables

Create or update the following documentation using the repository's existing documentation conventions:

- `ANALYTICS_CURRENT_STATE_AUDIT.md`
- `ANALYTICS_METRIC_DICTIONARY.md`
- `ANALYTICS_IMPLEMENTATION_PLAN.md`
- `ANALYTICS_TEST_MATRIX.md`
- `ANALYTICS_LIMITATIONS_AND_DATA_GAPS.md`

If the repository uses another documentation location or naming convention, reuse it and record the actual paths.

The audit must not claim a capability exists merely because a related component or database field exists. Verify that the end-to-end behavior works.

---

## 3. Role-Based Analytics Architecture

Implement analytics according to the application's existing authorization model.

### 3.1 Requester workspace

Purpose: provide each requester with a reliable view of their own submissions, outstanding actions, decisions, deadlines, documents and request history.

Default scope: requests the authenticated user is authorized to access as requester or another explicitly permitted participant.

Required capabilities:

- My Requests dashboard.
- Request status and lifecycle history.
- Pending approvals and overdue status.
- Requests requiring additional information.
- Drafts and recoverable drafts, where supported.
- Submission readiness and missing-document indicators.
- Approved, rejected, returned, withdrawn and cancelled request history.
- Upcoming deadlines and available amendment actions.
- Personal turnaround-time statistics when supported by reliable timestamps.
- Downloadable authorized request summaries.
- Relevant notifications and action links.

A requester must not see other employees' confidential requests merely because those requests belong to the same department.

### 3.2 Approver workspace

Purpose: support timely decisions and balanced, controlled approval workloads.

Default scope: approvals currently or historically assigned to the authenticated approver, including delegated or reassigned work only as permitted by policy.

Required capabilities:

- My Pending Approvals.
- Overdue Assigned Approvals.
- Approvals Due Today and within the next seven days.
- SLA approaching and SLA breached.
- Oldest pending approvals.
- Workload by request type, workflow, stage and priority.
- Assigned, delegated, reassigned and completed approval activity.
- Average and median decision time, when supported.
- Decision history and rework statistics.
- Bulk-approval eligibility and authorized bulk-action workspace.
- Missing assignment and blocked-stage warnings where the approver has appropriate operational visibility.
- Workload and escalation notifications.

Never expose an unrelated approver's confidential request data or allow analytics controls to bypass approval permissions.

### 3.3 Admin workspace

Purpose: provide authorized operational oversight for the departments, plants, workflows and business units within the administrator's permitted scope.

Required capabilities:

- Department and employee performance summaries.
- Pending and overdue backlog.
- SLA attainment and breach analysis.
- Workflow bottlenecks and stage-duration analysis.
- Missing approver assignments and stuck requests.
- Rework, resubmission, rejection and withdrawal trends.
- Automation failures and retry outcomes.
- Notification and integration failures.
- Workload distribution and reassignment patterns.
- Budget warnings and financial exposure, if supported by authoritative data.
- Duplicate indicators and amendment tracking.
- Workflow version comparisons and migration readiness.
- Scheduled report health and authorized operational alerts.
- Retention and legal-hold reporting within granted permissions.

Department-wide reporting must not automatically grant access to the underlying documents, comments, attachments or confidential request details.

### 3.4 Super Admin workspace

Purpose: provide platform-wide governance, operational reliability, configuration oversight and security visibility.

Required capabilities:

- Authorized platform-wide request and approval statistics.
- Users, active accounts, roles and department distribution.
- Authentication and authorization anomalies.
- Workflow inventory and version status.
- Automation execution, retries and failed jobs.
- Notification queue and delivery health.
- External integration health.
- API latency, application errors and database/storage health where instrumented.
- Audit-log integrity and configuration changes.
- Backup and restore verification results.
- Workflow migration and configuration-promotion results.
- Retention jobs, legal holds and governance exceptions.
- Analytics pipeline health and data freshness.
- Report scheduling and delivery health.
- Rollout and deployment status where reliable telemetry exists.

Super Admin access remains subject to security controls, audit logging and any restricted-data policies. Administrative visibility does not authorize arbitrary business decisions on behalf of users.

### 3.5 Authorization requirements

Enforce authorization on the server for every dashboard query, report endpoint, export, scheduled report, drill-down, saved view, alert subscription and data source.

Implement or reuse the following controls:

- Role-based access control.
- Department, plant and organizational scope restrictions.
- Record-level access rules.
- Field-level masking or exclusion for confidential fields.
- Separate permissions for viewing aggregates and viewing individual records.
- Separate permissions for creating, managing, exporting and scheduling reports.
- Separate permissions for platform-health and security information.
- Authorization checks on background jobs using the report owner's saved permissions and current policy.
- Revocation behavior when a user's access or role changes.
- Audit logs for privileged report creation, exports, access and configuration changes.

A hidden button is not an authorization control. Direct API requests must enforce the same permissions as the user interface.

---

## 4. Dashboard Information Architecture

Implement the following dashboards using the existing application navigation and visual design system.

### 4.1 Requester dashboards

- My Requests Overview.
- Pending and Overdue Requests.
- Request Timeline and Approval Tracker.
- My Request History.
- Requests Requiring My Action.
- Submission Readiness and Missing Information.
- Upcoming Deadlines.
- Personal Turnaround and Request Trends.
- My Notifications and Delivery Status.
- My Amendments and Revisions, where supported.

### 4.2 Approver dashboards

- My Approval Work Queue.
- Overdue and SLA-Risk Approvals.
- Approval Aging and Oldest Items.
- Workload Distribution.
- My Decision Trends.
- Decision Turnaround and Stage History.
- Delegated and Reassigned Work.
- Bulk Approval Workspace.
- Escalations and Missing Assignments, within authorized scope.

### 4.3 Admin dashboards

- Operational Overview.
- Department and Employee Performance.
- Pending and Overdue Management.
- SLA and Escalation Monitoring.
- Workflow Bottleneck Analysis.
- Approver Workload and Capacity.
- Rework and Decision Quality.
- Automation, Notifications and Integration Reliability.
- Financial and Budget Analytics, when supported.
- Duplicate, Amendment and Exception Management.
- Workflow Version Comparison and Migration.
- Scheduled Reports and Governance Operations.

### 4.4 Super Admin dashboards

- Platform Executive Overview.
- Workflow and Approval Operations.
- User and Access Governance.
- Automation and Background Job Reliability.
- Notifications and Integrations.
- Application, API and Database Health.
- Audit, Configuration and Security.
- Backup, Restore and Disaster Recovery.
- Workflow Migration and Configuration Promotion.
- Data Quality, Analytics Freshness and Reporting Operations.
- Retention, Legal Holds and Governance Exceptions.

Do not create redundant dashboard pages when existing routes or reusable dashboard layouts can accommodate the capability. Consolidate logically related cards and charts into a clear navigation structure.

---

## 5. Comprehensive KPI Card Catalogue

Implement all applicable KPI cards below, subject to verified data availability and authorization.

Every card must include:

- Clear title and business definition.
- Current value or an explicit unavailable state.
- Unit and reporting period.
- Relevant comparison, if selected and valid.
- Data freshness indicator where applicable.
- A documented click or drill-down behavior.
- Permission-aware filters.
- Loading, empty, error and stale-data states.
- Accessible text and icon cues.
- Tooltip or help text explaining calculation and exclusions.
- Optional trend direction only when the comparison is meaningful.

### 5.1 Requester KPI cards

1. Total Requests.
2. Draft Requests.
3. Submitted Requests.
4. Requests Awaiting Approval.
5. Requests Awaiting My Action.
6. Requests Returned for Correction.
7. Requests Awaiting Additional Information.
8. Approved Requests.
9. Rejected Requests.
10. Withdrawn Requests.
11. Cancelled Requests.
12. Recalled Requests, if supported.
13. Overdue Requests.
14. Approvals Due Today.
15. Approvals Due Within Seven Days.
16. Requests Approaching an SLA Deadline.
17. Requests with an SLA Breach.
18. Requests Missing Required Documents.
19. Submission Readiness Failures.
20. Potential Duplicate Requests.
21. Requests Requiring Amendment.
22. Open Amendments.
23. Completed Requests This Month.
24. Average Completion Turnaround.
25. Median Completion Turnaround.
26. Fastest and Longest Completed Request, with suitable privacy and outlier handling.
27. Monthly Request Count.
28. Request Value Submitted, if authoritative amounts exist.
29. Request Value Approved, if authoritative amounts exist.
30. Requests with Unread Notifications.
31. Recoverable Drafts and Autosave Recovery Events, where supported.
32. Upcoming Required-by Deadlines.
33. Requests Requiring Resubmission.
34. Requests with Missing or Incomplete Information.
35. Request Outcome Distribution.

Avoid presenting a request as overdue merely because it has not yet been approved. Use the actual due-date or SLA rules.

### 5.2 Approver KPI cards

1. Pending Assigned Approvals.
2. Overdue Assigned Approvals.
3. Approvals Due Today.
4. Approvals Due Within Seven Days.
5. Approvals Approaching SLA.
6. SLA-Breached Approvals.
7. Oldest Pending Approval.
8. Longest Current Wait.
9. Approvals Waiting for My Decision.
10. Approvals Blocked by Earlier Workflow Stages.
11. Approvals Waiting for Requester Information.
12. Approvals Waiting for Consultation.
13. Approvals Delegated to Me.
14. Approvals Delegated by Me.
15. Reassigned Approvals.
16. Approvals Completed Today.
17. Approvals Completed This Week.
18. Approvals Approved This Month.
19. Approvals Rejected This Month.
20. Average Decision Time.
21. Median Decision Time.
22. Decision Time by Request Type.
23. Current Workload by Workflow and Stage.
24. Workload by Priority.
25. Approvals at Risk of SLA Breach.
26. Eligible Bulk-Approval Items.
27. Items Missing an Eligible Approver, if visible to the role.
28. Pending Approvals by Age Bucket.
29. Decision Trends.
30. Unread Approval Notifications.
31. Failed or Unconfirmed Notification Deliveries relevant to my tasks, if supported.
32. Rework and Resubmission Volume.
33. Requests Awaiting My Review After Amendment.
34. Current Assigned Workload Compared with Team Average, only when the team aggregate is authorized and meaningful.

### 5.3 Admin KPI cards

1. Total Submitted Requests.
2. Total Completed Requests.
3. Total Pending Requests.
4. Total Overdue Requests.
5. Requests Due Today.
6. Requests Approaching SLA.
7. SLA-Breached Requests.
8. Requests Awaiting Requester Information.
9. Requests Awaiting Consultation.
10. Requests Without an Eligible Approver.
11. Requests with Stuck or Blocked Workflows.
12. Requests with Failed Automation Steps.
13. Requests Requiring Manual Recovery.
14. Failed Notification Deliveries.
15. Failed External Integration Events.
16. Average Completion Turnaround.
17. Median Completion Turnaround.
18. SLA Attainment Rate.
19. SLA Breach Rate.
20. First-Pass Approval Rate.
21. Rework Rate.
22. Rejection Rate.
23. Withdrawal and Cancellation Rate.
24. Department Backlog.
25. Department Overdue Backlog.
26. Approver Workload Distribution.
27. Stage Bottleneck Count.
28. Reassignment Volume.
29. Potential Duplicate Count.
30. Confirmed Duplicate Count, if confirmation records exist.
31. Budget Warnings.
32. Pending Financial Exposure, if reliable.
33. Requests Requiring Amendment.
34. Open Amendment Count.
35. Scheduled Report Failures.
36. Workflow Version Inventory.
37. Workflow Migration Warnings.
38. Configuration Promotion Failures.
39. Retention Jobs Due or Failed.
40. Active Legal Holds and Exceptions.
41. Data Quality Exceptions.
42. Analytics Refresh Failures or Staleness.
43. Pending Reconciliation Events.
44. Automation Retry Queue.
45. Long-Running Workflow Instances.

### 5.4 Super Admin KPI cards

1. Total Users.
2. Active Users.
3. Inactive or Suspended Users.
4. Users by Role.
5. Users by Department or Plant.
6. Authentication Failures.
7. Authorization Denials and Access Exceptions.
8. Platform-Wide Request Volume.
9. Platform-Wide Pending and Overdue Volume.
10. Active Workflows.
11. Workflow Versions and Configuration Changes.
12. SLA Attainment Across Authorized Scope.
13. Workflow Execution Failures.
14. Automation Failures.
15. Retry Queue Depth.
16. Exhausted Retry Attempts.
17. Background Job Failures.
18. Failed or Delayed Scheduled Jobs.
19. Notification Queue Backlog.
20. Notification Delivery Success and Failure.
21. Integration Health.
22. Integration Reconciliation Backlog.
23. Application Error Rate.
24. API Latency Percentiles, where instrumented.
25. Database Health and Query Performance, where instrumented.
26. Storage Utilization, where instrumented.
27. Audit-Log Write Failures or Integrity Alerts.
28. Backup Completion Status.
29. Restore Verification Status.
30. Configuration Promotion Failures.
31. Workflow Migration Status.
32. Retention Job Status.
33. Legal-Hold Exceptions.
34. Security Alerts.
35. Deployment or Rollout Status.
36. Analytics Data Freshness.
37. Report Generation Failures.
38. Scheduled Report Delivery Failures.
39. Data Quality and Metric Coverage.
40. Platform Availability, only if supported by reliable monitoring.

Do not invent infrastructure telemetry if it is not collected. Show the appropriate unavailable state and document the instrumentation requirement.

---

## 6. Comprehensive Graph, Chart and Visualization Catalogue

Choose the visualization appropriate to the analytical question. Reuse existing charting libraries. Avoid adding a new chart library without a documented need.

### 6.1 Request volume and status

- Requests Submitted Over Time — line chart.
- Requests Completed Over Time — line chart.
- Requests by Status — donut or bar chart.
- Submitted, Approved, Rejected and Cancelled Trends — stacked column chart.
- Requests by Department — horizontal bar chart.
- Requests by Request Type — bar chart.
- Requests by Workflow — bar chart.
- Request Volume by Day of Week — bar chart.
- Request Volume by Hour — heatmap, only if timestamps and business relevance justify it.
- Current Backlog vs Previous Period — comparison chart.
- Submission-to-Completion Funnel — funnel chart with explicitly defined stages.
- Request Lifecycle Flow — Sankey or flow visualization when transition data is reliable.
- Request Cohort Completion — cohort chart when cohort definitions are meaningful.

### 6.2 Pending, overdue and aging

- Pending Approvals by Age Bucket — histogram or stacked bar.
- Overdue Approvals by Age Bucket — histogram.
- Pending vs Overdue by Department — grouped or stacked bars.
- Pending vs Overdue by Approver — horizontal bars.
- Requests Approaching SLA — categorized bar chart.
- SLA Breaches by Department — bar chart.
- SLA Breaches by Workflow Stage — bar chart.
- SLA Breaches Over Time — line chart.
- Backlog Accumulation and Clearance — line chart.
- Overdue Backlog Trend — line chart.
- Pending Aging Heatmap by Department and Stage.
- Due Date Calendar — calendar visualization.
- Time Remaining Until Deadline — categorized distribution.
- Breach Duration Distribution — histogram.
- Oldest Open Requests — ranked table with authorized drill-down.
- Escalation Volume Over Time — line chart.
- Requests Awaiting Information by Age — bar chart.
- Unassigned Approvals by Department and Stage — bar chart.
- Blocked Workflow Instances by Reason — bar chart.

### 6.3 Turnaround and workflow bottlenecks

- Average vs Median Turnaround — comparison chart.
- Submission-to-First-Decision Time — line or distribution chart.
- Stage-Level Duration — horizontal bar chart.
- Stage Duration by Workflow — grouped bars.
- End-to-End Completion Time — line and distribution charts.
- Approval Queue Waiting Time vs Decision Time — stacked bar.
- Workflow Bottleneck Heatmap.
- Longest-Running Workflows — ranked table.
- Workflow Duration Distribution — box plot where supported.
- Time Between Sequential Decisions — distribution chart.
- Parallel Group Completion Duration — distribution chart with explicit group semantics.
- Workflow Completion Funnel — stage-level conversion chart.
- Stage Revisit and Rework Frequency — bar chart.
- Workflow Transition Sankey — only with reliable event history.
- Request Timeline or Gantt-Style View — per-request event timeline.
- Control Chart for Turnaround — where statistical assumptions are appropriate.
- Pareto Analysis of Delay Reasons — only if delay reasons are recorded reliably.

### 6.4 Approver workload and decision performance

- Current Assignments by Approver — horizontal bar chart.
- Pending Approvals by Approver — bar chart.
- Overdue Approvals by Approver — bar chart.
- Workload by Department and Approver — heatmap.
- Decisions Completed Over Time — line chart.
- Decision Time by Approver — distribution chart with minimum sample thresholds.
- Approval and Rejection Trends — stacked bars.
- First-Pass Approval Rate by Department — bar chart.
- Rework Rate by Request Type — bar chart.
- Reassignment Frequency — bar chart.
- Delegation Volume — trend chart.
- Approvals by Priority — stacked bar.
- Workload vs Available Capacity — only if a valid capacity model exists.
- SLA Risk by Approver — categorized table or chart.
- Approval Decisions by Workflow Stage — bar chart.
- Bulk Approval Activity — trend chart where recorded.

Do not interpret high approval volume as higher employee performance without accounting for assignment volume, request complexity, workflow stage, access scope and data quality. Avoid individual performance rankings that encourage unsafe or biased conclusions.

### 6.5 Financial and budget analytics

Render financial analytics only when the amount, currency, budget and financial status fields are reliable and authorized.

- Requested Amount vs Approved Amount.
- Approved Amount by Department.
- Approved Amount by Request Type.
- Pending Request Value.
- Pending Financial Exposure.
- Budget vs Approved Commitments.
- Budget Utilization.
- Budget Warning and Over-Budget Trends.
- Amount Distribution by Request Category.
- Monthly Approved Amount.
- Requests Near Approval Thresholds.
- Requests Above Configured Thresholds.
- Amendment-Related Amount Changes.
- Duplicate Invoice or Payment Indicators.
- ERP Integration Discrepancies.
- Reconciliation Status by Integration.
- Approved Amount vs Actual Spend, only when authoritative actual-spend data exists.

Use consistent currency handling. Never sum different currencies without an explicit, documented conversion policy and reliable exchange-rate source.

Do not treat approved value as actual expenditure, commitment or payment unless the underlying financial model defines that equivalence.

### 6.6 Automation and operational reliability

- Automation Success vs Failure Over Time.
- Automation Failures by Category.
- Retry Attempts by Category.
- Successful Recovery Rate.
- Exhausted Retry Queue.
- Time to Recovery.
- Automation Failure Heatmap by Workflow and Stage.
- Notification Delivery Success vs Failure.
- Notification Latency and Delivery Delays.
- Notification Failures by Channel.
- External Integration Success and Failure.
- Integration Reconciliation Backlog.
- Stuck Workflow Count Over Time.
- Manual Recovery Frequency.
- Scheduled Report Execution and Delivery Status.
- Workflow Migration Success vs Failure.
- Configuration Promotion Success vs Failure.
- Retention Job Success vs Failure.
- Backup and Restore Verification History.
- Application Error Trends.
- API Latency Percentiles.
- Database Query Performance.
- Analytics Refresh Duration and Failure Rate.

Every reliability metric must have a defined event source, time window and denominator. For example, retry success rate must not count multiple attempts as separate unique business operations unless that is the explicitly intended metric.

### 6.7 Advanced visualizations

Implement only when the underlying event history and business use case justify them:

- Sankey diagram for workflow transitions.
- Funnel analysis for lifecycle completion.
- Calendar heatmap for submissions or decisions.
- Pareto chart for delay or failure causes.
- Cohort analysis for requests created during a period.
- Box plots for turnaround distributions.
- Scatter plots for workload versus turnaround, with appropriate privacy controls.
- Gantt-style timelines for workflow stages.
- Waterfall chart for financial variance decomposition.
- Statistical control charts for process stability.
- Heatmaps for department, stage, priority and aging intersections.

If a selected chart type is not supported by the existing library, use a suitable supported alternative rather than blocking the feature or adding unnecessary dependencies.

---

## 7. Pending, Overdue, SLA and Blocked-State Semantics

This section is mandatory. Implement explicit, testable definitions.

### 7.1 Pending approval

A request or approval is pending when it has not reached the relevant terminal state and is awaiting an outstanding approval action, according to the workflow engine.

Examples:

- Awaiting a sequential approver.
- Awaiting completion of a parallel approval group.
- Awaiting one eligible approver in an Any-One group.
- Awaiting an N-of-M threshold.
- Waiting at a hybrid/custom workflow stage.
- Waiting for an eligible approver assignment, where the workflow state supports it.
- Waiting for an authorized consultation or other non-decision step, when modeled.

A pending item is not necessarily overdue.

### 7.2 Overdue approval

An approval is overdue only when an applicable, reliable due-date or SLA deadline has passed under the configured policy.

Determine which of the following deadlines actually exist:

- Request-level due date.
- Required-by date.
- Stage-level approval due date.
- Approver response deadline.
- SLA deadline.
- Requester information-response deadline.
- Consultation deadline.
- Automation recovery deadline.
- Scheduled report execution deadline.
- Integration reconciliation deadline.
- Governance-job deadline.

Do not use one deadline field as a substitute for another without an approved business rule.

### 7.3 SLA status

Where a valid SLA policy exists, calculate:

- Not Started, if applicable.
- Within SLA.
- Approaching SLA.
- SLA Breached.
- Paused, where permitted.
- Completed Within SLA.
- Completed After SLA.
- SLA Not Configured.
- SLA Data Unavailable.
- SLA Excluded, with a recorded and defined exclusion reason.

Approaching-SLA thresholds must be configurable. If the organization has not defined them, use a documented configurable default only after confirming it is suitable for the existing policy. Do not present an arbitrary threshold as an established business rule.

### 7.4 Blocked, unassigned and stuck

Keep these categories distinct:

- **Pending:** a valid next action is outstanding.
- **Overdue:** an applicable deadline has passed.
- **SLA breached:** the applicable SLA has been violated.
- **Unassigned:** a required assignment is missing or no eligible approver is available.
- **Blocked:** progress is prevented by a dependency or explicit hold.
- **Stuck:** progress has not occurred beyond a configurable operational threshold, based on reliable activity timestamps.
- **Automation failed:** a background or workflow automation operation failed.
- **Awaiting requester:** the next action belongs to the requester.
- **Awaiting external integration:** a defined external dependency is outstanding.
- **Paused:** the workflow or SLA is explicitly paused under an authorized policy.
- **Terminal:** the request has reached an approved, rejected, withdrawn or cancelled end state, as defined by the application.

A request can be pending and overdue at the same time. A request can be pending but not overdue. A request can be blocked without being overdue. Preserve these distinctions in both the database/API representation and the user interface.

### 7.5 Parallel and hybrid workflows

Respect the existing workflow engine's semantics.

- In a sequential workflow, the next stage may not begin until the previous stage is completed.
- In a parallel group, distinguish outstanding individual decisions from the group's overall completion.
- In Any-One workflows, do not count every unselected eligible approver as an independently pending business obligation unless the engine defines that behavior.
- In Any-N-of-M workflows, calculate outstanding requirements using the configured threshold and current valid decisions.
- In selected-parallel and hybrid workflows, use actual group membership and transition rules.
- Distinguish stage-level pending counts, approver assignment counts and unique request counts.

Never sum individual pending approver assignments and label the result as the number of pending requests. A single request may have multiple outstanding assignments.

### 7.6 Aging buckets

Provide configurable aging buckets. A proposed initial scheme is:

- Less than 24 hours.
- 1–2 days.
- 3–7 days.
- 8–14 days.
- 15–30 days.
- More than 30 days.

Validate whether these intervals fit the business policy. If the existing application uses business days, the UI and metric definition must clearly distinguish business-day aging from elapsed-calendar-time aging.

Where useful, separate:

- Age since request submission.
- Age since entering the current stage.
- Age since assignment to the current approver.
- Age since becoming overdue.
- Age since the last workflow progress event.

Do not use submission age as a substitute for current-stage waiting time.

### 7.7 Business-time calculation

If business-hour SLAs are required, use the configured business calendar, timezone, holidays and permitted pause conditions.

Do not assume a 24-hour calendar SLA is equivalent to a business-day SLA.

If the application has no reliable business calendar or historical pause/resume events, show the limitation and avoid claiming an exact business-time SLA result.

---

## 8. Conditional Formatting and Visual Status System

Reuse the existing design system and semantic color tokens.

Suggested meanings:

- **Neutral:** normal activity, informational status or no risk.
- **Green:** confirmed healthy state, successful completion or within-SLA outcome.
- **Amber:** approaching a deadline, warning, elevated risk or required attention.
- **Red:** confirmed overdue or breached state, critical failure or exhausted retry.
- **Blue or equivalent informational treatment:** waiting for requester input or another expected external action.
- **Grey:** unavailable data, disabled metric, not configured or insufficient evidence.
- **Distinct governance treatment:** legal hold, restricted records or special compliance state.

These are semantic suggestions, not permission to introduce inconsistent colors across the application.

### Conditional formatting rules

1. Overdue approval: red status indicator with explicit overdue duration.
2. Approaching SLA: amber status indicator with remaining time.
3. SLA breach: red indicator and breach duration.
4. Pending within SLA: neutral or standard pending treatment.
5. Awaiting requester: informational treatment with the required action.
6. Missing approver assignment: warning treatment and a clear reason.
7. Stuck workflow: warning or critical treatment according to severity and duration.
8. Potential duplicate: warning treatment; do not label it a confirmed duplicate.
9. Budget warning: warning treatment based on configured thresholds.
10. Failed automation: warning or critical treatment based on impact.
11. Retry in progress: neutral progress treatment.
12. Exhausted retry: critical treatment and authorized recovery action.
13. Failed notification delivery: warning or critical treatment according to business impact.
14. Failed integration reconciliation: explicit warning and reconciliation status.
15. Data unavailable: grey treatment, never a fabricated zero.
16. Legal hold: distinct compliance treatment that cannot be overridden by routine cleanup.
17. Healthy backup or verified restore: positive treatment only when an actual result confirms success.
18. Stale analytics: visible freshness warning.

Always combine colors with text, icons, labels or accessible descriptions. Do not rely on color alone.

Do not make conditional formatting the sole mechanism for explaining a problem. Include tooltips, status descriptions and relevant action links where authorized.

---

## 9. Comparisons and Trend Analytics

Support comparisons only when both sides use compatible definitions and sufficiently complete data.

### 9.1 Period comparisons

- Current period vs previous period.
- Current week vs previous week.
- Current month vs previous month.
- Current financial year vs previous financial year.
- Month-to-date vs equivalent prior-period dates.
- Year-to-date vs equivalent prior-year dates.
- Same period last year.
- Custom date range vs previous equal-length period.

Clearly label partial periods. Do not compare a partial current month with a complete prior month without explaining the difference.

### 9.2 Organizational comparisons

- Department vs organization aggregate.
- Department vs authorized peer departments.
- Approver vs team average or median.
- Workflow vs other comparable workflows.
- Request type vs organization baseline.
- Stage vs workflow average.
- Plant or business unit comparisons, where applicable.

Apply minimum sample thresholds and authorization checks. Do not expose a person's records through a supposedly anonymous aggregate when the group is too small to protect privacy.

### 9.3 Process comparisons

- SLA performance vs configured target.
- Average vs median turnaround.
- Pending backlog vs completed volume.
- First-pass approval vs rework.
- Workflow version A vs version B.
- Before vs after an authorized workflow change.
- Automation success before vs after a change.
- Failure rate before vs after a fix.
- Budget vs approved commitments, when supported.
- Current workload vs configured capacity, when capacity is modeled.

### 9.4 Percentage and variance calculations

Define the baseline and denominator for every percentage or variance.

- If the baseline is zero, return N/A or a clearly defined not-applicable state.
- If the denominator is missing, return unavailable.
- If the sample size is insufficient, show the sample limitation.
- Do not report an improvement percentage when the comparison periods are incompatible.
- Do not interpret a decline in approvals as improved efficiency without relevant context.
- Do not silently exclude cancelled or withdrawn requests from a metric; document and apply a consistent rule.

---

## 10. Comprehensive Reports Catalogue

Reports must be searchable, filterable, permission-aware, exportable where authorized, and generated using documented metric definitions.

### 10.1 Requester reports

- My Requests Register.
- My Request Status Report.
- My Pending and Overdue Requests.
- My Request Timeline and Approval History.
- My Completed Requests.
- My Rejected, Returned, Withdrawn and Cancelled Requests.
- My Upcoming Deadlines.
- My Missing Information and Document Checklist.
- My Request Turnaround Summary.
- My Monthly Request Trend.
- My Approved Request Summary PDF.
- My Amendment and Revision History.
- My Notification and Delivery History, where supported.
- My Request Value Summary, if authoritative amounts exist.

### 10.2 Approver reports

- My Pending Approval Register.
- My Overdue Approval Register.
- Approvals Due Today and This Week.
- My SLA Risk and Breach Report.
- My Decision History.
- My Approval and Rejection Trend.
- My Decision Turnaround Report.
- My Current Workload by Workflow and Stage.
- My Delegated and Reassigned Approval Report.
- My Rework and Resubmission Report.
- My Bulk Approval Activity.
- My Notification Delivery Exceptions.
- My Longest Pending Approvals.
- My Completed Approvals by Period.

### 10.3 Admin reports

- Department-Wise Request Summary.
- Employee-Wise Request Summary, within authorized scope.
- HOD-Wise Department Summary, where organizational mappings are reliable.
- Department-Wise Pending Report.
- Department-Wise Overdue Report.
- Employee-Wise Pending and Overdue Report.
- Approver-Wise Workload Report.
- Approver-Wise Turnaround Report.
- Request Type and Workflow Volume Report.
- Workflow Stage Duration Report.
- Workflow Bottleneck Report.
- SLA Attainment and Breach Report.
- Pending Aging Report.
- Overdue Aging Report.
- Escalation and Reminder Report.
- First-Pass Approval and Rework Report.
- Rejection, Withdrawal and Cancellation Report.
- Reassignment and Delegation Report.
- Unassigned and Stuck Request Report.
- Blocked Workflow Report.
- Automation Failure and Retry Report.
- Automation Recovery and Reconciliation Report.
- Notification Delivery Failure Report.
- External Integration Failure Report.
- Duplicate Indicator and Confirmation Report.
- Amendment and Revision Report.
- Budget Warning and Financial Exposure Report, where supported.
- Workflow Version Comparison Report.
- Workflow Migration Readiness and Results Report.
- Configuration Promotion Results Report.
- Scheduled Report Execution and Delivery Report.
- Retention and Legal-Hold Exception Report.
- Data Quality and Metric Coverage Report.
- Analytics Freshness and Refresh Status Report.

### 10.4 Super Admin reports

- Platform-Wide Request and Approval Summary.
- Platform-Wide Pending and Overdue Summary.
- Role and Department Access Report.
- User Lifecycle and Access Exception Report.
- Workflow Inventory and Version Report.
- Workflow Configuration Change Audit Report.
- Automation Reliability Report.
- Retry Queue and Exhausted Retry Report.
- Notification Delivery and Backlog Report.
- Integration Health and Reconciliation Report.
- Application Error and API Performance Report.
- Database and Storage Health Report, where instrumented.
- Audit-Log Health and Integrity Report.
- Backup and Restore Verification Report.
- Deployment and Rollout Report, where available.
- Workflow Migration and Configuration Promotion Report.
- Retention and Legal-Hold Governance Report.
- Analytics Data Freshness and Quality Report.
- Scheduled Report Execution and Delivery Report.
- Security Events and Privileged Access Report.
- Platform Availability Report, only if backed by reliable monitoring.

### 10.5 Report metadata

Each report must define:

- Report identifier and title.
- Purpose and intended audience.
- Required permission.
- Default date range.
- Supported filters.
- Primary date field used.
- Metric definitions and exclusions.
- Available detail level.
- Supported export formats.
- Refresh or execution frequency.
- Data freshness expectations.
- Known data limitations.
- Whether a report contains sensitive fields.
- Retention and delivery rules, where applicable.

---

## 11. Global Filters, Search and Saved Views

Provide shared filter behavior across applicable dashboards, charts and reports.

### Required filters

- Date range.
- Financial year.
- Department.
- Employee/requester.
- Approver.
- HOD or reporting manager.
- Plant or business unit.
- Request type.
- Request status.
- Workflow.
- Workflow version.
- Workflow stage or approval level.
- Priority.
- SLA status.
- Pending, overdue, blocked or unassigned classification.
- Aging bucket.
- Overdue category.
- Amount range and currency, where supported.
- Budget status, where supported.
- Automation status.
- Failure category.
- Retry status.
- Notification delivery status.
- Integration status.
- Amendment status.
- Duplicate status.
- Data quality status.

Only display filters that apply to the selected report or dashboard.

### Filter behavior

- Display active filters clearly.
- Support clearing individual filters and resetting the entire view.
- Preserve filter semantics when drilling down from a card to a chart or record list.
- Show the selected date range and timezone.
- Validate combinations that return no meaningful result.
- Prevent unauthorized users from expanding their permitted data scope.
- Avoid exposing restricted department or employee names in autocomplete suggestions.
- Support accessible keyboard navigation.

### Saved views

Support saved views when compatible with the current architecture:

- User-private views.
- Shared views for authorized teams, where supported.
- Default views.
- View name and description.
- Filters, sort order, grouping and visible columns.
- Role-aware access checks on every load.
- Owner, creation time and last-modified time.
- Edit, duplicate and delete permissions.
- Safe behavior if a saved filter references a department, user, workflow or field that no longer exists or is no longer accessible.

Do not store a saved view as a permanent authorization grant. Re-evaluate permissions at execution time.

---

## 12. Drill-Down and Navigation Requirements

Every actionable KPI and chart must have a defined drill-down contract.

Examples:

- Pending Approvals card → authorized pending approval register.
- Overdue Approvals card → overdue register with deadline and aging filters.
- SLA Breach chart → breached records and applicable SLA definition.
- Department backlog bar → department-level summary or permitted request register.
- Workflow bottleneck chart → workflow stages and relevant request instances.
- Automation failure chart → failure records, safe retry state and reconciliation status.
- Notification failure chart → delivery attempts and provider response where available.
- Integration failure chart → integration events and reconciliation history.
- Budget warning chart → authorized financial records and configured threshold.
- Data quality card → affected metric, missing field and documented limitation.
- Scheduled report failure card → report run history and authorized retry or correction action.

### Drill-down safeguards

1. Apply all active filters to the destination.
2. Preserve date range, timezone, grouping and sorting where meaningful.
3. Recalculate authorization on the server.
4. Mask sensitive fields.
5. Do not expose confidential record details from an aggregate chart.
6. Distinguish unique request counts from assignment or event counts.
7. Provide a clear path back to the originating dashboard.
8. Use pagination or virtualized tables for large result sets.
9. Display why a record is overdue, blocked or excluded.
10. Record privileged drill-down access where required by the existing audit policy.

---

## 13. Downloadable Reports and PDF Summaries

Reuse existing export utilities. Add new dependencies only when necessary.

### Supported formats

- CSV for structured data exports.
- XLSX for multi-sheet reports and formatted summaries, if supported by the existing stack.
- PDF for management summaries, request summaries and printable reports.
- Existing supported formats may be retained.

### Export requirements

- Server-side authorization and data scoping.
- Explicit reporting period and timezone.
- Applied filters and generation timestamp.
- Metric definitions or a reference to the metric dictionary.
- Data freshness indicator.
- Clear unavailable or incomplete metric labels.
- Safe filename generation.
- Appropriate output encoding.
- Pagination or streaming for large datasets.
- Reasonable row and file-size limits.
- Export audit logging.
- Protection against spreadsheet formula injection in CSV/XLSX.
- Protection of sensitive information in filenames and metadata.
- No unauthorized direct-file URL access.
- Temporary file cleanup and controlled download expiry, where applicable.

### PDF summary requirements

Where appropriate, include:

- Request identifier and title.
- Requester and authorized organizational details.
- Submission timestamp.
- Current status.
- Workflow stages and decisions.
- Relevant approval timestamps.
- Applicable deadlines and SLA status.
- Authorized comments and attachments list, where permitted.
- Amendment history where relevant.
- Generated timestamp and reporting timezone.
- Clear indication of missing historical data.
- Audit reference or verification information if supported.

Do not include private internal comments or confidential attachments in a requester-facing PDF unless policy explicitly permits them.

### Data export correctness

The exported data must match the report's filters, definitions, authorization scope and displayed aggregation.

Do not export a broader dataset than the current user is allowed to view. Do not rely solely on client-side filtering to enforce data access.

---

## 14. Scheduled Reports

Reuse the existing scheduler or job infrastructure.

### Required capabilities

- Create and edit a scheduled report.
- Select an authorized report and saved view.
- Configure date range or relative period.
- Select an approved delivery channel.
- Configure schedule frequency.
- Choose recipients permitted by policy.
- Enable, disable, pause or resume a schedule.
- View run history and delivery status.
- Show last successful run and next scheduled run.
- Handle failed executions and delivery failures.
- Prevent duplicate deliveries for the same logical scheduled run.
- Apply the current permission policy when executing.
- Record execution metadata and failures.

### Proposed schedule options

Support daily, weekly and monthly schedules where technically appropriate. Additional frequencies must reuse existing scheduler capabilities and should not be added if they create unnecessary operational risk.

### Scheduled report controls

- Validate recipients and report access at schedule creation and execution.
- Do not send reports to a recipient who no longer has permission.
- Define behavior when a schedule owner becomes inactive or loses access.
- Use the configured application timezone or an explicitly selected timezone.
- Handle daylight-saving transitions where relevant.
- Prevent overlapping executions or apply safe concurrency limits.
- Implement retry rules for transient failures.
- Do not retry permanent authorization or invalid-recipient failures indefinitely.
- Keep execution failure distinct from delivery failure.
- Record the report period and the actual data snapshot or generation time.
- Avoid sending sensitive report content through an unapproved channel.
- Apply retention rules to generated files and run logs.
- Support manual rerun only when it is safe and authorized.

### Scheduling UI states

Include:

- Draft.
- Enabled.
- Paused.
- Running.
- Completed.
- Completed with warnings.
- Failed.
- Delivery failed.
- Permission revoked.
- Disabled due to invalid configuration.

---

## 15. Alerts, Notifications and Escalation Analytics

Reuse the existing notification infrastructure. Do not create a competing notification engine without a demonstrated architectural need.

### 15.1 Alert catalogue

Provide configurable, authorized alerts for:

- New approval assignment.
- Approvals approaching a deadline.
- Overdue approval.
- SLA breach.
- Requester information required.
- Requester response overdue.
- Missing approver assignment.
- Workflow stuck beyond threshold.
- Automation failure.
- Retry exhaustion.
- Notification delivery failure.
- External integration failure.
- Integration reconciliation backlog.
- Duplicate indicator requiring review.
- Budget warning.
- Amendment requiring review.
- Scheduled report failure.
- Repeated analytics refresh failure.
- Data freshness threshold breach.
- Backup failure.
- Restore verification failure.
- Configuration promotion failure.
- Workflow migration failure.
- Retention job failure.
- Legal-hold exception.
- Security or authorization alert, where permitted.

### 15.2 Alert configuration

Support, where compatible with the current design:

- Alert type.
- Severity.
- Threshold.
- Relevant workflow, department or business unit.
- Eligible recipients or role-based audiences.
- Notification channel.
- Frequency and quiet hours.
- Escalation rule.
- Deduplication window.
- Enable/disable controls.
- Last triggered timestamp.
- Delivery status and error reason.
- Acknowledgement state, where meaningful.
- Safe retry behavior.

Do not expose platform-wide security alerts to ordinary requesters or unrelated approvers.

### 15.3 Alert quality controls

- Prevent alert storms through deduplication and rate limiting.
- Do not repeatedly notify about the same unchanged condition without an explicit policy.
- Distinguish a condition being detected from a notification being successfully delivered.
- Distinguish an alert being acknowledged from the underlying issue being resolved.
- Maintain a clear event history.
- Use idempotency for alert generation.
- Avoid duplicate alerts during retries or job restarts.
- Respect quiet hours and escalation policies.
- Ensure escalation cannot bypass approval authority or workflow order.

### 15.4 Retry and resend controls

Provide a **Retry**, **Resend** or **Reprocess** action wherever it is safe, applicable and necessary.

Before enabling the action, classify the operation:

- Safe to retry idempotently.
- Retryable only after reconciliation.
- Requires correction before retry.
- Unsafe to retry automatically.
- Manual recovery or authorization required.

For notifications, retry delivery without creating a duplicate business decision. For integrations, check transaction references and remote state before resubmitting. For report generation, use a unique logical run identifier. For workflow automation, verify the current workflow state before repeating the action.

Never expose a retry button that can duplicate an approval, payment, ERP transaction, workflow transition or other non-idempotent business operation.

---

## 16. Metric Dictionary and Calculation Governance

Create a central metric dictionary and make every implemented metric traceable to it.

Each definition must contain:

- Metric identifier.
- Display name.
- Business purpose.
- Formula.
- Numerator.
- Denominator.
- Data sources.
- Required fields.
- Event or date field used.
- Timezone.
- Calendar-time or business-time semantics.
- Record scope.
- Exclusions.
- Treatment of cancellations and withdrawals.
- Treatment of parallel approvals.
- Treatment of resubmissions and amendments.
- Treatment of paused workflows.
- Missing-data behavior.
- Minimum sample requirements, where applicable.
- Refresh frequency.
- Known limitations.
- Owning business rule or policy.
- Test cases.

### 16.1 Required metric definitions

Define at minimum:

**Total Requests**

Count of unique request records within the selected scope and reporting period, using the explicitly selected date field.

**Submitted Requests**

Count of unique requests with a valid submission event during the reporting period. Do not count unsent drafts as submitted.

**Pending Requests**

Count of unique nonterminal requests whose workflow has an outstanding requirement under the workflow engine's semantics.

**Pending Approvals**

Count of outstanding approval obligations according to the selected view. State whether the metric counts unique requests, approval assignments or approval-group obligations.

**Overdue Requests**

Count of unique requests for which an applicable request-level deadline has passed, based on a valid configured rule.

**Overdue Approvals**

Count of outstanding approval obligations whose applicable deadline has passed.

**SLA Attainment Rate**

Define the population and completion criteria before calculating. For example:

Completed eligible items meeting the applicable SLA divided by all completed eligible items with sufficient SLA and timestamp data.

Display the numerator, denominator, exclusions and reporting period. Do not mix unresolved current items into a completed-item denominator unless the selected metric explicitly measures current SLA compliance.

**SLA Breach Rate**

Define whether this refers to completed eligible items that breached SLA or all eligible items that have breached SLA by the reporting cutoff. Do not combine these interpretations into one unlabeled metric.

**First-Pass Approval Rate**

Define the denominator as eligible requests reaching the specified outcome and the numerator as those approved without a qualifying return, correction or resubmission event. If historical resubmission data is incomplete, report the metric as unavailable or qualified.

**Rework Rate**

Define a rework event, including which return, correction or resubmission events count. Avoid treating every comment as rework.

**Rejection Rate**

Define the eligible population and the relevant rejection event. Do not assume rejected requests are equivalent to all requests not approved.

**Withdrawal Rate**

Count eligible requests withdrawn by an authorized actor during the reporting period, using a reliable withdrawal event.

**Average Turnaround**

Calculate the average elapsed or business duration between explicitly defined start and end events. State the selected duration type and exclusions.

**Median Turnaround**

Use the same eligible population and start/end definitions as the corresponding average.

**Stage Duration**

Calculate time between reliable stage-entry and stage-exit events. Define behavior for reopened or repeated stages.

**Pending Age**

Calculate from the defined pending-start event to the reporting cutoff. Distinguish request age from current-stage or assignment age.

**Overdue Age**

Calculate from the applicable deadline to the reporting cutoff for outstanding items. For completed late items, calculate the interval between the deadline and completion event if both are available.

**Automation Success Rate**

Define whether the unit is unique logical executions or individual attempts. Prefer a logical-operation denominator for business outcomes, with attempt-level reliability shown separately.

**Notification Delivery Success Rate**

Use authoritative delivery status or provider receipts where available. A message being queued or submitted is not proof that it was delivered or read.

**Retry Recovery Rate**

Define a failed logical operation as recovered only when the intended outcome is verified, not merely when a retry returns success.

**Duplicate Rate**

Distinguish suspected duplicates from confirmed duplicates. Define the matching rule and eligible population.

**Budget Utilization**

Calculate only when the approved budget period, amount, currency and commitment or expenditure definitions are known.

### 16.2 Missing data and historical limitations

Apply these rules globally:

- Missing value is not zero.
- Missing timestamp is not an inferred timestamp.
- Missing SLA policy is not an implicit zero-hour or default SLA.
- Missing completion event prevents reliable calculation of completion-based timeliness.
- Missing due date prevents reliable calculation of due-date compliance.
- Missing delivery receipt prevents a claim that the notification was delivered.
- Missing integration response prevents a claim that an external transaction succeeded.
- Missing historical stage events prevent exact stage-duration reconstruction.
- Missing department or HOD mapping prevents reliable organizational attribution.
- Incomplete duplicate history prevents reliable confirmed-duplicate reporting.
- Incomplete financial data prevents reliable budget utilization or actual-spend reporting.

Use explicit states such as:

- Available.
- Partial Data.
- Insufficient Evidence.
- Not Configured.
- Not Applicable.
- Unavailable.
- Stale.

Where practical, display data coverage, such as the number of eligible records with complete data out of the total eligible population.

Never display an unreliable percentage as a definitive business KPI.

---

## 17. Date, Timezone and Reporting-Period Semantics

Implement consistent date handling across dashboards, APIs, reports, exports, scheduled jobs and alerts.

### Requirements

1. Identify the application's authoritative timezone configuration.
2. Use the user's selected timezone where the product supports it, without changing stored event timestamps.
3. Store and process event timestamps consistently using the existing database conventions.
4. Convert timestamps for display and reporting according to an explicit timezone rule.
5. Label the timezone in dashboards, reports and exported files.
6. Define inclusive start and exclusive end boundaries for date-range queries where appropriate.
7. Avoid ambiguous local-time boundaries and off-by-one errors.
8. Define how a request crossing midnight is assigned to a reporting day.
9. Distinguish submission date, approval date, completion date, due date and stage-entry date.
10. Support financial-year reporting according to the application's configured financial calendar.
11. Define whether period filters use event time, record creation time or the latest state.
12. Handle daylight-saving changes if any configured timezone requires them.
13. Ensure scheduled reports execute at the intended local time.
14. Document behavior when historical records contain naive or inconsistent timestamps.
15. Never silently rewrite historical timestamps to fit a new reporting rule.

### Reporting date field

Every report must state its date basis, for example:

- Submitted during period.
- Completed during period.
- Due during period.
- Decision made during period.
- Entered current stage during period.
- Automation failed during period.
- Notification delivery failed during period.

A report filtered by completion date must not silently include items merely because they were created in the selected period.

---

## 18. Backend, API and Database Implications

Determine the minimal safe changes required by the audit. Do not impose a new architecture if the current application can support the requirements.

### 18.1 Backend services

Implement or extend reusable services for:

- Metric definitions and calculation.
- Role-aware analytics queries.
- Pending and overdue classification.
- SLA calculations.
- Date and timezone normalization.
- Trend and comparison calculations.
- Department and approver aggregation.
- Chart data preparation.
- Report generation and export.
- Saved views and filters.
- Scheduled report execution.
- Alert evaluation and deduplication.
- Analytics data freshness.
- Data quality and metric coverage.
- Operational reliability reporting.

Avoid duplicating metric logic independently across multiple frontend components. Centralize authoritative calculations where practical.

### 18.2 API design

Follow existing API conventions. Define endpoints or equivalent service contracts for:

- Dashboard summary.
- Role-specific KPI cards.
- Chart series and breakdowns.
- Pending and overdue registers.
- SLA and aging summaries.
- Filter metadata.
- Drill-down and paginated detail lists.
- Report catalog and report execution.
- Export creation and secure download.
- Saved-view CRUD operations.
- Scheduled-report configuration and run history.
- Alert configuration and delivery history.
- Analytics data freshness and quality status.

For every endpoint, document:

- Authentication and authorization.
- Accepted filters.
- Default and maximum date range.
- Pagination and sorting.
- Response schema.
- Metric definitions.
- Error responses.
- Rate and resource limits.
- Data freshness.
- Audit requirements.

Validate filters and sorting server-side. Use allowlists for sort columns and report fields.

Do not permit arbitrary SQL, unbounded queries, unrestricted field selection or unauthorized aggregation through user-supplied parameters.

### 18.3 Database and schema

Prefer existing reliable event, request, assignment, SLA, audit and notification tables.

Only introduce schema changes when the audit demonstrates that they are necessary. Any schema changes must be documented, reviewed, tested and backward-compatible.

Potential additions, if genuinely required, include:

- Saved analytics views.
- Report definitions and configurations.
- Scheduled report definitions.
- Report execution history.
- Export job metadata.
- Alert rules and alert history.
- Analytics refresh metadata.
- Data quality exception records.
- Additional indexed event fields required for reliable queries.
- Authoritative event history where no existing record captures a necessary event.

Do not create duplicate tables for data already represented reliably by the current architecture.

### 18.4 Schema migration safeguards

- Use the project's existing migration framework.
- Prefer additive changes.
- Define rollback or recovery procedures.
- Preserve historical records.
- Avoid locking large tables unnecessarily.
- Test migrations against a representative nonproduction dataset.
- Do not drop or rename existing columns without explicit approval.
- Do not backfill historical values with guesses.
- Include a documented plan for data retention and cleanup.
- Obtain explicit authorization before destructive or production migration operations.

### 18.5 Query and aggregation design

- Use database-side aggregation for large datasets where appropriate.
- Avoid N+1 queries.
- Add or adjust indexes only after reviewing query plans and write impact.
- Use pagination for detail lists.
- Bound default date ranges.
- Cache expensive aggregates only when safe and consistent with authorization.
- Invalidate or refresh caches after relevant state transitions.
- Scope caches by authorization context and filter set.
- Never allow one user's cached results to leak to another user.
- Consider asynchronous report generation for large exports.
- Use transactions and consistent snapshots where needed to prevent contradictory report results.
- Avoid long-running dashboard requests that compete with approval transactions.
- Document expected freshness and any eventual consistency.

### 18.6 Optional analytics materialization

Introduce summary tables, pre-aggregations or a dedicated analytics store only if profiling demonstrates that direct queries cannot meet acceptable performance targets.

Before implementing materialization, document:

- The bottleneck being solved.
- Source-of-truth tables.
- Refresh strategy.
- Freshness target.
- Late-arriving event behavior.
- Correction and reconciliation logic.
- Failure recovery.
- Access-control implications.
- Operational cost and monitoring.
- Rollback approach.

The primary approval system remains authoritative for workflow state and decisions.

---

## 19. Frontend, UX and Accessibility

Use the existing application styling, navigation, responsive layout and component patterns.

### 19.1 Dashboard layout

- Prioritize the most actionable KPIs at the top.
- Group cards by status, workload, SLA and outcomes.
- Separate personal metrics from organizational metrics.
- Provide consistent chart legends, units and labels.
- Avoid unnecessary visual density.
- Allow sensible responsive reflow on mobile.
- Preserve table usability on smaller screens.
- Keep pending, overdue and SLA-breached counts visually distinct.
- Use clear labels for unique requests versus approval assignments.
- Provide chart descriptions or accessible data-table alternatives.

### 19.2 Required UI states

Every dashboard, chart, card, report and asynchronous operation must handle:

1. Loading.
2. Successful data.
3. Empty result.
4. Partial data.
5. Stale data.
6. Unavailable metric.
7. Permission denied.
8. Session expired or unauthorized.
9. Network or API error.
10. Invalid filter.
11. Export in progress.
12. Export completed.
13. Export failed.
14. Scheduled report running.
15. Scheduled report completed with warnings.
16. Scheduled report failed.
17. Notification delivery pending.
18. Notification delivery failed.
19. Retry in progress.
20. Retry succeeded.
21. Retry failed.
22. Configuration missing.
23. Data-quality exception.

Do not display a blank chart without an explanation. Do not show a success state before the server confirms success.

### 19.3 Responsive and accessible design

- Support desktop, tablet and mobile layouts.
- Use semantic headings and labels.
- Support keyboard navigation.
- Ensure focus visibility.
- Provide screen-reader descriptions for cards and charts.
- Avoid color-only status indicators.
- Use readable number formats and units.
- Ensure tables and controls remain operable at small screen widths.
- Respect the existing theme and system-preference behavior.
- Preserve manual theme overrides if the current application supports them.

### 19.4 Drill-down interaction

- Make clickable cards and chart elements visibly interactive.
- Provide clear destination titles.
- Preserve filter context.
- Avoid unintended navigation when selecting chart legends or tooltips.
- Show the selected reporting period and timezone.
- Provide an accessible tabular representation when visual charts are difficult to interpret.

---

## 20. Security, Privacy and Auditability

Analytics can expose more data than individual approval screens. Apply explicit safeguards.

### Security requirements

- Server-side authorization on every query and export.
- Record-level and field-level access enforcement.
- Least-privilege access.
- Secure export storage and download links.
- Expiring download access where supported.
- Protection against insecure direct-object references.
- Protection against injection in filters, sorting and exports.
- Rate limiting for expensive queries and report generation.
- No secrets or tokens in analytics payloads or logs.
- Safe handling of personal, financial and confidential data.
- Current permission checks for scheduled report recipients.
- Audit logging for privileged exports and configuration changes.
- Safe error messages without exposing stack traces or sensitive values.

### Audit events

Record relevant events, including:

- Report definition created or changed.
- Scheduled report created, modified, paused or disabled.
- Export requested and completed.
- Privileged report accessed.
- Alert configuration changed.
- Manual retry or reconciliation initiated.
- Workflow analytics configuration changed.
- Sensitive access denied.
- Retention or legal-hold settings changed.
- Metric definition or calculation configuration changed.

Use the existing audit infrastructure and retention policy. Do not create an unaudited parallel administrative path.

---

## 21. Performance and Reliability Requirements

Define measurable targets after inspecting the application's current workload, database size, hosting constraints and performance baseline.

Use the following as initial engineering targets, subject to measured feasibility:

- Cached or lightweight dashboard summary: p95 within 3 seconds.
- Standard filtered dashboard queries: p95 within 5 seconds.
- Standard report queries: p95 within 10 seconds for a documented bounded dataset.
- Large exports: background generation with progress and completion status.
- No unbounded full-table scan triggered by a normal dashboard load.
- No significant degradation of approval submission or decision transactions.
- No duplicate scheduled report deliveries from concurrent or retried jobs.
- No duplicate business operations caused by retry controls.
- Clear data freshness indicators for asynchronous calculations.

If existing infrastructure cannot meet a target, measure and document the gap. Do not conceal the performance issue or introduce unsafe database load to meet a cosmetic dashboard refresh requirement.

### Reliability controls

- Bounded query windows.
- Pagination and export limits.
- Query timeouts where appropriate.
- Retry with backoff for transient failures.
- Idempotent scheduled execution.
- Job concurrency controls.
- Error monitoring.
- Freshness monitoring.
- Safe cache invalidation.
- Graceful degradation when a noncritical analytics service fails.
- Separation of analytics failures from approval transaction failures.

Analytics unavailability must not prevent the core approval workflow from functioning.

---

## 22. Automated Testing Strategy

Build automated tests using the repository's existing testing framework. Add the minimum additional tooling required.

### 22.1 Unit tests

Test:

- Every metric formula.
- Numerator and denominator behavior.
- Pending versus overdue classification.
- SLA threshold boundaries.
- Aging bucket boundaries.
- Date-range inclusivity and exclusivity.
- Timezone conversions.
- Financial-year boundaries.
- Calendar-time versus business-time calculations.
- Missing timestamps.
- Missing due dates.
- Missing SLA configuration.
- Zero denominators.
- Empty datasets.
- Partial historical data.
- Withdrawn and cancelled request treatment.
- Resubmission and rework definitions.
- Parallel approval semantics.
- Any-One and Any-N-of-M semantics.
- Assignment counts versus unique request counts.
- Retry and recovery calculations.
- Notification delivery status calculations.
- Currency handling.
- Duplicate detection status.
- Comparison period calculations.
- Data freshness calculations.

### 22.2 API and integration tests

Test:

- Authorized access to each role's dashboard.
- Unauthorized cross-department access.
- Record-level authorization.
- Field-level masking.
- Filter validation.
- Pagination and sorting.
- Drill-down consistency.
- Export authorization.
- Saved-view permissions.
- Scheduled report execution.
- Permission revocation before execution.
- Notification and delivery history.
- Retry idempotency.
- Integration reconciliation.
- Analytics freshness and partial-data behavior.
- API failure and timeout behavior.
- Audit-event creation.

### 22.3 Frontend tests

Test:

- Correct role-specific dashboards.
- KPI values and labels.
- Chart values and legends.
- Filters and filter chips.
- Empty and loading states.
- Error and partial-data states.
- Responsive layouts.
- Accessible chart alternatives.
- Drill-down behavior.
- Saved-view interactions.
- Export progress and completion.
- Scheduled report management.
- Alert configuration.
- Retry and resend controls.
- Clear differentiation between pending, overdue and breached states.
- Correct display of missing data and unavailable metrics.

### 22.4 End-to-end tests

Test the full lifecycle:

1. Requester creates and submits a request.
2. Dashboard reflects the submission accurately.
3. Approval assignment appears in the authorized approver's queue.
4. Pending counts update correctly.
5. Due-date and SLA classifications behave correctly.
6. Approver completes the action.
7. Request and assignment counts update without double-counting.
8. Decision and stage-duration analytics update according to the documented refresh model.
9. Requester sees the authorized outcome.
10. Reports and exports reflect the same definitions.
11. Scheduled reports generate and deliver correctly.
12. Notification failures are represented accurately.
13. Retry controls do not duplicate decisions or external transactions.
14. Role or department permission changes restrict future access.
15. Audit events are recorded.

### 22.5 Workflow-specific tests

Include scenarios for:

- Sequential approvals.
- Parallel approvals.
- Any-One approval.
- Any-One Sequence.
- Selected Parallel.
- Any-N-of-M.
- Hybrid/custom workflows.
- Rejection.
- Return for correction.
- Resubmission.
- Withdrawal.
- Cancellation.
- Delegation.
- Reassignment.
- Absence handling.
- Missing approver assignment.
- Paused workflows.
- Reopened or repeated stages, where supported.
- Workflow version changes.
- Automation failure and recovery.
- Integration failure and reconciliation.

### 22.6 Performance and security tests

Test:

- Large request volumes.
- Large date ranges within configured limits.
- Concurrent dashboard access.
- Concurrent scheduled reports.
- Export memory and resource limits.
- Query plan and index effectiveness.
- Authorization bypass attempts.
- IDOR-style access attempts.
- Malicious filter and sorting values.
- Spreadsheet formula injection.
- Expired export links.
- Permission changes during scheduled reporting.
- Cache isolation between users and roles.
- Duplicate job execution and retry behavior.
- Graceful degradation during analytics-service failures.

### 22.7 Regression tests

Run existing tests for:

- Authentication.
- Authorization.
- Request submission.
- Approval transitions.
- Workflow branching.
- DoA rules.
- Delegation.
- Notifications.
- Attachments.
- Comments.
- Audit logging.
- ERP and external integrations.
- Existing dashboards and exports.

Fix regressions caused by this implementation. Do not silently modify unrelated functionality to make the analytics tests pass.

---

## 23. Acceptance Criteria

The implementation is accepted only when the relevant criteria below are verified.

### AC-01: Audit and reuse

- The audit document and repository have been inspected.
- Existing functionality has been classified as working, defective, missing or data-limited.
- Existing components and services are reused where appropriate.
- Architecture changes are justified and documented.

### AC-02: Role-based dashboards

- Requester, Approver, Admin and Super Admin have the correct authorized views.
- Dashboard visibility is enforced server-side.
- Users cannot access unauthorized records through direct API requests.

### AC-03: KPI correctness

- Every implemented KPI has a documented definition.
- KPI values reconcile with an independently verified test dataset.
- Unique requests, assignments, stage obligations and events are not confused.
- Missing values are not represented as zero.
- Unsupported metrics are explicitly marked unavailable.

### AC-04: Pending and overdue distinction

- Pending does not automatically mean overdue.
- Overdue requires a valid applicable deadline.
- SLA-breached status is separately defined.
- Blocked, unassigned, stuck and awaiting-requester states remain distinguishable.
- Parallel and hybrid workflows follow the actual engine semantics.

### AC-05: Charts and comparisons

- Every chart has an appropriate visualization, correct units and defined filters.
- Period comparisons use compatible populations and date semantics.
- Zero denominators and insufficient samples are handled correctly.
- Drill-down results match the chart's scope and authorization.

### AC-06: Conditional formatting

- Status formatting follows consistent semantic rules.
- Text and icons accompany color.
- Missing and stale data are visibly distinguished from healthy values.
- Risk states are not communicated by color alone.

### AC-07: Reports and exports

- Required role-appropriate reports are available or documented as blocked by genuine data gaps.
- Exported records match displayed filters and authorization.
- CSV/XLSX output is protected against formula injection.
- PDF summaries do not leak unauthorized comments or attachments.
- Exports identify reporting period, timezone and generation time.

### AC-08: Scheduled reports and alerts

- Authorized users can configure supported schedules.
- Execution and delivery failures are distinguishable.
- Duplicate scheduled deliveries are prevented.
- Alert rules respect authorization, rate limits and deduplication.
- Retry actions use safe, idempotent behavior.

### AC-09: Date and timezone semantics

- Date boundaries are tested.
- Reports use the documented date field.
- Timezones are explicitly identified.
- Historical timestamps are not fabricated or silently rewritten.

### AC-10: Security and audit

- Role, record and field restrictions are enforced server-side.
- Privileged operations are auditable.
- Export access is protected.
- Saved views do not bypass permissions.
- Scheduled reports re-evaluate permissions at execution time.

### AC-11: Performance and reliability

- Performance is measured against the documented baseline and targets.
- Large queries and exports are bounded.
- Analytics failures do not interrupt core approval transactions.
- Cache and retry behavior are tested.

### AC-12: Quality verification

- Relevant unit, integration, frontend, end-to-end, security and regression tests pass.
- Any unpassed test is listed with evidence and reason.
- No test is falsely marked passed.
- No critical or high-severity in-scope defect is left undisclosed.

### AC-13: Documentation and handover

- Metric dictionary is complete for implemented metrics.
- Data gaps and limitations are documented.
- API and schema changes are documented.
- Test evidence and implementation report are available.
- Deployment and rollback guidance is prepared.
- No production deployment has occurred without explicit authorization.

---

## 24. Phased Implementation Plan

Implement in the following sequence, adapting to the actual repository while preserving the required deliverables.

### Phase 0 — Discovery and Baseline

- Read `APPLICATION_CURRENT_STATE_AUDIT.md`.
- Inspect the repository and relevant data models.
- Map existing dashboards, APIs, roles, workflow events, SLA fields, notification services and schedulers.
- Identify reliable metrics and unavailable data.
- Establish current test and performance baselines.
- Produce the audit, metric dictionary outline, implementation plan and data-gap register.

**Exit gate:** architecture and data-source assumptions are verified, and high-risk changes are identified.

### Phase 1 — Metric and Authorization Foundation

- Define canonical metric semantics.
- Implement or extend role-aware analytics services.
- Implement correct pending, overdue, SLA and aging classification.
- Implement date-range and timezone rules.
- Add data quality and freshness indicators.
- Add unit and API tests.

**Exit gate:** core metrics reconcile against known test data and authorization tests pass.

### Phase 2 — Core Role Dashboards

- Implement Requester dashboard.
- Implement Approver dashboard.
- Implement Admin dashboard.
- Implement Super Admin dashboard.
- Add KPI cards, status summaries, essential charts and consistent filters.
- Implement empty, loading, unavailable and error states.
- Add drill-down to authorized registers.

**Exit gate:** all role dashboards work with correct scope and validated values.

### Phase 3 — Operational and Advanced Analytics

- Add aging and SLA analytics.
- Add workflow bottleneck and turnaround analytics.
- Add department, employee and approver comparisons.
- Add automation, notification and integration reliability charts.
- Add supported financial analytics.
- Add advanced charts only where data quality and use case justify them.

**Exit gate:** each metric has a verified formula, source and tested drill-down behavior.

### Phase 4 — Reports and Exports

- Implement the report catalogue.
- Add supported CSV/XLSX/PDF exports.
- Add secure report generation and download.
- Add export audit logging and output validation.
- Test large-report behavior and spreadsheet security.

**Exit gate:** exported data matches authorized report results.

### Phase 5 — Saved Views, Scheduling and Alerts

- Implement saved views.
- Implement scheduled reports and run history.
- Implement notification and alert rules.
- Add delivery tracking and safe retry controls.
- Implement deduplication, rate limits and permission revalidation.

**Exit gate:** schedules and alerts execute reliably without duplicate business actions or unauthorized delivery.

### Phase 6 — Performance, Security and Full Regression

- Profile representative dashboard queries.
- Optimize only demonstrated bottlenecks.
- Test large datasets and concurrent jobs.
- Perform authorization and export-security tests.
- Run end-to-end and full regression tests.
- Verify recovery behavior for failed jobs.

**Exit gate:** acceptance criteria are met, and remaining limitations are explicitly documented.

### Phase 7 — Documentation and Go-Live Readiness

- Finalize the metric dictionary.
- Finalize data-gap and limitation documentation.
- Record test evidence.
- Prepare migration, backup, rollback and monitoring instructions.
- Prepare a deployment checklist.
- Present unresolved issues and required approvals.

**Exit gate:** implementation is ready for authorized review. Deployment requires separate explicit approval.

---

## 25. Claude Code Execution Instructions

Execute this addendum as part of the existing master implementation prompt.

### Step 1: Inspect before editing

Read the audit document and relevant repository files. Confirm the existing technology stack, data models, permissions, workflow semantics, tests and integrations. Do not assume file paths, APIs, tables, fields or libraries without verifying them.

### Step 2: Prepare a traceable plan

Map each requirement to:

- Existing capability.
- Planned change.
- Source data.
- Permission rule.
- Test.
- Acceptance criterion.
- Dependency or blocker.

Identify which metrics can be implemented immediately and which require approved schema, policy or instrumentation changes.

### Step 3: Implement incrementally

Use the phases in this addendum. Prefer small, reviewable changes. Reuse working capabilities. Preserve existing workflows and backward compatibility.

### Step 4: Validate every metric

Use known test fixtures or controlled nonproduction records to independently verify calculations. Compare unique request counts, assignment counts, stage counts and event counts separately.

Never use plausible-looking output as evidence of correctness.

### Step 5: Validate the user experience

Test every role's dashboard, filters, drill-downs, exports, saved views, scheduled reports, alert delivery states and retry controls.

### Step 6: Run regression and security tests

Run existing and new tests. Investigate failures, correct in-scope defects and rerun relevant tests. Do not suppress failures or weaken assertions to obtain a passing result.

### Step 7: Verify safe recovery

For every automation or report failure with a retry action, verify idempotency, duplicate prevention, reconciliation and authorization. A successful retry must be based on a verified intended outcome.

### Step 8: Produce a final implementation report

Provide:

1. Executive summary.
2. Audit findings.
3. Features implemented.
4. Features reused.
5. Features corrected.
6. Files and modules changed.
7. Database migrations and configuration changes.
8. APIs added or modified.
9. Metric dictionary and calculation rules.
10. Role and authorization matrix.
11. Tests executed and actual results.
12. Performance results and known limitations.
13. Metrics unavailable because source data is missing.
14. Security and audit verification.
15. Remaining defects and blockers.
16. Rollback and recovery instructions.
17. Deployment checklist.
18. Explicit statement confirming whether production deployment occurred. It must remain **not deployed** unless separately authorized.

### Non-negotiable final rules

- Do not replace the existing approval architecture.
- Do not change approval rules merely to simplify analytics.
- Do not fabricate unavailable metrics.
- Do not confuse pending with overdue.
- Do not expose unauthorized data through aggregation, charts, exports or scheduled delivery.
- Do not count individual approval assignments as unique requests without explicitly labeling the metric.
- Do not claim notifications were delivered without delivery evidence.
- Do not claim an external operation succeeded without verified outcome or reconciliation.
- Do not create duplicate business operations through retry.
- Do not perform destructive operations or production deployment without explicit authorization.
- Do not mark acceptance criteria as passed without test evidence.

**Definition of done:** The analytics capability is integrated into the existing ARS Approval Platform, all implemented metrics are documented and verified, role permissions are enforced, dashboards and reports handle missing data honestly, pending and overdue states are correctly separated, delivery and retry behavior is safe, regression tests pass, and all remaining limitations are documented before go-live approval.

---

## Addendum B — Enterprise Reliability, Governance, Recovery and Advanced Business Functions

ADDENDUM — ENTERPRISE RELIABILITY, GOVERNANCE, RECOVERY AND OPERATIONAL READINESS

Extend the existing implementation scope to include the following capabilities wherever the repository audit establishes that they are missing, incomplete, or defective.

Do not duplicate functionality that already exists and works correctly. Verify each capability against the current implementation, tests, and configuration before modifying it.

A. Workflow Integrity and Recovery

- Implement or strengthen a canonical, server-enforced workflow state machine.
- Validate all supported workflow patterns, including Sequential, Parallel, Any-One, Any-One Sequence, Selected Parallel, Any-N-of-M, and Custom/Hybrid workflows where supported by the existing application.
- Validate conditional branches, rejection paths, resubmission paths, reopening rules, cancellation, recall, and parallel completion criteria.
- Detect stuck, orphaned, duplicated, and inconsistent approval steps.
- Provide authorized administrative recovery tools with a preview, reason, confirmation, and immutable audit event.
- Never repair a workflow by silently changing its historical approval decisions.
- Make recovery operations idempotent and safe to retry.
- Add reconciliation checks for persisted workflow state versus pending assignments and completed decisions.

B. Separation of Duties and Authorization

- Enforce configurable self-approval restrictions and conflict-of-interest rules.
- Validate requester, approver, delegate, consultant, watcher, and administrator permissions independently.
- Prevent unauthorized delegation, privilege escalation, circular delegation, and approval by ineligible users.
- Revalidate permissions and workflow state on the server at the time of every consequential action.
- Audit privileged changes, account suspension, permission modifications, and administrative overrides.
- Review password-reset and session-recovery flows for token leakage, replay, and account enumeration.
- Do not expose sensitive reset tokens or credentials in API responses, logs, or error reports.

C. Immutable History and Version Integrity

- Preserve request snapshots, workflow versions, decision history, and relevant configuration versions.
- Record the actor, action, timestamp, request identifier, workflow version, and relevant before/after values for important changes.
- Preserve historical decisions when forms, templates, roles, or workflow definitions change.
- Ensure authorized administrators cannot silently rewrite committed approval history.
- Provide a reliable method for reconstructing the approval path of a completed request.
- Test audit integrity across resubmission, recall, delegation, reassignment, migration, and recovery operations.

D. Monitoring and Operational Health

- Add or improve monitoring for application availability, error rates, background workers, scheduled jobs, notification delivery, integration failures, and workflow backlogs.
- Detect missed scheduled-job executions and alert the appropriate IT personnel.
- Track failed, delayed, retried, and completed background jobs.
- Provide correlation IDs for tracing requests across APIs, jobs, and notification services.
- Add health checks and readiness checks appropriate to the actual deployment architecture.
- Protect operational dashboards and diagnostic details with appropriate permissions.
- Avoid exposing secrets or sensitive business data in telemetry.

E. Backup and Disaster Recovery

- Audit existing backup and recovery mechanisms.
- Verify backup completion, integrity, retention, and access controls.
- Define recovery time and recovery point objectives with the appropriate business and IT stakeholders.
- Document restoration procedures for the database, workflow definitions, relevant audit records, and attachments.
- Test restoration in a non-production environment.
- Verify that restored records, relationships, files, and workflow histories are consistent.
- Document backup failures, recovery limitations, and required manual intervention.
- Never overwrite existing backups or run destructive recovery procedures without authorization.

F. SLA, Escalation, and Workload Management

- Support configurable SLA policies, reminders, and escalation rules.
- Use applicable plant or department working calendars where configured.
- Support escalation to authorized substitutes or management roles without bypassing approval rules.
- Provide workload visibility and safe workload balancing.
- Detect overdue requests, unassigned approval steps, and unavailable approvers.
- Avoid circular escalation and duplicate reminders.
- Record the reason, source, destination, timestamp, and result of each escalation or reassignment.
- Preserve the distinction between operational reminders and actual workflow-state transitions.

G. Notification and Integration Reliability

- Reuse the existing notification infrastructure.
- Implement safe retries, exponential backoff, idempotency, and failure handling where needed.
- Use durable job or outbox patterns when appropriate to prevent lost notifications after successful database transactions.
- Reconcile notification records with provider results where the provider exposes delivery information.
- Distinguish queued, sent, delivered, failed, and read statuses only when supported by actual evidence.
- Monitor recurring jobs and integration health.
- Prevent duplicate approval actions caused by repeated callbacks or retries.
- Keep email/WhatsApp approval by reply disabled until explicit business and security approval.

H. Reporting and Data Quality

- Validate analytics calculations against authoritative request and approval records.
- Define metric formulas, date boundaries, timezone rules, and handling of incomplete records.
- Identify missing or unreliable source data instead of inventing values.
- Provide authorized exports and downloadable approval summaries.
- Prevent unauthorized users from exporting restricted requests.
- Log sensitive administrative exports where appropriate.
- Keep reporting aggregation efficient and avoid exposing unnecessary personal or confidential information.

I. Controlled Release and Recovery

- Use feature flags or equivalent configuration controls where appropriate.
- Support gradual rollout to authorized test groups before organization-wide enablement.
- Separate development, test, and production configuration.
- Document rollback procedures for code, configuration, and database changes.
- Preserve historical records when disabling or rolling back a feature.
- Do not use feature flags as a substitute for server-side authorization.
- Do not deploy to production without explicit authorization.

J. Extended Edge-Case and Resilience Testing

Add tests for:

- Concurrent approvals and conflicting decisions.
- Duplicate submissions and duplicate background-job execution.
- Worker crashes and retry recovery.
- Inactive users and changing permissions during an active request.
- Workflow changes while requests using earlier versions remain active.
- Missing or stale budget information.
- Notification provider outages.
- Partial bulk-reassignment failures.
- Autosave failure and session expiry.
- Database migration and restoration.
- Unauthorized search results, file access, and report exports.
- Invalid workflow transitions and recovery from inconsistent states.

For every new control, include acceptance criteria, appropriate automated tests, audit requirements, operational monitoring, and documented failure behaviour.

K. Additional Completion Gate

Do not mark the application ready for UAT until the applicable critical workflow, authorization, data-integrity, and recovery tests pass.

Report all unresolved critical defects, security findings, unverified backups, missing operational dependencies, and policy decisions.

Distinguish verified completion from partial implementation, blocked work, and untested functionality.

Production readiness must be assessed using evidence, not visual appearance or a successful build alone.

ADDENDUM: ARS APPROVAL PLATFORM — ADVANCED BUSINESS FUNCTIONS, AUTOMATION RECOVERY AND GOVERNANCE

1\. Objective

Extend the existing ARS Approval Platform master implementation scope with the following capabilities:

1. Submission Readiness Checker.
2. Stuck-Request Detection.
3. Duplicate Request Detection.
4. Smart Form Autofill.
5. Approved-Request Amendment.
6. Department Scorecards.
7. Workflow Migration Assistant.
8. Safe Workflow Replay.
9. Configuration Promotion.
10. Retention and Legal Hold.
11. Centralized Failed Automation Recovery with Resend/Retry controls.

This addendum supplements the existing master prompt. It does not replace its UI modernization, approval-engine enhancements, security requirements, testing requirements, or phased implementation strategy.

The implementation priority is balanced across business productivity, workflow reliability, administrative control, and data governance.

2\. Mandatory Implementation Rules

Before implementing any of these functions:

- Read `APPLICATION_CURRENT_STATE_AUDIT.md` and inspect the actual repository.
- Identify existing implementations, API endpoints, database tables, background jobs, schedulers, automation mechanisms, and notification services.
- Reuse existing working components, services, job queues, audit logs, permission systems, and design patterns.
- Distinguish missing features from existing defects and partially implemented functionality.
- Do not create duplicate implementations of existing capabilities.
- Preserve existing workflow semantics, API contracts, data relationships, and historical approval records.
- Use the existing framework, database, testing tools, and architectural conventions wherever practical.
- Record necessary database, API, permission, UI, and background-processing changes before implementing them.
- Implement in small, independently testable phases.
- Do not deploy to production or execute destructive production operations without explicit authorization.

If an integration or policy decision is missing, implement the safe independent portions and document the blocker. Do not simulate a successful integration using hard-coded data.

FUNCTION 1 — SUBMISSION READINESS CHECKER

3\. Purpose

Provide requesters with a comprehensive validation step before they submit a request for approval.

The checker must identify missing information, invalid values, missing documents, calculation problems, and known workflow-routing issues before submission.

3.1 Functional requirements

Implement a reusable submission-readiness service and interface.

Validate, where applicable:

- Required fields.
- Field formats and lengths.
- Conditional field requirements.
- Cross-field validation.
- Calculated totals.
- Line-item consistency.
- Financial thresholds.
- Required attachments.
- Duplicate-request warnings.
- Department, plant, and cost-centre requirements.
- Configured budget checks.
- Applicable approval-routing configuration.
- Missing or inactive required approvers.
- Workflow configuration validity.
- Other request-type-specific rules discovered during the audit.

Display a readiness summary with:

- Ready to submit.
- Warnings requiring review.
- Errors preventing submission.
- Missing documents.
- Potential duplicate requests.
- Routing or configuration issues.
- A link to each affected field or section.

Provide clear actions such as `Review issue`, `Upload document`, and `Check again`.

Use these severity levels:

- Blocking: The request cannot be submitted until the problem is corrected.
- Warning: Submission may proceed if the applicable policy permits it.
- Informational: A suggestion that does not prevent submission.

Do not invent mandatory business rules. Reuse existing validation and workflow configuration.

3.2 Security and data integrity

- Perform authoritative validation on the server during submission.
- Do not trust client-calculated totals, permissions, or readiness status.
- Revalidate relevant data immediately before committing the submission.
- Prevent readiness-check results from being reused after relevant request data changes.
- Ensure readiness checks do not modify approval state or create duplicate requests.

3.3 UI states

Implement:

- Initial state.
- Checking state.
- Ready state.
- Ready with warnings.
- Blocking errors.
- Partial validation failure.
- Retry state.
- Stale-result state when request data changes.

3.4 Acceptance criteria

- A valid request can proceed to submission.
- Blocking validation errors prevent submission.
- Warnings follow the configured policy.
- Each error identifies the relevant field or section.
- Server-side validation prevents client-side bypasses.
- Readiness checks work on desktop and mobile.
- Automated tests cover valid, invalid, conditional, and concurrent-change scenarios.

FUNCTION 2 — STUCK-REQUEST DETECTION

4\. Purpose

Automatically identify requests or approval steps that have stopped progressing unexpectedly.

The feature must distinguish genuine workflow failures from legitimate pending approvals.

4.1 Functional requirements

Inspect the existing workflow engine and identify conditions such as:

- Requests with pending steps but no valid assignee.
- Approval steps assigned to inactive or ineligible users.
- Requests exceeding configured inactivity thresholds.
- Requests with inconsistent workflow and assignment states.
- Background processing that has failed or remained incomplete.
- Expired delegations that leave no eligible approver.
- Failed automation affecting workflow progression.
- Requests whose expected transition did not complete.
- Requests affected by invalid workflow configuration.
- Requests waiting for information beyond a configured threshold.

Use configurable thresholds and applicable working calendars.

Where possible, distinguish:

- Normal pending approval.
- Approaching SLA breach.
- Overdue approval.
- Potentially stuck workflow.
- Confirmed processing failure.
- Inconsistent or orphaned workflow state.

Do not classify every old pending request as a system defect.

4.2 Administrative dashboard

Provide authorized IT and administrators with:

- Stuck-request count.
- Requests grouped by reason.
- Time since last successful transition.
- Current workflow stage.
- Current assignment.
- Relevant error or correlation identifier.
- Recommended remediation.
- Retry or recovery action where safe.
- Resolution status and audit history.

Include filters for department, request type, age, workflow stage, and failure category where appropriate.

4.3 Automated remediation

Where safe and supported:

- Retry transient failures.
- Requeue eligible background work.
- Re-evaluate expired assignments.
- Identify eligible replacement approvers.
- Escalate according to existing policies.
- Reconcile inconsistent states using approved recovery logic.

Do not automatically change approval decisions or bypass mandatory approval levels.

4.4 Acceptance criteria

- Genuine stalled or inconsistent workflows are detected.
- Legitimately pending requests are not incorrectly marked as failures.
- Detection is safe to repeat.
- Administrative recovery is permission-controlled.
- Each remediation is audited.
- Recovery does not create duplicate approval decisions.
- Tests cover false positives, missing assignees, expired delegation, and failed background processing.

FUNCTION 3 — DUPLICATE REQUEST DETECTION

5\. Purpose

Warn requesters and authorized approvers when a newly created or submitted request appears to duplicate an existing request.

5.1 Functional requirements

Support configurable matching rules by request type.

Potential matching fields include:

- Request number or external reference.
- Vendor identifier.
- Invoice number.
- Purchase-order reference.
- Amount and currency.
- Requester.
- Request date or relevant date range.
- Department.
- Plant or location.
- Request category.
- Relevant business identifiers.

Use exact matching for reliable identifiers and configurable similarity matching only where justified.

Display authorized matching candidates with:

- Request reference.
- Request type.
- Status.
- Relevant matching fields.
- Match reason.
- Link to the existing request if the user has permission.

Possible outcomes:

- No likely duplicate found.
- Potential duplicate detected.
- Strong duplicate match detected.
- Matching service unavailable.

5.2 Business rules

- Default to warning rather than automatically rejecting a request.
- Allow blocking only where an explicitly configured policy requires it.
- Provide a documented override process for authorized users.
- Require an override reason where appropriate.
- Recheck relevant identifiers during submission to reduce concurrent duplicates.
- Use database uniqueness constraints for identifiers that must be unique.
- Do not rely on fuzzy matching as a replacement for authoritative uniqueness rules.

5.3 Security

- Return only records the current user is authorized to discover.
- Do not expose sensitive request information through match explanations.
- Prevent cross-department or cross-tenant leakage.
- Avoid logging unnecessary financial or personal data.

5.4 Acceptance criteria

- Exact duplicate identifiers are detected reliably.
- Similarity matches are presented as candidates, not facts.
- Legitimate repeated requests can proceed according to policy.
- Concurrent submissions are handled safely.
- Overrides are auditable.
- Search and matching enforce record-level authorization.

FUNCTION 4 — SMART FORM AUTOFILL

6\. Purpose

Reduce manual data entry while ensuring users can verify the values being submitted.

6.1 Functional requirements

Populate eligible fields using authorized existing sources, including:

- User profile.
- Department.
- Plant or location.
- Cost centre.
- Existing request templates.
- Previously submitted requests.
- Existing master data.
- ERP or other configured integrations.

Support:

- Autofill on form initialization.
- Autofill after request-type selection.
- Autofill based on dependent fields.
- User-triggered autofill.
- Explicit refresh where supported.
- Clear indication of automatically populated fields.
- Manual correction where policy permits.

6.2 Data provenance

Where useful, identify whether a value came from:

- User profile.
- Master data.
- Template.
- Previous request.
- External integration.
- User entry.

If a value is refreshed from an authoritative source, handle existing user edits carefully. Never silently overwrite a user's manual entry without an explicit rule or confirmation.

6.3 Security and data integrity

- Respect field-level visibility and edit permissions.
- Do not copy sensitive information into a new request by default.
- Never reuse old approval decisions, request identifiers, or historical approval assignments.
- Revalidate all values on the server.
- Prevent unauthorized users from retrieving another user's private request data for autofill.
- Handle unavailable integrations gracefully.

6.4 Acceptance criteria

- Eligible fields are populated from authorized sources.
- Manual edits are preserved according to the defined rules.
- New requests receive new identifiers and independent workflow history.
- Unavailable data sources produce a clear warning rather than fabricated values.
- Autofill is accessible and works on mobile.

FUNCTION 5 — APPROVED-REQUEST AMENDMENT

7\. Purpose

Allow an authorized requester to propose a change to an already approved request without silently modifying the original approved record.

7.1 Functional requirements

Provide an `Request Amendment` action for eligible approved requests.

Support:

- Selection of permitted fields to change.
- Original value and proposed value comparison.
- Amendment reason.
- Supporting attachments.
- Amendment validation.
- Re-evaluation of applicable approval rules.
- New approval workflow when required.
- Amendment status tracking.
- Notifications to relevant parties.
- Final amendment decision.
- Historical comparison and audit trail.

Potential amendment categories include:

- Amount changes.
- Date changes.
- Scope changes.
- Vendor changes.
- Cost-centre changes.
- Supporting-document updates.

The permitted fields and approval rules must be configurable or derived from the existing business policy.

7.2 State management

Define the lifecycle explicitly, using the existing state model where appropriate:

- Amendment draft.
- Amendment submitted.
- Amendment pending approval.
- Amendment approved.
- Amendment rejected.
- Amendment withdrawn or cancelled where permitted.

Keep the original approval decision intact.

Do not treat an amendment as approved until its required approval process has completed.

Define how the application represents the current effective version of the request while preserving the originally approved snapshot.

7.3 Security and audit

- Revalidate the user's permission to amend the request.
- Prevent users from modifying fields outside the permitted amendment scope.
- Preserve the original approved snapshot and decision history.
- Require fresh approval where the configured policy demands it.
- Prevent unauthorized changes to financial or workflow-critical fields.
- Audit every amendment submission, decision, and effective-value change.

7.4 Acceptance criteria

- An approved request can be amended through a controlled workflow.
- The original approved values remain historically recoverable.
- Approval requirements are recalculated correctly.
- Rejected amendments do not silently alter the effective approved record.
- Concurrent amendments are handled safely.
- Tests cover financial changes, rejected amendments, permission failures, and concurrent modifications.

FUNCTION 6 — DEPARTMENT SCORECARDS

8\. Purpose

Provide management with a consistent view of approval performance and workload across departments.

8.1 Metrics

Where reliable source data exists, include:

- Requests submitted.
- Requests approved.
- Requests rejected.
- Requests pending.
- Requests overdue.
- Median approval duration.
- Average approval duration.
- SLA attainment.
- Rework or changes-requested rate.
- Requests awaiting additional information.
- Workload by approval level.
- Backlog aging.
- Request-type distribution.

Define each metric and its numerator, denominator, date range, and exclusions.

Do not use missing values as zero. Do not calculate on-time completion when the necessary timestamps are unavailable.

8.2 Dashboard functions

Provide:

- Department filters.
- Date-range filters.
- Request-type filters.
- Monthly and period comparisons.
- Trend charts.
- Department scorecards.
- Drill-down into authorized supporting records.
- Export to supported formats.
- Loading, empty, error, and partial-data states.

8.3 Security

- Apply role-based and record-level report access.
- Prevent unauthorized exports.
- Aggregate or suppress sensitive details where required.
- Ensure drill-down results use the same authorization rules as ordinary request access.

8.4 Acceptance criteria

- Metrics reconcile with authoritative source records.
- Date boundaries and timezone rules are consistent.
- Missing or unreliable data is explicitly identified.
- Department comparisons use the same metric definitions.
- Exports match the visible filtered dataset.
- Performance remains acceptable for realistic data volumes.

FUNCTION 7 — WORKFLOW MIGRATION ASSISTANT

9\. Purpose

Help administrators assess and safely migrate active requests when workflow configurations change.

9.1 Functional requirements

Before a workflow migration, analyze:

- Source workflow version.
- Target workflow version.
- Active requests using the source version.
- Current approval stage of each affected request.
- Completed decisions.
- Pending assignments.
- Parallel approval groups.
- Delegations and consultations.
- Conditional routing rules.
- Changed required fields.
- Changed approval thresholds.
- Removed or renamed workflow steps.
- Approver eligibility.
- Incompatible state transitions.

Display a migration impact report.

Classify requests as:

- Compatible.
- Compatible with warnings.
- Requires manual review.
- Cannot be migrated safely.

Provide a dry-run mode that makes no production data changes.

9.2 Migration controls

Where the architecture supports migration:

- Preview the affected records.
- Define an explicit mapping from old to new workflow states.
- Preserve completed decisions.
- Validate the new assignment configuration.
- Require authorization and confirmation.
- Record the source and target versions.
- Maintain a migration audit trail.
- Provide recovery instructions.
- Support batches and progress tracking for large migrations.

Do not automatically move every active request to the newest workflow version.

Requests may need to remain on their original version to preserve the validity and meaning of previous decisions.

9.3 Acceptance criteria

- A dry run identifies affected requests without changing them.
- Incompatible mappings are blocked.
- Historical decisions remain intact.
- Migration failures can be identified and reconciled.
- The process handles partial failures without silently losing assignments.
- Tests cover old workflow versions, parallel approvals, and incompatible states.

FUNCTION 8 — SAFE WORKFLOW REPLAY

10\. Purpose

Allow authorized administrators or background workers to retry failed workflow processing without duplicating business operations.

10.1 Functional requirements

Audit existing background processing, automation, job queues, event handlers, and integration mechanisms.

Implement a replay or retry capability only where the operation is safe to repeat or has explicit idempotency protection.

Examples may include:

- Reprocessing a failed workflow event.
- Retrying a transient notification failure.
- Re-running a failed non-destructive synchronization.
- Re-evaluating an interrupted, recoverable workflow transition.
- Reprocessing a failed integration callback.
- Recovering a job that stopped before completing its intended work.

Provide a clear distinction between:

- Retry the same operation.
- Replay an event.
- Reconcile the current state.
- Create a new business operation.

These actions are not interchangeable.

10.2 Safety controls

Before replay:

1. Identify the failed operation and its original execution.
2. Verify its current status.
3. Determine whether any side effects already occurred.
4. Validate the operation's idempotency strategy.
5. Check current authorization and workflow state.
6. Prevent simultaneous duplicate retries.
7. Execute only the permitted retry scope.
8. Record the result and any generated correlation identifier.

Use existing idempotency keys, unique constraints, transactional outbox patterns, job identifiers, or other appropriate mechanisms.

Never replay a completed approval decision as if it were a new approval.

Never duplicate a financial transaction, ERP record, notification, or irreversible action.

10.3 Acceptance criteria

- A failed eligible operation can be retried safely.
- Duplicate retry attempts are controlled.
- Completed operations are not accidentally repeated.
- Partial completion is reconciled before retry.
- Retry results are visible and audited.
- Tests cover timeouts, partial side effects, duplicate clicks, worker crashes, and concurrent retries.

FUNCTION 9 — CONFIGURATION PROMOTION

11\. Purpose

Provide a controlled way to promote approved application configuration from development to testing and then to production.

11.1 Configuration scope

Identify promotable configuration from the existing application, such as:

- Workflow definitions.
- Form schemas.
- Validation rules.
- Approval thresholds.
- Notification templates.
- Department or plant configuration.
- SLA policies.
- Reference data where appropriate.
- Feature-flag definitions where permitted.

Exclude secrets, credentials, production tokens, and environment-specific sensitive values.

11.2 Functional requirements

Implement:

- Configuration export.
- Configuration import.
- Version identification.
- Schema validation.
- Dependency checks.
- Environment compatibility checks.
- Configuration diff.
- Pre-import validation.
- Dry-run mode.
- Approval and confirmation where required.
- Promotion history.
- Rollback or restoration instructions.

Use a structured, versioned format consistent with the existing architecture.

Validate imported content on the server.

Do not trust an exported file merely because it originated from another environment.

11.3 Environment safeguards

- Prevent accidental promotion to the wrong environment.
- Require explicit environment identification.
- Prevent secrets from being exported.
- Identify dependencies that do not exist in the destination.
- Preserve production-specific settings unless an explicitly approved change targets them.
- Require authorization before production configuration changes.
- Do not deploy application code as part of configuration promotion unless a separately authorized deployment mechanism explicitly supports it.

11.4 Acceptance criteria

- Configuration differences are visible before import.
- Invalid or incompatible configurations are rejected.
- Secret values are excluded.
- The destination environment is clearly identified.
- Promotion history is recorded.
- A failed import does not leave configuration in an inconsistent state.
- Tests cover version mismatch, missing dependencies, invalid files, and rollback.

FUNCTION 10 — RETENTION AND LEGAL HOLD

12\. Purpose

Implement governed retention and protection of records according to approved organizational and legal requirements.

Do not invent retention periods or legal obligations.

12.1 Functional requirements

Audit the existing records and storage mechanisms, including:

- Requests.
- Approval decisions.
- Audit history.
- Attachments.
- Comments.
- Notifications.
- Integration logs.
- Archived records.
- Exported reports.
- Workflow configuration history.

Support configurable retention policies for applicable record categories.

Where approved policy allows, support:

- Retention start date.
- Retention duration.
- Eligible archival date.
- Scheduled cleanup.
- Legal hold.
- Hold reason.
- Hold owner.
- Hold start and release timestamps.
- Records affected by a hold.
- Retention-policy version.
- Deletion or archival execution history.

12.2 Legal hold behaviour

A legal hold must prevent covered records from being deleted or altered by ordinary retention jobs.

Implement:

- Explicit authorization to create or release a hold.
- Required justification where appropriate.
- Visibility into active holds.
- Hold coverage across related records and attachments.
- Conflict detection between retention jobs and legal holds.
- Audit history for hold creation, modification, and release.

If a hold applies to a request, determine whether it also applies to related approvals, attachments, comments, exports, and other records according to the approved policy.

Do not assume that deleting a parent record safely deletes all related records.

12.3 Data protection and deletion

- Apply data minimization.
- Respect access restrictions.
- Prevent ordinary administrators from bypassing active legal holds.
- Use soft deletion or archival where appropriate to the existing design.
- Apply permanent deletion only when explicitly permitted by policy.
- Ensure retention jobs are idempotent and recoverable.
- Produce a dry-run report before large-scale retention operations.
- Document recovery limitations for permanently deleted records.

Do not run destructive retention operations against production without explicit authorization.

12.4 Acceptance criteria

- Retention rules are traceable to approved policies.
- Legal holds prevent covered records from being deleted by automated jobs.
- Hold creation and release are audited.
- Retention processing is repeatable and recoverable.
- Related records are handled consistently.
- Tests cover overlapping holds, scheduled cleanup, failed jobs, and authorized release.

FUNCTION 11 — CENTRALIZED FAILED AUTOMATION RECOVERY AND RESEND BUTTON

13\. Mandatory Requirement

Whenever an existing or newly implemented automation fails, provide a visible `Resend`, `Retry`, or appropriate recovery action wherever it is safe, meaningful, and technically supported.

The intent is to let authorized users recover from failed processing without manually recreating requests or asking developers to rerun jobs.

Do not create a generic retry button that blindly repeats every failed operation.

The correct action depends on the operation type and whether its side effects have already occurred.

13.1 Discover every automation

Audit the repository for:

- Background jobs.
- Workflow event processors.
- Notification dispatch.
- Email sending.
- Scheduled reports.
- Scheduled cleanup.
- Integration synchronizations.
- ERP requests.
- File-processing jobs.
- Import and export operations.
- Webhook handlers.
- Recurring scheduled tasks.
- Other asynchronous processing.

Create an automation inventory containing:

- Automation name.
- Purpose.
- Trigger.
- Execution mechanism.
- Retry capability.
- Idempotency mechanism.
- Side effects.
- Current failure handling.
- Responsible role.
- Recovery method.

Do not assume every asynchronous operation has a safe retry path.

13.2 Central automation status

Where appropriate, standardize operational statuses such as:

- Pending.
- Queued.
- Running.
- Succeeded.
- Failed.
- Retry scheduled.
- Retrying.
- Needs manual intervention.
- Cancelled.

Use the existing job or automation model if it already provides equivalent states.

Store the information needed to diagnose and recover failures, including:

- Automation identifier.
- Business record identifier where appropriate.
- Job or execution identifier.
- Attempt count.
- Last attempt timestamp.
- Failure category.
- Sanitized error summary.
- Correlation identifier.
- Next retry time, if applicable.
- Last successful execution, if known.
- Retry eligibility.
- Recovery status.

Avoid storing secrets or unnecessary sensitive payloads.

13.3 Where the recovery button should appear

Provide a contextual recovery action wherever users can reasonably identify a failed operation, including applicable:

- Failed automation details.
- Request detail pages.
- Failed notification records.
- Integration status screens.
- Scheduled-job monitoring.
- Admin automation dashboard.
- Bulk-operation result pages.
- Stuck-request details.
- Failed import or export records.

Do not clutter ordinary pages with irrelevant retry buttons.

The label must describe the actual operation:

- `Resend Notification`
- `Retry Integration`
- `Retry Failed Job`
- `Reprocess Event`
- `Retry Export`
- `Reconcile Request`

Use `Resend` only when the action actually resends a message or delivery attempt.

13.4 Retry safety classification

Classify every retryable operation.

Category A — Safe retry

Operations that are idempotent or otherwise guaranteed not to duplicate side effects.

Allow authorized users to retry after verifying the current status.

Category B — Retry after reconciliation

Operations where the previous attempt may have partially succeeded.

Check the authoritative downstream or persisted state before retrying. If the result is uncertain, reconcile first.

Category C — Manual recovery required

Operations involving uncertain financial transactions, irreversible external side effects, missing idempotency protection, or unresolved state conflicts.

Disable automatic retry and provide diagnostic information and a manual recovery path.

Do not permit a retry merely because an operation is labelled `Failed`. A timeout may occur after the external system has already completed the transaction.

13.5 Retry execution rules

Implement the following where appropriate:

- Server-side authorization.
- Current-state validation.
- Idempotency protection.
- Duplicate retry prevention.
- Concurrency control.
- Bounded automatic retries.
- Exponential backoff for transient errors.
- Classification of retryable and non-retryable errors.
- A maximum attempt limit.
- Rate limiting.
- Manual intervention when automated retries are exhausted.
- Audit records for each manual retry.
- Correlation IDs.
- Clear results and failure reasons.
- Reconciliation with downstream systems where supported.

Use the existing queue, scheduler, and worker infrastructure rather than introducing a second job-processing platform.

A user-triggered retry should normally enqueue the operation and return a clear status, rather than blocking a web request for a long-running job.

13.6 Permissions

- Ordinary users may retry only operations they are authorized to manage.
- Requesters must not be able to replay approval decisions.
- Approvers must not use automation recovery to bypass workflow rules.
- Integration and system-level retries must require appropriate permissions.
- High-impact or ambiguous operations must require authorized IT intervention.
- All server-side retry endpoints must independently enforce these rules.

13.7 UI states

Every applicable recovery action must support:

- Eligible failed operation.
- Retry in progress.
- Retry queued.
- Retry succeeded.
- Retry failed again.
- Retry unavailable.
- Manual intervention required.
- Operation already completed.
- Permission denied.
- Duplicate retry prevented.

Display the last attempt and the latest known outcome.

Disable the retry control while the same operation is already being processed, unless the underlying queue safely deduplicates concurrent requests.

Do not display success merely because a retry was queued. Show queued, running, and completed states distinctly.

13.8 Acceptance criteria

- The automation inventory identifies existing retry capabilities and gaps.
- Every eligible failed automation has a usable recovery action in an appropriate location.
- Unsafe retries are blocked.
- Retry operations are auditable.
- Partial side effects are reconciled.
- Repeated clicks do not duplicate jobs or business operations.
- Retrying an integration does not create duplicate ERP records or transactions.
- Retrying a notification does not accidentally repeat an approval decision.
- Exhausted retries lead to a clear manual-intervention path.
- The UI displays accurate retry status and errors.
- Automated tests cover safe retry, unsafe retry, duplicate clicks, permission failures, partial success, timeouts, and exhausted retries.

IMPLEMENTATION PHASES

14\. Balanced implementation order

Phase A — Audit and foundations

- Inspect the repository and current-state audit.
- Inventory existing automations.
- Establish the testing baseline.
- Map the workflow state model and current authorization.
- Identify existing reusable components and retry mechanisms.
- Document schema and API implications.

Phase B — Requester productivity

Implement:

- Submission Readiness Checker.
- Smart Form Autofill.
- Duplicate Request Detection.

Validate all three against existing forms, templates, permissions, and submission rules.

Phase C — Workflow reliability

Implement:

- Stuck-Request Detection.
- Safe Workflow Replay.
- Contextual Resend/Retry actions.
- Operational status and failure reporting.

Prioritize safe recovery of existing failed automations before introducing new retry mechanisms.

Phase D — Controlled business changes

Implement:

- Approved-Request Amendment.
- Workflow Migration Assistant.

Complete state-transition, versioning, authorization, and data-integrity tests before enabling these functions.

Phase E — Management and governance

Implement:

- Department Scorecards.
- Configuration Promotion.
- Retention and Legal Hold.

Treat production configuration changes and destructive retention actions as explicitly authorized operational activities.

Phase F — Regression and release verification

Run the complete applicable test suite.

Verify:

- Existing workflow types.
- All new features.
- Security and permissions.
- Automation recovery.
- Data integrity.
- Accessibility.
- Performance.
- Migration and recovery procedures.

Prepare the implementation report and go-live checklist.

15\. Cross-functional requirements

For every function, document:

1. Functional behaviour.
2. UI states.
3. Backend service changes.
4. API contract changes.
5. Database changes.
6. Permissions and security rules.
7. Audit requirements.
8. Failure and recovery behaviour.
9. Unit and integration tests.
10. End-to-end acceptance tests.
11. Known limitations.
12. Operational support requirements.

Follow the existing repository's file naming and documentation conventions. Update existing documentation instead of creating unnecessary duplicates.

16\. Global acceptance criteria

The addendum is complete only when:

- All 10 selected business functions have been assessed and implemented or explicitly classified as blocked or deferred.
- The automation inventory covers the actual asynchronous operations found in the repository.
- Every safely retryable failed automation has an appropriate recovery action.
- Unsafe retries are prevented or routed to manual reconciliation.
- No existing approval workflow is weakened.
- All new operations enforce server-side authorization.
- Audit history and historical approval decisions remain trustworthy.
- Automated tests provide evidence for the new functionality.
- Existing regressions are fixed or documented with evidence.
- Required database and API changes are documented.
- Known limitations and unresolved policy decisions are recorded.

Do not mark a feature complete merely because its UI exists. Verify the underlying behaviour end to end.

17\. Final reporting requirements

Update the implementation report with:

- Functions already supported by the existing application.
- New functions implemented.
- Existing defects corrected.
- Automation inventory and retry coverage.
- Safe-retry versus manual-recovery classification.
- API and database changes.
- Authorization and audit controls.
- Tests executed and actual results.
- Blocked and deferred functions.
- Required configuration and operational dependencies.
- Migration and rollback instructions.
- Remaining security and data-integrity risks.

Do not claim that every automation is retryable if the underlying operation is unsafe or the external system cannot confirm its state.

Do not claim production readiness solely because tests pass.

18\. Start execution

Begin by auditing `APPLICATION_CURRENT_STATE_AUDIT.md` and the repository. Identify which functions already exist, establish the baseline, create the phased implementation plan, and then implement each safe, in-scope phase.

Preserve the current architecture and working features. Fix verified defects, add regression tests, and reuse existing services wherever possible.

Do not deploy to production, perform destructive operations, enable email/WhatsApp approvals, or execute irreversible data changes without explicit authorization.

The final outcome must be a functioning, tested, auditable extension of the existing ARS Approval Platform—not a collection of mockups or placeholder controls.

---

# 6. Unified Execution Order and Final Delivery

Use this overall order, adapting to the actual repository without dropping any requirement:

1. **Discovery and baseline:** inspect the audit and repository, populate the status register, map dependencies and establish current test/performance baselines.
2. **Workflow integrity and security foundation:** fix critical state-machine, authorization, history and data-integrity defects.
3. **Data and metric foundation:** establish authoritative sources, metric definitions, date/timezone rules and data-quality handling.
4. **Core user experience:** implement missing My Work, tracker, autosave, search, mobile UX, notification preferences, delegation, comments and bulk approval functions.
5. **Business functions and recovery:** implement submission readiness, stuck detection, duplicate detection, autofill, amendments, safe replay, migration, configuration promotion, retention/legal hold and safe retry controls.
6. **Role-based analytics:** implement Requester, Approver, Admin and Super Admin dashboards, cards, charts, pending/overdue/SLA analytics, comparisons, conditional formatting, filters and drill-down.
7. **Reports and delivery:** implement authorized exports/PDFs, saved views, scheduled reports, alerting, delivery tracking and operational analytics.
8. **Reliability and governance:** implement or correct monitoring, background jobs, integration reconciliation, backup/restore verification, release controls and rollback documentation.
9. **Verification:** run unit, API/integration, frontend, end-to-end, security, accessibility, performance, resilience and regression tests as applicable.
10. **Status reconciliation:** update every atomic requirement in `IMPLEMENTATION_STATUS_REGISTER.md`. Implemented items must have evidence; remaining Yet to do items must be described with their incomplete work; Not feasible items must be separated and justified.
11. **Handover:** prepare the implementation report and go-live readiness checklist. Production remains undeployed unless explicit authorization is provided.

## 6.1 Required final response/report

The final report must include:

1. Executive summary.
2. Audit findings and current architecture.
3. A link/path to the completed implementation status register.
4. Counts of **Implemented**, **Yet to do**, and **Not feasible** requirements.
5. A separate, detailed list of every **Not feasible** requirement, with evidence, reason, dependency/owner and safe alternative.
6. A separate list of any **Yet to do** items that remain incomplete, with the exact remaining work and reason.
7. Features reused without modification.
8. Existing defects corrected.
9. Features built or completed.
10. Files/modules changed.
11. API and database/schema changes.
12. Security and authorization results.
13. Metric definitions, source data and data gaps.
14. Tests executed, actual pass/fail results and evidence.
15. Performance results and known limitations.
16. Automation inventory and retry/recovery coverage.
17. Backup/restore, migration and rollback instructions.
18. Deployment checklist and outstanding approvals.
19. Explicit confirmation that production deployment did not occur unless separately authorized.

## 6.2 Final completion gate

Do not claim the entire prompt is complete unless all applicable requirements have been classified and the completed ones have evidence.

- **Implemented:** leave the working capability in place and document verification.
- **Yet to do:** build or correct it, then test it. If it remains incomplete, keep it in this status.
- **Not feasible:** list it separately, explain why, and document the prerequisite or safe alternative.

Do not suppress failed tests, weaken assertions to force success, invent unavailable metrics, claim a notification was delivered without evidence, or claim an external operation succeeded without a verified outcome/reconciliation.

The final outcome must be a functioning, tested, secure, auditable extension of the existing ARS Approval Platform. It must preserve existing workflows and architecture, avoid duplicate implementations, and remain ready for authorized review before any production deployment.
