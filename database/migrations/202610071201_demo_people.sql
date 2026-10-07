-- Demo data (S6-02a, F-57, D-071). Demo people stand in for the staff list
-- until the owner provides it. They can't sign in themselves; the Super
-- Admin can try the app as one ("Try as", auth_method DEMO, audited).
-- "Retire demo staff" makes them inactive, never deleted.
ALTER TABLE users
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'D-071 demo person; never holds admin roles' AFTER is_break_glass;

ALTER TABLE user_sessions
  MODIFY COLUMN auth_method ENUM('GOOGLE', 'PASSWORD_OTP', 'DEMO') NOT NULL;
