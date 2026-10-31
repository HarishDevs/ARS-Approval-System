# Admin Configuration Studio: Deployment

Releases: v1.37.0 (Form Designer, D-235) and v1.38.0 (Workflow Designer and settings console, D-239 and D-240). Both are published by the owner, as every release is.

## 1. Database

- **No migration.** Neither release changes a table, a column or stored JSON.
  - Workflows, forms and settings are saved through the same server actions, schemas and transactions as before.
  - The only new storage is in the browser: the Workflow Designer keeps unsaved work under `ars-wf-draft:<workflow>-v<version>` in the editor's own browser. It never reaches the server, and it is cleared by a successful save or by **Discard**.
- **Planned, not run (Q-026):** a server-side working draft would need one additive column. It is shown here for the owner's decision; nothing has been executed.

  ```sql
  -- Up (additive; existing rows get 0)
  ALTER TABLE workflow_versions ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 0;
  -- Rollback (the old save path never reads the column)
  ALTER TABLE workflow_versions DROP COLUMN draft_revision;
  ```

  - **Behaviour change it would bring:** saving would update the open draft in place, with a revision check, instead of adding a new draft version each time. Version numbers would then grow only on publish or restore.
  - **Effect on today's work:** the browser copy (above) already protects unsaved work without the column.

## 2. Publishing

1. Publish v1.37.0, then v1.38.0, the usual way (DEPLOYMENT.md). Nothing has to be set on the server.
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
