-- Working calendar for response times (F-31, D-067). Working days are a
-- setting (calendar.working_days in system_settings, default MON-SAT).
CREATE TABLE holidays (
  holiday_on  DATE            NOT NULL PRIMARY KEY COMMENT 'India date',
  name        VARCHAR(100)    NOT NULL,
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_holidays_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Escalation time on the same calendar (twice the working time).
ALTER TABLE approval_tasks
  ADD COLUMN escalate_at DATETIME NULL COMMENT 'created_at + 2x the step SLA in working hours' AFTER due_at;
