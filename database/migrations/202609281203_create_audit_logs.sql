-- Append-only audit log (D-012, P1-37). Nobody, including the Super Admin,
-- can change or delete a row: the triggers below reject UPDATE and DELETE,
-- and the app has no code path that issues them. users are never deleted,
-- so the FKs need no ON DELETE action.
-- Deploy check (P0-17a): creating triggers on GoDaddy's MySQL needs the
-- TRIGGER privilege; if it is refused, the app-level guarantee still holds
-- but record the gap in DEVELOPMENT-MEMORY.
CREATE TABLE audit_logs (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id         BIGINT UNSIGNED  NULL,
  on_behalf_of_user_id  BIGINT UNSIGNED  NULL COMMENT 'delegation (D-018)',
  action                VARCHAR(100)     NOT NULL,
  entity_type           VARCHAR(100)     NOT NULL,
  entity_id             VARCHAR(64)      NULL,
  result                ENUM('SUCCESS', 'FAILURE') NOT NULL DEFAULT 'SUCCESS',
  ip_address            VARCHAR(45)      NULL,
  session_id            CHAR(36)         NULL,
  metadata_json         JSON             NULL COMMENT 'before/after values; never secrets',
  occurred_at           DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_audit_logs_on_behalf FOREIGN KEY (on_behalf_of_user_id) REFERENCES users(id),
  INDEX idx_audit_logs_actor (actor_user_id, occurred_at),
  INDEX idx_audit_logs_entity (entity_type, entity_id, occurred_at),
  INDEX idx_audit_logs_action (action, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- @begin
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
END
-- @end

-- @begin
CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
END
-- @end
