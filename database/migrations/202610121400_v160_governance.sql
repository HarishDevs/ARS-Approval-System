-- v1.6.0 legal holds (unified prompt FN10). Additive only. Retention
-- durations live in system settings (versioned by settings_change_history).

-- A hold keeps the records it covers from deletion or pruning until it is
-- released. Covers one request, everything a person raised, or every
-- request of an approval type.
CREATE TABLE legal_holds (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference       VARCHAR(80)     NOT NULL COMMENT 'matter or case reference',
  reason          VARCHAR(500)    NOT NULL,
  scope_type      ENUM('REQUEST', 'REQUESTER', 'WORKFLOW') NOT NULL,
  scope_id        BIGINT UNSIGNED NOT NULL,
  owner_user_id   BIGINT UNSIGNED NOT NULL COMMENT 'who answers for the hold',
  created_by      BIGINT UNSIGNED NOT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by     BIGINT UNSIGNED NULL,
  released_at     DATETIME        NULL,
  release_reason  VARCHAR(500)    NULL,
  INDEX idx_legal_holds_active (released_at, scope_type, scope_id),
  CONSTRAINT fk_legal_holds_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_legal_holds_created FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_legal_holds_released FOREIGN KEY (released_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
