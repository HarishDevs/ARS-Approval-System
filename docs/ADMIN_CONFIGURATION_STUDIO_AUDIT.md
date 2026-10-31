# Admin Configuration Studio: Audit

ARS-CMS v1.36.0 baseline, 31 Oct 2026. This is Phase 0 of the Configuration Studio work. Most of the inventory was written from the code the same day, in [ADMIN_EDITORS_REDESIGN_BRIEF.md](ADMIN_EDITORS_REDESIGN_BRIEF.md): routes, guards, data models, storage, server actions, rules, UI, the tests that pin each editor, and pain points. This file adds what the redesign needs on top: risks, the files it touches and leaves alone, database changes, and backward compatibility.

## 1. Baseline

- **Stack:** Next.js 15 App Router, React 19, TypeScript (strict), Tailwind with ARS tokens (light and dark), MySQL 8 (`mysql2`), zod, Vitest, Playwright.
- **Tests at v1.36.0:** unit 752, integration 303, e2e 194 of 194.
- **No client state library.** Editors keep React state and post hidden JSON inputs to server actions (`useActionForm`).
- **Shared UI that the redesign reuses:** `ConfirmDialog` / `Dialog`, `Toast` (with Undo), `UnsavedGuard`, `Hint`, `Menu`, `Drop`, `PeoplePicker`, tokens and `.btn-*`.

## 2. Risks

| Risk | Mitigation |
|---|---|
| E2E specs find controls by label, role and position | Keep the labels. Update a spec only where a control legitimately moved (for example to a tab), with a comment. |
| A field's identity was its position (`key={index}`) | Stable client ids (D-235c) |
| Workflow saves create a new version each time | Working-draft autosave (D-235e), with a revision guard |
| Invalid intermediate states can't be stored (the server refuses them) | Autosave only valid content; show "Not saved: fix N problems" |
| Secrets in settings | Unchanged server path (blank = keep, explicit remove); never in undo history or the browser |
| DoA offered but refused on custom approvals | Dropped (D-235a) |

## 3. Files

| Area | Changed (by phase) | Left alone |
|---|---|---|
| Forms | `features/admin/FormFieldsEditor.tsx` (rewritten), new `features/admin/form-designer/*` | `server/forms/fields.ts` (schemas and rules), `checkFormDefinition`, submission parsing |
| Custom approval | `CustomApprovalSetup.tsx` (DoA switch removed), `server/workflows/step-policy.ts` (feature removed) | `checkCustomSpec` (still refuses DoA), `submitCustomRequest` |
| Workflows (next) | `features/admin/WorkflowBuilder.tsx` split into designer parts; `app/admin/workflows/[id]` layout | The engine (`server/engine/*`), `compileBuilder`, `validateWorkflow`, publish and migration logic |
| Settings (next) | `app/superadmin/settings`, `app/superadmin/ai`, `SettingsGroupForm` | `server/settings/save.ts`, `plan-changes.ts`, encryption |

## 4. Database

- **Phases 1–2:** none.
- **Workflow autosave (planned):** additive only. Add `workflow_versions.draft_revision INT UNSIGNED NOT NULL DEFAULT 0` for the working draft's optimistic concurrency. There is no destructive change. Rollback is dropping the column, after which the old save path still works.

## 5. Backward compatibility

- Existing workflows, forms and settings load unchanged: same JSON, same keys.
- Saved field keys stay locked. Old custom-approval policies with `features.doa` are read without it.
- Routes are unchanged.
