-- v1.53.0 (owner, D-307): Projects is its own module, separate from Tasks.
-- The modules are released one at a time, so nobody gets Projects now: IT
-- switches it on per person (or in bulk) when Projects is released. The Super
-- Admin is exempt from module checks. New people start with Approvals and
-- Tasks. No other row changes.
-- Rollback (after rolling the code back):
--   UPDATE users SET module_access = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', module_access, ','), ',PROJECT,', ',')) WHERE FIND_IN_SET('PROJECT', module_access);
--   ALTER TABLE users MODIFY module_access SET('APPROVAL', 'TASK', 'INFORMATION', 'AI', 'MEETING') NOT NULL DEFAULT 'APPROVAL,TASK,INFORMATION,MEETING';

ALTER TABLE users
  MODIFY module_access SET('APPROVAL', 'TASK', 'PROJECT', 'INFORMATION', 'AI', 'MEETING') NOT NULL DEFAULT 'APPROVAL,TASK';
