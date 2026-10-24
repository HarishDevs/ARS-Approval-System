-- D-187 (owner): AI Rules, the "training" the IT team writes for Pic bot.
-- One document per chat (ALL applies to every chat). Stored as Markdown;
-- every provider receives it with each question. Additive: a new table.
CREATE TABLE ai_rules (
  chat_mode   VARCHAR(20)      NOT NULL PRIMARY KEY COMMENT 'ALL, GENERAL, APPROVAL, TASK, INFORMATION, SALESFORCE or COMBINED',
  content     MEDIUMTEXT       NOT NULL,
  updated_by  BIGINT UNSIGNED  NOT NULL,
  updated_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_rules_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
