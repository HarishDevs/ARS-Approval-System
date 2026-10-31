-- D-247 (audit FI-D01, BD-5): the weekly HOD report. One row per department
-- and week, claimed before sending, so a department's head gets the week's
-- report once even if the job runs again or twice at the same time.
-- Additive. Rollback: DROP TABLE hod_report_runs;
CREATE TABLE hod_report_runs (
  week_start     DATE            NOT NULL,
  department_id  BIGINT UNSIGNED NOT NULL,
  hod_user_id    BIGINT UNSIGNED NOT NULL,
  status         ENUM('SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'SENDING',
  note           VARCHAR(500)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (week_start, department_id),
  CONSTRAINT fk_hod_report_runs_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_hod_report_runs_hod FOREIGN KEY (hod_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
