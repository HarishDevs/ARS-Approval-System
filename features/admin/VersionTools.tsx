"use client";

import { useState } from "react";
import { restoreVersionAction, runMigrationAction } from "@/app/admin/workflows/actions";
import { ResultMessage, SubmitButton, useActionForm } from "@/features/ui/form";

// Version history tools: restore an older version as a draft, and the FN7
// migration form (the dry-run table is rendered by the page).
export function RestoreVersionButton({ workflowId, versionId, versionNo }: { workflowId: number; versionId: number; versionNo: number }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(restoreVersionAction, { confirmTitle: `Copy version ${versionNo} as a new draft?`, confirm: "The live version doesn't change. You can check the draft and publish it when ready.", confirmLabel: "Copy as draft" });
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      {confirmBar}
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="versionId" value={versionId} />
      <SubmitButton pending={pending} variant="secondary" className="btn-compact">
        Restore as draft
      </SubmitButton>
      <ResultMessage result={result} />
    </form>
  );
}

export interface MigrationRow {
  id: number;
  requestNo: string;
  title: string;
  verdict: "COMPATIBLE" | "WARNINGS" | "MANUAL" | "BLOCKED";
  verdictLabel: string;
  reasons: string[];
  currentSteps: string[];
}

const TONE: Record<MigrationRow["verdict"], string> = {
  COMPATIBLE: "bg-success-50 text-success-600",
  WARNINGS: "bg-warning-50 text-warning-600",
  MANUAL: "bg-primary-50 text-primary-700",
  BLOCKED: "bg-danger-50 text-danger-600",
};

export function MigrationForm({ workflowId, fromVersionId, fromNo, toNo, rows, mapping }: { workflowId: number; fromVersionId: number; fromNo: number; toNo: number; rows: MigrationRow[]; mapping: Record<string, string> }) {
  const movable = rows.filter((row) => row.verdict === "COMPATIBLE" || row.verdict === "WARNINGS");
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(rows.filter((row) => row.verdict === "COMPATIBLE").map((row) => row.id)));
  const { result, pending, onSubmit, confirmBar } = useActionForm(runMigrationAction, {
    confirmTitle: `Move ${chosen.size} request${chosen.size === 1 ? "" : "s"} to version ${toNo}?`,
    confirm: "Each request is checked again as it moves. Decisions already made stay. People already asked keep their tasks. Later steps follow the new version.",
    confirmLabel: "Move them",
  });
  const toggle = (id: number) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return (
    <form onSubmit={onSubmit} className="card overflow-x-auto">
      {confirmBar}
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="fromVersionId" value={fromVersionId} />
      {Object.entries(mapping).map(([from, to]) => (
        <input key={from} type="hidden" name={`map:${from}`} value={to} />
      ))}
      <table className="data-table">
        <caption className="sr-only">
          Open requests on version {fromNo}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Move</span>
            </th>
            <th scope="col">Request</th>
            <th scope="col">Waiting at</th>
            <th scope="col">Result of the check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const canMove = row.verdict === "COMPATIBLE" || row.verdict === "WARNINGS";
            return (
              <tr key={row.id}>
                <td>
                  {canMove && <input type="checkbox" name="requestId" value={row.id} checked={chosen.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Move ${row.requestNo}`} />}
                </td>
                <td>
                  <span className="font-semibold">{row.requestNo}</span>
                  <span className="block max-w-xs truncate text-caption text-ink-muted">{row.title}</span>
                </td>
                <td className="text-label">{row.currentSteps.join(", ") || "—"}</td>
                <td className="text-label">
                  <span className={`badge ${TONE[row.verdict]}`}>{row.verdictLabel}</span>
                  {row.reasons.map((reason) => (
                    <span key={reason} className="mt-1 block text-caption text-ink-muted">
                      {reason}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
        {movable.some((row) => row.verdict === "WARNINGS") && (
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" name="acceptWarnings" />
            Move requests with warnings
          </label>
        )}
        <SubmitButton pending={pending} className="btn-compact">
          Move selected ({chosen.size})
        </SubmitButton>
        <ResultMessage result={result} />
      </div>
    </form>
  );
}
