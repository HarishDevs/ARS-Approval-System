-- v1.6.0 (owner's master prompt). Additive only: v1.5.0 code ignores these,
-- so a rollback to v1.5.0 keeps working.

-- Per-person settings that aren't notification choices, e.g. the theme
-- (UI-02). One row per setting; a missing row means the default.
CREATE TABLE user_settings (
  user_id      BIGINT UNSIGNED NOT NULL,
  setting_key  VARCHAR(60)     NOT NULL,
  value        VARCHAR(200)    NOT NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, setting_key),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WS-04 Recently viewed requests: one row per person and request, the time
-- of the last visit. Lists re-check access, so losing access hides the row.
CREATE TABLE recent_views (
  user_id     BIGINT UNSIGNED NOT NULL,
  request_id  BIGINT UNSIGNED NOT NULL,
  viewed_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, request_id),
  INDEX idx_recent_views_user_time (user_id, viewed_at),
  CONSTRAINT fk_recent_views_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_recent_views_request FOREIGN KEY (request_id) REFERENCES approval_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EN-06 Consultation: an approver asks someone for advice. The consultee can
-- read the request and answer; they never get a decision (BD-9).
CREATE TABLE consultations (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id    BIGINT UNSIGNED NOT NULL,
  requested_by  BIGINT UNSIGNED NOT NULL,
  consultee_id  BIGINT UNSIGNED NOT NULL,
  question      VARCHAR(2000)   NOT NULL,
  answer        VARCHAR(2000)   NULL,
  status        ENUM('OPEN', 'ANSWERED', 'WITHDRAWN') NOT NULL DEFAULT 'OPEN',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  answered_at   DATETIME        NULL,
  INDEX idx_consultations_request (request_id),
  INDEX idx_consultations_consultee (consultee_id, status),
  CONSTRAINT fk_consultations_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_consultations_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_consultations_consultee FOREIGN KEY (consultee_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RD-03 What was submitted in each round, so a resubmission can show what
-- changed. Written by the service when a request is submitted, resubmitted
-- or reopened; older requests have no rows (the page says so).
CREATE TABLE request_revisions (
  request_id   BIGINT UNSIGNED NOT NULL,
  round        INT UNSIGNED    NOT NULL,
  title        VARCHAR(200)    NOT NULL,
  fields_json  JSON            NOT NULL,
  created_by   BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id, round),
  CONSTRAINT fk_request_revisions_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_revisions_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EN-08 Linked requests: "related" both ways, or "follow-up" (raised from an
-- approved request). A link never gives access: each side is shown only to
-- people who can already see it.
CREATE TABLE request_links (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_request_id  BIGINT UNSIGNED NOT NULL,
  to_request_id    BIGINT UNSIGNED NOT NULL,
  kind             ENUM('RELATED', 'FOLLOW_UP') NOT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_request_links_pair UNIQUE (from_request_id, to_request_id),
  INDEX idx_request_links_to (to_request_id),
  CONSTRAINT fk_request_links_from FOREIGN KEY (from_request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_links_to FOREIGN KEY (to_request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_links_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FN1/FN3/EN-09 (unified prompt): per-type submission policies, kept apart
-- from the versioned form (a policy change applies to new submissions).
ALTER TABLE workflow_definitions
  ADD COLUMN settings_json JSON NULL AFTER resubmit_policy;

-- EN-09 Department budgets per financial year (April–March, India). Amounts
-- in paise. warn_percent: an amber warning once commitments pass it.
CREATE TABLE budgets (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id  BIGINT UNSIGNED NOT NULL,
  fy_start_year  SMALLINT UNSIGNED NOT NULL COMMENT '2026 = April 2026 to March 2027',
  amount_paise   BIGINT UNSIGNED NOT NULL,
  warn_percent   TINYINT UNSIGNED NOT NULL DEFAULT 90,
  updated_by     BIGINT UNSIGNED NOT NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_budgets_dept_fy UNIQUE (department_id, fy_start_year),
  CONSTRAINT fk_budgets_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_budgets_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What the server checked when a request was submitted (FN1, FN3, EN-09):
-- the readiness result, warnings acknowledged, override reason, and the
-- budget position used. Written in the submit transaction; never changed.
CREATE TABLE request_submission_checks (
  request_id        BIGINT UNSIGNED PRIMARY KEY,
  result_json       JSON            NOT NULL,
  acknowledged      BOOLEAN         NOT NULL DEFAULT FALSE,
  override_reason   VARCHAR(500)    NULL,
  budget_department BIGINT UNSIGNED NULL,
  budget_fy         SMALLINT UNSIGNED NULL,
  budget_paise      BIGINT UNSIGNED NULL,
  committed_paise   BIGINT UNSIGNED NULL COMMENT 'before this request',
  request_paise     BIGINT UNSIGNED NULL,
  budget_state      ENUM('NOT_CHECKED', 'NO_BUDGET', 'OK', 'WARN', 'OVER') NOT NULL DEFAULT 'NOT_CHECKED',
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_submission_checks_budget (budget_department, budget_fy),
  CONSTRAINT fk_submission_checks_request FOREIGN KEY (request_id) REFERENCES approval_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FN4 / RP-01 personal templates: reusable values for one approval type.
CREATE TABLE request_templates (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  workflow_id  BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(80)     NOT NULL,
  title        VARCHAR(200)    NULL,
  fields_json  JSON            NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_request_templates_owner_name UNIQUE (user_id, workflow_id, name),
  CONSTRAINT fk_request_templates_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_request_templates_workflow FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
