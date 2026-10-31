# Admin Configuration Studio: Test Report

31 Oct 2026, ARS-CMS v1.37.0 and v1.38.0, on the owner's Windows machine. The MySQL 8 test database ran in Docker, and the production build was served on port 3100.

## Results

| Suite | Before (v1.36.0) | After (v1.38.0) |
|---|---|---|
| Unit (Vitest) | 752 | **767 passed** |
| Integration (Vitest, MySQL) | 303 | **309 passed** |
| End to end (Playwright) | 194 / 194 | **200 specs**: 191 passed in the full run; the 2 failures and 7 not run were re-run after the fix below, and all 21 passed |
| Lint, typecheck | clean | clean |

## New tests

**Unit**
- `tests/workflows/form-designer.test.ts` (6): move, duplicate keys, type-change losses, dependants, problems.
- `tests/workflows/workflow-designer.test.ts` (5):
  - problems per level (people, the requester on an approval step, the person field, any-N, skip-rule field, parallel N, choice paths, DoA limits and bands);
  - summaries;
  - duplicate with fresh ids;
  - the browser copy is offered only for the same version.

**End to end**
- `v138-form-designer`: the field library, reorder (buttons and Alt+arrows), duplicate, remove with a question and Undo, Undo/Redo, type change with a question.
- `v1391-workflow-designer`:
  - the map;
  - "Ready to save" and "N to fix" on the level, the toolbar and the map;
  - duplicate;
  - remove with a question and Undo;
  - Collapse all, and opening a level from the map;
  - Alt+↓.
- `v1392-settings-console`:
  - categories and search across them ("No setting matches");
  - the Unsaved mark on the category and in the list;
  - the AI page's single Save, and search narrowing it to one provider.

## Updated tests (a control moved, so the test moved with it)

- `v140-ui`: Remove level now asks first.
- `session12`, `v160-smart-forms`, `v161`, `v190`: field properties are in tabs (D-235).
- `v180`: no DoA option on custom approvals (D-235a).

## Found and fixed while testing

1. **The workflow form kept its unsaved mark after a save.** The leave guard asked "Leave without saving?" on "Compare with live" after publishing (v160-smart-zversions). The builder's form now receives the save signal.
2. **The AI provider Test was a form inside a form** once the AI settings became one form. It is now a button.

## Environment notes

- The production build took 7.5 minutes on this machine, against Playwright's 5-minute server limit. The full runs used a scratch config with the same suite and server and a 15-minute limit; the project's config is unchanged.
- One full run lost its network part-way (`ERR_NETWORK_IO_SUSPENDED`; the computer suspended), and one test lost the database connection (`ETIMEDOUT`). Both were re-run.

## v1.39.0 (working draft on the server, one condition builder)

| Suite | Result |
|---|---|
| Unit | 767 passed |
| Integration | 312 passed (new: `workflow-draft`, 3) |
| End to end | **201 / 201 passed** in one full run (new: v1391 autosave) |
| Lint, typecheck | clean |
