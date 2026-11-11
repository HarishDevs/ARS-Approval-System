"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, GripVertical, TriangleAlert } from "lucide-react";
import { PeoplePicker } from "@/features/ui/PeoplePicker";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { freshCondition, RuleEditor as SharedRuleEditor } from "@/features/admin/conditions/RuleEditor";
import { duplicateStage, stageName, stageProblems, stageSummary, type DesignContext } from "@/features/admin/workflow-designer/model";
import { moveItem } from "@/features/admin/form-designer/model";
import { stepDefaults, type StepPolicy } from "@/server/workflows/step-policy";
import { NUMERIC_TYPES, type FieldLookups, type FormField } from "@/server/forms/fields";
import { Hint } from "@/features/ui/Hint";
import { doaBandLabels, MAX_CHOICE_DEPTH, type ApproverPick, type BuilderCondition, type BuilderDoa, type BuilderInnerStage, type BuilderStage, type BuilderStep } from "@/server/workflows/builder";

// Structured workflow builder (D-056, F-50). Stages run in order; a stage
// is one step or several steps in parallel. The server compiles, validates
// and stores it; nothing here is trusted.
export interface BuilderOptions {
  people: { id: number; label: string; detail?: string }[]; // approver-eligible people (approval steps, D-085)
  anyone?: { id: number; label: string; detail?: string }[]; // everyone active (work and FYI steps, v1.8.0)
  roles: { code: string; name: string }[];
  departments: { id: number; label: string }[];
  groups: { id: number; label: string }[];
  designations: { id: number; label: string; approver: boolean }[];
  lookups: FieldLookups; // department / designation lists for "from the list" fields
}

type StepType = NonNullable<BuilderStep["type"]>;

