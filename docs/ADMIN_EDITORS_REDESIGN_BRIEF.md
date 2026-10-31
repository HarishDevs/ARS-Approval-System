# Redesign Brief: Workflow Builder, Form Fields Editor, Super Admin Settings

ARS-CMS v1.36.0, 31 Oct 2026. What exists today and how it is built, for the owner's redesign of the three IT-only editors. Everything is taken from the code (file:line references), not from earlier notes.

**Read these first:**
1. **DoA on custom approvals is offered but always refused.** IT can switch on "DoA matrix" in Admin → Custom approval, and the requester then sees "Add a DoA matrix". But `checkCustomSpec` (`server/approvals/service.ts:778`) refuses any DoA stage on a custom request. Decide in the redesign: drop the switch, or allow DoA.
2. **Form fields can't be reordered.** Nothing in the three editors can be duplicated. Removing a level, branch, DoA row, field, option or condition is immediate, with no confirmation and no undo.
3. **The engine doesn't care what the editor looks like.** All three editors only produce JSON that the server checks again in full (zod plus business rules), so the UI can be rebuilt freely. Keep the JSON shapes in §A2, §B2 and §C2, or change them on purpose together with their schemas and tests.
4. **E2E tests find these controls by label, role and position.** §A7, §B7 and §C7 list them. A redesign either keeps those names or updates the tests with it.

---

## A. Workflow builder (approval types and "Who approves" on custom requests)

### A1. Where it lives

| Route | What | Who |
|---|---|---|
| `/admin/workflows` | List of approval types | IT Admin, Super Admin |
| `/admin/workflows/new` | Create (name, code, prefix, form, levels) | same |
| `/admin/workflows/[id]` | Edit (left: builder; right: Versions, Test mode, Submission checks, Details, Delete) | same; 404 unless the type is PREDEFINED |
| `/admin/workflows/[id]/compare`, `/migrate`, `/admin/workflows/import`, `/api/admin/workflows/[id]/export` | Compare versions, move open requests, import and export | same |
| `/admin/custom-approval` | `CustomApprovalSetup`: the custom request's fields and step policy | same |
| `/users/custom` | `CustomApprovalForm`: the requester builds levels with the same `LevelsEditor` | everyone |

- **Area guard:** `requireArea` (`server/authorization/guards.ts:19`) gives a 404 to the wrong role. Super Admin can also make a page Hidden or View-only per person.
- **Actions:** `getAdminActor("admin.workflows")` (`server/admin/actor.ts:11`).

### A2. Data model: the JSON the builder produces (`server/workflows/builder.ts`)

```
BuilderSpec = { stages: Stage[] }            1–30 stages, at most one DOA, choice depth ≤ 3
Stage =
  STEP     { step }
  PARALLEL { id, label, steps[2..10], join: ALL|ANY_ONE|ANY_N, n? }
  BRANCH   { id, label, condition, then[≤20], otherwise[≤20] }    (no DOA inside)
  DOA      { field, limits[1..10] increasing, levels[1..15] {step, bands: bool[limits+1]} }
Step = { id /^[a-z0-9_]{1,30}$/, label, type?: APPROVE|WORK|NOTIFY, note?, approvers: Pick,
         rule: ALL|ANY_ONE|ANY_N, n?, skipWhen?: Condition, onNoApprover?: BLOCK|SKIP, slaHours? 1–720 }
Pick = PEOPLE{userIds 1–50} | ROLE{roleCode} | REQUESTER_MANAGER | REQUESTER_MANAGERS_MANAGER
     | REQUESTER_DEPARTMENT_HOD | DEPARTMENT_HOD{departmentId} | GROUP{groupId}
     | FORM_FIELD_USER{fieldKey} | DESIGNATION{designationId, sameDepartment?} | REQUESTER
Condition = { field, operator: EQ|NEQ|GT|GTE|LT|LTE|IN|NOT_IN|CONTAINS|IS_EMPTY|IS_NOT_EMPTY, value? }
          | { match: ALL|ANY, conditions[1..10] }
```

