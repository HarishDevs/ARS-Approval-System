-- Set-password links (P1-13, F-04, D-049). Only a keyed hash of the token is
-- stored. Single use; a newer link supersedes older unused ones.
CREATE TABLE password_tokens (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash   CHAR(64)        NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  purpose      ENUM('SET_PASSWORD') NOT NULL DEFAULT 'SET_PASSWORD',
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME        NOT NULL,
  used_at      DATETIME        NULL,
  CONSTRAINT uq_password_tokens_hash UNIQUE (token_hash),
  CONSTRAINT fk_password_tokens_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_password_tokens_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_password_tokens_user (user_id, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
