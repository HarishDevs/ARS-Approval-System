-- v1.6.0 (owner's master prompt). Additive only: v1.5.0 code ignores these,
-- so a rollback to v1.5.0 keeps working.

-- Per-person settings that aren't notification choices, e.g. the theme
-- (UI-02). One row per setting; a missing row means the default.
CREATE TABLE user_settings (
  user_id      BIGINT UNSIGNED NOT NULL,
  setting_key  VARCHAR(60)     NOT NULL,
  value        VARCHAR(200)    NOT NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, setting_key),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
