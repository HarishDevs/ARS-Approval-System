"use client";

import { useEffect, useState } from "react";
import { LOOKUP_SOURCES, type FieldLookups, type FieldType, type FormField, type LookupSource } from "@/server/forms/fields";
import type { Comparison } from "@/server/engine/types";

type ConditionValue = string | number;

// The form field creator of the workflow builder (S12, F-75, D-088).
// Fixed after testing key by key in the browser:
//   - the key follows the label until IT edits it (it used to stop after the
//     first letter);
//   - choices are a list editor (the old comma box dropped every comma);
//   - number boxes keep what is typed ("1." and "-" no longer vanish);
//   - condition values match the field: a date picker, a dropdown of the
//     choices / list / people, or a number.
const TYPE_CHOICES: { value: string; label: string }[] = [
  { value: "TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number / amount" },
  { value: "DATE", label: "Date" },
  { value: "CHOICE", label: "Dropdown (your options)" },
  { value: "LOOKUP:DEPARTMENT", label: "Department (from the list)" },
  { value: "LOOKUP:DESIGNATION", label: "Designation (from the list)" },
  { value: "PERSON", label: "Person" },
];
export const SOURCE_LABEL: Record<LookupSource, string> = { DEPARTMENT: "Departments", DESIGNATION: "Designations" };

export function slugKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return /^[a-z]/.test(slug) ? slug : slug ? `f_${slug}`.slice(0, 50) : "";
}

const typeValue = (field: FormField) => (field.type === "LOOKUP" ? `LOOKUP:${field.source ?? "DEPARTMENT"}` : field.type);

function withType(field: FormField, value: string): FormField {
  const [type, source] = value.split(":") as [FieldType, LookupSource | undefined];
  return {
    key: field.key,
    label: field.label,
    required: field.required,
    ...(field.help ? { help: field.help } : {}),
    type,
    ...(type === "CHOICE" ? { options: field.options ?? [] } : {}),
    ...(type === "NUMBER" && field.min !== undefined ? { min: field.min } : {}),
    ...(type === "LOOKUP" ? { source: source && (LOOKUP_SOURCES as readonly string[]).includes(source) ? source : "DEPARTMENT" } : {}),
  };
}

