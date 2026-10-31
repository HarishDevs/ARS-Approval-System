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

**Outstanding:** Workflow Designer, Settings console, shared autosave and save status, the condition builder shared with the workflow steps.
