"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { computeLine, formatPaise, MAX_LINES, type LineInput } from "@/server/forms/dynamic";

// EN-03 line items: description, quantity, rate and GST %. Totals shown here
// use the same paise maths as the server, which works them out again on
// submit and stores its own figures.
function initialRows(value: string): LineInput[] {
  try {
    const parsed = JSON.parse(value) as LineInput[];
    if (Array.isArray(parsed) && parsed.length) return parsed.map((row) => ({ description: String(row.description ?? ""), quantity: String(row.quantity ?? ""), rate: String(row.rate ?? ""), gst: row.gst === undefined ? "" : String(row.gst) }));
  } catch {
    // a fresh form
  }
  return [{ description: "", quantity: "1", rate: "", gst: "" }];
}

export function LineItemsEditor({ name, label, defaultValue, invalid, describedBy, onChange }: { name: string; label: string; defaultValue: string; invalid?: boolean; describedBy?: string; onChange: (totalRupees: number | null, json: string) => void }) {
  const [rows, setRows] = useState<LineInput[]>(() => initialRows(defaultValue));
  const json = JSON.stringify(rows.filter((row) => row.description.trim() || row.quantity.trim() || row.rate.trim()));
  const computed = useMemo(() => rows.map((row) => (row.description.trim() || row.rate.trim() ? computeLine(row) : null)), [rows]);
  const totalPaise = computed.reduce((sum, item) => sum + (item && item.ok ? item.line.totalPaise : 0), 0);
  const allValid = computed.every((item) => item === null || item.ok) && computed.some((item) => item?.ok);
  useEffect(() => onChange(allValid ? totalPaise / 100 : null, json), [allValid, totalPaise, json, onChange]);
  const set = (index: number, patch: Partial<LineInput>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className={`rounded-md border ${invalid ? "border-danger-600" : "border-line"}`} aria-describedby={describedBy}>
      <input type="hidden" name={name} value={json} />
      <div className="hidden gap-2 border-b border-line px-3 py-2 text-caption font-semibold uppercase tracking-wider text-ink-faint sm:grid sm:grid-cols-[1fr_5rem_7rem_4.5rem_7rem_2rem]">
        <span>Description</span>
        <span>Qty</span>
        <span>Rate (₹)</span>
        <span>GST %</span>
        <span className="text-right">Line total</span>
        <span />
      </div>
      <ol className="divide-y divide-line" aria-label={`${label} lines`}>
        {rows.map((row, index) => {
          const result = computed[index];
          return (
            <li key={index} className="grid grid-cols-2 gap-2 px-3 py-2 sm:grid-cols-[1fr_5rem_7rem_4.5rem_7rem_2rem] sm:items-center">
              <input aria-label={`Line ${index + 1} description`} value={row.description} onChange={(event) => set(index, { description: event.target.value })} maxLength={200} className="field-input col-span-2 sm:col-span-1" placeholder="e.g. 3-phase motor" />
              <input aria-label={`Line ${index + 1} quantity`} value={row.quantity} onChange={(event) => set(index, { quantity: event.target.value })} inputMode="decimal" className="field-input" />
              <input aria-label={`Line ${index + 1} rate in rupees`} value={row.rate} onChange={(event) => set(index, { rate: event.target.value })} inputMode="decimal" className="field-input" placeholder="0.00" />
              <input aria-label={`Line ${index + 1} GST percent`} value={row.gst ?? ""} onChange={(event) => set(index, { gst: event.target.value })} inputMode="decimal" className="field-input" placeholder="0" />
              <span className="text-right text-label tabular-nums" aria-live="polite">
                {result ? result.ok ? formatPaise(result.line.totalPaise) : <span className="text-caption text-danger-600">{result.message}</span> : "—"}
              </span>
              <button type="button" onClick={() => setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [{ description: "", quantity: "1", rate: "", gst: "" }]))} aria-label={`Remove line ${index + 1}`} className="btn-ghost justify-self-end !px-2">
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
        <button type="button" disabled={rows.length >= MAX_LINES} onClick={() => setRows((current) => [...current, { description: "", quantity: "1", rate: "", gst: "" }])} className="btn-ghost">
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add a line
        </button>
        <p className="text-label">
          Total <span className="font-semibold tabular-nums">{formatPaise(totalPaise)}</span>
        </p>
      </div>
    </div>
  );
}
