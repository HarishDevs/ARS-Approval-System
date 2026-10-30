-- D-215 (owner, "recreate Asana's My Tasks and Home, Projects, Tasks and
-- subtasks, Collaboration, Search and navigation"): Task & Project
-- Management on top of the v1.9 Task module. Additive: v1.29 code ignores
-- every new column and table, so a rollback keeps working.

-- Tasks gain subtasks (a parent, depth 0 = top task, at most 5 below),
-- their place among siblings, milestones, the time of the last assignment
-- (My Tasks "Recently assigned") and a soft delete.
ALTER TABLE tasks
  ADD COLUMN parent_task_id   BIGINT UNSIGNED NULL AFTER id,
  ADD COLUMN root_task_id     BIGINT UNSIGNED NULL AFTER parent_task_id,
  ADD COLUMN depth            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN subtask_position DOUBLE          NOT NULL DEFAULT 0,
  ADD COLUMN is_milestone     BOOLEAN         NOT NULL DEFAULT FALSE,
  ADD COLUMN assigned_at      DATETIME        NULL COMMENT 'UTC; last time the assignee changed',
  ADD COLUMN deleted_at       DATETIME        NULL,
  ADD COLUMN deleted_by       BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_task_id) REFERENCES tasks(id),
  ADD CONSTRAINT fk_tasks_deleter FOREIGN KEY (deleted_by) REFERENCES users(id),
  ADD INDEX idx_tasks_parent (parent_task_id, subtask_position),
  ADD INDEX idx_tasks_root (root_task_id);

UPDATE tasks SET assigned_at = created_at WHERE assigned_at IS NULL;

-- The built-in task type for project and quick tasks (no extra fields;
-- IT may change its settings like any other type in Admin → Task types).
INSERT INTO module_types (module, code, name, description, active)
SELECT 'TASK', 'GENERAL', 'General task', 'Built in: tasks added in projects, My Tasks and quick add.', TRUE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM module_types WHERE module = 'TASK' AND code = 'GENERAL');

INSERT INTO module_type_versions (type_id, version_no, status, form_json, settings_json, published_at)
SELECT mt.id, 1, 'PUBLISHED', JSON_ARRAY(),
  JSON_OBJECT('access', JSON_OBJECT('mode', 'EVERYONE', 'departmentIds', JSON_ARRAY(), 'userIds', JSON_ARRAY()),
    'assignScope', 'ANYONE', 'assignGroupIds', JSON_ARRAY(), 'assignUserIds', JSON_ARRAY(),
    'allowBlocked', TRUE, 'allowReopen', TRUE, 'allowReassign', TRUE, 'assigneeMayCancel', TRUE,
    'completion', 'NONE', 'defaultPriority', 'NORMAL', 'requireDueDate', FALSE, 'defaultDueDays', NULL,
    'reminderHoursBefore', 24, 'overdueReminder', TRUE, 'allowRelatedRequest', TRUE),
  UTC_TIMESTAMP()
FROM module_types mt
WHERE mt.module = 'TASK' AND mt.code = 'GENERAL' AND NOT EXISTS (SELECT 1 FROM module_type_versions v WHERE v.type_id = mt.id);

