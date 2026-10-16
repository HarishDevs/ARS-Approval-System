-- v1.11.0 (D-152 to D-155): Google Calendar two-way sync, configured by the
-- Super Admin, connected by each person to their own Google account.
-- Additive only: new tables, no change to existing ones.
-- Secrets (the OAuth client secret, access and refresh tokens) are stored
-- AES-256-GCM encrypted with ENCRYPTION_KEY; never in plain text.

-- One row (id = 1): the integration's global set-up.
CREATE TABLE gcal_settings (
  id                 TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled            BOOLEAN          NOT NULL DEFAULT FALSE,
  maintenance        BOOLEAN          NOT NULL DEFAULT FALSE,
  client_id          VARCHAR(255)     NULL,
  client_secret_enc  TEXT             NULL,
  config_json        JSON             NOT NULL,
  version            INT UNSIGNED     NOT NULL DEFAULT 1,
  updated_by         BIGINT UNSIGNED  NULL,
  updated_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_test_at       DATETIME         NULL,
  last_test_ok       BOOLEAN          NULL,
  last_test_json     JSON             NULL,
  CONSTRAINT fk_gcal_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gcal_settings (id, config_json) VALUES (1, JSON_OBJECT());

-- A person's connection to their own Google account (one per person).
CREATE TABLE gcal_connections (
  id                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED  NOT NULL,
  google_email        VARCHAR(255)     NULL,
  scopes              VARCHAR(1000)    NOT NULL DEFAULT '',
  refresh_token_enc   TEXT             NULL,
  access_token_enc    TEXT             NULL,
  access_expires_at   DATETIME         NULL COMMENT 'UTC',
  calendar_id         VARCHAR(255)     NULL,
  calendar_name       VARCHAR(255)     NULL,
  sync_token          VARCHAR(1024)    NULL,
  channel_id          VARCHAR(64)      NULL,
  channel_resource_id VARCHAR(255)     NULL,
  channel_token_hash  CHAR(64)         NULL,
  channel_expires_at  DATETIME         NULL COMMENT 'UTC',
  status              ENUM('ACTIVE', 'NEEDS_REAUTH', 'DISCONNECTED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  last_sync_at        DATETIME         NULL COMMENT 'UTC, last successful sync',
  last_error          VARCHAR(500)     NULL,
  last_error_at       DATETIME         NULL,
  lock_until          DATETIME         NULL COMMENT 'one sync per connection at a time',
  connected_at        DATETIME         NULL,
  created_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_gcal_connections_user UNIQUE (user_id),
  CONSTRAINT uq_gcal_connections_channel UNIQUE (channel_id),
  CONSTRAINT fk_gcal_connections_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_gcal_connections_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personal calendar entries in ARS: made in ARS, or brought in from the
-- person's Google Calendar. Only ever shown to their owner.
CREATE TABLE calendar_items (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED  NOT NULL,
  title       VARCHAR(200)     NOT NULL,
  notes       VARCHAR(2000)    NULL,
  all_day     BOOLEAN          NOT NULL DEFAULT FALSE,
  starts_at   DATETIME         NULL COMMENT 'UTC, timed entries',
  ends_at     DATETIME         NULL COMMENT 'UTC, timed entries',
  start_date  DATE             NULL COMMENT 'all-day entries',
  end_date    DATE             NULL COMMENT 'all-day entries, inclusive',
  recurring   BOOLEAN          NOT NULL DEFAULT FALSE COMMENT 'a repeating Google event (first occurrence shown)',
  origin      ENUM('ARS', 'GOOGLE') NOT NULL,
  version     INT UNSIGNED     NOT NULL DEFAULT 1,
  deleted_at  DATETIME         NULL,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_calendar_items_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_calendar_items_user (user_id, deleted_at, starts_at),
  INDEX idx_calendar_items_user_date (user_id, deleted_at, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which ARS record each Google event stands for (the durable mapping).
CREATE TABLE gcal_links (
  id               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id    BIGINT UNSIGNED  NOT NULL,
  user_id          BIGINT UNSIGNED  NOT NULL,
  entity_type      ENUM('APPROVAL_TASK', 'REQUEST', 'TASK', 'INFO', 'ITEM') NOT NULL,
  entity_id        BIGINT UNSIGNED  NOT NULL,
  calendar_id      VARCHAR(255)     NOT NULL,
  google_event_id  VARCHAR(255)     NOT NULL,
  generation       INT UNSIGNED     NOT NULL DEFAULT 0 COMMENT 'part of the event id; raised when an event is made again',
  etag             VARCHAR(255)     NULL COMMENT 'NULL = not yet written to Google',
  origin           ENUM('ARS', 'GOOGLE') NOT NULL,
  content_hash     CHAR(64)         NULL COMMENT 'what ARS last wrote or accepted',
  ars_version      INT UNSIGNED     NULL COMMENT 'calendar_items.version last synced',
  state            ENUM('ACTIVE', 'CANCELLED', 'UNLINKED') NOT NULL DEFAULT 'ACTIVE',
  last_push_at     DATETIME         NULL,
  last_pull_at     DATETIME         NULL,
  last_error       VARCHAR(500)     NULL,
  created_at       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_gcal_links_entity UNIQUE (connection_id, entity_type, entity_id),
  CONSTRAINT uq_gcal_links_event UNIQUE (connection_id, google_event_id),
  CONSTRAINT fk_gcal_links_connection FOREIGN KEY (connection_id) REFERENCES gcal_connections(id),
  INDEX idx_gcal_links_user (user_id, entity_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sync work, retried with backoff. pending_key is set only while a job waits,
-- so repeated push notifications collapse into one waiting job.
CREATE TABLE gcal_jobs (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id   BIGINT UNSIGNED  NOT NULL,
  kind            ENUM('SYNC', 'FULL_RESYNC', 'RENEW_CHANNEL') NOT NULL,
  reason          VARCHAR(40)      NOT NULL,
  status          ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD') NOT NULL DEFAULT 'PENDING',
  attempts        INT UNSIGNED     NOT NULL DEFAULT 0,
  next_run_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pending_key     VARCHAR(80)      NULL,
  started_at      DATETIME         NULL,
  finished_at     DATETIME         NULL,
  error_category  VARCHAR(40)      NULL,
  error_detail    VARCHAR(500)     NULL,
  result_json     JSON             NULL,
  created_by      BIGINT UNSIGNED  NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_gcal_jobs_pending UNIQUE (pending_key),
  CONSTRAINT fk_gcal_jobs_connection FOREIGN KEY (connection_id) REFERENCES gcal_connections(id),
  INDEX idx_gcal_jobs_due (status, next_run_at),
  INDEX idx_gcal_jobs_connection (connection_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The same event changed in both places before a sync (manual review).
CREATE TABLE gcal_conflicts (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  link_id         BIGINT UNSIGNED  NOT NULL,
  user_id         BIGINT UNSIGNED  NOT NULL,
  conflict_type   ENUM('BOTH_CHANGED', 'DELETED_IN_GOOGLE_CHANGED_IN_ARS') NOT NULL,
  ars_json        JSON             NOT NULL COMMENT 'title and times only',
  google_json     JSON             NOT NULL COMMENT 'title and times only',
  status          ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  resolution      ENUM('KEEP_ARS', 'KEEP_GOOGLE', 'DISMISSED') NULL,
  resolved_by     BIGINT UNSIGNED  NULL,
  resolved_at     DATETIME         NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gcal_conflicts_link FOREIGN KEY (link_id) REFERENCES gcal_links(id),
  INDEX idx_gcal_conflicts_user (user_id, status),
  INDEX idx_gcal_conflicts_link (link_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OAuth "state" values: single use, 10 minutes, bound to the person and to
-- a nonce cookie in their browser (CSRF protection for the callback).
CREATE TABLE gcal_oauth_states (
  state_hash   CHAR(64)         NOT NULL PRIMARY KEY,
  user_id      BIGINT UNSIGNED  NOT NULL,
  nonce_hash   CHAR(64)         NOT NULL,
  expires_at   DATETIME         NOT NULL COMMENT 'UTC',
  used_at      DATETIME         NULL,
  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gcal_oauth_states_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_gcal_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
