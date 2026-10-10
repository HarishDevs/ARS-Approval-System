-- v1.6.0 workflow reliability (unified prompt FN2, FN8, FN11, Addendum B).
-- Additive only: two new tables, nothing changed or removed.

-- One row per automation step per job-runner run, so the history, the last
-- good run and failures of each automation can be shown (job-run history,
-- missed-run detection). Kept for 90 days by housekeeping.
CREATE TABLE job_runs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_ref      VARCHAR(64)     NOT NULL COMMENT 'x-request-id of the runner call, shared by its steps',
  job_key      VARCHAR(40)     NOT NULL,
  trigger_kind ENUM('CRON', 'MANUAL') NOT NULL DEFAULT 'CRON',
  started_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at  DATETIME(3)     NULL,
  status       ENUM('RUNNING', 'OK', 'FAILED') NOT NULL DEFAULT 'RUNNING',
  counts_json  JSON            NULL COMMENT 'numbers only, never message content',
  error_code   VARCHAR(200)    NULL COMMENT 'error name and message, no payloads',
  INDEX idx_job_runs_key (job_key, started_at),
  INDEX idx_job_runs_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FN2: IT dismisses a stuck-request finding for a while ("we know, it's
-- waiting on the vendor"); it comes back after the snooze ends.
CREATE TABLE stuck_snoozes (
  request_id   BIGINT UNSIGNED NOT NULL,
  reason_code  VARCHAR(40)     NOT NULL,
  until_at     DATETIME        NOT NULL,
  note         VARCHAR(300)    NULL,
  created_by   BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id, reason_code),
  CONSTRAINT fk_stuck_snoozes_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_stuck_snoozes_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