**Custom-approval step policy** (`server/workflows/step-policy.ts:12-20`): `rule`, `slaHours` and `onNoApprover`, each with a default and "people may change it". The features DoA, choice and skip are off by default.

**Options lists the editor needs** (`features/admin/workflow-options.ts:11`): approver-eligible `people`, `anyone`, roles, departments, groups, designations (with the approver flag), lookups.

### A3. Storage and how it becomes the engine graph
- **`workflow_definitions`:** code, name, kind (PREDEFINED or CUSTOM), request prefix, active, resubmit policy, `settings_json`.
- **`workflow_versions`:** DRAFT, PUBLISHED or ARCHIVED. Each holds `builder_json` (the spec above), `form_json` (fields) and `definition_json` (the compiled graph). A unique generated column allows one published version per type.
- **Every Save inserts a new DRAFT version.** There is no draft-in-place. Publish archives the old live version and publishes the draft, inside a transaction (`approvals.repository.ts:213`).
- **`resolveContent`** (`service.ts:158-181`) runs:
  1. `checkFormDefinition`
  2. `checkDoaForm`
  3. `compileBuilder` (`builder.ts:205-280`): START → `step_<id>` / `par_<id>_split…join` / one node per DoA level with a band-skip / `choice_<id>` condition node → END
  4. approver eligibility
  5. approver designations
  6. engine `validateWorkflow`

### A4. Server actions (`app/admin/workflows/actions.ts`)

| Action | Notes |
|---|---|
| `createWorkflowAction` | Code `^[A-Z0-9_]{2,50}$`, prefix `^[A-Z]{2,6}$` |
| `saveDraftAction` | New version; returns ✗ errors and ! warnings |
| `publishAction` | Needs a valid draft |
| `simulateAction` | Test mode: a sample requester and values, compared with the live version |
| `updateDetailsAction`, `deleteWorkflowAction` | Delete only if the type was never used |
| `updateTypeSettingsAction` | Submission checks |
| `restoreVersionAction` | Refused while a draft exists |
| `runMigrationAction` | Moves open requests |
| `promoteCustomAction` | Custom request → approval type |
| Import / export | `server/workflows/promotion.ts` |
| Custom submit | `submitCustomAction` → `submitCustomRequest` (`service.ts:788`): `applyStepPolicy` → `unavailableFeatures` → `checkCustomSpec` → `resolveContent` |

The whole spec and form travel as **hidden JSON inputs**; a zod failure comes back as one message (the first issue).

### A5. UI today (`features/admin/WorkflowBuilder.tsx`, 917 lines, 7 components)

```
WorkflowBuilder
├─ (create only) Name · Code · Number prefix · Description
├─ FormFieldsEditor                         ← section B
├─ "Preview the form" toggle → RequestForm preview
├─ LevelsEditor
│   └─ StageList (recursive for choices)
│       ├─ each level: "Level N · kind"  ↑ ↓  Remove level
│       ├─ STEP      → StepEditor
│       ├─ PARALLEL  → name, join, N, grid of StepEditors, Add/Remove branch
│       ├─ BRANCH    → choice name, RuleEditor("If"), StageList "Then", StageList "Otherwise"
│       └─ DOA       → DoaEditor: amount field, limits (+/×), band matrix (checkbox per band),
│                      ↑ ↓ Remove per level, then <details> per level with a StepEditor
│   footer: Add a level · Add parallel steps · Add a DoA matrix · Add a choice (if / otherwise)
├─ Save ("Create workflow (as draft)" / "Save as new draft version"), dirty notice
└─ ✗/! check list (not linked to the step it is about)
StepEditor: Step name · Kind of step · Who approves · [People | Role | Department | Group |
            Designation (+same department) | Person field | FYI message]
            · rule · N · Respond within · If nobody… · ☐ Skip this step when… (→ RuleEditor)
```

- **State:** `stages[]`, `form[]` and `previewing` in React state. Dirty is a JSON compare plus its own `beforeunload`; no autosave, and no in-app link guard (unlike `UnsavedGuard` elsewhere).
- **Size:**
  - a plain step shows about 10 controls at once;
  - the default new DoA (2 limits × 3 levels) shows about 50;
  - parallel branches show full StepEditors side by side.
