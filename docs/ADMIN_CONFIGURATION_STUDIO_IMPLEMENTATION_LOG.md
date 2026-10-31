# Admin Configuration Studio: Implementation Log

## Phase 0: Audit (31 Oct 2026)
- Wrote [ADMIN_EDITORS_REDESIGN_BRIEF.md](ADMIN_EDITORS_REDESIGN_BRIEF.md) (the inventory) and [ADMIN_CONFIGURATION_STUDIO_AUDIT.md](ADMIN_CONFIGURATION_STUDIO_AUDIT.md) (risks, files, database, compatibility).
- Wrote [ADMIN_CONFIGURATION_STUDIO_ARCHITECTURE.md](ADMIN_CONFIGURATION_STUDIO_ARCHITECTURE.md) (decisions D-235a–f).
- Baseline: unit 752, integration 303, e2e 194/194.

## Phase 1–2: DoA decision and the Form Designer (31 Oct 2026)

**Files created**
- `features/admin/form-designer/model.ts`
- `features/admin/form-designer/FieldProperties.tsx`
- `tests/workflows/form-designer.test.ts`
- `tests/e2e/v138-form-designer.spec.ts`
- the three studio docs

**Files modified**
- `features/admin/FormFieldsEditor.tsx` (rewritten as the designer; same exports and API)
- `features/admin/CustomApprovalSetup.tsx`
- `features/admin/WorkflowBuilder.tsx` (DoA only on approval types)
- `server/workflows/step-policy.ts`
- Tests: `tests/approvals/v1250-custom-features.test.ts`, e2e `session12`, `v160-smart-forms`, `v161-attachments-collaborators`, `v180`, `v190`

**Functionality**
- **DoA dropped from custom approvals** (D-235a).
- **Form Designer:**
  - field library by group (Basic, Advanced, Layout; click or drag to add);
  - canvas of field cards (type, key, required *, rule and confidential marks, "N to fix");
  - reorder by drag, ↑/↓ buttons or Alt+↑/↓;
  - duplicate with its own key;
  - remove asks first (names fields that use it) and can be undone from the toast or Undo;
  - Undo/Redo (Ctrl+Z / Ctrl+Y outside text boxes);
  - find a field;
  - properties of the chosen field in tabs (General / Validation / Conditions / Advanced; only what its type uses);
  - type changes that drop settings ask first and name them;
  - formula: insert number fields with one click, and a live check;
  - the right column on wide containers, inline under the field on narrow ones.
- **Fixed on the way:**
  - a type change used to drop "confidential", "needed by" and decimals;
  - a dropdown turned into a number kept its text default.

**Database:** none.

**Tests:**
- unit form-designer (6)
- custom features (updated)
- e2e v138 plus the updated specs, in a targeted run: session12, v160-smart-forms, v161, v190, v170-abc, v180, session7 all pass, except v180's list test, which depends on data from earlier specs and passes in the full suite

**Outstanding after this phase:** Workflow Designer, settings console, autosave, a shared condition builder (see Phases 3–4).

## Phase 3: Workflow Designer (31 Oct 2026, v1.38.0, D-239)

**Files created**
- `features/admin/workflow-designer/model.ts`: problems per level, one-line summaries, duplicate with fresh ids, the browser copy's format
- `features/admin/workflow-designer/WorkflowMap.tsx`
- `tests/workflows/workflow-designer.test.ts`
- `tests/e2e/v1391-workflow-designer.spec.ts`

**Files modified**
- `features/admin/WorkflowBuilder.tsx`: the designer shell
- `features/admin/WorkflowPanels.tsx`: Test mode inputs
- `app/admin/workflows/[id]/page.tsx`: the browser-copy key
- `tests/e2e/v140-ui.spec.ts`: Remove level now asks first

**Functionality**
- **Visual mode:** a flow map from "Request submitted" to "Decided":
  - one box per level, with name, summary and "N to fix";
  - parallel steps side by side;
  - a choice as its two paths;
  - the DoA matrix as its bands.
- **Map and list stay in step:** clicking a box opens that level in the structured list, which is the only place it is edited.
- **Structured mode:**
  - every level folds, with a one-line summary when folded; Collapse all / Expand all;
  - drag a level by its handle, or move it with ↑/↓ or Alt+↑/↓ on its header;
  - **Duplicate**, with fresh ids;
  - **Remove level** asks first ("Remove level N?", naming the level) and can be undone from the message or with Undo.
