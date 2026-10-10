-- v1.6.1: attachment fields on forms, and request collaborators. Additive only.

-- A file can belong to an attachment field of the form (NULL = the general
-- "Attachments" box or a file added later).
ALTER TABLE request_attachments
  ADD COLUMN field_key VARCHAR(50) NULL COMMENT 'the ATTACHMENT form field it was uploaded to' AFTER round;

-- People the requester (or IT) added to follow a request: they can see it,
-- comment and add files, and are told about its progress. They never decide.
CREATE TABLE request_collaborators (
  request_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  added_by    BIGINT UNSIGNED NOT NULL,
  added_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_by  BIGINT UNSIGNED NULL,
  removed_at  DATETIME        NULL,
  PRIMARY KEY (request_id, user_id),
  INDEX idx_request_collaborators_user (user_id, removed_at),
  CONSTRAINT fk_request_collaborators_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_collaborators_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_request_collaborators_added FOREIGN KEY (added_by) REFERENCES users(id),
  CONSTRAINT fk_request_collaborators_removed FOREIGN KEY (removed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
