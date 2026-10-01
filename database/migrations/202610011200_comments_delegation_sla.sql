-- Session 4: comments (F-15), delegation / out of office (F-30), SLA
-- reminders and escalation (F-31).

-- Discussion on a request. Append-only like the rest of the history (D-061).
CREATE TABLE request_comments (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id  BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  body        VARCHAR(2000)   NOT NULL,
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_request_comments_request FOREIGN KEY (request_id) REFERENCES approval_requests(id),
  CONSTRAINT fk_request_comments_author FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX idx_request_comments_request (request_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- @begin
CREATE TRIGGER trg_request_comments_no_update BEFORE UPDATE ON request_comments
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request_comments is append-only';
END;
-- @end

-- @begin
CREATE TRIGGER trg_request_comments_no_delete BEFORE DELETE ON request_comments
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'request_comments is append-only';
END;
-- @end

-- Out of office (D-062): while active, delegate_id may act for user_id.
-- Ended early by setting ended_at; never deleted.
CREATE TABLE delegations (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL COMMENT 'the person who is away',
  delegate_id  BIGINT UNSIGNED NOT NULL,
  starts_on    DATE            NOT NULL,
  ends_on      DATE            NOT NULL,
  reason       VARCHAR(200)    NULL,
  created_by   BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME        NULL,
  ended_by     BIGINT UNSIGNED NULL,
  CONSTRAINT fk_delegations_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_delegations_delegate FOREIGN KEY (delegate_id) REFERENCES users(id),
  CONSTRAINT fk_delegations_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_delegations_ended_by FOREIGN KEY (ended_by) REFERENCES users(id),
  INDEX idx_delegations_user (user_id, ends_on),
  INDEX idx_delegations_delegate (delegate_id, ends_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SLA (D-063): each task can have a due time; reminders are sent once.
ALTER TABLE approval_tasks
  ADD COLUMN due_at DATETIME NULL COMMENT 'created_at + the step SLA hours' AFTER created_at,
  ADD INDEX idx_approval_tasks_due (status, due_at);

CREATE TABLE task_reminders (
  task_id   BIGINT UNSIGNED NOT NULL,
  kind      ENUM('REMINDER', 'ESCALATION') NOT NULL,
  sent_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, kind),
  CONSTRAINT fk_task_reminders_task FOREIGN KEY (task_id) REFERENCES approval_tasks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
