-- v1.51.0 (owner, D-300/D-301): Meeting Management. Coordinator-driven: one
-- Meeting Owner and one Coordinator per meeting; the Coordinator raises the
-- meeting points and the MOM, the Owner approves them. Action items become
-- General tasks linked to the meeting (tasks.meeting_id, like projects).
-- Additive: no existing row changes except module access (everyone gets the
-- new MEETING module, IT can switch it off per person).
-- Rollback (after rolling the code back):
--   ALTER TABLE tasks DROP FOREIGN KEY fk_tasks_meeting, DROP COLUMN meeting_id;
--   DROP TABLE meeting_events, meeting_open_points, meeting_actions, meeting_decisions,
--     meeting_points, meeting_participants, meeting_departments, meetings,
--     meeting_management_members, meeting_types;
--   ALTER TABLE users MODIFY module_access SET('APPROVAL','TASK','INFORMATION','AI') NOT NULL DEFAULT 'APPROVAL,TASK,INFORMATION';

ALTER TABLE users
  MODIFY module_access SET('APPROVAL', 'TASK', 'INFORMATION', 'AI', 'MEETING') NOT NULL DEFAULT 'APPROVAL,TASK,INFORMATION,MEETING';
UPDATE users SET module_access = CONCAT_WS(',', NULLIF(module_access, ''), 'MEETING') WHERE NOT FIND_IN_SET('MEETING', module_access);

CREATE TABLE meeting_types (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40)     NOT NULL,
  name        VARCHAR(100)    NOT NULL,
  template    TEXT            NULL COMMENT 'Default meeting points, one per line',
  position    INT             NOT NULL DEFAULT 0,
  active      BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_meeting_types_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO meeting_types (code, name, position) VALUES
  ('IDM', 'IDM (Inter Department Meeting)', 1),
  ('INTRA', 'Intra Department Meeting', 2),
  ('MD', 'MD Meeting', 3),
  ('ED', 'ED Meeting', 4),
  ('MANAGEMENT', 'Management Meeting', 5),
  ('PRODUCTION', 'Production and Despatch Meeting', 6),
  ('PROJECT', 'Project Review', 7),
  ('REVIEW', 'Review Meeting', 8),
  ('CRITICAL', 'Critical Meeting', 9),
  ('EXTERNAL', 'External Meeting', 10),
  ('OTHER', 'Other Meeting', 11);