- **Disclosure:** only the DoA per-level `<details>`, the skip checkbox and the preview toggle.
- **Accessibility:**
  - mostly `aria-label` instead of `<label for>`;
  - "Who approves" keeps that name even when the visible label says "Who does it" or "Who to tell";
  - condition rows reuse "Field / Condition / Value";
  - N inputs share "N";
  - reorder is buttons only (no drag); no duplicate.
- **Custom reuse:**
  - `CustomApprovalForm` uses `LevelsEditor` under "Who approves", with draft autosave and the policy context. Fixed options render as text (`fixed-rule`, `fixed-sla`, `fixed-nobody`).
  - `CustomApprovalSetup` shows the fields editor, the three step-option fieldsets ("default" + "People may change it") and "What people may add" (DoA, Choice, Skip).

### A6. Rules the redesign must keep (all enforced on the server too)
- **Approver eligibility (D-085):** only active, approver-designation people for approval steps; anyone for Work and FYI steps. Earlier choices stay valid (`approver-rules.ts:19-56`).
- **Nobody approves their own request:** engine error `APPROVER_IS_REQUESTER`; custom check `checkCustomSpec`. "Requester" can't be picked for an approval step.
- **Limits:**
  - 30 top-level stages, 20 per path;
  - parallel 2–10;
  - choice depth 3;
  - one DoA, top level only, 1–10 limits, 1–15 levels;
  - every band has a level, and every level is in a band.
- **DoA amount field:** on the form, numeric, and required (or CALC); a negative amount is refused.
- **Engine validation:** one Start; reachable End; at least one approval; no dead ends or loops; ANY_N within the number of people; known users, roles and fields.
- **Versions:** publish needs a valid draft; restore is refused while a draft exists; delete only if never used.

### A7. Tests that pin the current UI
- **Unit tests:** builder, branch, DoA matrix, v140 builder, version migration, custom features, v180 rules, promotion (integration).
- **E2E labels and buttons used:**
  - Labels: "Name" (exact), "Code", "Number prefix", "Step name" (placeholder "e.g. HOD approval"), "Kind of step", "Who approves", "Which conditions must hold", "Field" / "Condition" / "Value" (by `.nth`), "Level 1 name", "Limit 1", "HOD needed for Up to ₹2,00,000".
  - Buttons: "Remove level" (`.nth(2)`), "Add a level", "Add parallel steps", "Add a DoA matrix", "Add a choice (if / otherwise)", "+ Add another condition", "Create workflow (as draft)", "Save as new draft version", "Publish version N" → "Yes, publish", "Run test", "Compare with live", "Restore as draft", "Copy as draft".
  - Text: "You have changes that aren't saved yet."
  - Regions: "Form fields", "Steps", "What people may add".
  - Comboboxes: "People (search and pick anyone)" and "People (search and pick; only people who can approve)".
  - Test ids: `fixed-sla`.
- **Specs:** approval-flow, session7, session11, session12, v140-ui, v160-smart-zversions, v170-abc, v180, v137-ux-laws.

### A8. Pain points seen in the code
- One 917-line file. `StepEditor` alone is about 210 lines of per-pick-kind branches. Four near-identical selects (Role, Department, Group, Person field). The "fixed vs editable" policy branch is repeated three times.
- Everything is expanded: every option of every step shows at once.
- Errors are a flat list, not tied to the step or field they are about.
- Two different rule editors: the step condition (`WorkflowBuilder.tsx:620`) and the field rule (`FormFieldsEditor.tsx:92`).
- Test mode gives RADIO, MULTI_CHOICE, CHECKBOX, DATETIME and CURRENCY a plain text box.

---

## B. Form fields editor (used in four places)

### B1. Where it lives
`features/admin/FormFieldsEditor.tsx` (577 lines) is used in:
- the workflow builder (saved keys locked);
- Admin → Custom approval;
- task types and information types (via `ModuleTypeEditor`, with the extra record options "Show in lists", "Searchable" and "Can be changed after it's created").

