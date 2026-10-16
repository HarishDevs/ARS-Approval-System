-- v1.9.0 (owner): Task and Information modules, their set-up by IT, and
-- notification categories. Additive only: v1.8.x code ignores all of it, so
-- a rollback to v1.8.0 keeps working.

-- Task types and Information types (Admin): one row per type; the form and
-- behaviour live in versions. A retired type (active = FALSE) takes no new
-- records; its records stay readable.
CREATE TABLE module_types (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module       ENUM('TASK', 'INFO') NOT NULL,
  code         VARCHAR(40)     NOT NULL,
  name         VARCHAR(120)    NOT NULL,
  description  VARCHAR(500)    NULL,
  active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_module_types_code UNIQUE (module, code),
  CONSTRAINT fk_module_types_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_module_types_module (module, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versions: a DRAFT is edited; PUBLISHED is used for new records (one per
-- type); ARCHIVED versions stay because records point at them. Fields of a
-- published version are never changed in place.
CREATE TABLE module_type_versions (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_id            BIGINT UNSIGNED NOT NULL,
  version_no         INT UNSIGNED    NOT NULL,
  status             ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  form_json          JSON            NOT NULL,
  settings_json      JSON            NOT NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  published_by       BIGINT UNSIGNED NULL,
  published_at       DATETIME        NULL,
  published_type_id  BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'PUBLISHED' THEN type_id END) STORED,
  CONSTRAINT uq_module_type_versions UNIQUE (type_id, version_no),
  CONSTRAINT uq_module_type_versions_published UNIQUE (published_type_id),
  CONSTRAINT fk_module_type_versions_type FOREIGN KEY (type_id) REFERENCES module_types(id),
  CONSTRAINT fk_module_type_versions_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_module_type_versions_publisher FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks: work assigned to a person, tracked to completion. Independent of
-- approvals; related_request_id only points at one (D-143).
CREATE TABLE tasks (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_no             VARCHAR(30)     NOT NULL,
  type_version_id     BIGINT UNSIGNED NOT NULL,
  title               VARCHAR(200)    NOT NULL,
  description         TEXT            NULL,
  priority            ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  status              ENUM('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  created_by          BIGINT UNSIGNED NOT NULL,
  assignee_id         BIGINT UNSIGNED NOT NULL,
  assigned_by         BIGINT UNSIGNED NOT NULL,
  due_at              DATETIME        NULL COMMENT 'UTC',
  starts_on           DATE            NULL,
  form_data_json      JSON            NOT NULL,
  related_request_id  BIGINT UNSIGNED NULL,
  completed_by        BIGINT UNSIGNED NULL,
  completed_at        DATETIME        NULL,
  completion_note     VARCHAR(2000)   NULL,
  cancelled_by        BIGINT UNSIGNED NULL,
  cancelled_at        DATETIME        NULL,
  row_version         INT UNSIGNED    NOT NULL DEFAULT 1,
  submission_key      CHAR(36)        NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_tasks_no UNIQUE (task_no),
  CONSTRAINT uq_tasks_submission UNIQUE (created_by, submission_key),
  CONSTRAINT fk_tasks_version FOREIGN KEY (type_version_id) REFERENCES module_type_versions(id),
  CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  CONSTRAINT fk_tasks_assigner FOREIGN KEY (assigned_by) REFERENCES users(id),
  CONSTRAINT fk_tasks_request FOREIGN KEY (related_request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_tasks_completer FOREIGN KEY (completed_by) REFERENCES users(id),
  CONSTRAINT fk_tasks_canceller FOREIGN KEY (cancelled_by) REFERENCES users(id),
  INDEX idx_tasks_assignee (assignee_id, status, due_at),
  INDEX idx_tasks_creator (created_by, status),
  INDEX idx_tasks_status_due (status, due_at),
  INDEX idx_tasks_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A task's history: created, status changes, reassignments, comments, edits.
-- Append-only, like the approval timeline.
CREATE TABLE task_events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id      BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NULL,
  event_type   VARCHAR(40)     NOT NULL,
  from_status  VARCHAR(20)     NULL,
  to_status    VARCHAR(20)     NULL,
  body         VARCHAR(2000)   NULL,
  payload_json JSON            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_task_events_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_task_events_task (task_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- @begin
CREATE TRIGGER trg_task_events_no_update BEFORE UPDATE ON task_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_events is append-only';
END;
-- @end

-- @begin
CREATE TRIGGER trg_task_events_no_delete BEFORE DELETE ON task_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_events is append-only';
END;
-- @end

-- Reminders already sent for a task (claimed before sending, once each).
CREATE TABLE task_item_reminders (
  task_id  BIGINT UNSIGNED NOT NULL,
  kind     VARCHAR(30)     NOT NULL COMMENT 'DUE_SOON:<due_at> / OVERDUE:<due_at>',
  sent_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, kind),
  CONSTRAINT fk_task_item_reminders_task FOREIGN KEY (task_id) REFERENCES tasks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Information: something people need to know, optionally acknowledged.
CREATE TABLE info_items (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  info_no          VARCHAR(30)     NOT NULL,
  type_version_id  BIGINT UNSIGNED NOT NULL,
  title            VARCHAR(200)    NOT NULL,
  body             TEXT            NOT NULL,
  priority         ENUM('NORMAL', 'IMPORTANT', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  status           ENUM('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  ack_required     BOOLEAN         NOT NULL DEFAULT FALSE,
  effective_on     DATE            NULL,
  expires_on       DATE            NULL,
  form_data_json   JSON            NOT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  published_at     DATETIME        NULL,
  withdrawn_by     BIGINT UNSIGNED NULL,
  withdrawn_at     DATETIME        NULL,
  withdraw_reason  VARCHAR(500)    NULL,
  archived_at      DATETIME        NULL,
  row_version      INT UNSIGNED    NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_info_items_no UNIQUE (info_no),
  CONSTRAINT fk_info_items_version FOREIGN KEY (type_version_id) REFERENCES module_type_versions(id),
  CONSTRAINT fk_info_items_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_info_items_withdrawer FOREIGN KEY (withdrawn_by) REFERENCES users(id),
  INDEX idx_info_items_creator (created_by, status),
  INDEX idx_info_items_status (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who it was addressed to, as chosen (people, departments, groups, everyone).
CREATE TABLE info_targets (
  info_id      BIGINT UNSIGNED NOT NULL,
  target_type  ENUM('USER', 'DEPARTMENT', 'GROUP', 'EVERYONE') NOT NULL,
  target_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (info_id, target_type, target_id),
  CONSTRAINT fk_info_targets_info FOREIGN KEY (info_id) REFERENCES info_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The people it reached, fixed at publishing (D-145), with read and
-- acknowledgement kept apart.
CREATE TABLE info_recipients (
  info_id          BIGINT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  source           VARCHAR(20)     NOT NULL COMMENT 'USER / DEPARTMENT / GROUP / EVERYONE',
  added_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at          DATETIME        NULL,
  acknowledged_at  DATETIME        NULL,
  reminded_at      DATETIME        NULL,
  PRIMARY KEY (info_id, user_id),
  CONSTRAINT fk_info_recipients_info FOREIGN KEY (info_id) REFERENCES info_items(id),
  CONSTRAINT fk_info_recipients_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_info_recipients_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE info_events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  info_id      BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NULL,
  event_type   VARCHAR(40)     NOT NULL,
  body         VARCHAR(2000)   NULL,
  payload_json JSON            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_info_events_info FOREIGN KEY (info_id) REFERENCES info_items(id),
  CONSTRAINT fk_info_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_info_events_info (info_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- @begin
CREATE TRIGGER trg_info_events_no_update BEFORE UPDATE ON info_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'info_events is append-only';
END;
-- @end

-- @begin
CREATE TRIGGER trg_info_events_no_delete BEFORE DELETE ON info_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'info_events is append-only';
END;
-- @end

-- Files on tasks and information (same checks and storage as request files).
CREATE TABLE record_files (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type    ENUM('TASK', 'INFO') NOT NULL,
  entity_id      BIGINT UNSIGNED NOT NULL,
  field_key      VARCHAR(50)     NULL COMMENT 'the ATTACHMENT field, or NULL for general files',
  purpose        VARCHAR(20)     NOT NULL DEFAULT 'GENERAL' COMMENT 'GENERAL / EVIDENCE',
  uploaded_by    BIGINT UNSIGNED NOT NULL,
  original_name  VARCHAR(255)    NOT NULL,
  stored_path    VARCHAR(255)    NOT NULL,
  content_type   VARCHAR(150)    NOT NULL,
  size_bytes     INT UNSIGNED    NOT NULL,
  sha256         CHAR(64)        NOT NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_record_files_path UNIQUE (stored_path),
  CONSTRAINT fk_record_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_record_files_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications: which module they belong to and their record (D-146).
-- Older rows keep NULL here; their category comes from the event type.
ALTER TABLE notifications
  ADD COLUMN category ENUM('APPROVAL', 'TASK', 'INFORMATION', 'SYSTEM') NULL AFTER event_type,
  ADD COLUMN entity_type VARCHAR(20) NULL AFTER deep_link,
  ADD COLUMN entity_id BIGINT UNSIGNED NULL AFTER entity_type,
  ADD INDEX idx_notifications_user_id (user_id, id);
