-- v1.42.1 QA pass (QA-DB-08): two additive indexes for hot reads found in the
-- database review. Nothing else changes; existing queries keep working.
-- Optional and NOT a migration (the mobile brief: no schema change without the
-- owner's approval): the app works the same without them, only slower Inbox and
-- completed-task lists on large data. Once approved, run it once in phpMyAdmin
-- (SQL tab) on the app database.
-- Rollback (after rolling the code back, or any time; both are only speed):
--   ALTER TABLE notifications DROP INDEX idx_notifications_user_inbox;
--   ALTER TABLE tasks DROP INDEX idx_tasks_assignee_completed;

-- The Inbox list and its counts: one person's messages, not archived, newest
-- first (WHERE user_id = ? [AND archived_at IS NULL] ORDER BY id DESC).
ALTER TABLE notifications
  ADD INDEX idx_notifications_user_inbox (user_id, archived_at, id);

-- Completed tasks by person and time: My Tasks' Completed tab, Home's
-- Completed figure and weekly workload, "done this week".
ALTER TABLE tasks
  ADD INDEX idx_tasks_assignee_completed (assignee_id, status, completed_at);