### B2. Data model (`server/forms/fields.ts`)
- **17 types:** TEXT, LONG_TEXT, NUMBER, DATE, CHOICE, PERSON, LOOKUP, CALC, LINE_ITEMS, SECTION, ATTACHMENT, CURRENCY, DATETIME, MULTI_CHOICE, CHECKBOX, RADIO, URL. The UI shows 18, because LOOKUP is split into Department and Designation.
- **Field options:** `key` (`^[a-z][a-z0-9_]{0,49}$`), `label`, `type`, `required`, `options` (≤ 50), `source` (lookup), `help` (≤ 200), `min`, `showIf`, `requiredIf`, `formula` (CALC), `decimals` 0–4, `defaultValue`, `neededBy` (DATE), `maxFiles` 1–5, `confidential`, `listed`, `searchable`, `editable`.
- **Rule:** `{field, op: EQ|NEQ|GT|GTE|LT|LTE|FILLED|EMPTY, value?}`.
- **Up to 40 fields** on a workflow, 30 on a custom approval or module type.

### B3. Storage
- JSON in `workflow_versions.form_json`, `custom_approval_settings.form_json` (one row) and `module_type_versions.form_json`.
- Posted as a hidden `form` input.

### B4. Server checks (`checkFormDefinition`, `fields.ts:96-148`)
- Unique keys.
- Option types: 2+ options, with no case-insensitive duplicates.
- `min` only on number types; a default must be one of the options; a URL default must be a link.
- LOOKUP needs a source.
- CALC: the formula parses (no eval), refers only to numeric fields, and can't be required.
- SECTION is never required or confidential.
- One "needed by" date.
- `maxFiles` only on attachments.
- Rules point at existing non-section fields, with sensible operators and no cycles.
- **Reserved keys:**
  - custom approval: title, spec, submission_key, collaborator, attachments, allow_duplicate;
  - task and information types: their own reserved list, and no LINE_ITEMS.
- **CALC and line totals are recomputed on the server** on every submit.

### B5. UI today
```
Card "Form fields"
└─ per field (keyed by array index):
   Label · Key (auto from the label until edited; read-only once saved) · Type (+hint) · Required · Remove
   then everything that applies, always visible:
   Help text · Smallest value · Options (chips, paste a list, duplicate note) · Confidential ·
   Needed-by · Formula (+ live check) + Decimals · Up to N files · Default value / Default choice ·
   [record options] · "+ Show only when" · "+ Required when" (each → field / test / value / Remove)
└─ Add field
```

- A plain TEXT field shows about 10 controls; a CHOICE field about 15.
- No collapse, no reorder, no duplicate; Remove doesn't confirm.
- Changing the type rebuilds the field and drops options that no longer apply.
- Row identity is the index, so the "key typed by hand" memory is reset whenever any field is removed.
- Hints show only on hover or focus.

### B6 / B7. Tests that pin it
- **Unit:** form-fields (imports `slugKey` and `operatorsFor` from the component file), smart-forms, attachment-field, v190 rules, v180 rules.
- **E2E labels and buttons used:**
  - Field row: "Field label", "Field key" (read-only once saved), "Field type" (selectOption values such as `CALC`, `MULTI_CHOICE`), "Required: <label>", "Help text for <label>", "Smallest value for <label>", "Most files for <label>", "Formula".
  - Options: "New option for <label>", "Add option", "Remove option <x>", list "Options for <label>", text "Already in the list: capex".
  - Rules: "+ Show only when", "+ Required when", "Show only when: field|test|value", "Required when: field|test|value".
  - Formula error: `"freigt" isn't a field on this form.`
  - Buttons: "Add field", "Save draft", "Preview the form".
- **Specs:** session12, v160-smart-forms, v161-attachments-collaborators, v170-abc, v180, v190.

---

## C. Super Admin settings (85 settings; the AI group has 39)

