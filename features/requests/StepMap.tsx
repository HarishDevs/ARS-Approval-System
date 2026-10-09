import { StepStatusPill, taskStatusText } from "@/features/requests/StatusPill";
import type { MapStage, MapStep } from "@/server/approvals/step-map";
import { SafeText } from "@/features/ui/SafeText";

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
        <p className="font-medium">{step.label}</p>
        <StepStatusPill status={step.status} />
      </div>
      <p className="mt-0.5 text-caption text-ink-muted">{step.reason ?? step.rule}</p>
      {step.people.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {step.people.map((person) => {
            const status = taskStatusText(person.status);
            return (
              <li key={`${person.userId}-${person.status}`} className="text-label">
                <span className="font-medium">{person.name}</span> <span className={status.style}>· {status.label}</span>
                {person.decidedByName && <span className="text-ink-muted"> (by {person.decidedByName})</span>}
                {person.comment && <p className="mt-0.5 rounded bg-surface-muted px-2 py-1 text-caption text-ink-muted">“<SafeText text={person.comment} />”</p>}
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

export function StepMap({ stages }: { stages: MapStage[] }) {
  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => (
        <li key={`${stage.label}-${index}`} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-caption font-semibold text-ink-muted">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <StageBody stage={stage} />
          </div>
        </li>
      ))}
    </ol>
  );
}
