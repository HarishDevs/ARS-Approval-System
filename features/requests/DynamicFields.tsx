"use client";

import { useCallback, useMemo, useState } from "react";
import { LineItemsEditor } from "@/features/requests/LineItemsEditor";
import { describeRule, evaluateFormula, parseFormula, ruleHolds, visibleFields } from "@/server/forms/dynamic";
import { FieldError } from "@/features/ui/form";
import { ACCEPT_ATTRIBUTE } from "@/server/attachments/files";
import type { FieldLookups, FormField } from "@/server/forms/fields";
import type { ActionResult } from "@/lib/http/action-result";

// The fields of a form (v1.8.0: shared by raise / resubmit / amend and by
// the custom approval page, whose fields IT sets up). Live values decide
// which fields show and what is worked out (EN-01/02); the server applies
// the same rules again on submit. It listens to the inputs inside it, so it
// works inside any form.
const NO_FILES: Record<string, number> = {};
const NO_SOURCES: Record<string, string> = {};
const NOT_LOCKED = () => false;

export function DynamicFields({
  fields,
  mode,
  people,
  approverPeople,
  approverFields = [],
  lookups,
  initial,
  existingFiles = NO_FILES,
  sources = NO_SOURCES,
  locked = NOT_LOCKED,
  result,
  onLinesChange,
}: {
  fields: readonly FormField[];
  mode: "submit" | "resubmit";
  people: { id: number; label: string }[];
  approverPeople?: { id: number; label: string }[];
  approverFields?: readonly string[];
  lookups: FieldLookups;
  initial?: Record<string, string>;
  existingFiles?: Record<string, number>;
  sources?: Record<string, string>;
  locked?: (key: string) => boolean;
  result: ActionResult | null;
  onLinesChange?: () => void;
}) {
  const start = useMemo(() => {
    const values: Record<string, string> = {};
    for (const field of fields) values[field.key] = field.type === "ATTACHMENT" ? (existingFiles[field.key] ? String(existingFiles[field.key]) : "") : (initial?.[field.key] ?? (mode === "submit" ? (field.defaultValue ?? "") : ""));
    return values;
  }, [fields, initial, mode, existingFiles]);
  const [values, setValues] = useState<Record<string, string | number | null>>(start);
  const read = (element: HTMLElement) => {
    const form = element.closest("form");
    if (!form) return;
    const data = new FormData(form);
    setValues((current) => {
      const next: Record<string, string | number | null> = { ...current };
      for (const field of fields) {
        if (field.type === "ATTACHMENT") next[field.key] = ((form.elements.namedItem(`file:${field.key}`) as HTMLInputElement | null)?.files?.length ?? 0) + (existingFiles[field.key] ?? 0) || null;
        else if (field.type !== "LINE_ITEMS" && field.type !== "CALC" && field.type !== "SECTION" && !locked(field.key)) next[field.key] = String(data.get(field.key) ?? "");
      }
      return next;
    });
  };
  const onLines = useCallback(
    (key: string) => (total: number | null) => {
      setValues((current) => (current[key] === total ? current : { ...current, [key]: total }));
      onLinesChange?.();
    },
    [onLinesChange],
  );
  const lineHandlers = useMemo(() => Object.fromEntries(fields.filter((field) => field.type === "LINE_ITEMS").map((field) => [field.key, onLines(field.key)])), [fields, onLines]);
  const calculated = useMemo(() => {
    const out: Record<string, number | null> = {};
    const scope: Record<string, string | number | null> = { ...values };
    for (const field of fields) {
      if (field.type !== "CALC" || !field.formula) continue;
      try {
        out[field.key] = evaluateFormula(parseFormula(field.formula), scope);
        scope[field.key] = out[field.key] ?? null;
      } catch {
        out[field.key] = null;
      }
    }
    return out;
  }, [fields, values]);
  const shown = useMemo(() => visibleFields(fields, { ...values, ...calculated }), [fields, values, calculated]);
  const labelOf = (key: string) => fields.find((field) => field.key === key)?.label ?? key;

  return (
    <div className="space-y-5" onInput={(event) => read(event.currentTarget)} onChange={(event) => read(event.currentTarget)}>
      {fields.map((field) => {
        const visible = shown.has(field.key);
        const error = result && !result.ok ? result.fieldErrors?.[field.key] : undefined;
        if (field.type === "SECTION") {
          return visible ? (
            <div key={field.key} className="border-t border-line pt-4">
              <h3 className="font-semibold">{field.label}</h3>
              {field.help && <p className="text-label text-ink-muted">{field.help}</p>}
            </div>
          ) : null;
        }
        const required = field.required || (field.requiredIf ? ruleHolds(field.requiredIf, { ...values, ...calculated }) : false);
        return (
          // A field hidden by its rule is disabled, so it isn't sent (the server clears it anyway).
          <fieldset key={field.key} hidden={!visible} disabled={!visible || locked(field.key)} className="min-w-0">
            <label htmlFor={`f-${field.key}`} className="field-label">
              {field.label}
              {!required && field.type !== "CALC" && <span className="font-normal text-ink-faint"> (optional)</span>}
            </label>
            {field.type === "CALC" ? (
              <output id={`f-${field.key}`} aria-live="polite" className="field-input flex items-center bg-surface tabular-nums">
                {calculated[field.key] === null || calculated[field.key] === undefined ? <span className="text-ink-faint">Fill in the fields it uses</span> : calculated[field.key]!.toLocaleString("en-IN", { maximumFractionDigits: field.decimals ?? 2 })}
              </output>
            ) : field.type === "LINE_ITEMS" ? (
              <LineItemsEditor name={field.key} label={field.label} defaultValue={initial?.[`${field.key}__lines`] ?? initial?.[field.key] ?? ""} invalid={Boolean(error)} describedBy={error ? `${field.key}-error` : undefined} onChange={lineHandlers[field.key]!} />
            ) : (
              <FieldInput existing={existingFiles[field.key] ?? 0} field={field} people={approverPeople && approverFields.includes(field.key) ? approverPeople : people} lookups={lookups} defaultValue={start[field.key] ?? ""} error={error} />
            )}
            {sources[field.key] && <p className="mt-1 text-caption text-primary-700">{sources[field.key]}. You can change it.</p>}
            {locked(field.key) && <p className="mt-1 text-caption text-ink-muted">Can&apos;t be changed by an amendment.</p>}
            {field.type === "CALC" && field.formula && <p className="mt-1 text-caption text-ink-muted">Worked out automatically: {field.formula}</p>}
            {field.requiredIf && <p className="mt-1 text-caption text-ink-muted">Required when {describeRule(field.requiredIf, labelOf)}.</p>}
            {field.help && (
              <p id={`f-${field.key}-hint`} className="mt-1 text-caption text-ink-muted">
                {field.help}
              </p>
            )}
            <FieldError result={result} name={field.key} />
          </fieldset>
        );
      })}
    </div>
  );
}

