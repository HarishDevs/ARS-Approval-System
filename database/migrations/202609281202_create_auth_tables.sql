-- Sign-in support (P1-10 to P1-23).
-- OTP codes are stored only as keyed hashes. Expiry math is done in SQL
-- (CURRENT_TIMESTAMP), never mixed with JS Dates (Power BI site lesson).
CREATE TABLE otp_challenges (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge_token_hash  CHAR(64)         NOT NULL COMMENT 'hash of the opaque token the browser holds between steps',
  user_id               BIGINT UNSIGNED  NOT NULL,
  channel               ENUM('WHATSAPP') NOT NULL DEFAULT 'WHATSAPP' COMMENT 'D-025: WhatsApp only',
  purpose               ENUM('LOGIN', 'PASSWORD_RESET', 'VERIFY_WHATSAPP') NOT NULL,
  otp_hash              CHAR(64)         NOT NULL,
  expires_at            DATETIME         NOT NULL,
  attempt_count         INT UNSIGNED     NOT NULL DEFAULT 0,
  max_attempts          INT UNSIGNED     NOT NULL DEFAULT 5,
  consumed_at           DATETIME         NULL,
  ip_address            VARCHAR(45)      NULL,
  created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_otp_challenges_token UNIQUE (challenge_token_hash),
  CONSTRAINT fk_otp_challenges_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_otp_challenges_user_created (user_id, created_at),
  INDEX idx_otp_challenges_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A device = a browser holding the signed ars_device cookie (D-043).
CREATE TABLE user_devices (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED  NOT NULL,
  device_key_hash  CHAR(64)         NOT NULL,
  user_agent       VARCHAR(500)     NULL,
  first_seen_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_ip          VARCHAR(45)      NULL,
  trusted_until    DATETIME         NULL,
  CONSTRAINT uq_user_devices_user_key UNIQUE (user_id, device_key_hash),
  CONSTRAINT fk_user_devices_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-side session records so sessions can be revoked
-- ("sign out everywhere", "This wasn't me", deactivation) (P1-16, D-043).
CREATE TABLE user_sessions (
  id              CHAR(36)         NOT NULL PRIMARY KEY COMMENT 'UUID carried inside the signed cookie',
  user_id         BIGINT UNSIGNED  NOT NULL,
  device_id       BIGINT UNSIGNED  NULL,
  auth_method     ENUM('GOOGLE', 'PASSWORD_OTP') NOT NULL,
  ip_address      VARCHAR(45)      NULL,
  user_agent      VARCHAR(500)     NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME         NOT NULL,
  revoked_at      DATETIME         NULL,
  revoke_reason   VARCHAR(50)      NULL,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_sessions_device FOREIGN KEY (device_id) REFERENCES user_devices(id),
  INDEX idx_user_sessions_user (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_agent is VARCHAR(500): real browser UAs overflowed VARCHAR(100) on
-- the Power BI site and broke sign-in (P1-23).
CREATE TABLE login_logs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED  NULL,
  auth_method     ENUM('GOOGLE', 'PASSWORD_OTP') NOT NULL,
  step            ENUM('PASSWORD', 'OTP', 'GOOGLE') NOT NULL,
  success         BOOLEAN          NOT NULL,
  failure_reason  VARCHAR(100)     NULL,
  ip_address      VARCHAR(45)      NULL,
  user_agent      VARCHAR(500)     NULL,
  device_id       BIGINT UNSIGNED  NULL,
  new_device      BOOLEAN          NOT NULL DEFAULT FALSE,
  session_id      CHAR(36)         NULL,
  occurred_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_logs_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_login_logs_user (user_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
