-- Approver designations (S11-01, D-085, F-72). Only people whose designation
-- is ticked as an approver can be chosen as an approver (named steps, group
-- members, HOD, reporting manager, delegate). Every designation that exists
-- today is ticked so nothing changes on deploy; IT unticks the junior ones.
-- New designations start unticked.
ALTER TABLE designations
  ADD COLUMN is_approver BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'D-085: people with this designation can be chosen as approvers' AFTER name;

UPDATE designations SET is_approver = TRUE;
