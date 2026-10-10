-- v1.6.0 amendments after approval (unified prompt FN5). Additive, plus one
-- column made signed so a reduction can be stored (no data change).

-- FN5 amendments after approval. An amendment is a new request of the same
-- type, approved through the workflow again; the original request is never
-- changed. Its effective values are those of the latest APPROVED amendment.
CREATE TABLE request_amendments (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  original_id   BIGINT UNSIGNED NOT NULL,
  amendment_id  BIGINT UNSIGNED NOT NULL,
  reason        VARCHAR(1000)   NOT NULL,
  changes_json  JSON            NOT NULL COMMENT '[{key, from, to}] typed values',
  base_paise    BIGINT          NULL COMMENT 'effective budget amount when raised; the amendment counts only its change',
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_request_amendments_amendment UNIQUE (amendment_id),
  INDEX idx_request_amendments_original (original_id),
  CONSTRAINT fk_request_amendments_original FOREIGN KEY (original_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_amendments_amendment FOREIGN KEY (amendment_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_amendments_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An amendment's budget figure is the change against the effective amount,
-- which can be negative (a reduction).
ALTER TABLE request_submission_checks MODIFY request_paise BIGINT NULL;
