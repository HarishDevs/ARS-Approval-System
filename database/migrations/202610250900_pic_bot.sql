-- Pic bot - ai (D-172). Additive only: new columns with safe defaults and
-- one new table. Rollback = redeploy v1.15.0, which never reads them.

-- Which chat modes each person may use. Module modes still need the module;
-- GENERAL, SALESFORCE and COMBINED are never on by default (deny by default).
ALTER TABLE users
  ADD COLUMN chat_modes SET('GENERAL', 'APPROVAL', 'TASK', 'INFORMATION', 'SALESFORCE', 'COMBINED') NOT NULL DEFAULT 'APPROVAL,TASK,INFORMATION'
    COMMENT 'D-172: Pic bot modes this person may use (also limited by modules and global settings)',
  ADD COLUMN salesforce_scope ENUM('NONE', 'OWN', 'ALL') NOT NULL DEFAULT 'NONE'
    COMMENT 'D-172: Salesforce records Pic bot may read for this person: none, records they own, or all allowed';

-- A conversation keeps the mode it was started in; nothing from another
-- mode is ever added to it. Conversations from before this release are LEGACY.
ALTER TABLE ai_conversations
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'LEGACY' COMMENT 'D-172: GENERAL, APPROVAL, TASK, INFORMATION, SALESFORCE, COMBINED or LEGACY';

-- The browser sends a fresh key with each question; a repeat of the same key
-- in the same conversation is the same question (retry), never a second one.
ALTER TABLE ai_messages
  ADD COLUMN request_key CHAR(36) NULL COMMENT 'D-172: idempotency key of the question',
  ADD UNIQUE KEY uq_ai_messages_request (conversation_id, request_key),
  ADD KEY idx_ai_messages_request_key (request_key);

-- The one Salesforce connection (OAuth 2.0 web server flow with PKCE).
-- Tokens are AES-256-GCM encrypted; never sent to the browser or logged.
CREATE TABLE ai_salesforce_connection (
  id                    TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  status                ENUM('DISCONNECTED', 'CONNECTED', 'NEEDS_REAUTH') NOT NULL DEFAULT 'DISCONNECTED',
  instance_url          VARCHAR(255)     NULL,
  connected_user_name   VARCHAR(255)     NULL COMMENT 'the Salesforce user who authorised (shown to the Super Admin)',
  access_token_enc      TEXT             NULL,
  refresh_token_enc     TEXT             NULL,
  scopes                VARCHAR(255)     NULL,
  pending_state_hash    CHAR(64)         NULL COMMENT 'OAuth state of an authorisation in progress (hash only)',
  pending_verifier_enc  TEXT             NULL COMMENT 'PKCE verifier of that authorisation (encrypted)',
  pending_user_id       BIGINT UNSIGNED  NULL,
  pending_expires_at    DATETIME         NULL,
  last_test_at          DATETIME         NULL,
  last_test_ok          BOOLEAN          NULL,
  last_error            VARCHAR(300)     NULL,
  connected_by          BIGINT UNSIGNED  NULL,
  connected_at          DATETIME         NULL,
  updated_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO ai_salesforce_connection (id) VALUES (1);
