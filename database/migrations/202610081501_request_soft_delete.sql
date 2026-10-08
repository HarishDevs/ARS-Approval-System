-- Super Admin deletes a request (S11-07, D-086, F-73). Soft delete: the row,
-- its timeline and the audit log stay (D-012); every screen, queue, job and
-- report ignores a deleted request.
ALTER TABLE approval_requests
  ADD COLUMN deleted_at    DATETIME        NULL COMMENT 'D-086: hidden everywhere once set' AFTER closed_at,
  ADD COLUMN deleted_by    BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN delete_reason VARCHAR(500)    NULL AFTER deleted_by,
  ADD CONSTRAINT fk_approval_requests_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id),
  ADD INDEX idx_approval_requests_deleted (deleted_at);
