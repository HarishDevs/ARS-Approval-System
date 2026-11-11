"use client";

import { useCallback, useEffect, useState } from "react";
import { previewRouteAction } from "@/app/users/actions";
import type { StepPreview } from "@/server/approvals/route-preview";
import { ArrowLeft, ArrowRight, Check, ClipboardList, GitBranch, Info, ListChecks, RotateCcw, Save, Send, Workflow, X } from "lucide-react";
import { SaveLevelsInline } from "@/features/requests/Templates";
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
import { FileListInput } from "@/features/ui/FileListInput";

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
  // v1.54.0 (owner): the review names who each level goes to (the server works it out).
  const [preview, setPreview] = useState<Record<string, StepPreview> | null>(null);
  const previewKey = JSON.stringify(stages);
  useEffect(() => {
    if (step !== 3) return;
    let live = true;
    setPreview(null);
    previewRouteAction(JSON.stringify({ stages: JSON.parse(previewKey) as unknown }))
      .then((answer) => live && setPreview(answer.ok ? answer.steps : {}))
      .catch(() => live && setPreview({}));
    return () => {
      live = false;
    };
  }, [step, previewKey]);
  const [snapshot, setSnapshot] = useState<Snapshot>({ values: initial?.fields ?? {}, files: 0, collaborators: 0 });
  const [stepError, setStepError] = useState<string | null>(null);
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
    <dl className="grid gap-x-6 gap-y-3 text-label sm:grid-cols-2" data-testid="request-summary">
      <div className="sm:col-span-2">
        <dt className="text-caption text-ink-muted">Title</dt>
        <dd className={`font-medium ${title ? "" : "text-ink-faint"}`}>{title || "Not given yet"}</dd>
      </div>
      {summaryFields.map((field) => (
        <div key={field.label}>
          <dt className="text-caption text-ink-muted">{field.label}</dt>
          <dd className="break-words font-medium">{field.pills?.length ? <ChoicePills values={field.pills} /> : field.value}</dd>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
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
    </dl>
  );

  return (
    /* v1.48.1 (owner: "Work task or FYI can't be selected"): onChange only. React's change event already fires on every keystroke; an onInput here re-rendered the form on the select's native input event, which reset a controlled dropdown (Kind of step, Who approves…) before its own change ran. */
    /* v1.54.0 (owner's redesign): one page per step (details, then the
       workflow, then the review), no summary column, a slim step bar and the
       actions in a bar that stays put while the page scrolls. Every field
       stays in the one form (hidden, not removed), so nothing typed is lost. */
    <form ref={autosave.formRef} onSubmit={onSubmit} onChange={refresh} className="request-form mx-auto max-w-5xl space-y-4" data-step={step}>
      <input type="hidden" name="spec" value={JSON.stringify({ stages })} />
      <input type="hidden" name="submissionKey" value={submissionKey} />
      {followUpOf && <input type="hidden" name="followUpOf" value={followUpOf} />}

      {/* The bar that stays put: the steps on the left, the actions on the right. */}
      <div className="request-sticky sticky z-sticky -mx-1 rounded-xl border border-line bg-raised/95 px-2 py-2 shadow-card backdrop-blur" data-testid="request-bar">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Steps" className="request-steps min-w-0 flex-1" data-testid="request-steps">
            <ol className="flex items-center gap-1">
              {STEPS.map((item, index) => {
                const current = item.step === step;
                const done = item.step < step;
                return (
                  <li key={item.step} className="flex min-w-0 items-center gap-1">
                    {index > 0 && <span aria-hidden="true" className={`hidden h-px w-4 shrink-0 sm:block lg:w-8 ${done || current ? "bg-primary-600" : "bg-line-strong"}`} />}
                    <button
                      type="button"
                      onClick={() => go(item.step)}
                      aria-current={current ? "step" : undefined}
                      title={item.hint}
                      className={`flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-label transition-colors ${current ? "bg-primary-solid font-semibold text-on-solid" : done ? "text-ink hover:bg-surface-muted" : "text-ink-muted hover:bg-surface-muted"}`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-caption font-semibold ${current ? "bg-white/20" : done ? "bg-success-solid text-on-solid" : "border border-line-strong"}`}>
                        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : item.step}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="mob-long-sr">{item.title}</span>
                        <span className="mob-short" aria-hidden="true">
                          {item.short}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          {/* The actions, always in the same place: Draft and Reset, then Back and Next / Submit. */}
          <div className="action-bar flex flex-wrap items-center gap-1.5" data-testid="action-bar">
            {draft && (
              <button type="button" className="btn-ghost btn-compact inline-flex items-center gap-1.5" onClick={() => nudge()} title="Save what you have as a draft">
                <Save className="h-4 w-4" aria-hidden="true" /> <span className="mob-long">Save as draft</span>
                <span className="mob-short">Draft</span>
              </button>
            )}
            <button
              type="button"
              className="btn-ghost btn-compact inline-flex items-center gap-1.5"
              title="Clear the form and the levels"
              onClick={() => {
                setDiscardError(null);
                setConfirmDiscard(true);
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> <span className="mob-long">Reset</span>
              <span className="mob-short sr-only">Reset</span>
            </button>
            <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
            {step > 1 && (
              <button type="button" className="btn-secondary btn-compact inline-flex items-center gap-1.5" onClick={() => go((step - 1) as Step)}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>
            )}
            {step < 3 && (
              <button type="button" className="btn-primary btn-compact inline-flex items-center gap-1.5" onClick={() => go((step + 1) as Step)} data-testid="step-next">
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
        </div>
        {draft && (
          <div className="mt-1 flex justify-end px-1">
            <DraftStatus
              state={autosave.state}
              restoredAt={restoredAt}
              onDiscard={() => {
                setDiscardError(null);
                setConfirmDiscard(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Compact, dismissible notices instead of large banners. */}
      {draft && restoredAt && (
        <Notice tone="info">
          Restored your draft from {restoredAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. Files aren&apos;t kept in drafts: add them again.
        </Notice>
      )}
      {stepError && (
        <Notice tone="danger" role="alert" onClose={() => setStepError(null)}>
          {stepError}
        </Notice>
      )}

      {/* Step 1: the request details, a page of its own. */}
      <section className="card space-y-5 px-5 py-6 sm:px-8" hidden={step !== 1} aria-labelledby="req-info" data-testid="step-details">
        <PanelHeader icon={ClipboardList} id="req-info" title="Request details" hint="What you're asking for, with any files and the people who follow it." />
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
          {/* v1.52.2 (owner): each file listed with its name; more files add to the list; any can be removed. */}
          <FileListInput id="c-attachments" name="attachments" accept={ACCEPT_ATTRIBUTE} maxFiles={5} />
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

      {/* Step 2: the approval workflow, a page of its own. */}
      <section className="card space-y-4 px-5 py-6 sm:px-8" hidden={step !== 2} aria-labelledby="req-flow" data-testid="step-workflow">
        <PanelHeader
          icon={Workflow}
          id="req-flow"
          title="Approval workflow"
          hint="Pick anyone, in any order. Every new level starts as Specific people; change it to a manager, HOD or group if you like. You can't approve your own request."
          aside={<SaveLevelsInline spec={JSON.stringify({ stages })} />}
        />
        <fieldset disabled={step !== 2} className="min-w-0" aria-label="Approval workflow">
          <StepPolicyContext.Provider value={policy}>
            <LevelsEditor stages={stages} setStages={setStages} options={options} form={fields} newId={newStepId} title="Approval levels" cards />
          </StepPolicyContext.Provider>
        </fieldset>
      </section>

      {/* Step 3: everything, to check before sending. */}
      {step === 3 && (
        <section className="card space-y-5 px-5 py-6 sm:px-8" aria-labelledby="review" data-testid="step-review">
          <PanelHeader icon={ListChecks} id="review" title="Review & submit" hint="Check the details and who approves. Back, or a step above, changes anything; nothing is lost." />
          {missing.length > 0 ? <Notice tone="warning">Not ready yet: needs {missing.join(", ")}.</Notice> : <Notice tone="info">After you submit, it goes to the first level&apos;s approvers.</Notice>}
          <details open className="rounded-lg border border-line">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold">
              <ClipboardList className="h-4 w-4 text-primary-600" aria-hidden="true" /> Request details
            </summary>
            <div className="border-t border-line px-4 py-4">
              {summary}
              <button type="button" className="link mt-3 text-label" onClick={() => go(1)}>
                Edit the details
              </button>
            </div>
          </details>
          <details open className="rounded-lg border border-line">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold">
              <GitBranch className="h-4 w-4 text-primary-600" aria-hidden="true" /> Approval levels and approvers
            </summary>
            <ol className="space-y-3 border-t border-line px-4 py-4 text-label" data-testid="review-route">
              {stages.map((stage, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-solid text-caption font-semibold text-on-solid">{index + 1}</span>
                  <span className="min-w-0 flex-1 rounded-md bg-surface-muted/60 px-3 py-2">
                    <span className="font-semibold">
                      {stage.kind === "STEP" ? stage.step.label : stage.kind === "PARALLEL" ? `${stage.label} (in parallel)` : stage.kind === "BRANCH" ? `${stage.label} (a choice)` : "Approval authority (DoA)"}
                    </span>
                    {(stage.kind === "STEP" ? [stage.step] : stage.kind === "PARALLEL" ? stage.steps : []).map((item) => (
                      <ReviewApprovers key={item.id} label={stage.kind === "PARALLEL" ? item.label : null} preview={preview ? (preview[item.id] ?? { names: [] }) : null} />
                    ))}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
              <button type="button" className="link text-label" onClick={() => go(2)}>
                Edit the levels
              </button>
              <SaveLevelsInline spec={JSON.stringify({ stages })} />
            </div>
          </details>
        </section>
      )}

      {possibleDuplicate && (
        <label className="flex items-start gap-2 rounded-md border border-warning-600/40 bg-warning-50 px-3 py-2 text-label text-warning-600">
          <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
          <span>This is a separate request: raise it anyway.</span>
        </label>
      )}
      <ResultMessage result={result} />

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
        <Notice tone="danger" role="alert" onClose={() => setDiscardError(null)}>
          {discardError}
        </Notice>
      )}
    </form>
  );
}

// v1.54.0: each step's page header: an icon, the title and a line of help.
function PanelHeader({ icon: Icon, id, title, hint, aside }: { icon: typeof ClipboardList; id: string; title: string; hint: string; aside?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
      <span className="page-icon grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700" aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-[calc(18px*var(--text-scale,1))] font-semibold">
          {title}
        </h2>
        <p className="text-label text-ink-muted">{hint}</p>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

// v1.54.0 (owner: "compact, dismissible notifications"): a slim notice with an icon and a close button.
function Notice({ tone, children, role = "status", onClose }: { tone: "info" | "warning" | "danger"; children: React.ReactNode; role?: "status" | "alert"; onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const style = tone === "danger" ? "border-danger-200 bg-danger-50 text-danger-600" : tone === "warning" ? "border-warning-600/40 bg-warning-50 text-warning-600" : "border-primary-100 bg-primary-50 text-primary-700";
  return (
    <div role={role} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-label ${style}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => {
          setOpen(false);
          onClose?.();
        }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded opacity-70 hover:bg-black/5 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
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

// v1.54.0 (owner): under each level of the review, who it goes to.
function ReviewApprovers({ label, preview }: { label: string | null; preview: StepPreview | null }) {
  return (
    <span className="mt-0.5 block text-caption text-ink-muted" data-testid="review-approvers">
      {label && <span className="font-medium text-ink">{label}: </span>}
      {preview === null ? (
        "Finding the approvers…"
      ) : preview.names.length ? (
        <>
          {preview.note && <span>{preview.note}: </span>}
          <span className="font-medium text-ink">{preview.names.join(", ")}</span>
        </>
      ) : (
        <span className="text-warning-600">{preview.note ?? "Nobody chosen yet"}</span>
      )}
    </span>
  );
}

