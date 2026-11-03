"use client";

import { useRef, useState, useTransition } from "react";
import { checkImportAction, runImportAction, type ImportActionResult, type ImportPreview } from "@/app/admin/import/actions";
import { IMPORT_KINDS, IMPORT_LIMITS, IMPORT_SPECS, type ImportKind } from "@/server/import/kinds";
import { XLSX_MIME, buildWorkbook } from "@/server/import/xlsx";
import type { PlannedRow, RowAction } from "@/server/import/plan";
import { Spinner } from "@/features/ui/Spinner";
import { SafeText } from "@/features/ui/SafeText";
import { Hint } from "@/features/ui/Hint";

// Bulk import screen (S10-05/06, F-59): choose what, download the template
// or the current data (Excel, v1.49.1), upload an Excel or CSV file, check it (nothing saved), then import
// every row or none. Every wait shows a spinner and locks the controls.
type Busy = null | "checking" | "importing" | "template" | "data";
type Filter = "all" | "problems" | "changes";

const ACTION_BADGE: Record<RowAction, { label: string; className: string }> = {
  create: { label: "New", className: "bg-primary-50 text-primary-700" },
  update: { label: "Changes", className: "bg-warning-50 text-warning-600" },
  unchanged: { label: "No change", className: "bg-surface-muted text-ink-muted" },
  error: { label: "Problem", className: "bg-danger-50 text-danger-600" },
};
const SHOW_ROWS = 500;

function saveFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sizeText(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportPanel({ initialKind }: { initialKind: ImportKind }) {
  const [kind, setKind] = useState<ImportKind>(initialKind);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [checked, setChecked] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const spec = IMPORT_SPECS[kind];
  const locked = busy !== null;

  function reset(nextKind: ImportKind = kind) {
    setKind(nextKind);
    setFile(null);
    setResult(null);
    setChecked(null);
    setImported(false);
    setConfirming(false);
    setFilter("all");
    if (input.current) input.current.value = "";
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setResult(null);
    setChecked(null);
    setImported(false);
    setConfirming(false);
  }

  async function download(type: "template" | "data") {
    setBusy(type);
    setDownloadError(null);
    try {
      const response = await fetch(`/api/admin/import/${kind}?type=${type}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const today = new Date().toISOString().slice(0, 10);
      saveFile(type === "template" ? `ars-${kind}-template.xlsx` : `ars-${kind}-${today}.xlsx`, await response.blob());
    } catch {
      setDownloadError("The download didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function send(action: typeof checkImportAction, mode: "checking" | "importing") {
    if (!file) return;
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);
    setBusy(mode);
    setConfirming(false);
    startTransition(async () => {
      try {
        const next = await action(formData);
        setResult(next);
        if (next.preview) setChecked(next.preview);
        if (mode === "importing" && next.ok) setImported(true);
        if (next.preview?.summary.error) setFilter("problems");
      } catch {
        setResult({ ok: false, message: "The server didn't answer. Check your connection and try again." });
      } finally {
        setBusy(null);
      }
    });
  }

  function downloadProblems() {
    if (!checked) return;
    const rows = checked.rows.filter((row) => row.action === "error").flatMap((row) => row.problems.map((problem) => [row.line, row.key, problem.column, problem.message]));
    const fileRows = checked.fileProblems.map((problem) => ["", "", "file", problem]);
    saveFile(`ars-${kind}-problems.xlsx`, new Blob([buildWorkbook([{ name: "Problems", header: ["row", spec.columns[0]!.name, "column", "problem"], rows: [...fileRows, ...rows], widths: [8, 20, 20, 90] }])], { type: XLSX_MIME }));
  }

  const summary = checked?.summary;
  const toWrite = summary ? summary.create + summary.update : 0;
  const canImport = Boolean(result?.ok && checked && !imported && toWrite > 0);
  const visible = (checked?.rows ?? []).filter((row: PlannedRow) =>
    filter === "problems" ? row.action === "error" : filter === "changes" ? row.action === "create" || row.action === "update" : true,
  );

  return (
    <div className="space-y-6" aria-busy={locked}>
      {/* 1. What */}
      <section className="card p-5">
        <h2 className="font-semibold">1. What are you importing?</h2>
        <div role="tablist" aria-label="What to import" className="mt-3 flex flex-wrap gap-2">
          {IMPORT_KINDS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === kind}
              disabled={locked}
              onClick={() => reset(item)}
              className={`rounded-full border px-4 py-1.5 text-label font-semibold transition-colors disabled:opacity-60 ${
                item === kind ? "border-primary-solid bg-primary-solid text-on-solid" : "border-line bg-surface text-ink hover:bg-surface-muted"
              }`}
            >
              {IMPORT_SPECS[item].label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => download("template")} disabled={locked} className="btn-secondary btn-compact">
            {busy === "template" ? <Spinner /> : <DownloadIcon />}
            Download template
          </button>
          <button type="button" onClick={() => download("data")} disabled={locked} className="btn-secondary btn-compact">
            {busy === "data" ? <Spinner /> : <DownloadIcon />}
            Download current {spec.label.toLowerCase()}
          </button>
          <Hint text={spec.note} align="start" />
        </div>
        {downloadError && (
          <p role="alert" className="mt-2 text-label text-danger-600">
            {downloadError}
          </p>
        )}
        <details className="mt-4 rounded-md border border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-label font-semibold">Columns in the {spec.label.toLowerCase()} file</summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Needed</th>
                  <th>What to write</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {spec.columns.map((column) => (
                  <tr key={column.name}>
                    <td className="font-mono">{column.name}</td>
                    <td>{column.required ? "Required" : "Optional"}</td>
                    <td className="text-ink-muted">
                      <SafeText text={column.help} />
                    </td>
                    <td className="font-mono text-ink-muted">
                      <SafeText text={column.example} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-caption text-ink-muted">
            Matched by {spec.matchBy}. Keep the header row and every column. Fill the <strong>Excel template</strong> and upload it as it is (.xlsx); a CSV with commas, semicolons or tabs also works. The first sheet is read. Up to {IMPORT_LIMITS.maxRows.toLocaleString("en-IN")} rows and 2 MB per file.
          </p>
        </details>
      </section>

      {/* 2. Upload and check */}
      <section className="card p-5">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">2. Upload and check</h2>
          <Hint text="Checking saves nothing. It shows what would be created or changed, and every problem by row." align="start" />
        </div>
        <label
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            locked ? "cursor-not-allowed border-line opacity-60" : "border-line hover:border-primary-600 hover:bg-primary-50"
          }`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!locked) chooseFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="text-label font-semibold text-primary-700">{file ? "Choose a different file" : "Choose an Excel or CSV file"}</span>
          <span className="text-caption text-ink-muted">or drop it here</span>
          <input
            ref={input}
            type="file"
            name="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={locked}
            className="sr-only"
            aria-label={`${spec.label} file (Excel or CSV)`}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <p className="mt-3 text-label">
            <span className="font-semibold">{file.name}</span> <span className="text-ink-muted">· {sizeText(file.size)}</span>
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => send(checkImportAction, "checking")} disabled={!file || locked} className="btn-primary btn-compact">
            {busy === "checking" && <Spinner />}
            {busy === "checking" ? "Checking…" : "Check file"}
          </button>
          {(file || checked) && (
            <button type="button" onClick={() => reset()} disabled={locked} className="btn-secondary btn-compact">
              Start again
            </button>
          )}
        </div>
      </section>

      {busy === "checking" || busy === "importing" ? (
        <div role="status" className="card flex items-center gap-3 border-primary-600 bg-primary-50 p-4 text-label text-primary-700">
          <Spinner className="h-5 w-5" />
          <span>
            {busy === "checking"
              ? `Checking ${file?.name ?? "the file"}… nothing is saved yet.`
              : `Importing ${toWrite} ${spec.label.toLowerCase()}… please keep this page open.`}
          </span>
        </div>
      ) : null}

      {/* 3. Result */}
      {result && !locked && (
        <section className="card space-y-4 p-5" aria-live="polite">
          <h2 className="font-semibold">3. {imported ? "Done" : "Result of the check"}</h2>
          <p
            role={result.ok ? "status" : "alert"}
            className={`rounded-md border px-3 py-2 text-label ${result.ok ? "border-transparent bg-success-50 text-success-600" : "border-danger-200 bg-danger-50 text-danger-600"}`}
          >
            {result.message}
          </p>
          {checked?.fileProblems.length ? (
            <ul className="list-disc space-y-1 pl-5 text-label text-danger-600">
              {checked.fileProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {summary && summary.total > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-label">
                <SummaryChip label={imported ? "Created" : "New"} value={summary.create} tone="bg-primary-50 text-primary-700" />
                <SummaryChip label={imported ? "Updated" : "Changes"} value={summary.update} tone="bg-warning-50 text-warning-600" />
                <SummaryChip label="No change" value={summary.unchanged} tone="bg-surface-muted text-ink-muted" />
                <SummaryChip label="Problems" value={summary.error} tone="bg-danger-50 text-danger-600" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="group" aria-label="Show rows" className="flex gap-1">
                  {(["all", "changes", "problems"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      aria-pressed={filter === item}
                      className={`rounded-md px-3 py-1 text-label ${filter === item ? "bg-surface-muted font-semibold text-ink" : "text-ink-muted hover:bg-surface-muted"}`}
                    >
                      {item === "all" ? "All rows" : item === "changes" ? "New and changed" : "Problems"}
                    </button>
                  ))}
                </div>
                {summary.error > 0 && (
                  <button type="button" onClick={downloadProblems} className="btn-secondary btn-compact">
                    <DownloadIcon />
                    Download problem list
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>{spec.matchBy}</th>
                      <th>Result</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, SHOW_ROWS).map((row) => (
                      <tr key={row.line}>
                        <td className="tabular-nums text-ink-muted">{row.line}</td>
                        <td className="font-mono">{row.key || "—"}</td>
                        <td>
                          <span className={`badge ${ACTION_BADGE[row.action].className}`}>{ACTION_BADGE[row.action].label}</span>
                        </td>
                        <td>
                          {row.problems.length ? (
                            <ul className="space-y-0.5 text-danger-600">
                              {row.problems.map((problem, index) => (
                                <li key={index}>
                                  <span className="font-mono text-caption">{problem.column}</span>: {problem.message}
                                </li>
                              ))}
                            </ul>
                          ) : row.changes.length ? (
                            <span className="text-ink-muted">Changes: {row.changes.join(", ")}</span>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-ink-muted">
                          No rows to show.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {visible.length > SHOW_ROWS && <p className="text-caption text-ink-muted">Showing the first {SHOW_ROWS} of {visible.length} rows.</p>}
            </>
          )}
          {canImport && (
            <div className="border-t border-line pt-4">
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} className="btn-primary btn-compact">
                  Import {toWrite} {toWrite === 1 ? spec.noun : spec.label.toLowerCase()}
                </button>
              ) : (
                <div role="alertdialog" aria-label="Please confirm" className="space-y-2 rounded-md border border-warning-600 bg-warning-50 px-3 py-2 text-label">
                  <p>
                    Create {summary!.create} and update {summary!.update} {spec.label.toLowerCase()}? Every change is recorded in the audit log.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => send(runImportAction, "importing")} className="btn-primary btn-compact">
                      Yes, import
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="btn-secondary btn-compact">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {imported && (
            <button type="button" onClick={() => reset()} className="btn-secondary btn-compact">
              Import another file
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${tone}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      {label}
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
