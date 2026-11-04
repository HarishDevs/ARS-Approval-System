"use client";

import { RuleEditor as SharedRuleEditor } from "@/features/admin/conditions/RuleEditor";
import { useEffect, useState } from "react";
import { NUMERIC_TYPES, OPTION_TYPES, type FieldType, type FormField, type LookupSource } from "@/server/forms/fields";
import type { FieldRule } from "@/server/forms/dynamic";
import type { StoredRule } from "@/server/conditions/rule";
import { Hint } from "@/features/ui/Hint";
import { choicePillStyle } from "@/features/ui/ChoicePill";
import { isOptionColor, OPTION_COLOR_LABEL, OPTION_COLORS, reconcileOptionColors, type OptionColor } from "@/server/forms/option-colors";
import { formulaProblem, slugKey, TYPE_CHOICES, typeValue } from "@/features/admin/form-designer/model";

// D-235 (Form Designer): the selected field's properties, in tabs, showing
// only what applies to its type. Labels stay as they were (Field label,
// Required: <name>, Help text for <name> …): people and tests know them.
export const SOURCE_LABEL: Record<LookupSource, string> = { DEPARTMENT: "Departments", DESIGNATION: "Designations" };
const TYPE_HELP: Partial<Record<FieldType, string>> = {
  DATE: "The requester picks a date from a calendar.",
  DATETIME: "A date and a time of day, in India time.",
  CHECKBOX: 'One tick box. Required means it must be ticked (e.g. "I confirm the details are correct").',
  URL: "A web link starting with https:// or http://. Shown as a link that opens in a new tab.",
  LINE_ITEMS: "Rows of item, quantity, rate (₹) and GST %. The total can be the DoA amount.",
  SECTION: "A heading that groups the fields below it. It holds no value.",
  ATTACHMENT: "Files, 10 MB each. Required means at least one file.",
};
export function typeHelp(field: FormField): string | undefined {
  if (field.type === "LOOKUP" && field.source) return `The requester picks from the active ${SOURCE_LABEL[field.source].toLowerCase()} kept in Admin → Departments. New ones appear by themselves.`;
  return TYPE_HELP[field.type];
}

type Tab = "general" | "validation" | "conditions" | "advanced";
const TAB_LABEL: Record<Tab, string> = { general: "General", validation: "Validation", conditions: "Conditions", advanced: "Advanced" };

