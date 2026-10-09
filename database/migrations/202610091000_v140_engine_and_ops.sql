-- v1.4.0 (D-097..D-104).
-- Work steps (D-097): a task row says whether it is a decision or work, so
-- queues and dashboards can tell them apart.
ALTER TABLE approval_tasks
  ADD COLUMN task_type ENUM('APPROVAL', 'WORK') NOT NULL DEFAULT 'APPROVAL' COMMENT 'D-097' AFTER node_label;

-- Restart policy after "changes asked", per approval type (D-101).
ALTER TABLE workflow_definitions
  ADD COLUMN resubmit_policy ENUM('REQUESTING_STEP', 'BEGINNING') NOT NULL DEFAULT 'REQUESTING_STEP' COMMENT 'D-101' AFTER active;

-- Multi-level escalation (D-100): one row per level reached.
ALTER TABLE task_reminders
  MODIFY COLUMN kind ENUM('REMINDER', 'ESCALATION', 'ESCALATION_2', 'ESCALATION_3') NOT NULL;

-- Single-use security links (audit S-07): a "This wasn't me" link works once.
CREATE TABLE used_security_links (
  token_hash  CHAR(64)  NOT NULL PRIMARY KEY,
  used_at     DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_used_security_links_used (used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delivery receipts from CEOITBox (S8-03): when WhatsApp says delivered/read.
ALTER TABLE notification_deliveries
  ADD COLUMN delivered_at DATETIME NULL AFTER sent_at,
  ADD COLUMN read_at      DATETIME NULL AFTER delivered_at,
  ADD INDEX idx_notification_deliveries_reference (provider_reference);
