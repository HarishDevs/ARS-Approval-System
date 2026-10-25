"use client";

import { useCallback, useMemo, useState } from "react";
import { MultiChoiceInput, parseMulti } from "@/features/requests/MultiChoiceInput";
import { LineItemsEditor } from "@/features/requests/LineItemsEditor";
import { describeRule, evaluateFormula, parseFormula, ruleHolds, visibleFields } from "@/server/forms/dynamic";
import { FieldError } from "@/features/ui/form";
import { Hint } from "@/features/ui/Hint";
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
// D-179: field help is a hover tip, unless it has an email address (those
// stay visible page text).
const tipOf = (help: string | null | undefined) => (help && !help.includes("@") ? help : null);

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
  type Live = string | number | null | string[];
  const [values, setValues] = useState<Record<string, Live>>(() => Object.fromEntries(fields.map((field) => [field.key, field.type === "MULTI_CHOICE" ? parseMulti(start[field.key] ?? "") : (start[field.key] ?? "")])));
  const read = (element: HTMLElement) => {
    const form = element.closest("form");
    if (!form) return;
    const data = new FormData(form);
    setValues((current) => {
      const next: Record<string, Live> = { ...current };
      for (const field of fields) {
        // The tick boxes say what is chosen right now (their hidden list updates a moment later).
        if (field.type === "MULTI_CHOICE") next[field.key] = Array.from(form.querySelectorAll<HTMLInputElement>(`input[data-multi="${field.key}"]:checked`)).map((box) => box.value);
        else if (field.type === "CHECKBOX") next[field.key] = (form.elements.namedItem(field.key) as HTMLInputElement | null)?.checked ? "Yes" : "";
        else if (field.type === "ATTACHMENT") next[field.key] = ((form.elements.namedItem(`file:${field.key}`) as HTMLInputElement | null)?.files?.length ?? 0) + (existingFiles[field.key] ?? 0) || null;
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
    const scope: Record<string, string | number | null> = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]));
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
              <h3 className="flex items-center gap-1 font-semibold">
                {field.label}
                <Hint text={tipOf(field.help)} align="start" />
              </h3>
              {field.help && !tipOf(field.help) && <p className="text-label text-ink-muted">{field.help}</p>}
            </div>
          ) : null;
        }
        const required = field.required || (field.requiredIf ? ruleHolds(field.requiredIf, { ...values, ...calculated }) : false);
        return (
          // A field hidden by its rule is disabled, so it isn't sent (the server clears it anyway).
          <fieldset key={field.key} hidden={!visible} disabled={!visible || locked(field.key)} className="min-w-0">
            <div className="flex items-center gap-1">
              <label id={`f-${field.key}-label`} htmlFor={`f-${field.key}`} className="field-label">
                {field.label}
                {!required && field.type !== "CALC" && <span className="font-normal text-ink-faint"> (optional)</span>}
              </label>
              <Hint text={tipOf(field.help)} align="start" className="mb-1.5" />
              {field.type === "CALC" && field.formula && <Hint text={`Worked out automatically: ${field.formula}`} align="start" className="mb-1.5" />}
            </div>
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
            {field.requiredIf && <p className="mt-1 text-caption text-ink-muted">Required when {describeRule(field.requiredIf, labelOf)}.</p>}
            {/* The control still points at its help (aria-describedby). */}
            {field.help && (
              <p id={`f-${field.key}-hint`} className={tipOf(field.help) ? "sr-only" : "mt-1 text-caption text-ink-muted"}>
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
    case "CURRENCY":
      return (
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            ₹
          </span>
          <input id={id} name={field.key} {...a11y} defaultValue={defaultValue} inputMode="decimal" placeholder="e.g. 12,500.50" className="field-input pl-7" />
        </div>
      );
    case "DATETIME":
      return <input id={id} name={field.key} {...a11y} type="datetime-local" defaultValue={defaultValue} className="field-input" />;
    case "URL":
      return <input id={id} name={field.key} {...a11y} type="url" defaultValue={defaultValue} placeholder="https://" className="field-input" />;
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2 text-label">
          <input id={id} name={field.key} {...a11y} type="checkbox" value="Yes" defaultChecked={defaultValue === "Yes"} />
          Yes
        </label>
      );
    case "RADIO":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} {...a11y} className="flex flex-wrap gap-x-5 gap-y-2">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2 text-label">
              <input type="radio" name={field.key} value={option} defaultChecked={defaultValue === option} />
              {option}
            </label>
          ))}
        </div>
      );
    case "MULTI_CHOICE":
      return <MultiChoiceInput id={id} name={field.key} options={field.options ?? []} defaultValue={defaultValue} describedBy={describedBy} invalid={Boolean(error)} />;
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
          <div className="flex items-center gap-2">
            <input id={id} name={`file:${field.key}`} type="file" multiple={most > 1} accept={ACCEPT_ATTRIBUTE} {...a11y} className="block w-full min-w-0 flex-1 text-label file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2" />
            <Hint text={`Up to ${most} file${most === 1 ? "" : "s"}, 10 MB each.`} align="end" />
          </div>
          {existing > 0 && <p className="mt-1 text-caption text-ink-muted">{existing} already attached; new files are added to them.</p>}
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
