-- v1.6.0 reports, saved analytics views, scheduled reports and alert rules
-- (unified prompt Addendum A §10, §11, §15). Additive only.

-- A person's saved filters for Analytics or a report.
CREATE TABLE analytics_views (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(80)     NOT NULL,
  target       VARCHAR(60)     NOT NULL COMMENT 'DASHBOARD or a report key',
  query_json   JSON            NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_analytics_views_owner UNIQUE (user_id, target, name),
  CONSTRAINT fk_analytics_views_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A report delivered by email on a schedule. It always runs with the
-- owner's permissions at the time it runs.
CREATE TABLE report_schedules (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  report_key    VARCHAR(60)     NOT NULL,
  query_json    JSON            NOT NULL,
  format        ENUM('csv', 'xlsx', 'pdf') NOT NULL DEFAULT 'xlsx',
  frequency     ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
  weekday       TINYINT UNSIGNED NULL COMMENT '1 = Monday (WEEKLY)',
  month_day     TINYINT UNSIGNED NULL COMMENT '1-28 (MONTHLY)',
  hour_ist      TINYINT UNSIGNED NOT NULL DEFAULT 8,
  active        BOOLEAN         NOT NULL DEFAULT TRUE,
  next_run_at   DATETIME        NOT NULL,
  last_run_at   DATETIME        NULL,
  last_status   VARCHAR(20)     NULL,
  failures      INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report_schedules_due (active, next_run_at),
  CONSTRAINT fk_report_schedules_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_runs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id   BIGINT UNSIGNED NOT NULL,
  due_at        DATETIME        NOT NULL COMMENT 'the slot this run is for',
  started_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME        NULL,
  status        ENUM('RUNNING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'RUNNING',
  row_count     INT UNSIGNED    NULL,
  bytes         INT UNSIGNED    NULL,
  message       VARCHAR(300)    NULL,
  CONSTRAINT uq_report_runs_slot UNIQUE (schedule_id, due_at),
  CONSTRAINT fk_report_runs_schedule FOREIGN KEY (schedule_id) REFERENCES report_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A person's alert: tell me when a number in my scope crosses a line.
CREATE TABLE alert_rules (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  metric          VARCHAR(40)     NOT NULL,
  scope_kind      VARCHAR(20)     NOT NULL,
  threshold       INT UNSIGNED    NOT NULL,
  param           INT UNSIGNED    NULL COMMENT 'days, for "older than"',
  cooldown_hours  SMALLINT UNSIGNED NOT NULL DEFAULT 24,
  active          BOOLEAN         NOT NULL DEFAULT TRUE,
  firing          BOOLEAN         NOT NULL DEFAULT FALSE,
  latest_value    INT UNSIGNED    NULL,
  last_checked_at DATETIME        NULL,
  last_fired_at   DATETIME        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alert_rules_active (active),
  CONSTRAINT fk_alert_rules_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE alert_events (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id     BIGINT UNSIGNED NOT NULL,
  value       INT UNSIGNED    NOT NULL,
  fired_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alert_events_rule (rule_id, fired_at),
  CONSTRAINT fk_alert_events_rule FOREIGN KEY (rule_id) REFERENCES alert_rules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
