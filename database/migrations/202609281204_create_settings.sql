-- Settings edited in /superadmin (P1-54, P1-55). Secret values are stored
-- AES-256-GCM encrypted and are never returned to the browser (D-016).
-- History keeps only opaque references, never plaintext secrets.
CREATE TABLE system_settings (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key    VARCHAR(150)    NOT NULL,
  setting_group  VARCHAR(100)    NOT NULL,
  value_type     ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL DEFAULT 'STRING',
  encrypted      BOOLEAN         NOT NULL DEFAULT FALSE,
  value          TEXT            NULL,
  updated_by     BIGINT UNSIGNED NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_system_settings_key UNIQUE (setting_key),
  CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings_change_history (
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key          VARCHAR(150)    NOT NULL,
  changed_by           BIGINT UNSIGNED NULL,
  changed_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  change_type          ENUM('CREATE', 'UPDATE') NOT NULL,
  old_value_reference  VARCHAR(255)    NULL COMMENT 'opaque reference, never plaintext',
  new_value_reference  VARCHAR(255)    NULL COMMENT 'opaque reference, never plaintext',
  CONSTRAINT fk_settings_history_changed_by FOREIGN KEY (changed_by) REFERENCES users(id),
  INDEX idx_settings_history_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
