"use client";

import { useEffect, useRef, useState } from "react";
import { createWorkflowAction, saveDraftAction } from "@/app/admin/workflows/actions";
import { FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import type { FieldLookups, FormField } from "@/server/forms/fields";
import { ConditionValueInput, FormFieldsEditor, freshCondition, needsValue, operatorsFor } from "@/features/admin/FormFieldsEditor";
import { doaBandLabels, isConditionGroup, MAX_CHOICE_DEPTH, type ApproverPick, type BuilderCondition, type BuilderDoa, type BuilderInnerStage, type BuilderStage, type BuilderStep } from "@/server/workflows/builder";

// Structured workflow builder (D-056, F-50). Stages run in order; a stage
// is one step or several steps in parallel. The server compiles, validates
// and stores it; nothing here is trusted.
export interface BuilderOptions {
  people: { id: number; label: string }[];
  roles: { code: string; name: string }[];
  departments: { id: number; label: string }[];
  groups: { id: number; label: string }[];
  designations: { id: number; label: string; approver: boolean }[];
  lookups: FieldLookups; // department / designation lists for "from the list" fields
}

type StepType = NonNullable<BuilderStep["type"]>;
const STEP_TYPE_LABEL: Record<StepType, string> = {
  APPROVE: "Approval: they approve or reject",
  WORK: "Work task: they do it and mark it done",
  NOTIFY: "FYI: tell them and move on",
};
const WHO_LABEL: Record<StepType, string> = { APPROVE: "Who approves", WORK: "Who does it", NOTIFY: "Who to tell" };

type Rule = BuilderStep["rule"];

const PICK_LABEL: Record<ApproverPick["kind"], string> = {
  PEOPLE: "Specific people",
  REQUESTER_MANAGER: "Requester's manager",
  REQUESTER_MANAGERS_MANAGER: "Requester's manager's manager",
  REQUESTER_DEPARTMENT_HOD: "HOD of the requester's department",
  DEPARTMENT_HOD: "HOD of a department",
  ROLE: "Everyone with a role",
  GROUP: "An approver group",
  FORM_FIELD_USER: "Person chosen in a form field",
  DESIGNATION: "Everyone with a designation",
  REQUESTER: "The requester (work task or FYI only)",
};

function defaultPick(kind: ApproverPick["kind"], options: BuilderOptions): ApproverPick {
  switch (kind) {
    case "PEOPLE":
      return { kind, userIds: [] };
    case "ROLE":
      return { kind, roleCode: options.roles[0]?.code ?? "" };
    case "DEPARTMENT_HOD":
      return { kind, departmentId: options.departments[0]?.id ?? 0 };
    case "GROUP":
      return { kind, groupId: options.groups[0]?.id ?? 0 };
    case "FORM_FIELD_USER":
      return { kind, fieldKey: "" };
    case "DESIGNATION":
      return { kind, designationId: options.designations.find((item) => item.approver)?.id ?? options.designations[0]?.id ?? 0 };
    default:
      return { kind };
  }
}

export function WorkflowBuilder({
  mode,
  workflowId,
  initialStages,
  initialForm,
  options,
}: {
  mode: "create" | "edit";
  workflowId?: number;
  initialStages: BuilderStage[];
  initialForm: FormField[];
  options: BuilderOptions;
}) {
  const [stages, setStages] = useState<BuilderStage[]>(initialStages);
  const [form, setForm] = useState<FormField[]>(initialForm);
  // Keys already saved never change (S12-02).
  const [lockedKeys] = useState(() => initialForm.map((field) => field.key));
  // Random ids: a counter restarts on every page load and would collide
  // with ids already saved in the version being edited.
  const newId = newStepId;
  const { result, pending, onSubmit } = useActionForm(mode === "create" ? createWorkflowAction : saveDraftAction);
  const checks = (result?.ok ? result.data : undefined) as { errors: string[]; warnings: string[] } | undefined;

  // Leaving the page with unsaved changes asks first (audit gap A-05).
  const saved = useRef(JSON.stringify({ initialStages, initialForm }));
  const dirty = JSON.stringify({ initialStages: stages, initialForm: form }) !== saved.current;
  useEffect(() => {
    if (result?.ok) saved.current = JSON.stringify({ initialStages: stages, initialForm: form });
    // Only when a save has just succeeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);


  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {workflowId && <input type="hidden" name="workflowId" value={workflowId} />}
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
      <input type="hidden" name="form" value={JSON.stringify(form)} />

      {mode === "create" && (
        <section className="card grid gap-5 px-5 py-5 sm:grid-cols-2">
          <div>
            <label htmlFor="wf-name" className="field-label">
              Name
            </label>
            <input id="wf-name" name="name" placeholder="e.g. Purchase & SCM Approval" className="field-input" />
            <FieldError result={result} name="name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="wf-code" className="field-label">
                Code
              </label>
              <input id="wf-code" name="code" placeholder="PURCHASE" className="field-input uppercase" />
              <FieldError result={result} name="code" />
            </div>
            <div>
              <label htmlFor="wf-prefix" className="field-label">
                Number prefix
              </label>
              <input id="wf-prefix" name="prefix" placeholder="PUR" maxLength={6} className="field-input uppercase" />
              <FieldError result={result} name="prefix" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="wf-description" className="field-label">
              Description <span className="font-normal text-ink-faint">(shown to people raising a request)</span>
            </label>
            <input id="wf-description" name="description" className="field-input" />
          </div>
        </section>
      )}

      <FormFieldsEditor form={form} setForm={setForm} lockedKeys={lockedKeys} />

      <LevelsEditor stages={stages} setStages={setStages} options={options} form={form} newId={newId} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} className="btn-compact">
          {mode === "create" ? "Create workflow (as draft)" : "Save as new draft version"}
        </SubmitButton>
        <div className="min-w-0 flex-1">
          <ResultMessage result={result} />
          {dirty && !pending && <p className="text-label text-warning-600">You have changes that aren&apos;t saved yet.</p>}
        </div>
      </div>
      {checks && (checks.errors.length > 0 || checks.warnings.length > 0) && (
        <div className="space-y-1 text-label">
          {checks.errors.map((message) => (
            <p key={message} className="text-danger-600">
              ✗ {message}
            </p>
          ))}
          {checks.warnings.map((message) => (
            <p key={message} className="text-warning-600">
              ! {message}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}

export function newStepId(): string {
  return `s${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// The levels list (F-50, F-33): shared by the IT team's workflow builder and
// by staff creating a custom approval. A choice level (D-068) holds two
// nested lists of ordinary levels; choices aren't nested.
export function LevelsEditor({
  stages,
  setStages,
  options,
  form,
  newId,
  title = "Approval levels",
  hint = "Levels run top to bottom. Add as many as you need; a level can have several steps running in parallel, or a choice between paths.",
  allowChoice = true,
}: {
  stages: BuilderStage[];
  setStages: React.Dispatch<React.SetStateAction<BuilderStage[]>>;
  options: BuilderOptions;
  form: FormField[];
  newId: () => string;
  title?: string;
  hint?: string;
  allowChoice?: boolean;
}) {
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-label text-ink-muted">{hint}</p>
      </div>
      <StageList stages={stages} onChange={(next) => setStages(next)} options={options} form={form} newId={newId} allowChoice={allowChoice} depth={0} />
    </section>
  );
}

const stageKey = (stage: BuilderStage) => (stage.kind === "STEP" ? stage.step.id : stage.id);

function StageList({
  stages,
  onChange,
  options,
  form,
  newId,
  allowChoice,
  nested = false,
  depth,
}: {
  stages: BuilderStage[];
  onChange: (stages: BuilderStage[]) => void;
  options: BuilderOptions;
  form: FormField[];
  newId: () => string;
  allowChoice: boolean;
  nested?: boolean;
  depth: number; // choices this list is inside (D-099: up to MAX_CHOICE_DEPTH)
}) {
  const newStep = (label: string): BuilderStep => ({ id: newId(), label, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" });
  const setStage = (index: number, stage: BuilderStage) => onChange(stages.map((item, i) => (i === index ? stage : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const personFields = form.filter((field) => field.type === "PERSON");
  const kindLabel = (stage: BuilderStage) => (stage.kind === "STEP" ? "one step" : stage.kind === "PARALLEL" ? "parallel steps" : stage.kind === "DOA" ? "DoA matrix" : "a choice");
  const hasDoa = stages.some((stage) => stage.kind === "DOA");
  const numberFields = form.filter((field) => field.type === "NUMBER");

  return (
    <>
      <ol className={nested ? "space-y-3" : "divide-y divide-line"}>
        {stages.length === 0 && nested && <li className="text-label text-ink-muted">No levels on this path: it goes straight on.</li>}
        {stages.map((stage, index) => (
          <li key={stageKey(stage)} className={nested ? "rounded-md border border-line p-3" : "px-5 py-4"}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
                Level {index + 1} · {kindLabel(stage)}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn-secondary btn-compact" aria-label="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === stages.length - 1} className="btn-secondary btn-compact" aria-label="Move down">
                  ↓
                </button>
                <button type="button" onClick={() => onChange(stages.filter((_, i) => i !== index))} className="btn-secondary btn-compact text-danger-600">
                  Remove level
                </button>
              </div>
            </div>
            {stage.kind === "STEP" && (
              <StepEditor step={stage.step} onChange={(step) => setStage(index, { kind: "STEP", step })} options={options} form={form} personFields={personFields} />
            )}
            {stage.kind === "PARALLEL" && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input aria-label="Parallel level name" value={stage.label} onChange={(event) => setStage(index, { ...stage, label: event.target.value })} className="field-input" />
                  <select aria-label="How many branches must finish" value={stage.join} onChange={(event) => setStage(index, { ...stage, join: event.target.value as Rule })} className="field-input">
                    <option value="ALL">All branches must finish</option>
                    <option value="ANY_ONE">Any one branch is enough</option>
                    <option value="ANY_N">Any N branches</option>
                  </select>
                  {stage.join === "ANY_N" && (
                    <input aria-label="N" type="number" min={1} max={stage.steps.length} value={stage.n ?? 1} onChange={(event) => setStage(index, { ...stage, n: Number(event.target.value) })} className="field-input w-24" />
                  )}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {stage.steps.map((step, stepIndex) => (
                    <div key={step.id} className="rounded-md border border-dashed border-line p-3">
                      <StepEditor
                        step={step}
                        onChange={(next) => setStage(index, { ...stage, steps: stage.steps.map((item, i) => (i === stepIndex ? next : item)) })}
                        options={options}
                        form={form}
                        personFields={personFields}
                      />
                      {stage.steps.length > 2 && (
                        <button type="button" onClick={() => setStage(index, { ...stage, steps: stage.steps.filter((_, i) => i !== stepIndex) })} className="link mt-2 text-label">
                          Remove this branch
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setStage(index, { ...stage, steps: [...stage.steps, newStep("New branch")] })} className="btn-secondary btn-compact">
                  Add a parallel branch
                </button>
              </div>
            )}
            {stage.kind === "DOA" && (
              <DoaEditor stage={stage} onChange={(next) => setStage(index, next)} options={options} form={form} personFields={personFields} newId={newId} />
            )}
            {stage.kind === "BRANCH" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <input aria-label="Choice name" value={stage.label} onChange={(event) => setStage(index, { ...stage, label: event.target.value })} className="field-input max-w-xs" />
                  <RuleEditor form={form} value={stage.condition} onChange={(condition) => setStage(index, { ...stage, condition })} prefix="If" options={options} />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {(["then", "otherwise"] as const).map((path) => (
                    <div key={path} className="rounded-md bg-surface-muted p-3">
                      <p className="mb-2 text-label font-semibold">{path === "then" ? "Then these levels" : "Otherwise these levels"}</p>
                      <StageList
                        stages={stage[path]}
                        onChange={(next) => setStage(index, { ...stage, [path]: next as BuilderInnerStage[] })}
                        options={options}
                        form={form}
                        newId={newId}
                        allowChoice={allowChoice && depth + 1 < MAX_CHOICE_DEPTH}
                        nested
                        depth={depth + 1}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className={`flex flex-wrap gap-2 ${nested ? "pt-3" : "border-t border-line px-5 py-3"}`}>
        <button type="button" onClick={() => onChange([...stages, { kind: "STEP", step: newStep("New step") }])} className="btn-secondary btn-compact">
          Add a level
        </button>
        <button
          type="button"
          onClick={() => onChange([...stages, { kind: "PARALLEL", id: newId(), label: "Parallel review", join: "ALL", steps: [newStep("Branch A"), newStep("Branch B")] }])}
          className="btn-secondary btn-compact"
        >
          Add parallel steps
        </button>
        {allowChoice && !nested && !hasDoa && (
          <button
            type="button"
            disabled={numberFields.length === 0}
            title={numberFields.length === 0 ? "Add a number field (the amount) first" : undefined}
            onClick={() =>
              onChange([
                ...stages,
                {
                  kind: "DOA",
                  id: newId(),
                  label: "Approval authority (DoA)",
                  field: numberFields.find((field) => field.key === "amount")?.key ?? numberFields[0]?.key ?? "amount",
                  limits: [100000, 1000000],
                  levels: [
                    { step: newStep("Level 1"), bands: [true, true, true] },
                    { step: newStep("Level 2"), bands: [false, true, true] },
                    { step: newStep("Level 3"), bands: [false, false, true] },
                  ],
                },
              ])
            }
            className="btn-secondary btn-compact"
          >
            Add a DoA matrix
          </button>
        )}
        {allowChoice && (
          <button
            type="button"
            disabled={form.length === 0}
            title={form.length === 0 ? "Add a form field first" : undefined}
            onClick={() =>
              onChange([
                ...stages,
                {
                  kind: "BRANCH",
                  id: newId(),
                  label: "Amount check",
                  condition: { field: form[0]?.key ?? "", operator: "GT", value: 500000 },
                  then: [{ kind: "STEP", step: newStep("Extra approval") }],
                  otherwise: [],
                },
              ])
            }
            className="btn-secondary btn-compact"
          >
            Add a choice (if / otherwise)
          </button>
        )}
      </div>
    </>
  );
}

// DoA matrix (D-075, F-58): amount bands across, approval levels down;
// tick which levels each band needs. The levels run top to bottom.
function DoaEditor({
  stage,
  onChange,
  options,
  form,
  personFields,
  newId,
}: {
  stage: BuilderDoa;
  onChange: (stage: BuilderDoa) => void;
  options: BuilderOptions;
  form: FormField[];
  personFields: FormField[];
  newId: () => string;
}) {
  const bandLabels = doaBandLabels(stage.limits);
  const numberFields = form.filter((field) => field.type === "NUMBER");
  const setLevel = (index: number, level: BuilderDoa["levels"][number]) => onChange({ ...stage, levels: stage.levels.map((item, i) => (i === index ? level : item)) });
  const moveLevel = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stage.levels.length) return;
    const levels = [...stage.levels];
    [levels[index], levels[target]] = [levels[target]!, levels[index]!];
    onChange({ ...stage, levels });
  };
  // Adding a limit splits the top band (ticks copied); removing one merges
  // two bands (a level stays needed if either band needed it).
  const addLimit = () => {
    const last = stage.limits.at(-1) ?? 0;
    onChange({ ...stage, limits: [...stage.limits, last * 10 || 100000], levels: stage.levels.map((level) => ({ ...level, bands: [...level.bands, level.bands.at(-1) ?? true] })) });
  };
  const removeLimit = (index: number) => {
    if (stage.limits.length <= 1) return;
    onChange({
      ...stage,
      limits: stage.limits.filter((_, i) => i !== index),
      levels: stage.levels.map((level) => ({ ...level, bands: level.bands.flatMap((tick, band) => (band === index ? [tick || Boolean(level.bands[band + 1])] : band === index + 1 ? [] : [tick])) })),
    });
  };
  const setLimit = (index: number, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    onChange({ ...stage, limits: stage.limits.map((limit, i) => (i === index ? Number(digits || 0) : limit)) });
  };
  const empty = bandLabels.map((_, band) => !stage.levels.some((level) => level.bands[band]));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="field-label">Name</label>
          <input aria-label="DoA name" value={stage.label} onChange={(event) => onChange({ ...stage, label: event.target.value })} className="field-input" />
        </div>
        <div>
          <label className="field-label">Amount field it reads</label>
          <select aria-label="DoA amount field" value={stage.field} onChange={(event) => onChange({ ...stage, field: event.target.value })} className="field-input">
            {!numberFields.some((field) => field.key === stage.field) && <option value={stage.field}>{stage.field} (not on the form)</option>}
            {numberFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label || field.key}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="field-label">Amount limits (₹), lowest first</p>
        <div className="flex flex-wrap items-center gap-2">
          {stage.limits.map((limit, index) => (
            <span key={index} className="flex items-center gap-1">
              <input
                aria-label={`Limit ${index + 1}`}
                inputMode="numeric"
                value={limit ? limit.toLocaleString("en-IN") : ""}
                onChange={(event) => setLimit(index, event.target.value)}
                className="field-input w-36"
              />
              {stage.limits.length > 1 && (
                <button type="button" onClick={() => removeLimit(index)} className="btn-secondary btn-compact h-11" aria-label={`Remove limit ${index + 1}`}>
                  ×
                </button>
              )}
            </span>
          ))}
          {stage.limits.length < 10 && (
            <button type="button" onClick={addLimit} className="btn-secondary btn-compact">
              Add a limit
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Level (runs top to bottom)</th>
              {bandLabels.map((label, band) => (
                <th key={band} className={`text-center ${empty[band] ? "text-danger-600" : ""}`}>
                  {label}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stage.levels.map((level, index) => (
              <tr key={level.step.id}>
                <td>
                  <input aria-label={`Level ${index + 1} name`} value={level.step.label} onChange={(event) => setLevel(index, { ...level, step: { ...level.step, label: event.target.value } })} className="field-input min-w-40" />
                </td>
                {level.bands.map((tick, band) => (
                  <td key={band} className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`${level.step.label} needed for ${bandLabels[band]}`}
                      checked={tick}
                      onChange={(event) => setLevel(index, { ...level, bands: level.bands.map((item, i) => (i === band ? event.target.checked : item)) })}
                      className="h-5 w-5"
                    />
                  </td>
                ))}
                <td className="whitespace-nowrap">
                  <button type="button" onClick={() => moveLevel(index, -1)} disabled={index === 0} className="btn-secondary btn-compact" aria-label="Move level up">
                    ↑
                  </button>{" "}
                  <button type="button" onClick={() => moveLevel(index, 1)} disabled={index === stage.levels.length - 1} className="btn-secondary btn-compact" aria-label="Move level down">
                    ↓
                  </button>{" "}
                  {stage.levels.length > 1 && (
                    <button type="button" onClick={() => onChange({ ...stage, levels: stage.levels.filter((_, i) => i !== index) })} className="btn-secondary btn-compact text-danger-600">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {empty.some(Boolean) && <p className="text-label text-danger-600">Every amount band needs at least one ticked level.</p>}
      <button
        type="button"
        onClick={() => onChange({ ...stage, levels: [...stage.levels, { step: { id: newId(), label: `Level ${stage.levels.length + 1}`, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" }, bands: bandLabels.map(() => false).map((_, band) => band === bandLabels.length - 1) }] })}
        className="btn-secondary btn-compact"
      >
        Add a DoA level
      </button>

      <div className="space-y-3">
        <p className="text-label font-semibold">Who approves at each DoA level</p>
        {stage.levels.map((level, index) => (
          <details key={level.step.id} className="rounded-md border border-line p-3" open={index === 0}>
            <summary className="cursor-pointer text-label font-medium">
              {level.step.label || `Level ${index + 1}`} · needed for {level.bands.map((tick, band) => (tick ? bandLabels[band] : null)).filter(Boolean).join("; ") || "no band yet"}
            </summary>
            <div className="mt-3">
              <StepEditor step={level.step} onChange={(step) => setLevel(index, { ...level, step })} options={options} form={form} personFields={personFields} hideSkip />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

type SimpleCondition = Exclude<BuilderCondition, { match: string }>;

// A rule (D-099): one or more conditions, all or any of which must hold.
// One row is saved as a plain condition, so older specs stay as they were.
function RuleEditor({
  form,
  value,
  onChange,
  prefix,
  options,
}: {
  form: FormField[];
  value: BuilderCondition;
  onChange: (value: BuilderCondition) => void;
  prefix: string;
  options: BuilderOptions;
}) {
  const rows: SimpleCondition[] = isConditionGroup(value) ? (value.conditions as SimpleCondition[]) : [value as SimpleCondition];
  const match = isConditionGroup(value) ? value.match : "ALL";
  const save = (next: SimpleCondition[], nextMatch: "ALL" | "ANY" = match) => onChange(next.length === 1 ? next[0]! : { match: nextMatch, conditions: next });
  return (
    <div className="space-y-2">
      {rows.length > 1 && (
        <select aria-label="Which conditions must hold" value={match} onChange={(event) => save(rows, event.target.value as "ALL" | "ANY")} className="field-input w-auto text-label">
          <option value="ALL">All of these are true</option>
          <option value="ANY">Any one of these is true</option>
        </select>
      )}
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <ConditionEditor
            form={form}
            value={row}
            onChange={(next) => save(rows.map((item, i) => (i === index ? next : item)))}
            prefix={index === 0 ? prefix : match === "ALL" ? "and" : "or"}
            options={options}
          />
          {rows.length > 1 && (
            <button type="button" onClick={() => save(rows.filter((_, i) => i !== index))} className="btn-secondary btn-compact" aria-label={`Remove condition ${index + 1}`}>
              ×
            </button>
          )}
        </div>
      ))}
      {rows.length < 10 && (
        <button type="button" onClick={() => save([...rows, freshCondition(form[0])])} className="link text-label">
          + Add another condition
        </button>
      )}
    </div>
  );
}

// One field-operator-value condition, used inside rules. The operators and
// the value box follow the field's type (S12-04/05).
function ConditionEditor({
  form,
  value,
  onChange,
  prefix,
  options,
}: {
  form: FormField[];
  value: SimpleCondition;
  onChange: (value: SimpleCondition) => void;
  prefix: string;
  options: BuilderOptions;
}) {
  const field = form.find((item) => item.key === value.field);
  return (
    <div className="flex flex-wrap items-center gap-2 text-label">
      {prefix && <span className="font-medium">{prefix}</span>}
      <select value={value.field} onChange={(event) => onChange(freshCondition(form.find((item) => item.key === event.target.value)))} className="field-input w-auto" aria-label="Field">
        {!field && <option value={value.field}>Choose a field…</option>}
        {form.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label || item.key}
          </option>
        ))}
      </select>
      <select value={value.operator} onChange={(event) => onChange({ ...value, operator: event.target.value as SimpleCondition["operator"] })} className="field-input w-auto" aria-label="Condition">
        {operatorsFor(field).map(([operator, label]) => (
          <option key={operator} value={operator}>
            {label}
          </option>
        ))}
      </select>
      {needsValue(value.operator) && <ConditionValueInput field={field} value={value.value} onChange={(next) => onChange({ ...value, value: next })} lookups={options.lookups} people={options.people} />}
    </div>
  );
}

function StepEditor({
  step,
  onChange,
  options,
  form,
  personFields,
  hideSkip = false,
}: {
  step: BuilderStep;
  onChange: (step: BuilderStep) => void;
  options: BuilderOptions;
  form: FormField[];
  personFields: FormField[];
  hideSkip?: boolean;
}) {
  const pick = step.approvers;
  const skip = step.skipWhen ?? null;
  const type: StepType = step.type ?? "APPROVE";
  const designations = type === "APPROVE" ? options.designations.filter((item) => item.approver) : options.designations;
  // Changing the type keeps the people unless the requester can't do the new kind.
  const setType = (next: StepType) =>
    onChange({
      ...step,
      type: next === "APPROVE" ? undefined : next,
      approvers: next === "APPROVE" && pick.kind === "REQUESTER" ? { kind: "REQUESTER_MANAGER" } : pick,
      ...(next === "NOTIFY" ? { skipWhen: null } : {}),
    });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="field-label">Step name</label>
        <input aria-label="Step name" value={step.label} onChange={(event) => onChange({ ...step, label: event.target.value })} placeholder="e.g. HOD approval" className="field-input" />
      </div>
      <div>
        <label className="field-label">Kind of step</label>
        <select aria-label="Kind of step" value={type} onChange={(event) => setType(event.target.value as StepType)} className="field-input">
          {(Object.keys(STEP_TYPE_LABEL) as StepType[]).map((kind) => (
            <option key={kind} value={kind}>
              {STEP_TYPE_LABEL[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="field-label">{WHO_LABEL[type]}</label>
        <select aria-label="Who approves" value={pick.kind} onChange={(event) => onChange({ ...step, approvers: defaultPick(event.target.value as ApproverPick["kind"], options) })} className="field-input">
          {(Object.keys(PICK_LABEL) as ApproverPick["kind"][]).map((kind) => (
            <option
              key={kind}
              value={kind}
              disabled={
                (kind === "GROUP" && !options.groups.length) ||
                (kind === "DEPARTMENT_HOD" && !options.departments.length) ||
                (kind === "FORM_FIELD_USER" && !personFields.length) ||
                (kind === "DESIGNATION" && !designations.length) ||
                (kind === "REQUESTER" && type === "APPROVE")
              }
            >
              {PICK_LABEL[kind]}
            </option>
          ))}
        </select>
      </div>
      {type === "NOTIFY" && (
        <div className="md:col-span-2">
          <label className="field-label">
            Message <span className="font-normal text-ink-faint">(optional, added to the FYI)</span>
          </label>
          <input aria-label="FYI message" value={step.note ?? ""} maxLength={300} onChange={(event) => onChange({ ...step, note: event.target.value || undefined })} className="field-input" />
        </div>
      )}
      {pick.kind === "PEOPLE" && (
        <div className="md:col-span-2">
          <label className="field-label">People (hold Ctrl to pick several)</label>
          <select
            multiple
            aria-label="People (hold Ctrl to pick several)"
            value={pick.userIds.map(String)}
            onChange={(event) => onChange({ ...step, approvers: { kind: "PEOPLE", userIds: [...event.target.selectedOptions].map((option) => Number(option.value)) } })}
            className="field-input h-32 py-2"
          >
            {options.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {pick.kind === "ROLE" && (
        <select value={pick.roleCode} onChange={(event) => onChange({ ...step, approvers: { kind: "ROLE", roleCode: event.target.value } })} className="field-input md:col-span-2" aria-label="Role">
          {options.roles.map((role) => (
            <option key={role.code} value={role.code}>
              {role.name}
            </option>
          ))}
        </select>
      )}
      {pick.kind === "DEPARTMENT_HOD" && (
        <select value={pick.departmentId} onChange={(event) => onChange({ ...step, approvers: { kind: "DEPARTMENT_HOD", departmentId: Number(event.target.value) } })} className="field-input md:col-span-2" aria-label="Department">
          {options.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.label}
            </option>
          ))}
        </select>
      )}
      {pick.kind === "GROUP" && (
        <select value={pick.groupId} onChange={(event) => onChange({ ...step, approvers: { kind: "GROUP", groupId: Number(event.target.value) } })} className="field-input md:col-span-2" aria-label="Group">
          {options.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      )}
      {pick.kind === "DESIGNATION" && (
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <select value={pick.designationId} onChange={(event) => onChange({ ...step, approvers: { ...pick, designationId: Number(event.target.value) } })} className="field-input w-auto" aria-label="Designation">
            {!designations.some((item) => item.id === pick.designationId) && <option value={pick.designationId}>Choose a designation…</option>}
            {designations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={Boolean(pick.sameDepartment)} onChange={(event) => onChange({ ...step, approvers: { ...pick, sameDepartment: event.target.checked || undefined } })} />
            Only in the requester&apos;s department
          </label>
        </div>
      )}
      {pick.kind === "FORM_FIELD_USER" && (
        <select value={pick.fieldKey} onChange={(event) => onChange({ ...step, approvers: { kind: "FORM_FIELD_USER", fieldKey: event.target.value } })} className="field-input md:col-span-2" aria-label="Person field">
          <option value="">Choose a person field…</option>
          {personFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      )}
      {type !== "NOTIFY" && (
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <select value={step.rule} onChange={(event) => onChange({ ...step, rule: event.target.value as Rule })} className="field-input w-auto" aria-label="How many must approve">
          <option value="ALL">{type === "WORK" ? "All of them must mark it done" : "All of them must approve"}</option>
          <option value="ANY_ONE">Any one of them</option>
          <option value="ANY_N">Any N of them</option>
        </select>
        {step.rule === "ANY_N" && <input aria-label="N" type="number" min={1} value={step.n ?? 1} onChange={(event) => onChange({ ...step, n: Number(event.target.value) })} className="field-input w-24" />}
        <label className="flex items-center gap-2 text-label">
          Respond within
          <input
            aria-label="Respond within hours"
            type="number"
            min={1}
            max={720}
            value={step.slaHours ?? ""}
            onChange={(event) => onChange({ ...step, slaHours: event.target.value ? Number(event.target.value) : null })}
            placeholder="—"
            className="field-input w-20"
          />
          hours
        </label>
        <select value={step.onNoApprover ?? "BLOCK"} onChange={(event) => onChange({ ...step, onNoApprover: event.target.value as "BLOCK" | "SKIP" })} className="field-input w-auto" aria-label="If nobody resolves">
          <option value="BLOCK">If nobody to approve: stop and tell IT</option>
          <option value="SKIP">If nobody to approve: skip this step</option>
        </select>
      </div>
      )}
      {!hideSkip && type !== "NOTIFY" && (
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-label">
            <input
              type="checkbox"
              checked={skip !== null}
              disabled={form.length === 0}
              onChange={(event) => onChange({ ...step, skipWhen: event.target.checked ? freshCondition(form[0]) : null })}
            />
            Skip this step when…
            {form.length === 0 && <span className="text-ink-faint">(add a form field first)</span>}
          </label>
          {skip && (
            <div className="mt-2">
              <RuleEditor form={form} value={skip} onChange={(next) => onChange({ ...step, skipWhen: next })} prefix="" options={options} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