export function FieldProperties({
  field,
  form,
  locked,
  keyFollows,
  recordOptions,
  onChange,
  onKeyEdited,
  onTypeChange,
}: {
  field: FormField;
  form: readonly FormField[];
  locked: boolean;
  keyFollows: boolean;
  recordOptions: boolean;
  onChange: (change: (field: FormField) => FormField, tag: string) => void;
  onKeyEdited: () => void;
  onTypeChange: (value: string) => void;
}) {
  const name = field.label || field.key || "this field";
  const tabs: Tab[] = [
    "general",
    ...(field.type === "NUMBER" || field.type === "CURRENCY" || field.type === "ATTACHMENT" || field.type === "DATE" ? (["validation"] as const) : []),
    "conditions" as const,
    ...(field.type !== "SECTION" || recordOptions ? (["advanced"] as const) : []),
  ];
  const [chosen, setTab] = useState<Tab>("general");
  // A tab that no longer applies (the type changed) falls back to General.
  const tab: Tab = tabs.includes(chosen) ? chosen : "general";
  const others = form.filter((other) => other.key !== field.key && other.type !== "SECTION" && other.key);

  return (
    <div className="space-y-4" data-testid="field-properties">
      <div role="tablist" aria-label={`Properties of ${name}`} className="flex gap-1 border-b border-line">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-label ${tab === item ? "border-primary-600 font-semibold text-primary-700" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {TAB_LABEL[item]}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div role="tabpanel" aria-label="General" className="space-y-3">
          <Row label="Label" htmlFor="fd-label">
            <input
              id="fd-label"
              aria-label="Field label"
              value={field.label}
              onChange={(event) => {
                const label = event.target.value;
                onChange((item) => ({ ...item, label, key: keyFollows ? slugKey(label) : item.key }), "label");
              }}
              placeholder="e.g. Amount (₹)"
              className="field-input"
            />
          </Row>
          <Row label="Key" htmlFor="fd-key" hint={locked ? "Saved keys can't change: running requests and conditions use them." : "Used in conditions and formulas. Fills in from the label until you change it."}>
            <input
              id="fd-key"
              aria-label="Field key"
              value={field.key}
              readOnly={locked}
              onChange={(event) => {
                onKeyEdited();
                onChange((item) => ({ ...item, key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }), "key");
              }}
              placeholder="key"
              className="field-input font-mono read-only:bg-surface read-only:text-ink-muted"
            />
          </Row>
          <Row label="Type" htmlFor="fd-type" hint={typeHelp(field)}>
            <select id="fd-type" aria-label="Field type" value={typeValue(field)} onChange={(event) => onTypeChange(event.target.value)} className="field-input">
              {TYPE_CHOICES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Row>
          {field.type !== "SECTION" && (
            <label className="flex min-h-9 items-center gap-2 text-label">
              <input
                type="checkbox"
                aria-label={`Required: ${name}`}
                checked={field.required}
                disabled={field.type === "CALC"}
                onChange={(event) => onChange((item) => ({ ...item, required: event.target.checked }), "required")}
                className="h-5 w-5"
              />
              Required
              {field.type === "CALC" && <span className="text-caption text-ink-muted">(worked out, so never asked)</span>}
            </label>
          )}
          <Row label="Help text" htmlFor="fd-help">
            <input
              id="fd-help"
              aria-label={`Help text for ${name}`}
              value={field.help ?? ""}
              onChange={(event) => onChange((item) => ({ ...item, help: event.target.value ? event.target.value.slice(0, 200) : undefined }), "help")}
              placeholder="Optional: shown under the field"
              className="field-input"
            />
          </Row>
          {OPTION_TYPES.includes(field.type) && (
            <div>
              <p className="field-label">Options</p>
              <ChoiceListEditor
                label={name}
                options={field.options ?? []}
                onChange={(options) =>
                  onChange((item) => {
                    // v1.47.0: a kept or renamed option keeps its colour; a removed one drops it.
                    const optionColors = reconcileOptionColors(item.options ?? [], options, item.optionColors);
                    const next: FormField = { ...item, options, optionColors, ...(item.defaultValue && !options.includes(item.defaultValue) ? { defaultValue: undefined } : {}) };
                    if (!optionColors) delete next.optionColors;
                    return next;
                  }, "options")
                }
                colors={field.optionColors}
                onColorsChange={(colors) =>
                  onChange((item) => {
                    const next: FormField = { ...item, optionColors: colors };
                    if (!Object.keys(colors).length) delete next.optionColors;
                    return next;
                  }, "options")
                }
              />
            </div>
          )}
          {field.type === "CALC" && (
            <div className="space-y-1">
              <Row
                label="Formula"
                htmlFor="fd-formula"
                hint={`Uses + − × ÷, brackets and round(x, 2). Number fields you can use: ${
                  form
                    .filter((other) => NUMERIC_TYPES.includes(other.type) && other.key !== field.key)
                    .map((other) => other.key)
                    .join(", ") || "none yet"
                }.`}
              >
                <input
                  id="fd-formula"
                  value={field.formula ?? ""}
                  onChange={(event) => onChange((item) => ({ ...item, formula: event.target.value.slice(0, 500) }), "formula")}
                  placeholder="e.g. quantity * rate * (1 + gst / 100)"
                  className="field-input font-mono"
                />
              </Row>
              <FormulaCheck formula={field.formula ?? ""} form={form} self={field.key} />
              <FormulaFieldChips
                form={form}
                self={field.key}
                onInsert={(key) => onChange((item) => ({ ...item, formula: `${item.formula ?? ""}${item.formula && !/\s$/.test(item.formula) ? " " : ""}${key}`.slice(0, 500) }), "formula")}
              />
              <label className="flex items-center gap-2 text-label">
                Decimal places
                <select value={field.decimals ?? 2} onChange={(event) => onChange((item) => ({ ...item, decimals: Number(event.target.value) }), "decimals")} className="field-input w-20">
                  {[0, 1, 2, 3, 4].map((digits) => (
                    <option key={digits}>{digits}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {["TEXT", "NUMBER", "CURRENCY", "DATE", "URL"].includes(field.type) && (
            <Row label="Default value" htmlFor="fd-default">
              <input
                id="fd-default"
                aria-label={`Default value for ${name}`}
                type={field.type === "DATE" ? "date" : "text"}
                value={field.defaultValue ?? ""}
                onChange={(event) => onChange((item) => ({ ...item, defaultValue: event.target.value ? event.target.value.slice(0, 200) : undefined }), "default")}
                placeholder="Optional"
                className="field-input"
              />
            </Row>
          )}
          {(field.type === "CHOICE" || field.type === "RADIO") && (field.options ?? []).length > 0 && (
            <Row label="Default choice" htmlFor="fd-default-choice">
              <select id="fd-default-choice" value={field.defaultValue ?? ""} onChange={(event) => onChange((item) => ({ ...item, defaultValue: event.target.value || undefined }), "default")} className="field-input">
                <option value="">None</option>
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Row>
          )}
        </div>
      )}

      {tab === "validation" && (
        <div role="tabpanel" aria-label="Validation" className="space-y-3">
          {(field.type === "NUMBER" || field.type === "CURRENCY") && (
            <div className="flex flex-wrap items-center gap-2 text-label">
              Smallest value allowed
              <NumberDraftInput label={`Smallest value for ${name}`} value={field.min} onChange={(min) => onChange((item) => ({ ...item, min }), "min")} placeholder="none" />
              <Hint text="Use 0 for amounts. A DoA amount can never be negative." />
            </div>
          )}
          {field.type === "ATTACHMENT" && (
            <label className="flex flex-wrap items-center gap-2 text-label">
              Up to
              <select
                aria-label={`Most files for ${name}`}
                value={field.maxFiles ?? 5}
                onChange={(event) => onChange((item) => ({ ...item, maxFiles: Number(event.target.value) }), "maxFiles")}
                className="field-input w-20"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count}>{count}</option>
                ))}
              </select>
              file(s), 10 MB each
            </label>
          )}
          {field.type === "DATE" && (
            <label className="flex items-center gap-2 text-label">
              <input type="checkbox" checked={Boolean(field.neededBy)} onChange={(event) => onChange((item) => ({ ...item, neededBy: event.target.checked || undefined }), "neededBy")} className="h-5 w-5" />
              This is the &quot;needed by&quot; date
              <Hint text="Shown in the calendar and reports. One per form." align="start" />
            </label>
          )}
        </div>
      )}

      {tab === "conditions" && (
        <div role="tabpanel" aria-label="Conditions" className="space-y-3">
          {others.length === 0 && <p className="text-caption text-ink-muted">Add another field first: a condition looks at another field&apos;s value.</p>}
          <RuleEditor label="Show only when" rule={field.showIf} others={others} onChange={(showIf) => onChange((item) => ({ ...item, showIf }), "showIf")} />
          {field.type !== "CALC" && field.type !== "SECTION" && (
            <RuleEditor label="Required when" rule={field.requiredIf} others={others} onChange={(requiredIf) => onChange((item) => ({ ...item, requiredIf }), "requiredIf")} />
          )}
        </div>
      )}

      {tab === "advanced" && (
        <div role="tabpanel" aria-label="Advanced" className="space-y-3 text-label">
          {field.type !== "SECTION" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(field.confidential)} onChange={(event) => onChange((item) => ({ ...item, confidential: event.target.checked || undefined }), "confidential")} className="h-5 w-5" />
              Confidential
              <Hint text="Only the requester, the approvers and IT see the value (hidden from collaborators, advisers and in exports)." align="start" />
            </label>
          )}
          {recordOptions && field.type !== "SECTION" && (
            <fieldset className="space-y-2">
              <legend className="field-label">In task and information records</legend>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(field.listed)} onChange={(event) => onChange((item) => ({ ...item, listed: event.target.checked || undefined }), "listed")} className="h-5 w-5" />
                Show in lists
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(field.searchable)}
                  disabled={!["TEXT", "LONG_TEXT", "CHOICE", "RADIO", "NUMBER", "CURRENCY", "URL"].includes(field.type)}
                  onChange={(event) => onChange((item) => ({ ...item, searchable: event.target.checked || undefined }), "searchable")}
                  className="h-5 w-5"
                />
                Searchable
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(field.editable)}
                  disabled={field.type === "CALC" || field.type === "ATTACHMENT"}
                  onChange={(event) => onChange((item) => ({ ...item, editable: event.target.checked || undefined }), "editable")}
                  className="h-5 w-5"
                />
                Can be changed after it&apos;s created
              </label>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1">
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
        {hint && <Hint text={hint} align="start" className="mb-1.5" />}
      </div>
      {children}
    </div>
  );
}

