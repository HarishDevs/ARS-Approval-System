-- D-225 (owner): My Tasks gets an Overdue section (open tasks past their due
-- day show there). Each person's Overdue row is made on first use, above
-- their first section (ensureMySections).
ALTER TABLE my_task_sections
  MODIFY COLUMN system_key ENUM('OVERDUE', 'RECENT', 'TODAY', 'UPCOMING', 'LATER') NULL;
