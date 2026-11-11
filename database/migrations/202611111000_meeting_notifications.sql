-- v1.51.1 (owner: "use the notification inbox for meeting notifications as
-- well"): Meeting becomes its own Inbox category. Additive: the ENUM gains a
-- value and meeting messages already sent move from Task to Meeting.
-- Rollback (after rolling the code back):
--   UPDATE notifications SET category = 'TASK' WHERE category = 'MEETING';
--   ALTER TABLE notifications MODIFY category ENUM('APPROVAL', 'TASK', 'INFORMATION', 'SYSTEM') NULL;
ALTER TABLE notifications
  MODIFY category ENUM('APPROVAL', 'TASK', 'INFORMATION', 'SYSTEM', 'MEETING') NULL;
UPDATE notifications SET category = 'MEETING' WHERE event_type LIKE 'MEETING\_%';
UPDATE notifications SET entity_type = 'MEETING', entity_id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(deep_link, '/users/meetings/', -1), '?', 1) AS UNSIGNED)
  WHERE event_type LIKE 'MEETING\_%' AND entity_type IS NULL AND deep_link REGEXP '/users/meetings/[0-9]+';
