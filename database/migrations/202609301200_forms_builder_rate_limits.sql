-- S3: the form and the builder description travel with each workflow
-- version (D-055, D-056), and a hit table for rate limiting (D-059).
ALTER TABLE workflow_versions
  ADD COLUMN form_json JSON NULL COMMENT 'FormField[] for requests on this version' AFTER definition_json,
  ADD COLUMN builder_json JSON NULL COMMENT 'BuilderSpec the graph was compiled from; NULL if hand-made' AFTER form_json;

-- Sliding-window counters (F-09). Not history: the retry runner deletes
-- rows older than a day.
CREATE TABLE rate_limit_hits (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket       VARCHAR(190) NOT NULL COMMENT 'e.g. signin:ip:1.2.3.4 or forgot:login:emp005',
  occurred_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_rate_limit_hits_bucket (bucket, occurred_at),
  INDEX idx_rate_limit_hits_time (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
