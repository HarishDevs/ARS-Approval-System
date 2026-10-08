-- WhatsApp template creator (S7, D-076, F-42b). Each version keeps what was
-- sent to CEOITBox and what Meta said about it. Versions are never edited
-- after submission: a change becomes the next version with a new name.
ALTER TABLE whatsapp_templates
  ADD COLUMN category          VARCHAR(20)     NOT NULL DEFAULT 'UTILITY' AFTER language,
  ADD COLUMN body_text         TEXT            NULL COMMENT 'body as sent, with {{1}}, {{2}}' AFTER category,
  ADD COLUMN footer_text       VARCHAR(60)     NULL AFTER body_text,
  ADD COLUMN provider_status   VARCHAR(30)     NULL COMMENT 'NOT_SUBMITTED, SUBMITTED, or Meta status (APPROVED, PENDING, REJECTED, PAUSED, DISABLED)' AFTER approval_status,
  ADD COLUMN rejection_reason  VARCHAR(500)    NULL AFTER provider_status,
  ADD COLUMN submitted_at      DATETIME        NULL AFTER rejection_reason,
  ADD COLUMN submitted_by      BIGINT UNSIGNED NULL AFTER submitted_at,
  ADD COLUMN synced_at         DATETIME        NULL AFTER submitted_by,
  ADD CONSTRAINT fk_whatsapp_templates_submitted_by FOREIGN KEY (submitted_by) REFERENCES users(id);
