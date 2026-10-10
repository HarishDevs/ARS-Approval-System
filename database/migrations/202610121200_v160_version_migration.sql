-- v1.6.0 workflow version migration (unified prompt FN7). Additive only.
-- Each run and each request's outcome is kept, so a migration can be
-- reviewed, reconciled and, if needed, run back the other way.
CREATE TABLE workflow_migrations (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_id      BIGINT UNSIGNED NOT NULL,
  from_version_id  BIGINT UNSIGNED NOT NULL,
  to_version_id    BIGINT UNSIGNED NOT NULL,
  mapping_json     JSON            NOT NULL COMMENT 'source step id -> target step id',
  accept_warnings  BOOLEAN         NOT NULL DEFAULT FALSE,
  requested_by     BIGINT UNSIGNED NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME        NULL,
  moved            INT UNSIGNED    NOT NULL DEFAULT 0,
  skipped          INT UNSIGNED    NOT NULL DEFAULT 0,
  failed           INT UNSIGNED    NOT NULL DEFAULT 0,
  INDEX idx_workflow_migrations_workflow (workflow_id, created_at),
  CONSTRAINT fk_workflow_migrations_workflow FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id),
  CONSTRAINT fk_workflow_migrations_from FOREIGN KEY (from_version_id) REFERENCES workflow_versions(id),
  CONSTRAINT fk_workflow_migrations_to FOREIGN KEY (to_version_id) REFERENCES workflow_versions(id),
  CONSTRAINT fk_workflow_migrations_user FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_migration_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  migration_id  BIGINT UNSIGNED NOT NULL,
  request_id    BIGINT UNSIGNED NOT NULL,
  outcome       ENUM('MOVED', 'SKIPPED', 'FAILED') NOT NULL,
  verdict       VARCHAR(20)     NULL,
  message       VARCHAR(500)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_migration_items_run (migration_id),
  INDEX idx_migration_items_request (request_id),
  CONSTRAINT fk_migration_items_run FOREIGN KEY (migration_id) REFERENCES workflow_migrations(id),
  CONSTRAINT fk_migration_items_request FOREIGN KEY (request_id) REFERENCES approval_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
