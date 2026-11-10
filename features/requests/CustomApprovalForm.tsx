"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardList, GitBranch, Info, ListChecks, RotateCcw, Save, Send, Workflow } from "lucide-react";
import { DraftStatus, useDraftAutosave } from "@/features/requests/useDraftAutosave";
import type { DraftInfo } from "@/features/requests/RequestForm";
import { submitCustomAction } from "@/app/users/collab-actions";
import { LevelsEditor, newStepId, StepPolicyContext, type BuilderOptions } from "@/features/admin/WorkflowBuilder";
import { DynamicFields } from "@/features/requests/DynamicFields";
import { DEFAULT_STEP_POLICY, stepDefaults, type StepPolicy } from "@/server/workflows/step-policy";
import { actionErrorMessage, FieldError, ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
import { ChoicePills } from "@/features/ui/ChoicePill";
import type { BuilderInnerStage, BuilderStage } from "@/server/workflows/builder";
import { NO_LOOKUPS, type FieldLookups, type FormField } from "@/server/forms/fields";
import { PeoplePicker, type PersonOption } from "@/features/ui/PeoplePicker";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import { ConfirmDialog } from "@/features/ui/Dialog";

// Custom approval (F-33, D-060): anyone picks anyone, any mix of levels.
// v1.8.0: the fields and step options are IT's set-up (Admin → Custom
// approval); the server applies the same set-up on submit.
// D-255 (owner's mock-up): the same form in three steps (Request details,
// Approval workflow, Review & submit) with a live summary. Every field stays
// in the one form at every step (hidden, not removed), so nothing typed is
// lost between steps, the draft keeps saving, and the submit is unchanged.

function restoredStages(spec: string | undefined): BuilderStage[] | null {
  try {
    const parsed = spec ? (JSON.parse(spec) as { stages?: BuilderStage[] }) : null;
    return parsed?.stages?.length ? parsed.stages : null;
  } catch {
    return null;
  }
}

type Step = 1 | 2 | 3;
// v1.46.0 (owner): phones show the short names, so the steps fit one slim row.
const STEPS: { step: Step; title: string; short: string; hint: string; icon: typeof ClipboardList }[] = [
  { step: 1, title: "Request details", short: "Details", hint: "What it is about", icon: ClipboardList },
  { step: 2, title: "Approval workflow", short: "Workflow", hint: "Who approves, in what order", icon: Workflow },
  { step: 3, title: "Review & submit", short: "Review", hint: "Check, then send", icon: ListChecks },
];

// What the levels add up to, for the summary and the checks.
interface RouteFacts {
  levels: number;
  named: number; // people named as approvers
  ruleSteps: number; // steps whose approvers come from a rule (manager, HOD, group, role…)
  empty: string[]; // steps with nobody chosen
  needs: string[]; // v1.42.1: what each of them still needs, in the step's own words
  kind: "Sequential" | "Parallel" | "Mixed";
}
function routeFacts(stages: readonly BuilderStage[]): RouteFacts {
  const facts: RouteFacts = { levels: stages.length, named: 0, ruleSteps: 0, empty: [], needs: [], kind: "Sequential" };
  const people = new Set<number>();
  let parallel = 0;
  const visit = (stage: BuilderStage | BuilderInnerStage) => {
    if (stage.kind === "STEP" || stage.kind === "PARALLEL") {
      if (stage.kind === "PARALLEL") parallel += 1;
      const steps = stage.kind === "STEP" ? [stage.step] : stage.steps;
      for (const step of steps) {
        const pick = step.approvers as { kind: string; userIds?: number[] };
        if (pick.kind === "PEOPLE") {
          if (!pick.userIds?.length) {
            facts.empty.push(step.label);
            facts.needs.push(step.type === "WORK" ? `someone to do "${step.label}"` : step.type === "NOTIFY" ? `someone to tell for "${step.label}"` : `approvers for "${step.label}"`);
          }
          pick.userIds?.forEach((id) => people.add(id));
        } else facts.ruleSteps += 1;
      }
    } else if (stage.kind === "BRANCH") {
      [...stage.then, ...stage.otherwise].forEach(visit);
    }
  };
  stages.forEach(visit);
  facts.named = people.size;
  facts.kind = parallel === 0 ? "Sequential" : parallel === stages.length ? "Parallel" : "Mixed";
  return facts;
}

type Snapshot = { values: Record<string, string>; files: number; collaborators: number };
function readForm(form: HTMLFormElement | null): Snapshot {
  if (!form) return { values: {}, files: 0, collaborators: 0 };
  const data = new FormData(form);
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (typeof value === "string" && !(key in values)) values[key] = value;
  const files = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')].reduce((sum, input) => sum + (input.files?.length ?? 0), 0);
  return { values, files, collaborators: data.getAll("collaborator").length };
}

// D-263 (owner: "after filling all the required fields only allow the page
// to move further"): step 1's required fields, checked before Next. A field
// hidden by its rule doesn't count; the server checks everything again on submit.
function missingRequired(form: HTMLFormElement | null, fields: readonly FormField[], title: string): Record<string, string> {
  const missing: Record<string, string> = {};
  if (!title.trim()) missing.title = "Give the request a title.";
  if (!form) return missing;
  const data = new FormData(form);
  for (const field of fields) {
    if (!field.required || field.type === "SECTION" || field.type === "CALC") continue;
    const holder = form.querySelector(`#f-${CSS.escape(field.key)}`)?.closest("fieldset");
    if (holder?.hidden || holder?.disabled) continue;
    const filled =
      field.type === "ATTACHMENT"
        ? [...form.querySelectorAll<HTMLInputElement>(`input[name="file:${CSS.escape(field.key)}"]`)].some((input) => (input.files?.length ?? 0) > 0)
        : field.type === "LINE_ITEMS"
          ? !["", "[]"].includes(String(data.get(`${field.key}__lines`) ?? data.get(field.key) ?? "").trim())
          : field.type === "MULTI_CHOICE"
            ? data.getAll(field.key).some((value) => String(value).trim() !== "")
            : String(data.get(field.key) ?? "").trim() !== "";
    if (!filled) missing[field.key] = `${field.label} is required.`;
  }
  return missing;
}

const formatAmount = (text: string) => {
  const number = Number(text.replace(/[,\s₹]/g, ""));
  return Number.isFinite(number) && text.trim() !== "" ? `₹ ${number.toLocaleString("en-IN")}` : text;
};

export function CustomApprovalForm({
  options,
  draft,
  initial,
  collaboratorOptions = [],
  fields,
  policy = DEFAULT_STEP_POLICY,
  lookups = NO_LOOKUPS,
  people = [],
  defaultApproverId = null,
  followUpOf,
  expiredSource,
}: {
  options: BuilderOptions;
  draft?: DraftInfo;
  initial?: { title: string; fields: Record<string, string> };
  collaboratorOptions?: PersonOption[];
  fields: FormField[];
  policy?: StepPolicy;
  lookups?: FieldLookups;
  people?: PersonOption[];
  defaultApproverId?: number | null; // D-234: the reporting manager, when they may approve
  followUpOf?: number; // v1.50.3: linked to this approved request on submit
  expiredSource?: { requestNo: string; expiredOn: string }; // DR-05: asks why
}) {
  const [stages, setStages] = useState<BuilderStage[]>(
    () =>
      restoredStages(initial?.fields.spec) ?? [
        { kind: "STEP", step: { id: "s1", label: "First approval", approvers: { kind: "PEOPLE", userIds: defaultApproverId ? [defaultApproverId] : [] }, ...stepDefaults(policy) } },
      ],
  );
  const { result, pending, onSubmit } = useActionForm(submitCustomAction);
  const restoredAt = draft?.savedAt ? new Date(draft.savedAt) : null;
  const autosave = useDraftAutosave({ draftKey: draft?.key ?? "", initialVersion: draft?.version ?? null, savedAt: null, disabled: !draft });
  const { nudge } = autosave;
  // The levels live in a hidden input, which fires no input event: save on change.
  const [firstRender, setFirstRender] = useState(true);
  useEffect(() => {
    if (firstRender) {
      setFirstRender(false);
      return;
    }
    nudge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages]);
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const possibleDuplicate = Boolean(result && !result.ok && result.fieldErrors?.allowDuplicate);

  // D-255: the steps and the live summary.
  const [step, setStep] = useState<Step>(1);
  const [snapshot, setSnapshot] = useState<Snapshot>({ values: initial?.fields ?? {}, files: 0, collaborators: 0 });
  const [stepError, setStepError] = useState<string | null>(null);
  // Owner (v1.42.0): on a computer the page stays still and each column
  // (details, workflow, summary) scrolls on its own, down to the window's edge.
  const columns = useRef<HTMLDivElement>(null);
  const [columnsHeight, setColumnsHeight] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const box = columns.current;
      if (!box || window.innerWidth < 1280) return setColumnsHeight(null);
      // From the columns' top to the window's bottom, less whatever sits below them.
      const top = box.getBoundingClientRect().top + window.scrollY;
      const below = Math.max(0, document.documentElement.scrollHeight - (top + box.offsetHeight));
      setColumnsHeight(Math.max(360, Math.floor(window.innerHeight - top - below - 4)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [checked, setChecked] = useState<Record<string, string> | null>(null);
  const refresh = useCallback(() => setSnapshot(readForm(autosave.formRef.current)), [autosave.formRef]);
  // Once Next has pointed out what's missing, each message goes as it's filled in.
  useEffect(() => {
    if (!checked) return;
    const now = missingRequired(autosave.formRef.current, fields, snapshot.values.title ?? "");
    if (Object.keys(now).length !== Object.keys(checked).length) setChecked(Object.keys(now).length ? now : null);
  }, [snapshot, checked, fields, autosave.formRef]);
  useEffect(() => {
    refresh();
  }, [refresh, stages]);
  const facts = routeFacts(stages);
  const title = (snapshot.values.title ?? "").trim();
  const missing = [...(title ? [] : ["a title"]), ...facts.needs];

  // After a refused submit, go to the step the problem is on.
  useEffect(() => {
    if (!result || result.ok) return;
    const keys = Object.keys(result.fieldErrors ?? {}).filter((key) => key !== "allowDuplicate");
    if (keys.some((key) => key === "spec" || key.startsWith("stage"))) setStep(2);
    else if (keys.length) setStep(1);
  }, [result]);

  const go = (next: Step) => {
    setStepError(null);
    if (next > 1 && step === 1) {
      const missing = missingRequired(autosave.formRef.current, fields, title);
      if (Object.keys(missing).length) {
        setChecked(missing);
        setStepError(`Fill in the required fields first (${Object.keys(missing).length} to go).`);
        const first = Object.keys(missing)[0]!;
        autosave.formRef.current?.querySelector<HTMLElement>(first === "title" ? "#c-title" : `#f-${CSS.escape(first)}`)?.focus();
        return;
      }
      setChecked(null);
    }
    if (next === 3 && facts.empty.length) {
      setStep(2);
      setStepError(`Choose ${facts.needs[0]}.`);
      return;
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  // A field shown in the summary: IT's fields with a value, in their order.
  const summaryFields = fields
    .filter((field) => !["ATTACHMENT", "SECTION", "LINE_ITEMS"].includes(field.type))
    .map((field) => ({ label: field.label, value: snapshot.values[field.key] ?? "", type: field.type, options: (field as { options?: { value: string; label: string }[] }).options, colors: field.optionColors }))
    .filter((field) => field.value.trim() !== "")
    .map((field) => ({
      label: field.label,
      value: field.type === "CURRENCY" ? formatAmount(field.value) : (field.options?.find((option) => option.value === field.value)?.label ?? field.value),
      // v1.47.0: a choice with option colours shows as coloured pills.
      pills: field.colors ? summaryChoices(field.type, field.value).map((item) => ({ label: item, color: field.colors?.[item] ?? null })) : null,
    }));

  const summary = (
    <dl className="space-y-3 text-label" data-testid="request-summary">
      <div>
        <dt className="text-caption text-ink-muted">Title</dt>
        <dd className={`font-medium ${title ? "" : "text-ink-faint"}`}>{title || "Not given yet"}</dd>
      </div>
      {summaryFields.slice(0, 8).map((field) => (
        <div key={field.label}>
          <dt className="text-caption text-ink-muted">{field.label}</dt>
          <dd className="break-words font-medium">{field.pills?.length ? <ChoicePills values={field.pills} /> : field.value}</dd>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-caption text-ink-muted">Attachments</dt>
          <dd className="font-medium tabular-nums">{snapshot.files}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Collaborators</dt>
          <dd className="font-medium tabular-nums">{snapshot.collaborators}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Approval levels</dt>
          <dd className="font-medium tabular-nums">
            {facts.levels} ({facts.kind})
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Approvers</dt>
          <dd className="font-medium tabular-nums">
            {facts.named}
            {facts.ruleSteps ? ` + ${facts.ruleSteps} by rule` : ""}
          </dd>
        </div>
      </div>
      {missing.length > 0 ? (
        <p className="rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-caption text-warning-600" role="status">
          Not ready yet: needs {missing.join(", ")}.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-md bg-primary-50 px-3 py-2 text-caption text-primary-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> After you submit, it goes to the first level&apos;s approvers.
        </p>
      )}
    </dl>
  );

  return (
    /* v1.48.1 (owner: "Work task or FYI can't be selected"): onChange only. React's change event already fires on every keystroke; an onInput here re-rendered the form on the select's native input event, which reset a controlled dropdown (Kind of step, Who approves…) before its own change ran. */
    <form ref={autosave.formRef} onSubmit={onSubmit} onChange={refresh} className="space-y-5" data-step={step}>
      {draft && restoredAt && (
        <p role="status" className="rounded-md bg-primary-50/60 px-3 py-2 text-label text-primary-700">
          Restored your draft from {restoredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. Files aren&apos;t kept in
          drafts: add them again before submitting.
        </p>
      )}
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {followUpOf && <input type="hidden" name="followUpOf" value={followUpOf} />}

      {/* The three steps. */}
      <nav aria-label="Steps" className="request-steps scroll-hint -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="request-steps">
        <ol className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-3">
          {STEPS.map((item) => {
            const current = item.step === step;
            const done = item.step < step;
            return (
              <li key={item.step}>
                <button
                  type="button"
                  onClick={() => go(item.step)}
                  aria-current={current ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${current ? "border-primary-600 bg-primary-solid text-on-solid shadow-button" : "border-line bg-surface hover:bg-surface-muted"}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-label font-semibold ${current ? "border-on-solid" : done ? "border-success-solid bg-success-solid text-on-solid" : "border-line-strong text-ink-muted"}`}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : item.step}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label font-semibold">
                      {/* v1.46.0: phones show the short name; the full one stays for screen readers. */}
                      <span className="mob-long-sr">{item.title}</span>
                      <span className="mob-short" aria-hidden="true">
                        {item.short}
                      </span>
                    </span>
                    <span className={`block text-caption ${current ? "opacity-85" : "text-ink-muted"}`}>{item.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {/* The action bar (owner: at the top of the page, under the steps). */}
      <div className="action-bar flex flex-wrap items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 shadow-card" data-testid="action-bar">
        {draft && (
          <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1.5" onClick={() => nudge()}>
            <Save className="h-4 w-4" aria-hidden="true" /> <span className="mob-long">Save as draft</span>
            <span className="mob-short">Draft</span>
          </button>
        )}
        <button
          type="button"
          className="btn-ghost btn-compact inline-flex items-center gap-1.5"
          onClick={() => {
            setDiscardError(null);
            setConfirmDiscard(true);
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> <span className="mob-long">Reset</span>
          <span className="mob-short sr-only">Reset</span>
        </button>
        <span className="flex-1" />
        {step > 1 && (
          <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1.5" onClick={() => go((step - 1) as Step)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
        )}
        {step < 3 && (
          <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1.5" onClick={() => go((step + 1) as Step)} data-testid="step-next">
            <span className="mob-long">{step === 1 ? "Next: Approval workflow" : "Next: Review & submit"}</span>
            <span className="mob-short">Next</span> <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {/* Submit on the last step only, after the checks of steps 1 and 2. */}
        {step === 3 && (
          <SubmitButton pending={pending} className="btn-compact">
            <span className="inline-flex items-center gap-1.5">
              <Send className="h-4 w-4" aria-hidden="true" /> Submit request
            </span>
          </SubmitButton>
        )}
      </div>
      {stepError && (
        <p role="alert" className="text-label text-danger-600">
          {stepError}
        </p>
      )}

      <div ref={columns} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_18rem]" style={columnsHeight ? { height: columnsHeight } : undefined} data-testid="request-columns">
        {/* Step 1: request details (beside the workflow on wide screens). */}
        <section
          className={`card space-y-5 px-5 py-5 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain ${step === 1 ? "" : "hidden"} ${step === 3 ? "" : "xl:block"}`}
          aria-labelledby="req-info"
          data-testid="step-details"
        >
          <header className="flex items-start gap-3">
            <span className="page-icon grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700" aria-hidden="true">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h2 id="req-info" className="font-semibold">
                Request information
              </h2>
              <p className="text-caption text-ink-muted">What you&apos;re asking for, with any files and the people who follow it.</p>
            </div>
          </header>
          <div>
            <label htmlFor="c-title" className="field-label">
              Title{" "}
              <span className="text-danger-600" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="c-title"
              name="title"
              defaultValue={initial?.title ?? ""}
              maxLength={200}
              placeholder="e.g. Approval to hire a temporary driver"
              className="field-input"
              aria-required="true"
              aria-invalid={checked?.title ? true : undefined}
            />
            <FieldError result={checked ? { ok: false, message: "", fieldErrors: checked } : result} name="title" />
          </div>
          {expiredSource && (
            <div className="rounded-md bg-danger-50 px-3 py-3">
              <label htmlFor="c-expiredReason" className="field-label text-danger-600">
                {expiredSource.requestNo} expired on {expiredSource.expiredOn}. Why are you using it?
                <span aria-hidden="true"> *</span>
              </label>
              <textarea id="c-expiredReason" name="expiredReason" rows={2} maxLength={1000} aria-required="true" className="field-input h-auto py-2.5" placeholder="e.g. The work is still going on; renewing the approval" />
              <FieldError result={result} name="expiredReason" />
            </div>
          )}
          <DynamicFields
            fields={fields}
            mode="submit"
            people={people}
            lookups={lookups}
            initial={initial?.fields}
            result={checked ? { ok: false, message: "", fieldErrors: checked } : result}
            onLinesChange={nudge}
          />
          <div>
            <div className="flex items-center gap-1">
              <label htmlFor="c-attachments" className="field-label">
                Attachments <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <Hint text="Quotes, invoices, photos: PDF, images, Word, Excel, PowerPoint, CSV or text. Up to 5 files of 10 MB each." align="start" className="mb-1.5" />
            </div>
            <input
              id="c-attachments"
              name="attachments"
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="block w-full rounded-lg border-2 border-dashed border-line-strong bg-surface-muted/40 px-3 py-4 text-label file:mr-3 file:rounded-md file:border-0 file:bg-primary-solid file:px-3 file:py-2 file:text-on-solid hover:border-primary-600"
            />
            {snapshot.files > 0 && (
              <p className="mt-1 text-caption text-ink-muted">
                {snapshot.files} file{snapshot.files === 1 ? "" : "s"} chosen.
              </p>
            )}
            <FieldError result={result} name="attachments" />
          </div>
          <div>
            <PeoplePicker
              name="collaborator"
              label="Collaborators (optional)"
              options={collaboratorOptions}
              help="Followers can view, comment and add files, but don't approve."
              onChange={() => window.setTimeout(refresh, 0)}
            />
            <FieldError result={result} name="collaborator" />
          </div>
        </section>

        {/* Step 2: the approval workflow. */}
        <div className={`xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain ${step === 2 ? "" : "hidden"} ${step === 3 ? "" : "xl:block"}`} data-testid="step-workflow">
          {step === 1 && (
            <p className="mb-2 rounded-md bg-surface-muted px-3 py-2 text-caption text-ink-muted" data-testid="workflow-locked">
              Fill in the request details, then press <strong>Next</strong> to set who approves.
            </p>
          )}
          <fieldset disabled={step === 1} className={`min-w-0 ${step === 1 ? "pointer-events-none opacity-60" : ""}`} aria-label="Approval workflow">
            <StepPolicyContext.Provider value={policy}>
              <LevelsEditor
                stages={stages}
                setStages={setStages}
                options={options}
                form={fields}
                newId={newStepId}
                title="Approval workflow"
                cards
                hint="Pick anyone, in any order. Add parallel steps when several people should look at the same time. You can't approve your own request."
              />
            </StepPolicyContext.Provider>
          </fieldset>
        </div>

        {/* Step 3: review everything before sending. */}
        {step === 3 && (
          <section className="card space-y-4 px-5 py-5 xl:col-span-2 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain" aria-labelledby="review" data-testid="step-review">
            <header className="flex items-start gap-3">
              <span className="page-icon grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700" aria-hidden="true">
                <ListChecks className="h-5 w-5" />
              </span>
              <div>
                <h2 id="review" className="font-semibold">
                  Review & submit
                </h2>
                <p className="text-caption text-ink-muted">Check the details and the route. Use Back or the steps above to change anything; nothing is lost.</p>
              </div>
            </header>
            {summary}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-label font-semibold">
                <GitBranch className="h-4 w-4 text-ink-muted" aria-hidden="true" /> Route
              </h3>
              <ol className="space-y-1.5 text-label">
                {stages.map((stage, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-solid text-caption font-semibold text-on-solid">{index + 1}</span>
                    <span>
                      {stage.kind === "STEP"
                        ? stage.step.label
                        : stage.kind === "PARALLEL"
                          ? `${stage.label} (in parallel: ${stage.steps.map((item) => item.label).join(", ")})`
                          : stage.kind === "BRANCH"
                            ? `${stage.label} (a choice)`
                            : "Approval authority (DoA)"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* The live summary: beside everything on wide screens, folded on phones. */}
        <aside className={`${step === 3 ? "hidden xl:block" : ""} xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain`} aria-label="Request summary">
          <details className="card group xl:hidden" open={false}>
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-semibold">
              Request summary <span className="text-caption font-normal text-ink-muted">{missing.length ? "Not ready" : "Ready"}</span>
            </summary>
            <div className="border-t border-line px-4 py-3">{summary}</div>
          </details>
          <div className="card hidden px-4 py-4 xl:block">
            <h2 className="mb-3 font-semibold">Request summary</h2>
            {summary}
          </div>
        </aside>
      </div>

      {possibleDuplicate && (
        <label className="flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
          <span>This is a separate request: raise it anyway.</span>
        </label>
      )}
      <ResultMessage result={result} />
      {draft && (
        <DraftStatus
          state={autosave.state}
          restoredAt={restoredAt}
          onDiscard={() => {
            setDiscardError(null);
            setConfirmDiscard(true);
          }}
        />
      )}

      {/* WEB-11 (v1.10.0): the app's own confirmation, not the browser's. */}
      <ConfirmDialog
        open={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          if (!draft) {
            window.location.reload();
            return;
          }
          setDiscarding(true);
          const done = await autosave.discard().catch((error: unknown) => ({ ok: false, message: actionErrorMessage(error) ?? "Couldn't reach the server. Try again." }));
          setDiscarding(false);
          if (done.ok) window.location.reload();
          else {
            setConfirmDiscard(false);
            setDiscardError(done.message);
          }
        }}
        title={draft ? "Reset and discard this draft?" : "Reset the form?"}
        body="What you typed and the levels you set are cleared. This can't be undone."
        confirmLabel="Yes, reset"
        busyLabel="Resetting…"
        busy={discarding}
        tone="danger"
      />
      {discardError && (
        <p role="alert" className="text-label text-danger-600">
          {discardError}
        </p>
      )}
    </form>
  );
}

// v1.47.0: the picked option(s) of a choice field as typed in the form (a
// multi-select sends its picks as a JSON list).
function summaryChoices(type: string, value: string): string[] {
  if (type !== "MULTI_CHOICE") return [value];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [value];
  } catch {
    return [value];
  }
}
