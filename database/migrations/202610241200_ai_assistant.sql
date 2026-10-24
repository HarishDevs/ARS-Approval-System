-- AI module branch (D-169): the AI assistant's conversations. Additive: new
-- tables only. A conversation belongs to one person and only they can open
-- it (the owner is part of every query). No API keys here: provider keys are
-- encrypted settings (Super Admin → AI settings).
CREATE TABLE ai_conversations (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_user_id  BIGINT UNSIGNED  NOT NULL,
  title          VARCHAR(200)     NOT NULL,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_conversations_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  INDEX idx_ai_conversations_owner (owner_user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One question or answer. Usage (provider, model, tokens, time) is kept per
-- answer for limits and cost; a failed answer keeps its safe error message.
CREATE TABLE ai_messages (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id  BIGINT UNSIGNED  NOT NULL,
  role             ENUM('user', 'assistant') NOT NULL,
  content          MEDIUMTEXT       NOT NULL,
  provider         VARCHAR(20)      NULL,
  model            VARCHAR(100)     NULL,
  input_tokens     INT UNSIGNED     NULL,
  output_tokens    INT UNSIGNED     NULL,
  latency_ms       INT UNSIGNED     NULL,
  error            VARCHAR(300)     NULL,
  evidence_json    JSON             NULL COMMENT 'tools run for this answer: name, arguments, result, source, as-of time',
  unverified_json  JSON             NULL COMMENT 'figures in the answer not found in any tool result (shown as a warning)',
  created_at       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_messages_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id),
  INDEX idx_ai_messages_conversation (conversation_id, id),
  INDEX idx_ai_messages_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 7 (D-169): actions the AI proposes. A person decides; nothing is ever
-- carried out automatically (execution is switched off). The content hash
-- and version make an altered proposal fail its decision.
CREATE TABLE ai_proposals (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id   BIGINT UNSIGNED  NULL,
  requested_by      BIGINT UNSIGNED  NOT NULL COMMENT 'the person whose question led to it; never its approver',
  approver_user_id  BIGINT UNSIGNED  NULL COMMENT 'their reporting manager; NULL = any IT Admin',
  kind              ENUM('REMINDER', 'FOLLOW_UP', 'REVIEW', 'OTHER') NOT NULL,
  title             VARCHAR(200)     NOT NULL,
  details           TEXT             NOT NULL,
  evidence_json     JSON             NULL,
  content_hash      CHAR(64)         NOT NULL,
  version           INT UNSIGNED     NOT NULL DEFAULT 1,
  status            ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  decided_by        BIGINT UNSIGNED  NULL,
  decided_at        DATETIME         NULL,
  decision_note     VARCHAR(500)     NULL,
  expires_at        DATETIME         NOT NULL,
  created_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_proposals_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_ai_proposals_approver FOREIGN KEY (approver_user_id) REFERENCES users(id),
  CONSTRAINT fk_ai_proposals_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
  INDEX idx_ai_proposals_requested (requested_by, status),
  INDEX idx_ai_proposals_approver (approver_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 6 (D-169): external data sources, read-only. A run that fails keeps
-- the last good data and marks the source stale; nothing is shown as current
-- unless every page of the run succeeded.
CREATE TABLE ai_sync_runs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_key     VARCHAR(30)      NOT NULL,
  dataset        VARCHAR(80)      NOT NULL,
  status         ENUM('RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL,
  rows_fetched   INT UNSIGNED     NOT NULL DEFAULT 0,
  checkpoint_in  VARCHAR(40)      NULL,
  checkpoint_out VARCHAR(40)      NULL,
  error          VARCHAR(300)     NULL,
  started_by     BIGINT UNSIGNED  NULL,
  started_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at    DATETIME         NULL,
  INDEX idx_ai_sync_runs_source (source_key, dataset, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Records copied from a source (e.g. a Salesforce object), keyed by the
-- source's own stable id, so a repeated or overlapping sync never duplicates.
CREATE TABLE ai_source_records (
  source_key   VARCHAR(30)      NOT NULL,
  dataset      VARCHAR(80)      NOT NULL,
  record_id    VARCHAR(40)      NOT NULL,
  modified_at  DATETIME         NULL,
  data_json    JSON             NOT NULL,
  synced_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_key, dataset, record_id),
  INDEX idx_ai_source_records_modified (source_key, dataset, modified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
