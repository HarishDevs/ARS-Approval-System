-- D-185 (owner): "Try as" for every person, from their user page, by the IT
-- team. It opens in a private window from a one-time link; the trial session
-- is view-only and records who opened it. Additive: a new enum value and a
-- nullable column; rollback = redeploy the previous release.
ALTER TABLE user_sessions
  MODIFY COLUMN auth_method ENUM('GOOGLE', 'PASSWORD_OTP', 'DEMO', 'TRY_AS') NOT NULL,
  ADD COLUMN tried_by BIGINT UNSIGNED NULL COMMENT 'D-185: the admin who opened this view-only Try as session',
  ADD CONSTRAINT fk_user_sessions_tried_by FOREIGN KEY (tried_by) REFERENCES users (id);
