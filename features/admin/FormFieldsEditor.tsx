"use client";

import { useEffect, useState } from "react";
import { LOOKUP_SOURCES, NUMERIC_TYPES, OPTION_TYPES, type FieldLookups, type FieldType, type FormField, type LookupSource } from "@/server/forms/fields";
import { RULE_OPERATORS, RULE_WORDS, formulaFields, parseFormula, type FieldRule } from "@/server/forms/dynamic";
import type { Comparison } from "@/server/engine/types";
import { Hint } from "@/features/ui/Hint";

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
  { value: "CURRENCY", label: "Currency (₹, paise)" },
  { value: "DATE", label: "Date" },
  { value: "DATETIME", label: "Date and time" },
  { value: "CHOICE", label: "Dropdown (your options)" },
  { value: "MULTI_CHOICE", label: "Multi-select (your options)" },
  { value: "RADIO", label: "Radio buttons (your options)" },
  { value: "CHECKBOX", label: "Checkbox (yes when ticked)" },
  { value: "URL", label: "Web link (URL)" },
  { value: "LOOKUP:DEPARTMENT", label: "Department (from the list)" },
  { value: "LOOKUP:DESIGNATION", label: "Designation (from the list)" },
  { value: "PERSON", label: "Person" },
  // v1.6.0 smart forms
  { value: "CALC", label: "Calculated (formula)" },
  { value: "LINE_ITEMS", label: "Line items (qty × rate + GST)" },
  { value: "SECTION", label: "Section heading" },
  // v1.6.1
  { value: "ATTACHMENT", label: "Attachments (files)" },
];
export const SOURCE_LABEL: Record<LookupSource, string> = { DEPARTMENT: "Departments", DESIGNATION: "Designations" };
// D-179: what each field type does, as a hover hint beside the type.
const TYPE_HELP: Partial<Record<FieldType, string>> = {
  DATE: "The requester picks a date from a calendar.",
  DATETIME: "A date and a time of day, in India time.",
  CHECKBOX: 'One tick box. Required means it must be ticked (e.g. "I confirm the details are correct").',
  URL: "A web link starting with https:// or http://. Shown as a link that opens in a new tab.",
  LINE_ITEMS: "The requester adds rows of description, quantity, rate (₹) and GST %. The total (worked out in paise on the server) is this field's value, so it can be the DoA amount or used in a formula.",
  SECTION: "A heading that groups the fields below it. It holds no value.",
  ATTACHMENT: "The requester attaches files here (PDF, images, Word, Excel, PowerPoint, CSV or text; 10 MB each). Required means at least one file. The files are listed under this field on the request.",
};
function typeHelp(field: FormField): string | undefined {
  if (field.type === "LOOKUP" && field.source) return `The requester picks from the active ${SOURCE_LABEL[field.source].toLowerCase()} kept in Admin → Departments. New ones appear by themselves.`;
  return TYPE_HELP[field.type];
}

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
    ...(OPTION_TYPES.includes(type) ? { options: field.options ?? [] } : {}),
    ...((type === "NUMBER" || type === "CURRENCY") && field.min !== undefined ? { min: field.min } : {}),
    ...(type === "LOOKUP" ? { source: source && (LOOKUP_SOURCES as readonly string[]).includes(source) ? source : "DEPARTMENT" } : {}),
    ...(type === "CALC" ? { formula: field.formula ?? "", required: false } : {}),
    ...(type === "SECTION" ? { required: false } : {}),
    ...(type === "ATTACHMENT" ? { maxFiles: field.maxFiles ?? 5 } : {}),
    ...(field.showIf ? { showIf: field.showIf } : {}),
    ...(field.requiredIf && type !== "SECTION" && type !== "CALC" ? { requiredIf: field.requiredIf } : {}),
    ...(field.defaultValue && ["TEXT", "NUMBER", "CURRENCY", "CHOICE", "RADIO", "DATE", "URL"].includes(type) ? { defaultValue: field.defaultValue } : {}),
    ...(field.listed ? { listed: true } : {}),
    ...(field.searchable ? { searchable: true } : {}),
    ...(field.editable ? { editable: true } : {}),
  };
}

