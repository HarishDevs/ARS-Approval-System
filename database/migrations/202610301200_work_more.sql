-- D-218 (owner: "build and test completely"): the rest of Task & Project
-- Management (PB-77): recurring tasks, project templates, project custom
-- fields, the task inbox (archive, bookmark) with a daily digest, and
-- department holidays. Additive: v1.30 code ignores all of it.

-- Recurring tasks: the rule lives on the task; completing it creates the
-- next one in the same series (copied: title, description, assignee,
-- priority, projects and sections, tags, followers, subtasks).
ALTER TABLE tasks
  ADD COLUMN recurrence_json JSON NULL,
  ADD COLUMN series_id BIGINT UNSIGNED NULL,
  ADD INDEX idx_tasks_series (series_id);

-- A project template: a project row marked is_template that holds its
-- sections, fields and tasks (with day offsets) as JSON, so template tasks
-- never appear in anyone's lists or reminders. New projects are made from it.
ALTER TABLE projects
  ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT FALSE AFTER default_view,
  ADD COLUMN template_json JSON NULL AFTER is_template;

-- Custom fields of a project, and their values on tasks.
CREATE TABLE project_fields (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id   BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(60)     NOT NULL,
  kind         ENUM('TEXT', 'NUMBER', 'SELECT', 'DATE') NOT NULL,
  options_json JSON            NOT NULL,
  position     DOUBLE          NOT NULL DEFAULT 0,
  created_by   BIGINT UNSIGNED NOT NULL,
  deleted_at   DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_fields_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_fields_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_project_fields_project (project_id, deleted_at, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_field_values (
  task_id     BIGINT UNSIGNED NOT NULL,
  field_id    BIGINT UNSIGNED NOT NULL,
  value       VARCHAR(500)    NOT NULL,
  updated_by  BIGINT UNSIGNED NOT NULL,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, field_id),
  CONSTRAINT fk_task_field_values_task FOREIGN KEY (task_id) REFERENCES tasks(id),
  CONSTRAINT fk_task_field_values_field FOREIGN KEY (field_id) REFERENCES project_fields(id),
  CONSTRAINT fk_task_field_values_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The task inbox: notifications can be archived and bookmarked.
ALTER TABLE notifications
  ADD COLUMN archived_at   DATETIME NULL,
  ADD COLUMN bookmarked_at DATETIME NULL;

-- Daily digests already sent (one per person per India day).
CREATE TABLE work_digest_sends (
  user_id  BIGINT UNSIGNED NOT NULL,
  day      DATE            NOT NULL,
  sent_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day),
  CONSTRAINT fk_work_digest_sends_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Holidays of one department only (on top of the organisation's holidays).
CREATE TABLE department_holidays (
  department_id BIGINT UNSIGNED NOT NULL,
  holiday_on    DATE            NOT NULL COMMENT 'India date',
  name          VARCHAR(100)    NOT NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (department_id, holiday_on),
  CONSTRAINT fk_department_holidays_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_department_holidays_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
