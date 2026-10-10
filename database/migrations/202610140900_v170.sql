-- v1.7.0 (lists A, B and C). Additive only: v1.6.x code ignores all of it,
-- so a rollback to v1.6.2 keeps working.

-- A1 approval expiry: fixed when the request is approved, from the type's
-- "approval valid for" days at that moment. The notice is sent once.
ALTER TABLE approval_requests
  ADD COLUMN valid_until        DATETIME NULL COMMENT 'A1: approved requests of types with a validity period' AFTER closed_at,
  ADD COLUMN expiry_notified_at DATETIME NULL COMMENT 'A1: the 7-day notice was queued' AFTER valid_until,
  ADD INDEX idx_approval_requests_validity (status, valid_until);