// v1.8.0: on the custom approval page, IT's step options (Admin → Custom
// approval): a fixed option is shown, not offered, and new steps start with
// the defaults. The server applies the same set-up on submit.
export const StepPolicyContext = createContext<StepPolicy | null>(null);
const useNewStepDefaults = () => {
  const policy = useContext(StepPolicyContext);
  return policy ? stepDefaults(policy) : {};
};
// v1.42.1: short names fit the box in narrow columns (New request); what
// each kind does is said under it.
const STEP_TYPE_LABEL: Record<StepType, string> = {
  APPROVE: "Approval",
  WORK: "Work task",
  NOTIFY: "FYI (tell only)",
};
const STEP_TYPE_HELP: Record<StepType, string> = {
  APPROVE: "They approve or reject.",
  WORK: "They do the work and mark it done. It also appears in their Task Management (My Tasks).",
  NOTIFY: "They're told, and the request moves straight on.",
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

// D-239: the designer's shared state for the levels. v1.54.0 (D-309): IT's
// approval-type designer is gone, so nothing provides it now and the levels
// behave as on the New request page (nothing collapses; removal just asks).
interface Designer {
  context: DesignContext;
  collapsed: Set<string>;
  toggle: (key: string) => void;
  removed: (name: string) => void;
}
const DesignerContext = createContext<Designer | null>(null);

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
  cards = false,
}: {
  stages: BuilderStage[];
  setStages: React.Dispatch<React.SetStateAction<BuilderStage[]>>;
  options: BuilderOptions;
  form: FormField[];
  newId: () => string;
  title?: string;
  hint?: string;
  allowChoice?: boolean;
  cards?: boolean; // v1.42.0 (owner, New request): small summary cards on top, one level open below
}) {
  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">{title}</h2>
          <Hint text={hint} align="start" />
        </div>
      </div>
      <StageList stages={stages} onChange={(next) => setStages(next)} options={options} form={form} newId={newId} allowChoice={allowChoice} depth={0} cards={cards} />
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
  cards = false,
}: {
  stages: BuilderStage[];
  onChange: (stages: BuilderStage[]) => void;
  options: BuilderOptions;
  form: FormField[];
  newId: () => string;
  allowChoice: boolean;
  nested?: boolean;
  depth: number; // choices this list is inside (D-099: up to MAX_CHOICE_DEPTH)
  cards?: boolean;
}) {
  const defaults = useNewStepDefaults();
  // D-239: the designer (workflow page) adds collapsing, problems and Undo.
  const designer = useContext(DesignerContext);
  const [removing, setRemoving] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const known = useRef<string[]>(stages.map(stageKey));
  useEffect(() => {
    if (!cards) return;
    const keys = stages.map(stageKey);
    const added = keys.findIndex((key) => !known.current.includes(key));
    known.current = keys;
    if (added >= 0) setActive(added);
    else setActive((current) => Math.min(current, Math.max(0, keys.length - 1)));
  }, [cards, stages]);
  // D-206: on the custom approval page IT decides whether the choice is offered.
  // D-235: a DoA matrix is never offered there (approval types only, D-075).
  const features = useContext(StepPolicyContext)?.features;
  const allowDoa = allowChoice && !features;
  const allowBranch = allowChoice && (features?.choice ?? true);
  const newStep = (label: string): BuilderStep => ({ id: newId(), label, approvers: { kind: "PEOPLE", userIds: [] }, rule: "ALL" as const, ...defaults });
  const setStage = (index: number, stage: BuilderStage) => onChange(stages.map((item, i) => (i === index ? stage : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    onChange(moveItem(stages, index, target));
    // Keep the keyboard on the level it moved (Alt+↑ / Alt+↓).
    requestAnimationFrame(() => document.getElementById(`level-head-${stageKey(stages[index]!)}`)?.focus());
  };
  const remove = (index: number) => {
    const name = stageName(stages[index]!) || `Level ${index + 1}`;
    onChange(stages.filter((_, i) => i !== index));
    designer?.removed(name);
  };
  const duplicate = (index: number) => onChange([...stages.slice(0, index + 1), duplicateStage(stages[index]!, newId), ...stages.slice(index + 1)]);
  const personFields = form.filter((field) => field.type === "PERSON");
  const kindLabel = (stage: BuilderStage) => (stage.kind === "STEP" ? "one step" : stage.kind === "PARALLEL" ? "parallel steps" : stage.kind === "DOA" ? "DoA matrix" : "a choice");
  const hasDoa = stages.some((stage) => stage.kind === "DOA");
  const numberFields = form.filter((field) => NUMERIC_TYPES.includes(field.type));

  return (
    <>
      {cards && stages.length > 0 && (
        <ol className="sticky top-0 z-[2] grid grid-cols-2 gap-2 border-b border-line bg-surface px-4 py-3 sm:grid-cols-3" aria-label="Levels" data-testid="level-cards">
          {stages.map((stage, index) => {
            const problems = stageProblems(stage, { form });
            return (
              <li key={stageKey(stage)} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  aria-pressed={active === index}
                  className={`block w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${active === index ? "border-primary-600 bg-primary-50" : "border-line hover:bg-surface-muted"}`}
                  data-testid="level-card"
                >
                  <span className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                    <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${active === index ? "bg-primary-solid text-on-solid" : "bg-surface-muted text-ink"}`}>{index + 1}</span>
                    Level {index + 1}
                    {problems.length > 0 && <TriangleAlert aria-label="Needs attention" className="ml-auto h-3.5 w-3.5 text-warning-600" />}
                  </span>
                  <span className="mt-0.5 block truncate text-label font-semibold">{stageName(stage) || kindLabel(stage)}</span>
                  <span className="block truncate text-caption text-ink-muted">{stageSummary(stage)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <ol className={nested ? "space-y-3" : "divide-y divide-line"}>
        {stages.length === 0 && nested && <li className="text-label text-ink-muted">No levels on this path: it goes straight on.</li>}
        {stages.map((stage, index) => {
          const key = stageKey(stage);
          const folded = Boolean(designer?.collapsed.has(key));
          const problems = designer ? stageProblems(stage, designer.context) : [];
          return (
            <li
              key={key}
              id={`level-${key}`}
              hidden={cards && index !== active}
              data-testid="workflow-level"
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                setDropAt(index);
              }}
              onDrop={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                onChange(moveItem(stages, dragging, index));
                setDragging(null);
                setDropAt(null);
              }}
              className={`${nested ? "rounded-md border border-line p-3" : "scroll-mt-20 px-5 py-4"} ${dropAt === index && dragging !== null && dragging !== index ? "outline outline-2 outline-primary-600" : ""} ${dragging === index ? "opacity-50" : ""}`}
            >
              <div className={`flex flex-wrap items-center justify-between gap-2 ${folded ? "" : "mb-3"}`}>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", key);
                      setDragging(index);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropAt(null);
                    }}
                    title="Drag to move this level"
                    aria-hidden="true"
                    className="cursor-grab text-ink-faint hover:text-ink"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  {designer && (
                    <button
                      type="button"
                      id={`level-head-${key}`}
                      aria-expanded={!folded}
                      aria-label={`${folded ? "Open" : "Fold"} level ${index + 1}: ${stageName(stage) || kindLabel(stage)}`}
                      onClick={() => designer.toggle(key)}
                      onKeyDown={(event) => {
                        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                          event.preventDefault();
                          move(index, event.key === "ArrowUp" ? -1 : 1);
                        }
                      }}
                      title="Alt+↑ / Alt+↓ moves the level"
                      className="rounded p-0.5 text-ink-muted hover:bg-surface-muted"
                    >
                      <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${folded ? "-rotate-90" : ""}`} />
                    </button>
                  )}
                  <p className="text-caption font-semibold uppercase tracking-wider text-ink-faint">
                    Level {index + 1} · {kindLabel(stage)}
                  </p>
                  {folded && (
                    <p className="min-w-0 truncate text-label">
                      <span className="font-medium">{stageName(stage)}</span> <span className="text-ink-muted">· {stageSummary(stage)}</span>
                    </p>
                  )}
                  {problems.length > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-caption font-semibold text-danger-600"
                      title={problems.join("\n")}
                      data-testid="level-problems"
                    >
                      <TriangleAlert aria-hidden="true" className="h-3 w-3" />
                      {problems.length} to fix
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="btn-secondary btn-compact" aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === stages.length - 1} className="btn-secondary btn-compact" aria-label="Move down">
                    ↓
                  </button>
                  {!(stage.kind === "DOA") && (
                    <button type="button" onClick={() => duplicate(index)} className="btn-secondary btn-compact" aria-label={`Duplicate level ${index + 1}`} title="Duplicate">
                      <Copy aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => setRemoving(index)} className="btn-danger-quiet btn-compact">
                    Remove level
                  </button>
                </div>
              </div>
              {!folded && problems.length > 0 && (
                <ul className="mb-3 space-y-0.5 rounded-md bg-danger-50 px-3 py-2 text-label text-danger-600" aria-label={`What to fix in level ${index + 1}`}>
                  {problems.map((problem) => (
                    <li key={problem}>✗ {problem}</li>
                  ))}
                </ul>
              )}
              {!folded && (
                <>
                  {stage.kind === "STEP" && <StepEditor step={stage.step} onChange={(step) => setStage(index, { kind: "STEP", step })} options={options} form={form} personFields={personFields} />}
                  {stage.kind === "PARALLEL" && (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                        <input aria-label="Parallel level name" value={stage.label} onChange={(event) => setStage(index, { ...stage, label: event.target.value })} className="field-input" />
                        <select
                          aria-label="How many branches must finish"
                          value={stage.join}
                          onChange={(event) => setStage(index, { ...stage, join: event.target.value as Rule })}
                          className="field-input"
                        >
                          <option value="ALL">All branches must finish</option>
                          <option value="ANY_ONE">Any one branch is enough</option>
                          <option value="ANY_N">Any N branches</option>
                        </select>
                        {stage.join === "ANY_N" && (
                          <input
                            aria-label="N"
                            type="number"
                            min={1}
                            max={stage.steps.length}
                            value={stage.n ?? 1}
                            onChange={(event) => setStage(index, { ...stage, n: Number(event.target.value) })}
                            className="field-input w-24"
                          />
                        )}
                      </div>
                      {/* DR-01 (owner, 2 Nov 2026): what one branch's rejection does, for any one / any N only. */}
                      {stage.join !== "ALL" && (
                        <select
                          aria-label="If one branch rejects"
                          value={stage.onReject ?? "END"}
                          onChange={(event) => setStage(index, { ...stage, onReject: event.target.value === "WHEN_UNREACHABLE" ? "WHEN_UNREACHABLE" : "END" })}
                          className="field-input"
                        >
                          <option value="END">If one branch rejects, the request is rejected</option>
                          <option value="WHEN_UNREACHABLE">If one branch rejects, the others carry on (rejected only when too few can still finish)</option>
                        </select>
                      )}
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
                  {stage.kind === "DOA" && <DoaEditor stage={stage} onChange={(next) => setStage(index, next)} options={options} form={form} personFields={personFields} newId={newId} />}
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
                </>
              )}
            </li>
          );
        })}
      </ol>
      <ConfirmDialog
        open={removing !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing !== null) remove(removing);
          setRemoving(null);
        }}
        title={removing !== null ? `Remove level ${removing + 1}?` : "Remove this level?"}
        body={
          removing !== null && stages[removing]
            ? `“${stageName(stages[removing]!) || kindLabel(stages[removing]!)}” (${stageSummary(stages[removing]!)}) leaves the flow.${designer ? " You can undo it." : ""}`
            : ""
        }
        confirmLabel="Remove level"
        tone="danger"
      />
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
        {allowDoa && !nested && !hasDoa && (
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
        {allowBranch && (
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
  const numberFields = form.filter((field) => NUMERIC_TYPES.includes(field.type));
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
                  <input
                    aria-label={`Level ${index + 1} name`}
                    value={level.step.label}
                    onChange={(event) => setLevel(index, { ...level, step: { ...level.step, label: event.target.value } })}
                    className="field-input min-w-40"
                  />
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
                    <button type="button" onClick={() => onChange({ ...stage, levels: stage.levels.filter((_, i) => i !== index) })} className="btn-danger-quiet btn-compact">
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
        onClick={() =>
          onChange({
            ...stage,
            levels: [
              ...stage.levels,
              {
                step: { id: newId(), label: `Level ${stage.levels.length + 1}`, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" },
                bands: bandLabels.map(() => false).map((_, band) => band === bandLabels.length - 1),
              },
            ],
          })
        }
        className="btn-secondary btn-compact"
      >
        Add a DoA level
      </button>

      <div className="space-y-3">
        <p className="text-label font-semibold">Who approves at each DoA level</p>
        {stage.levels.map((level, index) => (
          <details key={level.step.id} className="rounded-md border border-line p-3" open={index === 0}>
            <summary className="cursor-pointer text-label font-medium">
              {level.step.label || `Level ${index + 1}`} · needed for{" "}
              {level.bands
                .map((tick, band) => (tick ? bandLabels[band] : null))
                .filter(Boolean)
                .join("; ") || "no band yet"}
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

// A rule (D-099): one or more conditions, all or any of which must hold.
// Since 2 Nov 2026 the one editor every rule uses (form rules too).
function RuleEditor({ form, value, onChange, prefix, options }: { form: FormField[]; value: BuilderCondition; onChange: (value: BuilderCondition) => void; prefix: string; options: BuilderOptions }) {
  return <SharedRuleEditor fields={form} value={value} onChange={onChange} prefix={prefix} lookups={options.lookups} people={options.people} />;
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
  const policy = useContext(StepPolicyContext);
  const type: StepType = step.type ?? "APPROVE";
  const designations = type === "APPROVE" ? options.designations.filter((item) => item.approver) : options.designations;
  // Changing the type keeps the people unless the requester can't do the new kind.
  const setType = (next: StepType) =>
    onChange({
      ...step,
      type: next === "APPROVE" ? undefined : next,
      approvers: next === "APPROVE" && pick.kind === "REQUESTER" ? { kind: "REQUESTER_MANAGER" } : pick,
      ...(next === "NOTIFY" ? { skipWhen: null } : {}),
      ...(next !== "WORK" ? { holdsUp: undefined, workPriority: undefined, workDueOn: undefined } : {}),
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
      <p className="-mt-1 text-caption text-ink-muted md:col-span-2" data-testid="step-kind-help">
        {STEP_TYPE_HELP[type]}
      </p>
      {/* D-273 (owner's journey brief): whether the request waits for the work. */}
      {type === "WORK" && (
        <label className="flex items-start gap-2 text-label md:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={step.holdsUp !== false}
            onChange={(event) => onChange({ ...step, holdsUp: event.target.checked ? undefined : false })}
            data-testid="step-holds-up"
          />
          <span>
            The request waits until it&apos;s done
            <span className="block text-caption text-ink-muted">Untick to give the work as tasks and let the request move on at once; finishing them won&apos;t decide anything on the request.</span>
          </span>
        </label>
      )}
      {/* v1.50.0 (owner): the task's priority and due date; it reaches the person's Task Management when this step starts. */}
      {type === "WORK" && (
        <div className="grid gap-3 sm:grid-cols-2 md:col-span-2" data-testid="work-task-options">
          <div>
            <label className="field-label" htmlFor={`work-priority-${step.id}`}>
              Task priority
            </label>
            <select
              id={`work-priority-${step.id}`}
              value={step.workPriority ?? "NORMAL"}
              onChange={(event) => onChange({ ...step, workPriority: event.target.value === "NORMAL" ? undefined : (event.target.value as "IMPORTANT" | "HIGH" | "URGENT") })}
              className="field-input"
            >
              <option value="URGENT">Critical</option>
              <option value="HIGH">Most Important</option>
              <option value="IMPORTANT">Important</option>
              <option value="NORMAL">Normal</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`work-due-${step.id}`}>
              Task due date <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id={`work-due-${step.id}`}
              type="date"
              min={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
              value={step.workDueOn ?? ""}
              onChange={(event) => onChange({ ...step, workDueOn: event.target.value || undefined })}
              className="field-input"
            />
          </div>
        </div>
      )}
      <div className="md:col-span-2">
        <label className="field-label">{WHO_LABEL[type]}</label>
        <select
          aria-label="Who approves"
          value={pick.kind}
          onChange={(event) => onChange({ ...step, approvers: defaultPick(event.target.value as ApproverPick["kind"], options) })}
          className="field-input"
        >
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
          <div className="flex items-center gap-1.5">
            <label className="field-label">Message</label>
            <Hint text="Optional, added to the FYI." align="start" className="mb-1.5" />
          </div>
          <input aria-label="FYI message" value={step.note ?? ""} maxLength={300} onChange={(event) => onChange({ ...step, note: event.target.value || undefined })} className="field-input" />
        </div>
      )}
      {pick.kind === "PEOPLE" && (
        <div className="md:col-span-2">
          {/* v1.8.0: search and pick, like Collaborators. Approval steps list
              people who can approve; work tasks and FYIs list anyone active. */}
          <PeoplePicker
            label={type === "APPROVE" ? "People (search and pick; only people who can approve)" : "People (search and pick anyone)"}
            options={type === "APPROVE" ? options.people : (options.anyone ?? options.people)}
            value={pick.userIds}
            onChange={(ids) => onChange({ ...step, approvers: { kind: "PEOPLE", userIds: ids } })}
            max={50}
            help={type === "APPROVE" ? "Type a name or user id. Managers and above can approve." : "Type a name or user id. Anyone active can do a work task or receive an FYI."}
          />
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
        <select
          value={pick.departmentId}
          onChange={(event) => onChange({ ...step, approvers: { kind: "DEPARTMENT_HOD", departmentId: Number(event.target.value) } })}
          className="field-input md:col-span-2"
          aria-label="Department"
        >
          {options.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.label}
            </option>
          ))}
        </select>
      )}
      {pick.kind === "GROUP" && (
        <select
          value={pick.groupId}
          onChange={(event) => onChange({ ...step, approvers: { kind: "GROUP", groupId: Number(event.target.value) } })}
          className="field-input md:col-span-2"
          aria-label="Group"
        >
          {options.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      )}
      {pick.kind === "DESIGNATION" && (
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <select
            value={pick.designationId}
            onChange={(event) => onChange({ ...step, approvers: { ...pick, designationId: Number(event.target.value) } })}
            className="field-input w-auto"
            aria-label="Designation"
          >
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
        <select
          value={pick.fieldKey}
          onChange={(event) => onChange({ ...step, approvers: { kind: "FORM_FIELD_USER", fieldKey: event.target.value } })}
          className="field-input md:col-span-2"
          aria-label="Person field"
        >
          <option value="">Choose a person field…</option>
          {personFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      )}
      {/* Owner (v1.42.0): an option IT has fixed isn't shown on the request; the server applies it. */}
      {type !== "NOTIFY" && !(policy && !policy.rule.editable && !policy.slaHours.editable && !policy.onNoApprover.editable) && (
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          {policy && !policy.rule.editable ? null : (
            <>
              <select value={step.rule} onChange={(event) => onChange({ ...step, rule: event.target.value as Rule })} className="field-input w-auto" aria-label="How many must approve">
                <option value="ALL">{type === "WORK" ? "All of them must mark it done" : "All of them must approve"}</option>
                <option value="ANY_ONE">Any one of them</option>
                <option value="ANY_N">Any N of them</option>
              </select>
              {step.rule === "ANY_N" && (
                <input aria-label="N" type="number" min={1} value={step.n ?? 1} onChange={(event) => onChange({ ...step, n: Number(event.target.value) })} className="field-input w-24" />
              )}
            </>
          )}
          {policy && !policy.slaHours.editable ? null : (
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
          )}
          {policy && !policy.onNoApprover.editable ? null : (
            <select
              value={step.onNoApprover ?? "BLOCK"}
              onChange={(event) => onChange({ ...step, onNoApprover: event.target.value as "BLOCK" | "SKIP" })}
              className="field-input w-auto"
              aria-label="If nobody resolves"
            >
              <option value="BLOCK">{type === "WORK" ? "If nobody to do it" : "If nobody to approve"}: stop and tell IT</option>
              <option value="SKIP">{type === "WORK" ? "If nobody to do it" : "If nobody to approve"}: skip this step</option>
            </select>
          )}
        </div>
      )}
      {!hideSkip && (policy?.features.skip ?? true) && type !== "NOTIFY" && (
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" checked={skip !== null} disabled={form.length === 0} onChange={(event) => onChange({ ...step, skipWhen: event.target.checked ? freshCondition(form[0]) : null })} />
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