### C1. Where it lives
- `/superadmin/settings` ("Providers & security") holds 6 groups (Email, WhatsApp, Sign-in security, General, Retention, Feature switches), plus Test send and "Recent changes".
- `/superadmin/ai` holds the AI group, split into "General" (7), seven provider cards (key, model, business data each) and "Common settings" (11), plus emergency-stop and live stats.
- `/superadmin/salesforce` holds AI_DATA (7).
- **Super Admin only:** checked by the page, the layout and every action.

### C2. Data model (`server/settings/definitions.ts`)
- **`SettingDefinition`:** `{ key, group, label, valueType: STRING|NUMBER|BOOLEAN (BOOLEAN unused), encrypted, schema (zod), defaultValue?, choices? }`.
- **Rendering rules:**
  - an ON/OFF enum becomes a switch;
  - another enum becomes a select (labels from `OPTION_LABEL` in the component);
  - `choices` become checkboxes;
  - encrypted becomes a password box with Configured / Not configured and "Remove this key";
  - otherwise a text or number input.
- **Counts:** GENERAL 7, FEATURES 9, RETENTION 2, AUTHENTICATION 10, EMAIL 4 (1 secret), WHATSAPP 7 (2 secrets), AI 39 (7 secrets), AI_DATA 7 (2 secrets).
- **The AI group's 39 settings:**
  - active and fallback provider (NONE, CLAUDE, OPENAI, GROK, DEEPSEEK, GROQ, GEMINI, NVIDIA);
  - for each of the 7 providers: API key (secret), model, "may see business data" (ALLOWED / NOT_ALLOWED);
  - questions per person per day, longest question, wait for answer, keep conversations;
  - emergency stop, floating launcher, general chat, combined chat, module chats (checkboxes);
  - per minute, waiting at once, global concurrency, context turns, longest answer, input and output price (₹).

### C3. Storage, secrets, history
- **`system_settings`** (key, group, type, encrypted, value). Secrets are AES-256-GCM with `ENCRYPTION_KEY` and are never sent to the browser.
- **`settings_change_history`** records old and new as a value reference or a secret fingerprint. The audit entries are SETTING_CHANGED / SETTING_CLEARED.
- **"Recent changes"** shows the last 25, on `/superadmin/settings` only.

### C4. Saving
`saveSettingsAction` (group whitelist) → `planSettingChanges` (pure, unit-tested):
- a blank secret keeps the existing one;
- "Remove" clears it;
- other values save only when they really differ, after zod validation;
- an empty optional value stays unset.

Then `saveSettingsGroup` writes value, history and audit in one transaction.

### C5. UI today
- One `<form>` per card, each with its own Save: 6 on the settings page, 9 on the AI page, all posting `group="AI"`.
- Every setting is visible at once. No unsaved-changes guard; secrets are cleared from the box after a save.
- Labels carry their own explanations, which `splitLabel` turns into a hint at runtime. Some labels are out of date: module chats still says "comma-separated" though it shows checkboxes, and the General card's description names only 2 of its 7 settings.
- Long text values (maintenance notice, Salesforce objects) use one-line inputs.

### C7. Tests that pin it
- **Unit:** plan-changes (8), split-label (2), encryption.
- **E2E:** test ids `ai-providers` (7 providers, "Not set up"), `ai-provider-CLAUDE` with `getByLabel("API key")` of type password, `ai-general` with the switch "Emergency stop", the label "Active provider" (exact), `ai-live`; access checks (404 for non-Super Admins). No e2e test saves a setting through the UI.

---

## D. What stays the same whatever the redesign
- **The server re-checks everything.** The UI may change shape freely, as long as it produces the same JSON (or the schemas and tests change with it).
- **Living files and decisions** that set these rules: D-085 (approver eligibility), D-075 (DoA belongs to approval types), D-206 (custom features), D-016 (404, not "forbidden"), D-183 (setting choices).
- **The design standards** in `docs/UX_DESIGN_STANDARDS.md` apply: tokens, `btn-danger-quiet` + confirm for removals, `UnsavedGuard`, labels associated with inputs, Hick (fold the advanced options).
- **What tests need from the new UI:** the labels, roles and test ids in A7, B7 and C7, or updated tests with the redesign.
