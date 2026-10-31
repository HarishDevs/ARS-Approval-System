# Admin Configuration Studio: Deployment

Releases: v1.37.0 (Form Designer, D-235), v1.38.0 (Workflow Designer and settings console, D-239 and D-240) and v1.39.0 (working draft on the server, D-241; one condition builder, D-242). All are published by the owner, as every release is.

## 1. Database

- **v1.37.0 and v1.38.0: no migration.** Neither changes a table, a column or stored JSON.
  - Workflows, forms and settings are saved through the same server actions, schemas and transactions as before.
  - The only new storage is in the browser: the Workflow Designer keeps unsaved work under `ars-wf-draft:<workflow>-v<version>` in the editor's own browser. It never reaches the server, and it is cleared by a successful save or by **Discard**.
- **v1.39.0: one additive migration** (Q-026 answered by the owner, D-241): `database/migrations/202610311400_workflow_draft_revision.sql`, applied when the app starts like every migration.

  ```sql
  -- Up (additive; existing rows get 0)
  ALTER TABLE workflow_versions ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 0;
  -- Rollback (the old save path never reads the column)
  ALTER TABLE workflow_versions DROP COLUMN draft_revision;
  ```

  - **Behaviour:** saving (by hand, or the editor's autosave) updates the open draft in place, with a revision check, instead of adding a draft version each time. A new version number starts only when the live version was the latest (after a publish) or on restore.
  - **Rollback:** republish v1.38.0, then (optionally) drop the column. v1.38.0 never reads it, so leaving it is harmless.

## 2. Publishing

1. Publish v1.37.0, v1.38.0 and v1.39.0 the usual way (DEPLOYMENT.md). Nothing has to be set on the server; v1.39.0's migration applies when the app starts. After v1.39.0, change a step name on an approval type and wait a few seconds: "Saved to draft version N … Not published." should appear.
2. After publishing, check as IT:
   - Admin → Approval types → any type: the **flow map** is above the levels, and "Ready to save" or "N to fix" shows.
   - Fold a level, then open it from the map.
   - Remove a level: it asks first, and **Undo** in the message brings it back.
3. Check as Super Admin:
   - Settings & providers shows the category list and **Find a setting**.
   - AI settings has one **Save AI settings** button.
   - A provider's **Test** button still works. It is now a plain button inside the one AI form.

## 3. Rollback

Republish the previous release. There is no data to undo: no table was changed, and the browser copies are ignored by older versions.

## 4. Security (unchanged, rechecked)

- **Settings:**
  - Super Admin only (page, layout and every action).
  - Secrets are still write-only: blank keeps the key, "Remove this key" clears it, and the browser never receives a stored key.
  - The search runs in the browser over labels and keys only, never over values.
- **Workflows:**
  - `getAdminActor("admin.workflows")` on every action.
  - `resolveContent` and the engine validation still decide on save.
  - The designer's problem list is guidance only.
- **Autosave never publishes.** Publishing remains its own confirmed step ("Publish version N" → "Yes, publish").
