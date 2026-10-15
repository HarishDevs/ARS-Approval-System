-- v1.8.0 (owner). Additive only: v1.7.x code ignores all of it, so a
-- rollback to v1.7.2 keeps working.

-- Custom approval set-up (Admin → Custom approval): the fields people fill
-- in and the step options they may change. One row (id 1). A change applies
-- to new custom approvals only: each request keeps the form it was raised
-- with (its own workflow version).
CREATE TABLE custom_approval_settings (
  id          TINYINT UNSIGNED PRIMARY KEY,
  form_json   JSON            NOT NULL,
  policy_json JSON            NOT NULL,
  updated_by  BIGINT UNSIGNED NULL,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_custom_approval_settings_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Page access (Super Admin): Hidden, View or Full for a page, for everyone,
-- a department or one person. The most specific rule wins (person, then
-- department, then everyone); no rule = Full. Never applies to the Super Admin.
CREATE TABLE page_access_rules (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  page_key    VARCHAR(60)     NOT NULL,
  scope       ENUM('EVERYONE', 'DEPARTMENT', 'USER') NOT NULL,
  scope_id    BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 for EVERYONE',
  level       ENUM('HIDDEN', 'VIEW', 'FULL') NOT NULL,
  updated_by  BIGINT UNSIGNED NULL,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_page_access_rules UNIQUE (page_key, scope, scope_id),
  INDEX idx_page_access_scope (scope, scope_id),
  CONSTRAINT fk_page_access_rules_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
