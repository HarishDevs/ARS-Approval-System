-- v1.41.0: installable app, phone/desktop notifications (Web Push) and the
-- daily session (D-250, D-251, D-252). Additive: existing rows keep working
-- and older code never reads the new columns.
-- Rollback (after rolling the code back):
--   DROP TABLE push_subscriptions; DROP TABLE admin_broadcasts;
--   ALTER TABLE notifications DROP COLUMN broadcast_id, DROP COLUMN priority;
--   ALTER TABLE notification_deliveries DROP INDEX idx_notification_deliveries_push, DROP COLUMN subscription_id;
--   (then DELETE the PUSH rows and MODIFY the two channel ENUMs back)
--   ALTER TABLE user_sessions DROP COLUMN session_policy;

-- D-250: DAILY = ends at the next midnight (India time), no idle sign-out.
ALTER TABLE user_sessions
  ADD COLUMN session_policy ENUM('IDLE', 'DAILY') NOT NULL DEFAULT 'IDLE' COMMENT 'D-250' AFTER expires_at;

-- D-252: one row per browser push subscription (a person may have several
-- devices). The endpoint is unique (its hash), so registering the same
-- browser again updates its row, even for another person signing in on it.
-- The two keys are stored encrypted (AES-256-GCM, like other secrets).
-- Signing out never touches this table; only Remove, a 404/410 from the push
-- service, or the browser giving up the subscription ends a row.
CREATE TABLE push_subscriptions (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id            BIGINT UNSIGNED NOT NULL,
  endpoint           VARCHAR(1000)   NOT NULL,
  endpoint_hash      CHAR(64)        NOT NULL COMMENT 'sha256 of the endpoint',
  p256dh_enc         VARCHAR(500)    NOT NULL,
  auth_enc           VARCHAR(300)    NOT NULL,
  device_type        ENUM('PHONE', 'TABLET', 'DESKTOP') NOT NULL DEFAULT 'DESKTOP',
  browser            VARCHAR(40)     NULL,
  operating_system   VARCHAR(40)     NULL,
  installed          BOOLEAN         NOT NULL DEFAULT FALSE COMMENT 'registered from the installed app',
  permission         VARCHAR(20)     NOT NULL DEFAULT 'granted',
  status             ENUM('ACTIVE', 'EXPIRED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  failure_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  last_failure_code  VARCHAR(60)     NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_seen_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'the app last confirmed it',
  last_used_at       DATETIME        NULL COMMENT 'the push service last accepted a message',
  CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint_hash),
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_push_subscriptions_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- D-252: push is a third delivery channel. One delivery row per device and
-- message: QUEUED rows are the push queue (drained right after the action and
-- on every job run); next_retry_at schedules a retry.
ALTER TABLE notification_deliveries
  MODIFY COLUMN channel ENUM('EMAIL', 'WHATSAPP', 'PUSH') NOT NULL,
  ADD COLUMN subscription_id BIGINT UNSIGNED NULL COMMENT 'PUSH only' AFTER channel,
  ADD INDEX idx_notification_deliveries_push (channel, status, next_retry_at);

-- "This device" in Profile → Notifications.
ALTER TABLE notification_preferences
  MODIFY COLUMN channel ENUM('EMAIL', 'WHATSAPP', 'INAPP', 'PUSH') NOT NULL;

-- D-252: notifications sent by IT from Admin → Notifications.
CREATE TABLE admin_broadcasts (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_by     BIGINT UNSIGNED NOT NULL,
  title          VARCHAR(120)    NOT NULL,
  message        VARCHAR(500)    NOT NULL,
  category       ENUM('ANNOUNCEMENT', 'MANAGEMENT', 'SYSTEM', 'IMPORTANT') NOT NULL,
  priority       ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  link           VARCHAR(300)    NULL,
  audience_json  JSON            NOT NULL COMMENT 'who it was aimed at, as chosen',
  audience_text  VARCHAR(300)    NOT NULL,
  recipients     INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_broadcasts_user FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_admin_broadcasts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notifications
  ADD COLUMN broadcast_id BIGINT UNSIGNED NULL COMMENT 'D-252: sent from Admin → Notifications',
  ADD COLUMN priority ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  ADD INDEX idx_notifications_broadcast (broadcast_id);