- **Undo / Redo** for the levels (Ctrl+Z / Ctrl+Y outside text boxes). Typing in one box counts as one step. The Form Designer keeps its own history.
- **Contextual validation:**
  - each level lists what to fix, and the toolbar shows "N to fix" (click it to jump) or "Ready to save";
  - these are guidance only, and the server still decides on Save.
  - No check refuses people saved earlier who are no longer approver-eligible: D-085 keeps them valid.
- **Autosave without publishing:**
  - unsaved work is copied to this browser as it changes;
  - on the next visit to the same version: "Restore them" or "Discard";
  - a save clears the copy, and publishing stays a separate confirmed step.
  - The server-side working draft (D-235e) needs an additive column and changes how versions are numbered, so it is put to the owner as Q-026, with the migration and rollback (ADMIN_CONFIGURATION_STUDIO_DEPLOYMENT.md). Not run.
- **Test mode** gives each field type its own input:
  - radio: a list;
  - several options: a multi-select, sent as the JSON list a real request sends;
  - a tick box: a checkbox;
  - date and time: a date-time picker;
  - currency and number: a decimal keypad;
  - link: a URL box;
  - long text: a text area.

**Database:** none.

## Phase 4: Settings console (31 Oct 2026, v1.38.0, D-240)

**Files created**
- `features/superadmin/SettingsConsole.tsx`
- `tests/e2e/v1392-settings-console.spec.ts`

**Files modified**
- `features/superadmin/SettingsGroupForm.tsx`: parts, search, unsaved marks, the leave guard, text areas for long text
- `app/superadmin/settings/page.tsx`
- `app/superadmin/ai/page.tsx`
- `features/ai/AiAdminForms.tsx`: the provider Test is a button, not a nested form

**Functionality**
- **Categories:** listed down the side, with **Unsaved** on any category that has changes.
- **Find a setting** searches names, explanations and keys across every category. It hides what doesn't match and keeps what was typed. "No setting matches" offers **Clear search**.
- **One Save per category,** still the server's per-group transaction with history and audit.
- **AI:** one form, General · Providers (each with its status and Test) · Common, with one **Save AI settings**. It used to be nine forms posting to the same group.
- **Leaving a changed category asks first** (UnsavedGuard).
- **Secrets:** unchanged. Write-only; blank keeps the key; "Remove this key" clears it.

**Database:** none.

## Phase 5: Working draft and one condition builder (31 Oct 2026, v1.39.0, D-241, D-242)

The owner said "go ahead with all the pending points".

**Files created**
- `database/migrations/202610311400_workflow_draft_revision.sql`
- `features/admin/conditions/ConditionRow.tsx`
- `tests/integration/workflow-draft.int.test.ts`

**Files modified**
- `lib/db/repositories/approvals.repository.ts`: `draftRevision`, `updateDraftVersion`
- `server/approvals/service.ts`: `saveWorkingDraft`
- `app/admin/workflows/actions.ts`: `saveDraftAction` saves into the open draft
- `features/admin/WorkflowBuilder.tsx`: autosave and its status, "Save draft"
- `app/admin/workflows/[id]/page.tsx`: the open draft
- `features/admin/form-designer/FieldProperties.tsx`: the shared row
- Tests: `tests/e2e/v1391-workflow-designer.spec.ts` (autosave), `tests/e2e/v160-smart-zversions.spec.ts` ("Save draft")

**Functionality**
- **Working draft:**
  - The editor saves into the open draft about 4 seconds after the last change, and only when nothing is left to fix (otherwise it waits and says so).
  - It makes a draft only when the latest version is live.
  - Every save carries the revision it saw. A save from an older revision, or for a draft that is no longer the open one, is refused and changes nothing; the editor says so, offers Reload, and stops autosaving (the browser copy keeps the work).
  - "Save draft" does the same at once and waits for an autosave in flight.
  - After a publish on the same page the editor follows the new state, so the next change starts the next draft.
  - Publishing is unchanged and still asks first.
- **One condition builder:** both rule editors draw the same row (field, test, value). Each still saves its own shape, so no stored JSON changes. A field that is no longer on the form shows as "(not on the form)".

**Database:** one additive column (above). Rollback: drop it.

## Not done

Nothing from the owner's Configuration Studio brief is left open.
