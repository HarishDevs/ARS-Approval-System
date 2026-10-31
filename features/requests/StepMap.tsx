import { StepStatusPill, taskStatusText } from "@/features/requests/StatusPill";
import type { MapStage, MapStep, TrackerSummary } from "@/server/approvals/step-map";
import { SafeText } from "@/features/ui/SafeText";
import { Check } from "lucide-react";

// The full level map (F-14): every level in order; parallel steps side by
// side; choices show both paths, the one not taken greyed out (D-068).
function StepCard({ step }: { step: MapStep }) {
  if (step.notTaken) {
    return (
      <div className="rounded-md border border-dashed border-line p-3 opacity-60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{step.label}</p>
          <span className="badge bg-surface-muted text-ink-muted">Not taken</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-md border p-3 ${step.status === "ACTIVE" ? "border-primary-600 bg-primary-50/40" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {step.type === "WORK" && <span className="mr-1.5 rounded-full bg-primary-50 px-2 py-px text-caption font-semibold text-primary-700">Work</span>}
          {step.type === "NOTIFY" && <span className="mr-1.5 rounded-full bg-surface-muted px-2 py-px text-caption font-semibold text-ink-muted">FYI</span>}
          {step.label}
        </p>
        <StepStatusPill status={step.status} />
      </div>
      <p className="mt-0.5 text-caption text-ink-muted">{step.reason ?? step.rule}</p>
      {step.people.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {step.people.map((person) => {
            const status =
              person.status === "TOLD" ? { label: "told", style: "text-ink-muted" } : step.type === "WORK" && person.status === "APPROVED" ? { label: "done", style: "text-success-600" } : taskStatusText(person.status);
            return (
              <li key={`${person.userId}-${person.status}`} className="text-label">
                <span className="font-medium">{person.name}</span> <span className={status.style}>· {status.label}</span>
                {person.decidedByName && <span className="text-ink-muted"> (by {person.decidedByName})</span>}
                {person.comment && (
                  <p className="mt-0.5 rounded bg-surface-muted px-2 py-1 text-caption text-ink-muted">
                    “<SafeText text={person.comment} />”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StageBody({ stage }: { stage: MapStage }) {
  if (stage.kind === "PARALLEL") {
    return (
      <div className="rounded-md border border-dashed border-line p-3">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">
          {stage.label} · in parallel · {stage.joinRule}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {stage.steps.map((step) => (
            <StepCard key={step.nodeId} step={step} />
          ))}
        </div>
      </div>
    );
  }
  if (stage.kind === "CHOICE") {
    return (
      <div className="rounded-md border border-dashed border-line p-3">
        <p className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">{stage.label}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {stage.paths?.map((path) => (
            <div key={path.label} className={`rounded-md p-2 ${path.taken === false ? "opacity-70" : ""}`}>
              <p className="mb-2 text-label font-medium">
                {path.label}
                {path.taken === true && <span className="badge ml-2 bg-success-50 text-success-600">Path taken</span>}
              </p>
              {path.stages.length === 0 ? (
                <p className="text-caption text-ink-muted">No extra levels.</p>
              ) : (
                <div className="space-y-2">
                  {path.stages.map((inner, index) => (
                    <StageBody key={`${inner.label}-${index}`} stage={inner} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      {stage.steps.map((step) => (
        <StepCard key={step.nodeId} step={step} />
      ))}
    </>
  );
}

// D-234 (Goal gradient, Connectedness): a level is done when every step on
// its path is approved or skipped, current while one is active or blocked,
// else still to come. Steps of a choice count only on the path taken.
type LevelState = "done" | "current" | "upcoming" | "stopped";
function allSteps(stage: MapStage): MapStep[] {
  const taken = (stage.paths ?? []).filter((path) => path.taken !== false).flatMap((path) => path.stages.flatMap(allSteps));
  return [...stage.steps, ...taken].filter((step) => !step.notTaken);
}
export function levelState(stage: MapStage): LevelState {
  const steps = allSteps(stage);
  if (steps.some((step) => step.status === "REJECTED" || step.status === "CANCELLED")) return "stopped";
  if (steps.some((step) => step.status === "ACTIVE" || step.status === "BLOCKED")) return "current";
  if (steps.length > 0 && steps.every((step) => step.status === "APPROVED" || step.status === "SKIPPED")) return "done";
  return "upcoming";
}
const LEVEL_DOT: Record<LevelState, string> = {
  done: "bg-success-600 text-on-solid",
  current: "bg-primary-solid text-on-solid ring-4 ring-primary-100",
  upcoming: "border border-line-strong bg-surface text-ink-muted",
  stopped: "bg-danger-solid text-on-solid",
};
const LEVEL_WORD: Record<LevelState, string> = { done: "done", current: "now", upcoming: "to come", stopped: "stopped" };

export function StepMap({ stages }: { stages: MapStage[] }) {
  return (
    <ol className="space-y-3" data-testid="step-map">
      {stages.map((stage, index) => {
        const state = levelState(stage);
        const last = index === stages.length - 1;
        return (
          <li key={`${stage.label}-${index}`} className="relative flex gap-3" data-level-state={state}>
            {/* The line joining this level to the next: solid once this one is done. */}
            {!last && <span aria-hidden="true" className={`absolute left-3 top-9 -bottom-3 w-0.5 -translate-x-1/2 ${state === "done" ? "bg-success-600" : "bg-line-strong"}`} />}
            <span aria-hidden="true" className={`relative z-[1] mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold ${LEVEL_DOT[state]}`}>
              {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <span className="sr-only">
              Level {index + 1} of {stages.length}: {LEVEL_WORD[state]}.
            </span>
            <div className="min-w-0 flex-1">
              <StageBody stage={stage} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Where the request is now (spec #2): words and a progress count, never
// colour alone.
const TONE: Record<TrackerSummary["tone"], string> = {
  progress: "border-line bg-surface-muted",
  waiting: "border-primary-600/40 bg-primary-50/50",
  attention: "border-warning-600/40 bg-warning-50",
  done: "border-success-600/40 bg-success-50",
  stopped: "border-line bg-surface-muted",
};

export function TrackerBanner({ summary }: { summary: TrackerSummary }) {
  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  return (
    <div className={`mb-4 rounded-md border px-4 py-3 ${TONE[summary.tone]}`}>
      <p className="font-semibold">
        <span className="sr-only">Now: </span>
        <SafeText text={summary.headline} />
      </p>
      {summary.detail && (
        <p className="text-label text-ink-muted">
          <SafeText text={summary.detail} />
        </p>
      )}
      {summary.total > 0 && (
        <div className="mt-2 flex items-center gap-3">
          <div role="progressbar" aria-label="Steps finished" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.done} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-primary-600 motion-safe:transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-caption text-ink-muted tabular-nums">
            {summary.done} of {summary.total} steps done
          </span>
        </div>
      )}
    </div>
  );
}
