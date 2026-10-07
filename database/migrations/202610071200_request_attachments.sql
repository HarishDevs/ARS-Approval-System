-- Attachments on requests (S6-05, F-18, D-072). The bytes live on disk in
-- UPLOAD_DIR (outside the web root); this table is the record. Rows are
-- never deleted or updated: a newer file is simply added.
CREATE TABLE request_attachments (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id     BIGINT UNSIGNED NOT NULL,
  uploaded_by    BIGINT UNSIGNED NOT NULL,
  round          INT UNSIGNED    NOT NULL COMMENT 'request round when it was added',
  original_name  VARCHAR(255)    NOT NULL COMMENT 'cleaned file name, as shown and downloaded',
  stored_path    VARCHAR(255)    NOT NULL COMMENT 'relative to UPLOAD_DIR: yyyy/mm/<random id>',
  content_type   VARCHAR(150)    NOT NULL,
  size_bytes     INT UNSIGNED    NOT NULL,
  sha256         CHAR(64)        NOT NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_request_attachments_path UNIQUE (stored_path),
  CONSTRAINT fk_request_attachments_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_request_attachments_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
