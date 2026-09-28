-- Notification hub (P1-40 to P1-48). One notification row per event and
-- recipient; one delivery row per channel. Delivery failures never roll
-- back the business action. payload_json keeps what is needed to retry
-- (template variables / email text), never secrets.
CREATE TABLE whatsapp_templates (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_code    VARCHAR(100)  NOT NULL COMMENT 'stable ARS id, e.g. WA_LOGIN_OTP_V1',
  event_type       VARCHAR(60)   NOT NULL COMMENT 'N-01..N-20 event code, e.g. OTP_LOGIN, NEW_LOGIN',
  provider_name    VARCHAR(150)  NULL COMMENT 'CEOITBox/Meta template name',
  language         VARCHAR(10)   NOT NULL DEFAULT 'en',
  version          INT UNSIGNED  NOT NULL DEFAULT 1,
  status           ENUM('DRAFT', 'ACTIVE', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
  approval_status  ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  created_by       BIGINT UNSIGNED NULL,
  updated_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_whatsapp_templates_code UNIQUE (template_code, language, version),
  CONSTRAINT fk_whatsapp_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_whatsapp_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  INDEX idx_whatsapp_templates_event (event_type, status, approval_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Positional variables: position 1 = {{1}} at CEOITBox. Order must match.
CREATE TABLE whatsapp_template_variables (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id   BIGINT UNSIGNED NOT NULL,
  position      INT UNSIGNED    NOT NULL,
  variable_key  VARCHAR(100)    NOT NULL,
  display_name  VARCHAR(150)    NOT NULL,
  CONSTRAINT uq_whatsapp_template_variables_pos UNIQUE (template_id, position),
  CONSTRAINT fk_whatsapp_template_variables_template FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL-backed send limiter (survives restarts, no Redis needed).
CREATE TABLE whatsapp_rate_limit_log (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_whatsapp_rate_limit_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type   VARCHAR(60)     NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(200)    NOT NULL,
  message      VARCHAR(1000)   NOT NULL,
  deep_link    VARCHAR(500)    NULL COMMENT 'always an app URL; opening it requires sign-in (D-019)',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at      DATETIME        NULL,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_notifications_user_read (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_deliveries (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_id     BIGINT UNSIGNED NOT NULL,
  channel             ENUM('EMAIL', 'WHATSAPP') NOT NULL,
  provider            VARCHAR(50)     NOT NULL COMMENT 'RESEND or CEOITBOX',
  status              ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
  provider_reference  VARCHAR(255)    NULL COMMENT 'provider message id only',
  attempt_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  next_retry_at       DATETIME        NULL,
  last_attempt_at     DATETIME        NULL,
  sent_at             DATETIME        NULL,
  failure_code        VARCHAR(100)    NULL,
  payload_json        JSON            NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_deliveries_notification FOREIGN KEY (notification_id) REFERENCES notifications(id),
  INDEX idx_notification_deliveries_retry (status, next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Background work (SLA timers, escalation, retries) run by cPanel cron via
-- the signed /api/jobs/run endpoint (D-028).
CREATE TABLE jobs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_type      VARCHAR(60)     NOT NULL,
  payload_json  JSON            NULL,
  run_after     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status        ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
  attempts      INT UNSIGNED    NOT NULL DEFAULT 0,
  last_error    VARCHAR(500)    NULL,
  locked_at     DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_due (status, run_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
