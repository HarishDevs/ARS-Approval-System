-- v1.5.0 (owner's development spec). Additive only: v1.4.0 code ignores
-- these tables, so a rollback to v1.4.0 keeps working.

-- #3 Drafts: one per person and form (WF:<workflowId> or CUSTOM), saved by
-- autosave, removed on submit or discard, expired after 30 days. Every read
-- and write filters on user_id (no one else's draft can be fetched).
CREATE TABLE request_drafts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  draft_key    VARCHAR(40)     NOT NULL,
  title        VARCHAR(200)    NULL,
  fields_json  JSON            NOT NULL,
  version      INT UNSIGNED    NOT NULL DEFAULT 1,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME        NOT NULL,
  CONSTRAINT uq_request_drafts_owner_key UNIQUE (user_id, draft_key),
  CONSTRAINT fk_request_drafts_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_request_drafts_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- #4 Saved views: a person's own named search filters. Private.
CREATE TABLE saved_views (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(80)     NOT NULL,
  query_json  JSON            NOT NULL,
  is_default  BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_saved_views_owner_name UNIQUE (user_id, name),
  CONSTRAINT fk_saved_views_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- #6 Notification preferences: only choices that differ from the default
-- (on) are stored. Mandatory groups are enforced in code, whatever is here.
CREATE TABLE notification_preferences (
  user_id      BIGINT UNSIGNED NOT NULL,
  event_group  VARCHAR(40)     NOT NULL,
  channel      ENUM('EMAIL', 'WHATSAPP') NOT NULL,
  enabled      BOOLEAN         NOT NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_group, channel),
  CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- #13 Small per-person flags, e.g. the first-use checklist dismissed.
CREATE TABLE user_flags (
  user_id  BIGINT UNSIGNED NOT NULL,
  flag     VARCHAR(60)     NOT NULL,
  set_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, flag),
  CONSTRAINT fk_user_flags_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- #12 "Due soon" reminder before the response time runs out.
ALTER TABLE task_reminders
  MODIFY COLUMN kind ENUM('REMINDER', 'ESCALATION', 'ESCALATION_2', 'ESCALATION_3', 'DUE_SOON') NOT NULL;
