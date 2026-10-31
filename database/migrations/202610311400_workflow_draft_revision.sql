-- D-241 (Q-026, owner: "go ahead with all the pending points"): the workflow
-- editor saves to one working draft as it goes. Each save of the open draft
-- raises draft_revision, and a save made from an older revision is refused,
-- so two editors can't overwrite each other's work. Publishing stays a
-- separate, confirmed step.
-- Additive: existing rows get 0, and v1.38 code never reads the column.
-- Rollback: ALTER TABLE workflow_versions DROP COLUMN draft_revision;
ALTER TABLE workflow_versions
  ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 0;
