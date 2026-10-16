-- v1.9.0: optional append-only guards for the task and information history
-- (task_events, info_events). The app only ever inserts into these tables,
-- so it works without them; they add a database-level lock against edits.
--
-- The app's database user can't create triggers on hosted MySQL with binary
-- logging (needs SUPER), so the migration skips them with a warning. To add
-- them: cPanel -> phpMyAdmin -> choose the app database -> SQL -> paste this
-- file -> Go. Running it twice only reports "already exists".
CREATE TRIGGER trg_task_events_no_update BEFORE UPDATE ON task_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_events is append-only';
CREATE TRIGGER trg_task_events_no_delete BEFORE DELETE ON task_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'task_events is append-only';
CREATE TRIGGER trg_info_events_no_update BEFORE UPDATE ON info_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'info_events is append-only';
CREATE TRIGGER trg_info_events_no_delete BEFORE DELETE ON info_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'info_events is append-only';
