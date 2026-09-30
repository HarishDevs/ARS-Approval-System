-- Multi-level approval persistence (north star, S2-06, D-050, F-13).
-- The engine is pure (server/engine); these tables store what it needs:
--   workflow_definitions → workflow_versions (the node graph as JSON; a
--   running request stays on the version it was submitted against)
--   approval_requests (state JSON + optimistic version, permanent number)
--   approval_tasks (a projection of the engine's tasks, for queues)
--   approval_events (append-only timeline)

-- Approver groups: the GROUP approver source (P2-05, S2-06a).
CREATE TABLE approver_groups (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(50)     NOT NULL,
  name         VARCHAR(150)    NOT NULL,
  active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_approver_groups_code UNIQUE (code),
  CONSTRAINT fk_approver_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE approver_group_members (
  group_id     BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  added_by     BIGINT UNSIGNED NULL,
  added_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_approver_group_members_group FOREIGN KEY (group_id) REFERENCES approver_groups(id),
  CONSTRAINT fk_approver_group_members_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_approver_group_members_added_by FOREIGN KEY (added_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PREDEFINED = built by the IT team in /admin; CUSTOM = made by any user
-- for one need (D-026, D-040).
CREATE TABLE workflow_definitions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(50)     NOT NULL,
  name            VARCHAR(150)    NOT NULL,
  description     VARCHAR(1000)   NULL,
  kind            ENUM('PREDEFINED', 'CUSTOM') NOT NULL,
  request_prefix  VARCHAR(10)     NOT NULL COMMENT 'request numbers look like PUR-2026-000421',
  owner_user_id   BIGINT UNSIGNED NULL COMMENT 'creator of a CUSTOM workflow',
  active          BOOLEAN         NOT NULL DEFAULT TRUE,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_workflow_definitions_code UNIQUE (code),
  CONSTRAINT fk_workflow_definitions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_workflow_definitions_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workflow_versions (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workflow_id            BIGINT UNSIGNED NOT NULL,
  version_no             INT UNSIGNED    NOT NULL,
  status                 ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  definition_json        JSON            NOT NULL COMMENT 'engine WorkflowDefinition: nodes + edges',
  -- At most one PUBLISHED version per workflow (MySQL has no partial index).
  published_workflow_id  BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'PUBLISHED', workflow_id, NULL)) STORED,
  created_by             BIGINT UNSIGNED NULL,
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by           BIGINT UNSIGNED NULL,
  published_at           DATETIME        NULL,
  CONSTRAINT uq_workflow_versions_no UNIQUE (workflow_id, version_no),
  CONSTRAINT uq_workflow_versions_one_published UNIQUE (published_workflow_id),
  CONSTRAINT fk_workflow_versions_workflow FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id),
  CONSTRAINT fk_workflow_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_workflow_versions_published_by FOREIGN KEY (published_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per prefix and year, locked while a number is taken.
CREATE TABLE request_sequences (
  prefix      VARCHAR(10)  NOT NULL,
  year        SMALLINT UNSIGNED NOT NULL,
  current_value  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE approval_requests (
  id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_no           VARCHAR(30)     NOT NULL,
  workflow_version_id  BIGINT UNSIGNED NOT NULL,
  requester_id         BIGINT UNSIGNED NOT NULL,
  title                VARCHAR(200)    NOT NULL,
  form_data_json       JSON            NOT NULL,
  status               ENUM('IN_PROGRESS', 'ON_HOLD', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL,
  round                INT UNSIGNED    NOT NULL DEFAULT 1,
  state_json           JSON            NOT NULL COMMENT 'engine InstanceState',
  state_version        INT UNSIGNED    NOT NULL DEFAULT 1 COMMENT 'optimistic check on every write',
  submitted_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at            DATETIME        NULL,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_approval_requests_no UNIQUE (request_no),
  CONSTRAINT fk_approval_requests_version FOREIGN KEY (workflow_version_id) REFERENCES workflow_versions(id),
  CONSTRAINT fk_approval_requests_requester FOREIGN KEY (requester_id) REFERENCES users(id),
  INDEX idx_approval_requests_requester (requester_id, status),
  INDEX idx_approval_requests_status (status, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE approval_tasks (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id     BIGINT UNSIGNED NOT NULL,
  task_key       VARCHAR(40)     NOT NULL COMMENT 'engine task id, unique within the request',
  node_id        VARCHAR(100)    NOT NULL,
  node_label     VARCHAR(200)    NOT NULL,
  round          INT UNSIGNED    NOT NULL,
  approver_id    BIGINT UNSIGNED NOT NULL,
  status         ENUM('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'NOT_REQUIRED', 'CANCELLED') NOT NULL,
  decided_by     BIGINT UNSIGNED NULL COMMENT 'the signed-in actor (G-01)',
  on_behalf_of   BIGINT UNSIGNED NULL COMMENT 'set when a delegate acted (D-018)',
  comment        VARCHAR(2000)   NULL,
  created_at     DATETIME        NOT NULL,
  decided_at     DATETIME        NULL,
  CONSTRAINT uq_approval_tasks_key UNIQUE (request_id, task_key),
  CONSTRAINT fk_approval_tasks_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_approval_tasks_approver FOREIGN KEY (approver_id) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_decided_by FOREIGN KEY (decided_by) REFERENCES users(id),
  CONSTRAINT fk_approval_tasks_on_behalf FOREIGN KEY (on_behalf_of) REFERENCES users(id),
  INDEX idx_approval_tasks_queue (approver_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE approval_events (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id    BIGINT UNSIGNED NOT NULL,
  event_type    VARCHAR(40)     NOT NULL,
  node_id       VARCHAR(100)    NULL,
  actor_id      BIGINT UNSIGNED NULL,
  payload_json  JSON            NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_approval_events_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_approval_events_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_approval_events_request (request_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The timeline is history: like audit_logs, nobody can edit or delete it (G-04).
-- @begin
CREATE TRIGGER trg_approval_events_no_update BEFORE UPDATE ON approval_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'approval_events is append-only';
END;
-- @end

-- @begin
CREATE TRIGGER trg_approval_events_no_delete BEFORE DELETE ON approval_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'approval_events is append-only';
END;
-- @end