// A number box that keeps the text being typed and reports a number (or
// undefined) once it is one.
export function NumberDraftInput({
  value,
  onChange,
  label,
  placeholder,
  className = "field-input w-32",
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const parse = (raw: string): number | undefined | null => {
    const cleaned = raw.replace(/[,\s₹]/g, "");
    if (cleaned === "") return undefined;
    const number = Number(cleaned);
    // null = still being typed ("-", "1.") or not a number yet.
    return cleaned === "-" || cleaned.endsWith(".") || !Number.isFinite(number) ? null : number;
  };
  // A new value from outside (another row removed, a reset) replaces the text.
  useEffect(() => {
    const typed = parse(text);
    if (typed !== null && typed !== value) setText(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={(event) => {
        setText(event.target.value);
        const next = parse(event.target.value);
        if (next !== null) onChange(next);
      }}
    />
  );
}

// Dropdown options: type one and press Add or Enter; paste several
// separated by commas, semicolons or new lines.
export function ChoiceListEditor({ options, onChange, label }: { options: string[]; onChange: (options: string[]) => void; label: string }) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  function add(text: string) {
    const items = text
      .split(/[,;\n]/)
      .map((item) => item.trim().slice(0, 100))
      .filter(Boolean);
    if (!items.length) return;
    const next = [...options];
    const skipped: string[] = [];
    for (const item of items) {
      if (next.some((existing) => existing.toLowerCase() === item.toLowerCase())) skipped.push(item);
      else if (next.length < 50) next.push(item);
    }
    onChange(next);
    setDraft("");
    setNote(skipped.length ? `Already in the list: ${skipped.join(", ")}` : null);
  }
  return (
    <div className="space-y-2">
      <ul aria-label={`Options for ${label}`} className="flex flex-wrap gap-2">
        {options.map((option, index) => (
          <li key={option} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted py-1 pl-3 pr-1 text-label">
            {option}
            <button
              type="button"
              aria-label={`Remove option ${option}`}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
              className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-danger-600"
            >
              ✕
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="text-caption text-ink-faint">No options yet: add at least two.</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={`New option for ${label}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(draft);
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              event.preventDefault();
              add(text);
            }
          }}
          placeholder="Type an option, then Enter"
          className="field-input min-w-0 flex-1"
        />
        <button type="button" onClick={() => add(draft)} className="btn-secondary btn-compact h-11">
          Add option
        </button>
      </div>
      <p className="text-caption text-ink-faint">{note ?? "Tip: paste a list separated by commas or new lines to add many at once."}</p>
    </div>
  );
}

export function FormFieldsEditor({ form, setForm, lockedKeys }: { form: FormField[]; setForm: (update: (all: FormField[]) => FormField[]) => void; lockedKeys: readonly string[] }) {
  // Keys of saved fields never change; a new field's key follows its label
  // until IT edits the key.
  const [editedKeys, setEditedKeys] = useState<Set<number>>(new Set());
  const update = (index: number, change: (field: FormField) => FormField) => setForm((all) => all.map((item, i) => (i === index ? change(item) : item)));

  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold">Form fields</h2>
        <p className="text-label text-ink-muted">What the requester fills in. Steps can skip on these values, e.g. amount, a date or a department.</p>
      </div>
      <div className="divide-y divide-line">
        {form.map((field, index) => {
          const name = field.label || field.key || `field ${index + 1}`;
          const keyFollows = !lockedKeys.includes(field.key) && !editedKeys.has(index);
          return (
            <div key={index} className="grid items-start gap-3 px-5 py-4 lg:grid-cols-[1fr_170px_210px_auto_auto]" data-testid="form-field">
              <div>
                <input
                  aria-label="Field label"
                  value={field.label}
                  onChange={(event) => {
                    const label = event.target.value;
                    update(index, (item) => ({ ...item, label, key: keyFollows ? slugKey(label) : item.key }));
                  }}
                  placeholder="Label, e.g. Amount (₹)"
                  className="field-input"
                />
              </div>
              <input
                aria-label="Field key"
                value={field.key}
                readOnly={lockedKeys.includes(field.key)}
                title={lockedKeys.includes(field.key) ? "Saved keys can't change: running requests and conditions use them." : "Used in conditions. Fills in from the label."}
                onChange={(event) => {
                  setEditedKeys((all) => new Set(all).add(index));
                  update(index, (item) => ({ ...item, key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }));
                }}
                placeholder="key"
                className="field-input font-mono read-only:bg-surface read-only:text-ink-muted"
              />
              <select aria-label="Field type" value={typeValue(field)} onChange={(event) => update(index, (item) => withType(item, event.target.value))} className="field-input">
                {TYPE_CHOICES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <label className="flex h-11 items-center gap-2 text-label">
                <input type="checkbox" aria-label={`Required: ${name}`} checked={field.required} onChange={(event) => update(index, (item) => ({ ...item, required: event.target.checked }))} />
                Required
              </label>
              <button
                type="button"
                aria-label={`Remove field ${name}`}
                onClick={() => {
                  setEditedKeys(new Set());
                  setForm((all) => all.filter((_, i) => i !== index));
                }}
                className="btn-secondary btn-compact h-11"
              >
                Remove
              </button>
              <div className="space-y-3 lg:col-span-5">
                <input
                  aria-label={`Help text for ${name}`}
                  value={field.help ?? ""}
                  onChange={(event) => update(index, (item) => ({ ...item, help: event.target.value ? event.target.value.slice(0, 200) : undefined }))}
                  placeholder="Help text shown under the field (optional)"
                  className="field-input"
                />
                {field.type === "NUMBER" && (
                  <div className="flex flex-wrap items-center gap-2 text-label">
                    Smallest value allowed
                    <NumberDraftInput label={`Smallest value for ${name}`} value={field.min} onChange={(min) => update(index, (item) => ({ ...item, min }))} placeholder="none" />
                    <span className="text-caption text-ink-faint">Use 0 for amounts. A DoA amount can never be negative.</span>
                  </div>
                )}
                {field.type === "CHOICE" && <ChoiceListEditor label={name} options={field.options ?? []} onChange={(options) => update(index, (item) => ({ ...item, options }))} />}
                {field.type === "LOOKUP" && field.source && (
                  <p className="text-caption text-ink-muted">
                    The requester picks from the active {SOURCE_LABEL[field.source].toLowerCase()} kept in Admin → Departments. New ones appear by themselves.
                  </p>
                )}
                {field.type === "DATE" && <p className="text-caption text-ink-muted">The requester picks a date from a calendar.</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-3">
        <button type="button" onClick={() => setForm((all) => [...all, { key: "", label: "", type: "TEXT", required: false }])} className="btn-secondary btn-compact">
          Add field
        </button>
      </div>
    </section>
  );
}

// ---- conditions ---------------------------------------------------------------------------
type Operator = Comparison["operator"];
const ALL: Record<string, [Operator, string][]> = {
  NUMBER: [
    ["GT", "is more than"],
    ["GTE", "is at least"],
    ["LT", "is less than"],
    ["LTE", "is at most"],
    ["EQ", "is"],
    ["NEQ", "is not"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
  DATE: [
    ["LT", "is before"],
    ["LTE", "is on or before"],
    ["GT", "is after"],
    ["GTE", "is on or after"],
    ["EQ", "is"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
  OTHER: [
    ["EQ", "is"],
    ["NEQ", "is not"],
    ["IS_EMPTY", "is empty"],
    ["IS_NOT_EMPTY", "is filled in"],
  ],
};

export function operatorsFor(field: FormField | undefined): [Operator, string][] {
  if (!field) return ALL.NUMBER!;
  return ALL[field.type === "NUMBER" || field.type === "DATE" ? field.type : "OTHER"]!;
}

export function needsValue(operator: Operator): boolean {
  return operator !== "IS_EMPTY" && operator !== "IS_NOT_EMPTY";
}

// A starting condition for a field: its first operator and no value yet.
export function freshCondition(field: FormField | undefined): { field: string; operator: Operator; value: ConditionValue } {
  return { field: field?.key ?? "", operator: operatorsFor(field)[0]![0], value: "" };
}

export function ConditionValueInput({
  field,
  value,
  onChange,
  lookups,
  people,
}: {
  field: FormField | undefined;
  value: string | number | boolean | (string | number)[] | undefined;
  onChange: (value: ConditionValue) => void;
  lookups: FieldLookups;
  people: { id: number; label: string }[];
}) {
  const current = Array.isArray(value) ? value[0] : value;
  const select = (items: { value: string; label: string }[], numeric = false) => (
    <select aria-label="Value" value={current === undefined || current === null ? "" : String(current)} onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)} className="field-input w-auto min-w-40">
      <option value="">Choose…</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
  switch (field?.type) {
    case "NUMBER":
      return <NumberDraftInput label="Value" value={typeof current === "number" ? current : undefined} onChange={(next) => onChange(next ?? "")} placeholder="e.g. 500000" className="field-input w-40" />;
    case "DATE":
      return <input aria-label="Value" type="date" value={typeof current === "string" ? current : ""} onChange={(event) => onChange(event.target.value)} className="field-input w-auto" />;
    case "CHOICE":
      return select((field.options ?? []).map((option) => ({ value: option, label: option })));
    case "LOOKUP":
      return select((field.source ? lookups[field.source] : []).map((option) => ({ value: option.code, label: `${option.name} (${option.code})` })));
    case "PERSON":
      return select(
        people.map((person) => ({ value: String(person.id), label: person.label })),
        true,
      );
    default:
      return <input aria-label="Value" value={current === undefined || current === null ? "" : String(current)} onChange={(event) => onChange(event.target.value)} className="field-input w-48" />;
  }
}
