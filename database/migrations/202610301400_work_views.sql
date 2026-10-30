-- D-220 (owner, with Asana screenshots): saved view tabs ("Pending Today",
-- "Overdue", "Assigner"…): a name and the grid's filters, sort, groups and
-- columns. My Tasks tabs are the person's own; a project's tabs are shared
-- with everyone who sees the project (made by its owners and editors).
CREATE TABLE work_views (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope       ENUM('MY_TASKS', 'PROJECT') NOT NULL,
  scope_id    BIGINT UNSIGNED NOT NULL COMMENT 'user id (MY_TASKS) or project id',
  name        VARCHAR(60)     NOT NULL,
  config_json JSON            NOT NULL,
  position    DOUBLE          NOT NULL DEFAULT 0,
  created_by  BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_work_views_name UNIQUE (scope, scope_id, name),
  CONSTRAINT fk_work_views_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_work_views_scope (scope, scope_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
