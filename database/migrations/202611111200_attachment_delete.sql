-- v1.52.3 (owner: "attachments can be deleted until the first approval; after
-- that not, unless an approver asks for changes"): a deleted attachment is
-- hidden everywhere but kept (with who and when) for the audit trail.
-- Rollback (after rolling the code back):
--   ALTER TABLE request_attachments DROP COLUMN deleted_at, DROP COLUMN deleted_by;
ALTER TABLE request_attachments
  ADD COLUMN deleted_at DATETIME NULL,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL,
  ADD INDEX idx_request_attachments_live (request_id, deleted_at);
