-- v1.7.0 (lists A, B and C). Additive only: v1.6.x code ignores all of it,
-- so a rollback to v1.6.2 keeps working.

-- A1 approval expiry: fixed when the request is approved, from the type's
-- "approval valid for" days at that moment. The notice is sent once.
ALTER TABLE approval_requests
  ADD COLUMN valid_until        DATETIME NULL COMMENT 'A1: approved requests of types with a validity period' AFTER closed_at,
  ADD COLUMN expiry_notified_at DATETIME NULL COMMENT 'A1: the 7-day notice was queued' AFTER valid_until,
  ADD INDEX idx_approval_requests_validity (status, valid_until);

-- B06 scheduled reports: extra recipients (people in the app, by user id).
-- Each recipient gets the report run with their own permissions; anyone
-- who can't run it for that scope is skipped.
ALTER TABLE report_schedules
  ADD COLUMN recipients_json JSON NULL COMMENT 'B06: extra recipient user ids' AFTER hour_ist;

-- B07 saved views: shared with everyone (filters only; each viewer's scope
-- is checked again when it opens) and one default per person and target.
ALTER TABLE analytics_views
  ADD COLUMN shared     BOOLEAN NOT NULL DEFAULT FALSE AFTER query_json,
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE AFTER shared,
  ADD INDEX idx_analytics_views_shared (target, shared);

-- B08 alerts: severity, quiet hours (India time, CRITICAL ignores them) and
-- channels (inbox only, or inbox and email).
ALTER TABLE alert_rules
  ADD COLUMN severity    ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING' AFTER cooldown_hours,
  ADD COLUMN quiet_start TINYINT UNSIGNED NULL COMMENT 'B08: hour 0-23 India time' AFTER severity,
  ADD COLUMN quiet_end   TINYINT UNSIGNED NULL AFTER quiet_start,
  ADD COLUMN channels    ENUM('INBOX', 'INBOX_EMAIL') NOT NULL DEFAULT 'INBOX_EMAIL' AFTER quiet_end;

-- C02 large exports made in the background. The file is written to private
-- storage (next to backups), downloadable by its owner for 7 days, then
-- removed by the job runner. It is made with the owner's permissions at
-- the time it runs.
CREATE TABLE export_jobs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  report_key   VARCHAR(60)     NOT NULL,
  query_json   JSON            NOT NULL,
  format       ENUM('csv', 'xlsx', 'pdf') NOT NULL,
  status       ENUM('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
  file_name    VARCHAR(120)    NULL COMMENT 'name on disk (random), never a path from input',
  row_count    INT UNSIGNED    NULL,
  bytes        INT UNSIGNED    NULL,
  message      VARCHAR(300)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at   DATETIME        NULL,
  finished_at  DATETIME        NULL,
  expires_at   DATETIME        NULL,
  INDEX idx_export_jobs_user (user_id, created_at),
  INDEX idx_export_jobs_status (status, created_at),
  CONSTRAINT fk_export_jobs_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- C01 index review for the analytics and report queries (period filters by
-- submitted, closed and decided time). Measured in docs/PERFORMANCE_ANALYTICS.md.
ALTER TABLE approval_requests
  ADD INDEX idx_approval_requests_submitted (submitted_at),
  ADD INDEX idx_approval_requests_closed (closed_at);
ALTER TABLE approval_tasks
  ADD INDEX idx_approval_tasks_decided (decided_at),
  ADD INDEX idx_approval_tasks_request_status (request_id, status);
