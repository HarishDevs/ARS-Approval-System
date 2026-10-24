-- AI module branch (D-168): per-person module access, the four modules of
-- ARS Approvals. Additive: one new column on users with a default, so every
-- existing person and every way a person is created (the form, import, demo
-- people, scripts, seeds) gets exactly what everyone can use today:
-- Approval, Task and Information. Nobody gets AI unless an admin ticks it.
-- The Super Admin is exempt from module checks (like page access, D-039).
ALTER TABLE users
  ADD COLUMN module_access SET('APPROVAL', 'TASK', 'INFORMATION', 'AI') NOT NULL DEFAULT 'APPROVAL,TASK,INFORMATION'
  COMMENT 'D-168: modules this person may use; AI only when granted';
