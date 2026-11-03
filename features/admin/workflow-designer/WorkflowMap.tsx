"use client";

import { AlertTriangle, CircleCheck, GitBranch, Layers, Play, Split, User } from "lucide-react";
import { doaBandLabels, type BuilderStep } from "@/server/workflows/builder";
import { stageName, stageProblems, stageSummary, stepSummary, type AnyStage, type DesignContext } from "@/features/admin/workflow-designer/model";

// D-239 (Configuration Studio): the visual mode of the Workflow Designer. The
// levels drawn as a flow from Start to End: one box per step, parallel steps
// side by side, a choice as two paths, a DoA matrix as its bands. Clicking a
// box opens that level in the structured list (the one place it is edited),
// so the map and the list can never disagree.
export function WorkflowMap({ stages, context, onSelect, selected }: { stages: AnyStage[]; context: DesignContext; onSelect: (index: number) => void; selected: number | null }) {
  return (
    <div className="overflow-x-auto px-5 py-4" data-testid="workflow-map">
      <ol className="mx-auto flex w-max min-w-full flex-col items-center" aria-label="Workflow map">
        <Terminal label="Request submitted" icon={<Play aria-hidden="true" className="h-3.5 w-3.5" />} />
        {stages.map((stage, index) => (
          <li key={index} className="flex flex-col items-center">
            <Connector />
            <StageNode stage={stage} context={context} index={index} onSelect={onSelect} selected={selected === index} />
          </li>
        ))}
        <Connector />
        <Terminal label="Decided" icon={<CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />} />
      </ol>
      {stages.length === 0 && <p className="mt-3 text-center text-label text-ink-muted">No levels yet: add one below.</p>}
    </div>
  );
}

function Terminal({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-3 py-1 text-caption font-semibold text-ink-muted" aria-label={label}>
      {icon}
      {label}
    </li>
  );
}

const Connector = () => <span aria-hidden="true" className="h-5 w-px bg-line-strong" />;

function StageNode({ stage, context, index, onSelect, selected }: { stage: AnyStage; context: DesignContext; index: number; onSelect: (index: number) => void; selected: boolean }) {
  const problems = stageProblems(stage, context);
  const icon =
    stage.kind === "PARALLEL" ? (
      <Layers aria-hidden="true" className="h-3.5 w-3.5" />
    ) : stage.kind === "BRANCH" ? (
      <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
    ) : stage.kind === "DOA" ? (
      <Split aria-hidden="true" className="h-3.5 w-3.5" />
    ) : (
      <User aria-hidden="true" className="h-3.5 w-3.5" />
    );
  return (
    <div className={`w-[min(36rem,calc(100vw-4rem))] rounded-lg border bg-raised ${selected ? "border-primary-600 ring-2 ring-primary-600/30" : problems.length ? "border-danger-200" : "border-line"}`}>
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-label={`Level ${index + 1}: ${stageName(stage)}. ${stageSummary(stage)}${problems.length ? `. ${problems.length} to fix` : ""}. Open in the list`}
        className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-muted"
      >
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-50 text-caption font-semibold text-primary-700">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-label font-semibold">
            {icon}
            <span className="truncate">{stageName(stage) || "Unnamed level"}</span>
          </span>
          <span className="block truncate text-caption text-ink-muted">{stageSummary(stage)}</span>
        </span>
        {problems.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-caption font-semibold text-danger-600" title={problems.join("\n")}>
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            {problems.length} to fix
          </span>
        )}
      </button>
      {stage.kind === "PARALLEL" && (
        <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2">
          {stage.steps.map((step) => (
            <MiniStep key={step.id} step={step} />
          ))}
        </div>
      )}
      {stage.kind === "BRANCH" && (
        <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-2">
          {(["then", "otherwise"] as const).map((path) => (
            <div key={path} className="rounded-md bg-surface-muted p-2">
              <p className="mb-1 text-caption font-semibold text-ink-muted">{path === "then" ? "If yes" : "Otherwise"}</p>
              {stage[path].length === 0 ? (
                <p className="text-caption text-ink-faint">Goes straight on</p>
              ) : (
                <ol className="space-y-1">
                  {stage[path].map((inner, at) => (
                    <li key={at} className="truncate rounded border border-line bg-raised px-2 py-1 text-caption">
                      <span className="font-medium">{stageName(inner) || "Unnamed"}</span> · <span className="text-ink-muted">{stageSummary(inner)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
      {stage.kind === "DOA" && (
        <div className="overflow-x-auto border-t border-line px-3 py-2">
          <table className="text-caption">
            <thead>
              <tr>
                <th className="pr-2 text-left font-medium text-ink-muted">Level</th>
                {doaBandLabels(stage.limits).map((band) => (
                  <th key={band} className="px-1.5 text-center font-medium text-ink-muted">
                    {band}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stage.levels.map((level) => (
                <tr key={level.step.id}>
                  <td className="pr-2">{level.step.label}</td>
                  {level.bands.map((tick, band) => (
                    <td key={band} className="text-center">
                      {tick ? (
                        <span aria-label="needed">●</span>
                      ) : (
                        <span aria-label="not needed" className="text-ink-faint">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniStep({ step }: { step: BuilderStep }) {
  return (
    <span className="max-w-[16rem] truncate rounded border border-line bg-surface-muted px-2 py-1 text-caption" title={stepSummary(step)}>
      <span className="font-medium">{step.label}</span> · <span className="text-ink-muted">{stepSummary(step)}</span>
    </span>
  );
}