-- Projects. Privacy: PRIVATE (members only), DEPARTMENT (members and the
-- project's department), ORGANISATION (everyone active). Non-members who see
-- a shared project get default_access_role.
CREATE TABLE projects (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(150)    NOT NULL,
  description         TEXT            NULL,
  color               VARCHAR(20)     NOT NULL DEFAULT 'green',
  department_id       BIGINT UNSIGNED NULL,
  privacy             ENUM('PRIVATE', 'DEPARTMENT', 'ORGANISATION') NOT NULL DEFAULT 'PRIVATE',
  default_access_role ENUM('EDITOR', 'COMMENTER', 'VIEWER') NOT NULL DEFAULT 'COMMENTER',
  default_view        ENUM('LIST', 'BOARD', 'CALENDAR', 'TIMELINE') NOT NULL DEFAULT 'LIST',
  owner_id            BIGINT UNSIGNED NOT NULL,
  start_on            DATE            NULL,
  due_on              DATE            NULL,
  current_status      ENUM('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ON_HOLD', 'COMPLETE', 'DROPPED') NULL,
  completed_at        DATETIME        NULL,
  archived_at         DATETIME        NULL,
  row_version         INT UNSIGNED    NOT NULL DEFAULT 1,
  created_by          BIGINT UNSIGNED NOT NULL,
  deleted_at          DATETIME        NULL,
  deleted_by          BIGINT UNSIGNED NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_projects_deleter FOREIGN KEY (deleted_by) REFERENCES users(id),
  INDEX idx_projects_privacy (privacy, department_id, archived_at, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Members: a person or a whole department, with a role. The effective role
-- is the highest of every grant (server/work/access.ts).
CREATE TABLE project_members (
  project_id   BIGINT UNSIGNED NOT NULL,
  member_type  ENUM('USER', 'DEPARTMENT') NOT NULL,
  member_id    BIGINT UNSIGNED NOT NULL,
  role         ENUM('OWNER', 'EDITOR', 'COMMENTER', 'VIEWER') NOT NULL,
  added_by     BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, member_type, member_id),
  CONSTRAINT fk_project_members_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_members_adder FOREIGN KEY (added_by) REFERENCES users(id),
  INDEX idx_project_members_member (member_type, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_sections (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(150)    NOT NULL,
  position    DOUBLE          NOT NULL DEFAULT 0,
  created_by  BIGINT UNSIGNED NOT NULL,
  deleted_at  DATETIME        NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_sections_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_sections_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_project_sections_project (project_id, deleted_at, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A task in a project (one section there), in several projects at once.
CREATE TABLE task_projects (
  task_id     BIGINT UNSIGNED NOT NULL,
  project_id  BIGINT UNSIGNED NOT NULL,
  section_id  BIGINT UNSIGNED NOT NULL,
  position    DOUBLE          NOT NULL DEFAULT 0,
  added_by    BIGINT UNSIGNED NOT NULL,
  added_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, project_id),
  CONSTRAINT fk_task_projects_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_projects_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_task_projects_section FOREIGN KEY (section_id) REFERENCES project_sections(id),
  CONSTRAINT fk_task_projects_adder FOREIGN KEY (added_by) REFERENCES users(id),
  INDEX idx_task_projects_list (project_id, section_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Followers (collaborators): they see the task and hear about it.
CREATE TABLE task_followers (
  task_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  source      ENUM('CREATOR', 'ASSIGNEE', 'MANUAL', 'MENTION', 'COMMENT') NOT NULL,
  added_by    BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT fk_task_followers_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_followers_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_task_followers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments with one level of replies; mentions are kept as @[Name](user:id).
CREATE TABLE task_comments (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id            BIGINT UNSIGNED NOT NULL,
  parent_comment_id  BIGINT UNSIGNED NULL,
  author_id          BIGINT UNSIGNED NOT NULL,
  body               TEXT            NOT NULL,
  is_pinned          BOOLEAN         NOT NULL DEFAULT FALSE,
  edited_at          DATETIME        NULL,
  deleted_at         DATETIME        NULL,
  deleted_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES task_comments(id),
  CONSTRAINT fk_task_comments_author FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX idx_task_comments_task (task_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE work_likes (
  target_type  ENUM('TASK', 'COMMENT', 'STATUS') NOT NULL,
  target_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_type, target_id, user_id),
  CONSTRAINT fk_work_likes_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Blocked by / blocking (finish before start). No loops (service check).
CREATE TABLE task_dependencies (
  blocker_task_id  BIGINT UNSIGNED NOT NULL,
  blocked_task_id  BIGINT UNSIGNED NOT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_task_id, blocked_task_id),
  CONSTRAINT fk_task_dependencies_blocker FOREIGN KEY (blocker_task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_dependencies_blocked FOREIGN KEY (blocked_task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_dependencies_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_task_dependencies_blocked (blocked_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tags: organisation-wide labels.
CREATE TABLE work_tags (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)     NOT NULL,
  color       VARCHAR(20)     NOT NULL DEFAULT 'gray',
  created_by  BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_work_tags_name UNIQUE (name),
  CONSTRAINT fk_work_tags_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_tags (
  task_id   BIGINT UNSIGNED NOT NULL,
  tag_id    BIGINT UNSIGNED NOT NULL,
  added_by  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  CONSTRAINT fk_task_tags_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_tags_tag FOREIGN KEY (tag_id) REFERENCES work_tags(id),
  CONSTRAINT fk_task_tags_adder FOREIGN KEY (added_by) REFERENCES users(id),
  INDEX idx_task_tags_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project status updates: frozen when posted.
CREATE TABLE project_status_updates (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  BIGINT UNSIGNED NOT NULL,
  status      ENUM('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ON_HOLD', 'COMPLETE', 'DROPPED') NOT NULL,
  title       VARCHAR(200)    NOT NULL,
  body        TEXT            NULL,
  snapshot_json JSON          NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  deleted_at  DATETIME        NULL,
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_status_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_status_author FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX idx_project_status_project (project_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Project history (members, privacy, sections, archive, delete). The app only inserts.
CREATE TABLE project_events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id   BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NULL,
  event_type   VARCHAR(40)     NOT NULL,
  body         VARCHAR(500)    NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_events_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_project_events_project (project_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starred projects and saved searches, per person.
CREATE TABLE work_favourites (
  user_id      BIGINT UNSIGNED NOT NULL,
  object_type  ENUM('PROJECT', 'SEARCH') NOT NULL,
  object_id    BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, object_type, object_id),
  CONSTRAINT fk_work_favourites_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recently opened projects (Home's Projects widget).
CREATE TABLE work_recent_projects (
  user_id     BIGINT UNSIGNED NOT NULL,
  project_id  BIGINT UNSIGNED NOT NULL,
  opened_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, project_id),
  CONSTRAINT fk_work_recent_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_work_recent_project FOREIGN KEY (project_id) REFERENCES projects(id),
  INDEX idx_work_recent_user (user_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- My Tasks: a person's own sections (four built in) and where they put each
-- task. Only the assignee's placement counts; nobody else sees them.
CREATE TABLE my_task_sections (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(100)    NOT NULL,
  position    DOUBLE          NOT NULL DEFAULT 0,
  system_key  ENUM('RECENT', 'TODAY', 'UPCOMING', 'LATER') NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_my_task_sections_system UNIQUE (user_id, system_key),
  CONSTRAINT fk_my_task_sections_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_my_task_sections_user (user_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE my_task_placements (
  user_id     BIGINT UNSIGNED NOT NULL,
  task_id     BIGINT UNSIGNED NOT NULL,
  section_id  BIGINT UNSIGNED NOT NULL,
  position    DOUBLE          NOT NULL DEFAULT 0,
  placed_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, task_id),
  CONSTRAINT fk_my_task_placements_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_my_task_placements_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_my_task_placements_section FOREIGN KEY (section_id) REFERENCES my_task_sections(id) ON DELETE CASCADE,
  INDEX idx_my_task_placements_section (user_id, section_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saved task searches (the filters as a query string), per person.
CREATE TABLE work_saved_searches (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(80)     NOT NULL,
  query       VARCHAR(1000)   NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_work_saved_searches UNIQUE (user_id, name),
  CONSTRAINT fk_work_saved_searches_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