// The rule editor for "show only when" / "required when" (EN-01).
function RuleEditor({ label, rule, others, onChange }: { label: string; rule: FieldRule | undefined; others: FormField[]; onChange: (rule: FieldRule | undefined) => void }) {
  if (!rule) {
    return (
      <button type="button" className="link text-label" disabled={others.length === 0} onClick={() => onChange({ field: others[0]!.key, op: "FILLED" })}>
        + {label}
      </button>
    );
  }
  const target = others.find((other) => other.key === rule.field);
  const numeric = target ? NUMERIC_TYPES.includes(target.type) : false;
  const operators = RULE_OPERATORS.filter((op) => numeric || !["GT", "GTE", "LT", "LTE"].includes(op));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-label">
      <span className="font-medium">{label}</span>
      <select aria-label={`${label}: field`} value={rule.field} onChange={(event) => onChange({ ...rule, field: event.target.value })} className="field-input w-auto">
        {others.map((other) => (
          <option key={other.key} value={other.key}>
            {other.label || other.key}
          </option>
        ))}
      </select>
      <select aria-label={`${label}: test`} value={rule.op} onChange={(event) => onChange({ ...rule, op: event.target.value as FieldRule["op"] })} className="field-input w-auto">
        {operators.map((op) => (
          <option key={op} value={op}>
            {RULE_WORDS[op]}
          </option>
        ))}
      </select>
      {rule.op !== "FILLED" && rule.op !== "EMPTY" &&
        (target && OPTION_TYPES.includes(target.type) ? (
          <select aria-label={`${label}: value`} value={rule.value ?? ""} onChange={(event) => onChange({ ...rule, value: event.target.value })} className="field-input w-auto">
            <option value="">Choose…</option>
            {(target.options ?? []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input aria-label={`${label}: value`} value={rule.value ?? ""} onChange={(event) => onChange({ ...rule, value: event.target.value.slice(0, 100) })} inputMode={numeric ? "decimal" : undefined} className="field-input w-40" />
        ))}
      <button type="button" className="link text-danger-600" onClick={() => onChange(undefined)} aria-label={`Remove: ${label}`}>
        Remove
      </button>
    </div>
  );
}

// Live check of a formula against the form (EN-02).
function formulaProblem(formula: string, form: FormField[], self: string): string | null {
  if (!formula.trim()) return "Write a formula, e.g. quantity * rate.";
  try {
    for (const ref of formulaFields(parseFormula(formula))) {
      const target = form.find((field) => field.key === ref);
      if (!target) return `"${ref}" isn't a field on this form.`;
      if (target.key === self) return "A formula can't use its own field.";
      if (!NUMERIC_TYPES.includes(target.type)) return `"${target.label}" isn't a number.`;
    }
    return null;
  } catch (error) {
    return (error as Error).message;
  }
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
          placeholder="New option"
          className="field-input min-w-0 flex-1"
        />
        <button type="button" onClick={() => add(draft)} className="btn-secondary btn-compact h-11">
          Add option
        </button>
        <Hint text="Press Enter to add. Paste a list separated by commas or new lines to add many at once." align="end" className="self-center" />
      </div>
      {note && <p className="text-caption text-ink-faint">{note}</p>}
    </div>
  );
}

