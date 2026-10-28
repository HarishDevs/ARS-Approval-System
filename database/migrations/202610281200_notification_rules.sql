-- D-209 (owner): reminder and escalation rules for approvals and tasks, built
-- by IT in Admin. A rule holds its conditions and stages as JSON (checked by
-- server/notifications/rule-model.ts). Every send is recorded once per rule,
-- record, stage and repeat, so nothing is sent twice. Additive: new tables.
CREATE TABLE notification_rules (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150)     NOT NULL,
  kind            ENUM('REMINDER', 'ESCALATION') NOT NULL,
  module          ENUM('APPROVAL', 'TASK') NOT NULL,
  active          BOOLEAN          NOT NULL DEFAULT TRUE,
  match_mode      ENUM('ALL', 'ANY') NOT NULL DEFAULT 'ALL',
  conditions_json JSON             NOT NULL,
  stages_json     JSON             NOT NULL,
  send_email      BOOLEAN          NOT NULL DEFAULT TRUE,
  subject         VARCHAR(200)     NOT NULL DEFAULT '',
  body            TEXT             NOT NULL,
  created_by      BIGINT UNSIGNED  NOT NULL,
  updated_by      BIGINT UNSIGNED  NOT NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_notification_rules_active (active, module),
  CONSTRAINT fk_notification_rules_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_notification_rules_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_rule_sends (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_id     BIGINT UNSIGNED  NOT NULL,
  record_kind ENUM('APPROVAL_STEP', 'TASK') NOT NULL,
  record_id   BIGINT UNSIGNED  NOT NULL,
  stage_no    TINYINT UNSIGNED NOT NULL,
  send_no     TINYINT UNSIGNED NOT NULL,
  recipients  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  sent_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_rule_sends (rule_id, record_kind, record_id, stage_no, send_no),
  KEY idx_notification_rule_sends_record (record_kind, record_id),
  CONSTRAINT fk_notification_rule_sends_rule FOREIGN KEY (rule_id) REFERENCES notification_rules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
