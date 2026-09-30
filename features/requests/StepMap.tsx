import { StepStatusPill, taskStatusText } from "@/features/requests/StatusPill";
import type { MapStage, MapStep } from "@/server/approvals/step-map";

// The full level map (F-14): every stage in order; parallel steps side by
// side; each step with its rule and every approver's status.
function StepCard({ step }: { step: MapStep }) {
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
                {person.comment && <p className="mt-0.5 rounded bg-surface-muted px-2 py-1 text-caption text-ink-muted">“{person.comment}”</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
            {stage.kind === "PARALLEL" ? (
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
            ) : (
              stage.steps.map((step) => <StepCard key={step.nodeId} step={step} />)
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
