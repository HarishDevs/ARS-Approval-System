-- QA fixes (S8-06, docs/qa/QA-TEST-SUITE.md §39).
-- D-QA-01: a one-time key per submitted form, so a retried submit returns
-- the first request instead of creating a second one. NULL for requests
-- made before this change (unique allows many NULLs).
ALTER TABLE approval_requests
  ADD COLUMN submission_key CHAR(36) NULL COMMENT 'one-time key from the form (idempotent submit)' AFTER requester_id,
  ADD CONSTRAINT uq_approval_requests_submission UNIQUE (requester_id, submission_key);

-- D-QA-06: notification outbox. Messages for a request action are written in
-- the same transaction as the action, sent right after the commit, and any
-- left unsent (crash, restart) are sent by the job runner. Sent rows are
-- kept for 30 days by housekeeping.
CREATE TABLE notification_outbox (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id    BIGINT UNSIGNED NULL,
  payload_json  JSON            NOT NULL COMMENT 'NotifyInput',
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  claimed_at    DATETIME(3)     NULL COMMENT 'set by whoever is sending it',
  sent_at       DATETIME(3)     NULL,
  attempts      INT UNSIGNED    NOT NULL DEFAULT 0,
  INDEX idx_notification_outbox_unsent (sent_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