// v1.9.0: `recordOptions` adds the task / information choices per field
// (show in lists, searchable, editable later); `intro` replaces the
// approval wording at the top.
export function FormFieldsEditor({
  form,
  setForm,
  lockedKeys,
  recordOptions = false,
  intro,
}: {
  form: FormField[];
  setForm: (update: (all: FormField[]) => FormField[]) => void;
  lockedKeys: readonly string[];
  recordOptions?: boolean;
  intro?: string;
}) {
  // Keys of saved fields never change; a new field's key follows its label
  // until IT edits the key.
  const [editedKeys, setEditedKeys] = useState<Set<number>>(new Set());
  const update = (index: number, change: (field: FormField) => FormField) => setForm((all) => all.map((item, i) => (i === index ? change(item) : item)));

  return (
    <section className="card">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">Form fields</h2>
          <Hint text={intro ?? "What the requester fills in. Steps can skip on these values, e.g. amount, a date or a department."} align="start" />
        </div>
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
              <div className="flex items-center gap-1">
                <select aria-label="Field type" value={typeValue(field)} onChange={(event) => update(index, (item) => withType(item, event.target.value))} className="field-input min-w-0 flex-1">
                  {TYPE_CHOICES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <Hint text={typeHelp(field)} align="end" />
              </div>
              <label className="flex h-11 items-center gap-2 text-label">
                <input type="checkbox" aria-label={`Required: ${name}`} checked={field.required} disabled={field.type === "CALC" || field.type === "SECTION"} onChange={(event) => update(index, (item) => ({ ...item, required: event.target.checked }))} />
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
                  placeholder="Help text (optional)"
                  className="field-input"
                />
                {(field.type === "NUMBER" || field.type === "CURRENCY") && (
                  <div className="flex flex-wrap items-center gap-2 text-label">
                    Smallest value allowed
                    <NumberDraftInput label={`Smallest value for ${name}`} value={field.min} onChange={(min) => update(index, (item) => ({ ...item, min }))} placeholder="none" />
                    <Hint text="Use 0 for amounts. A DoA amount can never be negative." />
                  </div>
                )}
                {OPTION_TYPES.includes(field.type) && <ChoiceListEditor label={name} options={field.options ?? []} onChange={(options) => update(index, (item) => ({ ...item, options }))} />}
                {field.type !== "SECTION" && (
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-2 text-label">
                      <input type="checkbox" checked={Boolean(field.confidential)} onChange={(event) => update(index, (item) => ({ ...item, confidential: event.target.checked || undefined }))} />
                      Confidential
                    </label>
                    <Hint text="Only the requester, the approvers and IT see the value (hidden from collaborators, advisers and in exports)." align="start" />
                  </div>
                )}
                {field.type === "DATE" && (
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-2 text-label">
                      <input type="checkbox" checked={Boolean(field.neededBy)} onChange={(event) => update(index, (item) => ({ ...item, neededBy: event.target.checked || undefined }))} />
                      This is the &quot;needed by&quot; date
                    </label>
                    <Hint text="Shown in the calendar and reports." align="start" />
                  </div>
                )}
                {field.type === "CALC" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <label className="field-label" htmlFor={`formula-${index}`}>
                        Formula
                      </label>
                      <Hint
                        text={`Uses + − × ÷, brackets and round(x, 2). Number fields you can use: ${form.filter((other) => NUMERIC_TYPES.includes(other.type) && other.key !== field.key).map((other) => other.key).join(", ") || "none yet"}.`}
                        align="start"
                        className="mb-1.5"
                      />
                    </div>
                    <input
                      id={`formula-${index}`}
                      value={field.formula ?? ""}
                      onChange={(event) => update(index, (item) => ({ ...item, formula: event.target.value.slice(0, 500) }))}
                      placeholder="e.g. quantity * rate * (1 + gst / 100)"
                      className="field-input font-mono"
                    />
                    {formulaProblem(field.formula ?? "", form, field.key) && <p className="text-caption text-danger-600">{formulaProblem(field.formula ?? "", form, field.key)}</p>}
                    <label className="flex items-center gap-2 text-label">
                      Decimal places
                      <select value={field.decimals ?? 2} onChange={(event) => update(index, (item) => ({ ...item, decimals: Number(event.target.value) }))} className="field-input w-20">
                        {[0, 1, 2, 3, 4].map((digits) => (
                          <option key={digits}>{digits}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {field.type === "ATTACHMENT" && (
                  <div className="space-y-1">
                    <label className="flex flex-wrap items-center gap-2 text-label">
                      Up to
                      <select aria-label={`Most files for ${name}`} value={field.maxFiles ?? 5} onChange={(event) => update(index, (item) => ({ ...item, maxFiles: Number(event.target.value) }))} className="field-input w-20">
                        {[1, 2, 3, 4, 5].map((count) => (
                          <option key={count}>{count}</option>
                        ))}
                      </select>
                      file(s)
                    </label>
                  </div>
                )}
                {["TEXT", "NUMBER", "CURRENCY", "DATE", "URL"].includes(field.type) && (
                  <input
                    aria-label={`Default value for ${name}`}
                    type={field.type === "DATE" ? "date" : "text"}
                    value={field.defaultValue ?? ""}
                    onChange={(event) => update(index, (item) => ({ ...item, defaultValue: event.target.value ? event.target.value.slice(0, 200) : undefined }))}
                    placeholder="Default value (optional)"
                    className="field-input"
                  />
                )}
                {(field.type === "CHOICE" || field.type === "RADIO") && (field.options ?? []).length > 0 && (
                  <label className="flex flex-wrap items-center gap-2 text-label">
                    Default choice
                    <select value={field.defaultValue ?? ""} onChange={(event) => update(index, (item) => ({ ...item, defaultValue: event.target.value || undefined }))} className="field-input w-auto">
                      <option value="">None</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                )}
                {recordOptions && field.type !== "SECTION" && (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-label">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(field.listed)} onChange={(event) => update(index, (item) => ({ ...item, listed: event.target.checked || undefined }))} />
                      Show in lists
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(field.searchable)} disabled={!["TEXT", "LONG_TEXT", "CHOICE", "RADIO", "NUMBER", "CURRENCY", "URL"].includes(field.type)} onChange={(event) => update(index, (item) => ({ ...item, searchable: event.target.checked || undefined }))} />
                      Searchable
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(field.editable)} disabled={field.type === "CALC" || field.type === "ATTACHMENT"} onChange={(event) => update(index, (item) => ({ ...item, editable: event.target.checked || undefined }))} />
                      Can be changed after it&apos;s created
                    </label>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <RuleEditor label="Show only when" rule={field.showIf} others={form.filter((other, i) => i !== index && other.type !== "SECTION" && other.key)} onChange={(showIf) => update(index, (item) => ({ ...item, showIf }))} />
                  {field.type !== "CALC" && field.type !== "SECTION" && (
                    <RuleEditor label="Required when" rule={field.requiredIf} others={form.filter((other, i) => i !== index && other.type !== "SECTION" && other.key)} onChange={(requiredIf) => update(index, (item) => ({ ...item, requiredIf }))} />
                  )}
                </div>
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
  return ALL[NUMERIC_TYPES.includes(field.type) ? "NUMBER" : field.type === "DATE" ? "DATE" : "OTHER"]!;
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
    case "CALC":
    case "LINE_ITEMS":
    case "CURRENCY":
    case "NUMBER":
      return <NumberDraftInput label="Value" value={typeof current === "number" ? current : undefined} onChange={(next) => onChange(next ?? "")} placeholder="e.g. 500000" className="field-input w-40" />;
    case "DATE":
      return <input aria-label="Value" type="date" value={typeof current === "string" ? current : ""} onChange={(event) => onChange(event.target.value)} className="field-input w-auto" />;
    case "CHOICE":
    case "RADIO":
    case "MULTI_CHOICE":
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
