-- Reporting views for Power BI (P7-04, D-106). Read-only, one row per
-- request / per task, deleted requests left out, names instead of ids.
-- Give Power BI a MySQL user with SELECT on these two views only
-- (DEPLOYMENT Part K2); it never sees the raw tables.
-- Optional and NOT a migration: creating views needs the CREATE VIEW
-- privilege, which a hosting plan may not give the app's user, and a failed
-- migration would stop the app from starting. Run it once in phpMyAdmin
-- (SQL tab) when Power BI is set up; re-run it after upgrades (it replaces).
CREATE OR REPLACE VIEW reporting_requests AS
SELECT
  r.id                                   AS request_id,
  r.request_no                           AS request_no,
  r.title                                AS title,
  w.name                                 AS approval_type,
  w.kind                                 AS approval_kind,
  u.name                                 AS requester,
  d.name                                 AS requester_department,
  r.status                               AS status,
  r.round                                AS round_no,
  r.submitted_at                         AS submitted_at_utc,
  r.closed_at                            AS closed_at_utc,
  CASE WHEN r.closed_at IS NULL THEN NULL ELSE ROUND(TIMESTAMPDIFF(MINUTE, r.submitted_at, r.closed_at) / 60, 1) END AS hours_to_close
FROM approval_requests r
JOIN workflow_versions v ON v.id = r.workflow_version_id
JOIN workflow_definitions w ON w.id = v.workflow_id
JOIN users u ON u.id = r.requester_id
LEFT JOIN departments d ON d.id = u.department_id
WHERE r.deleted_at IS NULL;

CREATE OR REPLACE VIEW reporting_tasks AS
SELECT
  t.id                                   AS task_id,
  r.request_no                           AS request_no,
  w.name                                 AS approval_type,
  t.node_label                           AS step,
  t.task_type                            AS task_type,
  t.round                                AS round_no,
  a.name                                 AS assigned_to,
  ad.name                                AS assigned_department,
  t.status                               AS status,
  dby.name                               AS decided_by,
  t.created_at                           AS created_at_utc,
  t.due_at                               AS due_at_utc,
  t.decided_at                           AS decided_at_utc,
  CASE WHEN t.decided_at IS NULL THEN NULL ELSE ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.decided_at) / 60, 1) END AS hours_to_decide,
  (t.status = 'PENDING' AND t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue_now
FROM approval_tasks t
JOIN approval_requests r ON r.id = t.request_id AND r.deleted_at IS NULL
JOIN workflow_versions v ON v.id = r.workflow_version_id
JOIN workflow_definitions w ON w.id = v.workflow_id
JOIN users a ON a.id = t.approver_id
LEFT JOIN departments ad ON ad.id = a.department_id
LEFT JOIN users dby ON dby.id = t.decided_by;
