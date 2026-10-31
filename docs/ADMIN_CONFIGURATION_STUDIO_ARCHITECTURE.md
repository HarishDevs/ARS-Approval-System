# Admin Configuration Studio: Architecture and Decisions

ARS-CMS, from 31 Oct 2026 (D-235 onwards). Owner brief: "Build all of it, start with the form fields editor". It covers the redesign of the Workflow Builder, the Form Fields Editor and the Super Admin Settings, following the owner's Configuration Studio specification.

- Audit: [ADMIN_CONFIGURATION_STUDIO_AUDIT.md](ADMIN_CONFIGURATION_STUDIO_AUDIT.md)
- Progress: [ADMIN_CONFIGURATION_STUDIO_IMPLEMENTATION_LOG.md](ADMIN_CONFIGURATION_STUDIO_IMPLEMENTATION_LOG.md)

## 1. Principles (fixed)

1. **The server stays the authority.** Every editor only produces the existing JSON:
   - `BuilderSpec` (`server/workflows/builder.ts`)
   - `FormField[]` (`server/forms/fields.ts`)
   - setting values (`server/settings/definitions.ts`)

   These go through the existing server actions, zod schemas, business rules, permission checks (`requireArea`, `getAdminActor`, Super Admin only) and transactions. The UI may be rebuilt freely, but no rule moves to the client.
2. **One design language.** It uses the ARS tokens (light and dark from the same tokens) and the D-234 standards: `btn-danger-quiet` + confirmation for removals, `UnsavedGuard`, tabs and folds for advanced options, labels tied to inputs. No second styling system and no new dependencies.
3. **Shared behaviour, not three copies.** These are built once and reused:
   - undo/redo history
   - confirm-before-remove
   - the properties panel pattern
   - the condition builder
   - the save status
4. **Nothing pretends.** No button without a working action, no invented statistics, and no "Saved" before the server confirms.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D-235a | **DoA is dropped from custom approvals.** The "DoA matrix" switch is removed from Admin → Custom approval, and the requester's levels editor never offers it. An old stored `features.doa` is ignored, and the server still refuses a DoA stage on a custom request. | `checkCustomSpec` always refused it (D-075: a DoA matrix belongs to an approval type), so the switch was a non-working option. Owner: "Drop it". |
| D-235b | **Form Designer = library · canvas · properties.** It uses the same component (`FormFieldsEditor`) in all four places, so no second editor exists. On a narrow container the properties open under the chosen field instead of a right column (measured on the designer's own width, not the window's). | It is used inside the workflow builder's column, which is narrower than the screen. |
| D-235c | **Stable field identity.** Each field carries a client-side id while it is edited, so reorder, remove and duplicate never mix up "key typed by hand" or the open field. Saved keys stay locked. | Rows used to be keyed by position. |
| D-235d | **Remove asks first and can be undone.** Undo/redo keeps up to 100 snapshots, and typing in one box counts as one step. A type change that would drop settings asks first and names what goes. | Owner: "removals don't ask first". |
| D-235e (planned) | **Workflow autosave uses a working draft.** Every save currently inserts a new DRAFT version. Autosave will update the latest DRAFT in place, guarded by a revision number so a stale editor can't overwrite another's work. It creates the draft only when none exists, and saves only content that `resolveContent` accepts (otherwise it shows "Not saved: fix N problems"). Publish stays a separate, confirmed action. Needs one additive migration (`workflow_versions.draft_revision`). | Avoids hundreds of draft versions; keeps publish explicit. |
| D-235f (planned) | **One settings console with one Save per category.** It keeps the server's per-group transaction (`saveSettingsGroup`). Blank secret = keep; "Remove" = clear; secrets never reach the browser. | The current screens have 15 separate Save buttons on two pages. |

## 3. Components

| Piece | Where | Used by |
|---|---|---|
| `FormFieldsEditor` (Form Designer) | `features/admin/FormFieldsEditor.tsx` | WorkflowBuilder, CustomApprovalSetup, ModuleTypeEditor (task and information types) |
| Field model (pure, unit-tested) | `features/admin/form-designer/model.ts` | Designer; tests |
| `FieldProperties` (tabs, rule editor, options, formula insert chips) | `features/admin/form-designer/FieldProperties.tsx` | Designer |
| `ConfirmDialog`, `useToast` (Undo action), `Hint`, `UnsavedGuard` | `features/ui/*` | All editors |
| Workflow Designer, Settings console, shared history and save status | (next phases) | — |

## 4. Test strategy

- **Pure rules** (move, duplicate keys, type-change losses, dependents, problems): `tests/workflows/form-designer.test.ts`.
- **Behaviour:** `tests/e2e/v138-form-designer.spec.ts`.
- **Older specs** that drove the old editor were updated where the property moved to a tab (Validation, Conditions, Advanced) or needs its field chosen first.
- The server rules keep their own tests unchanged.
