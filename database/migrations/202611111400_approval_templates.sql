-- v1.54.0 (owner, D-309): approval templates are the person's own: a
-- requester saves the approval levels of a request (never its form values or
-- files) under a name; Approval templates lists them; using one opens New
-- request with the same levels, all editable. Only the person sees theirs.
-- Additive. Rollback (after rolling the code back): DROP TABLE approval_templates;
CREATE TABLE approval_templates (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(80)     NOT NULL,
  spec_json   JSON            NOT NULL COMMENT 'the levels: {"stages": [...]} as the New request form builds them',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_approval_templates_name (user_id, name),
  CONSTRAINT fk_approval_templates_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