-- The Management group (owner: ED and MD): sees every meeting and the dashboards.
CREATE TABLE meeting_management_members (
  user_id     BIGINT UNSIGNED NOT NULL,
  added_by    BIGINT UNSIGNED NULL,
  added_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_mm_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meetings (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_no           VARCHAR(30)     NOT NULL,
  title                VARCHAR(200)    NOT NULL,
  description          TEXT            NULL,
  type_id              BIGINT UNSIGNED NOT NULL,
  department_id        BIGINT UNSIGNED NULL COMMENT 'Organising department',
  owner_id             BIGINT UNSIGNED NOT NULL COMMENT 'Meeting Owner: approves points and MOM',
  coordinator_id       BIGINT UNSIGNED NOT NULL COMMENT 'Coordinator: runs the meeting; may equal owner_id',
  mode                 ENUM('ONLINE', 'OFFLINE', 'HYBRID') NOT NULL DEFAULT 'OFFLINE',
  venue                VARCHAR(200)    NULL,
  link                 VARCHAR(500)    NULL,
  priority             ENUM('NORMAL', 'IMPORTANT', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  confidentiality      ENUM('GENERAL', 'MANAGEMENT') NOT NULL DEFAULT 'GENERAL',
  guests               VARCHAR(1000)   NULL COMMENT 'External participants, free text',
  status               ENUM('SCHEDULED', 'IN_PROGRESS', 'AWAITING_MOM', 'MOM_SUBMITTED', 'MOM_RETURNED', 'MOM_APPROVED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  scheduled_start      DATETIME        NOT NULL COMMENT 'UTC',
  scheduled_end        DATETIME        NOT NULL COMMENT 'UTC',
  actual_start         DATETIME        NULL,
  actual_end           DATETIME        NULL,
  agenda_due_at        DATETIME        NULL COMMENT 'Points must be submitted before this',
  mom_due_at           DATETIME        NULL COMMENT 'MOM must be submitted before this',
  points_status        ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED') NOT NULL DEFAULT 'DRAFT',
  points_policy        ENUM('BLOCK', 'LAST_APPROVED') NOT NULL DEFAULT 'LAST_APPROVED' COMMENT 'Owner: if points are not approved at meeting time',
  points_submitted_at  DATETIME        NULL,
  points_decided_at    DATETIME        NULL,
  points_remarks       VARCHAR(1000)   NULL,
  mom_submitted_at     DATETIME        NULL,
  mom_decided_at       DATETIME        NULL,
  mom_remarks          VARCHAR(1000)   NULL,
  series_id            BIGINT UNSIGNED NULL COMMENT 'First meeting of the follow-up chain',
  parent_meeting_id    BIGINT UNSIGNED NULL COMMENT 'The meeting this follows up',
  cancelled_reason     VARCHAR(500)    NULL,
  created_by           BIGINT UNSIGNED NOT NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  row_version          INT UNSIGNED    NOT NULL DEFAULT 1,
  deleted_at           DATETIME        NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_meetings_no UNIQUE (meeting_no),
  CONSTRAINT fk_meetings_type FOREIGN KEY (type_id) REFERENCES meeting_types(id),
  CONSTRAINT fk_meetings_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_meetings_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_meetings_coordinator FOREIGN KEY (coordinator_id) REFERENCES users(id),
  CONSTRAINT fk_meetings_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_meetings_parent FOREIGN KEY (parent_meeting_id) REFERENCES meetings(id),
  INDEX idx_meetings_start (scheduled_start),
  INDEX idx_meetings_department (department_id, scheduled_start),
  INDEX idx_meetings_owner (owner_id, status),
  INDEX idx_meetings_coordinator (coordinator_id, status),
  INDEX idx_meetings_series (series_id),
  INDEX idx_meetings_status (status, scheduled_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meeting_departments (
  meeting_id     BIGINT UNSIGNED NOT NULL,
  department_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (meeting_id, department_id),
  CONSTRAINT fk_md_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  CONSTRAINT fk_md_department FOREIGN KEY (department_id) REFERENCES departments(id),
  INDEX idx_md_department (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meeting_participants (
  meeting_id     BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  response       ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE') NOT NULL DEFAULT 'PENDING',
  response_note  VARCHAR(300)    NULL,
  attendance     ENUM('UNMARKED', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED') NOT NULL DEFAULT 'UNMARKED',
  added_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_id, user_id),
  CONSTRAINT fk_mp_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_mp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meeting_points (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id     BIGINT UNSIGNED NOT NULL,
  position       INT             NOT NULL,
  title          VARCHAR(300)    NOT NULL,
  presenter_id   BIGINT UNSIGNED NULL,
  discussion     TEXT            NULL COMMENT 'MOM notes for this point',
  PRIMARY KEY (id),
  CONSTRAINT fk_mpt_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  CONSTRAINT fk_mpt_presenter FOREIGN KEY (presenter_id) REFERENCES users(id),
  INDEX idx_mpt_meeting (meeting_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meeting_decisions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id     BIGINT UNSIGNED NOT NULL,
  position       INT             NOT NULL,
  text           VARCHAR(1000)   NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_mdc_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  INDEX idx_mdc_meeting (meeting_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Action items: each becomes a General task (task_id) when the MOM is approved.
-- A follow-up meeting carries an open action forward as a new row pointing to
-- the SAME task (carried_from_id), never a copy of the task.
CREATE TABLE meeting_actions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id       BIGINT UNSIGNED NOT NULL,
  position         INT             NOT NULL,
  title            VARCHAR(200)    NOT NULL,
  description      VARCHAR(2000)   NULL,
  owner_id         BIGINT UNSIGNED NOT NULL COMMENT 'The one accountable person (task assignee)',
  priority         ENUM('NORMAL', 'IMPORTANT', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
  due_on           DATE            NULL,
  task_id          BIGINT UNSIGNED NULL,
  carried_from_id  BIGINT UNSIGNED NULL,
  confirmed_by     BIGINT UNSIGNED NULL COMMENT 'Owner or Coordinator confirmed the work is done',
  confirmed_at     DATETIME        NULL,
  review_note      VARCHAR(1000)   NULL COMMENT 'Latest follow-up note (delay reason, review)',
  PRIMARY KEY (id),
  CONSTRAINT fk_ma_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  CONSTRAINT fk_ma_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_ma_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_ma_carried FOREIGN KEY (carried_from_id) REFERENCES meeting_actions(id),
  CONSTRAINT uq_ma_meeting_task UNIQUE (meeting_id, task_id),
  INDEX idx_ma_meeting (meeting_id, position),
  INDEX idx_ma_task (task_id),
  INDEX idx_ma_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Open points: matters to revisit without a task (followed up in the module).
CREATE TABLE meeting_open_points (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id       BIGINT UNSIGNED NOT NULL,
  text             VARCHAR(1000)   NOT NULL,
  owner_id         BIGINT UNSIGNED NULL,
  review_on        DATE            NULL,
  status           ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  closed_note      VARCHAR(1000)   NULL,
  closed_by        BIGINT UNSIGNED NULL,
  closed_at        DATETIME        NULL,
  carried_from_id  BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_mop_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  CONSTRAINT fk_mop_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_mop_carried FOREIGN KEY (carried_from_id) REFERENCES meeting_open_points(id),
  INDEX idx_mop_meeting (meeting_id),
  INDEX idx_mop_status (status, review_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- History and the updates shown to participants (append-only by convention).
CREATE TABLE meeting_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meeting_id   BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NULL,
  event_type   VARCHAR(40)     NOT NULL,
  body         VARCHAR(2000)   NULL,
  payload_json JSON            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_me_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  INDEX idx_me_meeting (meeting_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Owner: "a place to record which meeting in the task, like the projects".
ALTER TABLE tasks
  ADD COLUMN meeting_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_tasks_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id),
  ADD INDEX idx_tasks_meeting (meeting_id);
