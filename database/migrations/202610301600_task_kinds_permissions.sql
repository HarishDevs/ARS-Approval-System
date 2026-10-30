-- D-222 (owner): two kinds of task, Periodic and Ad hoc. An ad hoc task can
-- go to several people at once: each gets their own copy, linked by
-- assign_group_id (the first copy's id). Only an ad hoc task's creator (and
-- IT) changes its details.
ALTER TABLE tasks
  ADD COLUMN assign_group_id BIGINT UNSIGNED NULL,
  ADD INDEX idx_tasks_assign_group (assign_group_id);

-- D-222 (owner's screenshot, Asana's "Project permissions"): per project, who
-- may update each field's values, and who may share its tasks with other
-- projects. JSON checked by server/work/access.ts parseProjectPermissions.
ALTER TABLE projects
  ADD COLUMN permissions_json JSON NULL AFTER template_json;