function FormulaCheck({ formula, form, self }: { formula: string; form: readonly FormField[]; self: string }) {
  const problem = formulaProblem(formula, form, self);
  return problem ? <p className="text-caption text-danger-600">{problem}</p> : <p className="text-caption text-success-600">The formula reads correctly.</p>;
}

// D-235 (formula builder): the number fields as chips that insert their key.
function FormulaFieldChips({ form, self, onInsert }: { form: readonly FormField[]; self: string; onInsert: (key: string) => void }) {
  const numbers = form.filter((other) => NUMERIC_TYPES.includes(other.type) && other.key && other.key !== self);
  if (!numbers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Insert a number field">
      <span className="text-caption text-ink-muted">Insert:</span>
      {numbers.map((other) => (
        <button key={other.key} type="button" onClick={() => onInsert(other.key)} className="rounded-full border border-line px-2 py-0.5 font-mono text-caption hover:bg-surface-muted" title={other.label}>
          {other.key}
        </button>
      ))}
    </div>
  );
}

// "Show only when" / "required when" (EN-01). Since 2 Nov 2026 the same
// editor and the same saved shape as the workflow's rules (one condition, or
// several joined by all / any); an older saved rule opens converted.
export function RuleEditor({ label, rule, others, onChange }: { label: string; rule: StoredRule | undefined; others: readonly FormField[]; onChange: (rule: FieldRule | undefined) => void }) {
  if (!rule) {
    return (
      <button type="button" className="link block text-label" disabled={others.length === 0} onClick={() => onChange({ field: others[0]!.key, operator: "IS_NOT_EMPTY" })}>
        + {label}
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface-muted px-3 py-2 text-label">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <button type="button" className="link text-danger-600" onClick={() => onChange(undefined)} aria-label={`Remove: ${label}`}>
          Remove
        </button>
      </div>
      <SharedRuleEditor fields={others} value={rule} onChange={onChange} labels={{ field: `${label}: field`, operator: `${label}: test`, value: `${label}: value` }} />
    </div>
  );
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
  // A new value from outside (undo, another field chosen) replaces the text.
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
export function ChoiceListEditor({
  options,
  onChange,
  label,
  colors,
  onColorsChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  label: string;
  colors?: Readonly<Record<string, OptionColor>>; // v1.47.0: the options' pill colours
  onColorsChange?: (colors: Record<string, OptionColor>) => void; // given → each chip has a colour picker
}) {
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
          <li
            key={option}
            className={`inline-flex items-center gap-1 rounded-full border border-line py-1 pl-3 pr-1 text-label ${colors?.[option] ? "choice-pill font-normal" : "bg-surface-muted"}`}
            style={colors?.[option] ? choicePillStyle(colors[option]) : undefined}
          >
            {option}
            {onColorsChange && (
              // v1.47.0 (owner: "add Color selector in the Dropdown"): a plain select, so it works with the keyboard and screen readers.
              <select
                aria-label={`Colour for option ${option}`}
                value={colors?.[option] ?? ""}
                onChange={(event) => {
                  const next: Record<string, OptionColor> = { ...(colors ?? {}) };
                  if (isOptionColor(event.target.value)) next[option] = event.target.value;
                  else delete next[option];
                  onColorsChange(next);
                }}
                className="h-7 max-w-[6.5rem] cursor-pointer rounded-full border border-line bg-surface px-1.5 text-caption text-ink"
                data-testid="option-colour"
              >
                <option value="">No colour</option>
                {OPTION_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {OPTION_COLOR_LABEL[color]}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              aria-label={`Remove option ${option}`}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-danger-600"
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
        <Hint text={`Press Enter to add. Paste a list separated by commas or new lines to add many at once.${onColorsChange ? " Pick a colour on an option to show it as a coloured pill in lists and on the record." : ""}`} align="end" className="self-center" />
      </div>
      {note && <p className="text-caption text-ink-faint">{note}</p>}
    </div>
  );
}