export function FieldInput({ field, people, lookups, defaultValue, error, existing = 0 }: { field: FormField; people: { id: number; label: string }[]; lookups: FieldLookups; defaultValue: string; error?: string; existing?: number }) {
  const id = `f-${field.key}`;
  // FB-06: the hint and the error are read with the control.
  const describedBy = [field.help ? `${id}-hint` : null, error ? `${field.key}-error` : null].filter(Boolean).join(" ") || undefined;
  const a11y = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": field.required || undefined };
  switch (field.type) {
    case "LONG_TEXT":
      return <textarea id={id} name={field.key} {...a11y} defaultValue={defaultValue} rows={4} className="field-input h-auto py-2.5" />;
    case "NUMBER":
      return <input id={id} name={field.key} {...a11y} defaultValue={defaultValue} inputMode="decimal" placeholder="e.g. 12,50,000" className="field-input" />;
    case "DATE":
      return <input id={id} name={field.key} {...a11y} type="date" defaultValue={defaultValue} className="field-input" />;
    case "CHOICE":
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "LOOKUP": {
      const items = field.source ? lookups[field.source] : [];
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose…</option>
          {/* A value saved earlier that is no longer active stays selectable. */}
          {defaultValue && !items.some((item) => item.code === defaultValue) && <option value={defaultValue}>{defaultValue}</option>}
          {items.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      );
    }
    case "ATTACHMENT": {
      const most = field.maxFiles ?? 5;
      return (
        <>
          <input id={id} name={`file:${field.key}`} type="file" multiple={most > 1} accept={ACCEPT_ATTRIBUTE} {...a11y} className="block w-full text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
          <p className="mt-1 text-caption text-ink-muted">
            Up to {most} file{most === 1 ? "" : "s"}, 10 MB each.{existing ? ` ${existing} already attached; new files are added to them.` : ""}
          </p>
        </>
      );
    }
    case "PERSON":
      return (
        <select id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input">
          <option value="">Choose a person…</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      );
    default:
      return <input id={id} name={field.key} {...a11y} defaultValue={defaultValue} className="field-input" />;
  }
}
