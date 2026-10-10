-- v1.6.2: room for a plain-language failure reason (e.g. why a backup
-- failed). Widens one column; no data changes.
ALTER TABLE job_runs MODIFY error_code VARCHAR(500) NULL COMMENT 'plain-language reason, no payloads or secrets';
