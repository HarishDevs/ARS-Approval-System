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
