-- v1.51.2 (owner: "all the on time parts make check boxes, don't calculate
-- automatically"): the Coordinator ticks whether the points and MOM were in
-- time and whether the meeting started and ended on time (the register's
-- tick columns). NULL = not answered yet. Additive.
-- Rollback (after rolling the code back):
--   ALTER TABLE meetings DROP COLUMN points_on_time, DROP COLUMN started_on_time, DROP COLUMN ended_on_time, DROP COLUMN mom_on_time;
ALTER TABLE meetings
  ADD COLUMN points_on_time  BOOLEAN NULL AFTER mom_remarks,
  ADD COLUMN started_on_time BOOLEAN NULL AFTER points_on_time,
  ADD COLUMN ended_on_time   BOOLEAN NULL COMMENT 'FALSE = extended past the scheduled end' AFTER started_on_time,
  ADD COLUMN mom_on_time     BOOLEAN NULL AFTER ended_on_time;
