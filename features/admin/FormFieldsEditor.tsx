"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  AtSign,
  Calculator,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  GripVertical,
  Hash,
  Heading,
  IndianRupee,
  Link2,
  List,
  ListChecks,
  Paperclip,
  Redo2,
  Rows3,
  Search,
  Trash2,
  Type,
  Undo2,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { NUMERIC_TYPES, type FieldLookups, type FormField } from "@/server/forms/fields";
import type { Comparison } from "@/server/engine/types";
import { Hint } from "@/features/ui/Hint";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { useToast } from "@/features/ui/Toast";
import { FieldProperties, NumberDraftInput } from "@/features/admin/form-designer/FieldProperties";
import { conversionLosses, dependentsOf, duplicateField, fieldProblems, formulaProblem, GROUP_LABEL, moveItem, newField, TYPE_CHOICES, typeChoice, withType, type FieldGroup } from "@/features/admin/form-designer/model";

export { slugKey } from "@/features/admin/form-designer/model";
export { ChoiceListEditor, NumberDraftInput, SOURCE_LABEL } from "@/features/admin/form-designer/FieldProperties";

type ConditionValue = string | number;

// D-235 (owner: "Build all of it, start with the form fields editor";
// "Fields can't be reordered, and removals don't ask first"): the Form
// Designer. Library (add a field by type) · canvas (the fields as cards, in
// order: drag, or Move up / down with the buttons or Alt+↑/↓; Duplicate;
// Delete asks first and can be undone) · properties of the selected field
// only (tabs: General, Validation, Conditions, Advanced; only what applies to
// its type). Undo / Redo (Ctrl+Z / Ctrl+Y outside text boxes). Changing a
// type that would drop settings asks first. Each field keeps its own
// identity while it moves, so nothing typed is lost when another is removed.
// The server checks the whole form again on save (checkFormDefinition).
const TYPE_ICON: Record<string, LucideIcon> = {
  TEXT: Type,
  LONG_TEXT: AlignLeft,
  NUMBER: Hash,
  DATE: Calendar,
  CHOICE: List,
  PERSON: User,
  CHECKBOX: CheckSquare,
  RADIO: CircleDot,
  MULTI_CHOICE: ListChecks,
  CURRENCY: IndianRupee,
  DATETIME: CalendarClock,
  ATTACHMENT: Paperclip,
  "LOOKUP:DEPARTMENT": Users,
  "LOOKUP:DESIGNATION": AtSign,
  CALC: Calculator,
  LINE_ITEMS: Rows3,
  URL: Link2,
  SECTION: Heading,
};
const iconFor = (field: FormField): LucideIcon => TYPE_ICON[typeChoice(field)?.value ?? "TEXT"] ?? Type;

type Snapshot = { form: FormField[]; ids: string[] };
let seq = 0;
const newId = () => `f${Date.now().toString(36)}${(seq += 1).toString(36)}`;
const HISTORY_LIMIT = 100;
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// The designer is wide enough for three columns (library · canvas · properties)
// only when its own box is; inside the workflow builder it often isn't, and
// the properties then open under the chosen field.
function useWide(ref: React.RefObject<HTMLElement | null>, at = 960) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= at));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, at]);
  return wide;
}

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
  const toast = useToast();
  const box = useRef<HTMLElement>(null);
  const wide = useWide(box);
  // A stable identity per field (not its place in the list).
  const [ids, setIds] = useState<string[]>(() => form.map(newId));
  useEffect(() => {
    if (ids.length !== form.length) setIds(form.map((_, index) => ids[index] ?? newId()));
  }, [form, ids]);
  const [selected, setSelected] = useState<string | null>(null);
  // Keys of saved fields never change; a new field's key follows its label until IT edits the key.
  const [editedKeys, setEditedKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<{ id: string; value: string; losses: string[] } | null>(null);

  // Undo / redo: whole snapshots of the form and the identities.
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastTag = useRef<{ tag: string; at: number } | null>(null);
  const [, bump] = useState(0);
  const current = useRef<Snapshot>({ form, ids });
  current.current = { form, ids };

  const commit = useCallback(
    (next: Snapshot, tag?: string) => {
      const now = Date.now();
      // Typing in one box is one step, not one per letter.
      const coalesce = tag && lastTag.current?.tag === tag && now - lastTag.current.at < 1500;
      if (!coalesce) {
        past.current = [...past.current, current.current].slice(-HISTORY_LIMIT);
      }
      future.current = [];
      lastTag.current = tag ? { tag, at: now } : null;
      setIds(next.ids);
      setForm(() => next.form);
      bump((value) => value + 1);
    },
    [setForm],
  );
  const restore = useCallback(
    (from: React.MutableRefObject<Snapshot[]>, to: React.MutableRefObject<Snapshot[]>) => {
      const snapshot = from.current[from.current.length - 1];
      if (!snapshot) return;
      from.current = from.current.slice(0, -1);
      to.current = [...to.current, current.current];
      lastTag.current = null;
      setIds(snapshot.ids);
      setForm(() => snapshot.form);
      bump((value) => value + 1);
    },
    [setForm],
  );
  const undo = () => restore(past, future);
  const redo = () => restore(future, past);

  const indexOf = (id: string) => ids.indexOf(id);
  const keys = form.map((field) => field.key);
  const updateField = (id: string, change: (field: FormField) => FormField, tag: string) => {
    const index = indexOf(id);
    if (index < 0) return;
    commit({ form: form.map((field, i) => (i === index ? change(field) : field)), ids }, `${id}:${tag}`);
  };
  const add = (value: string, at = form.length) => {
    const field = newField(value, keys);
    const id = newId();
    commit({ form: [...form.slice(0, at), field, ...form.slice(at)], ids: [...ids.slice(0, at), id, ...ids.slice(at)] });
    setSelected(id);
    setQuery("");
  };
  const move = (id: string, to: number) => {
    const from = indexOf(id);
    if (from < 0 || to < 0 || to >= form.length || from === to) return;
    commit({ form: moveItem(form, from, to), ids: moveItem(ids, from, to) });
  };
  const duplicate = (id: string) => {
    const index = indexOf(id);
    if (index < 0) return;
    const copy = duplicateField(form[index]!, keys);
    const copyId = newId();
    commit({ form: [...form.slice(0, index + 1), copy, ...form.slice(index + 1)], ids: [...ids.slice(0, index + 1), copyId, ...ids.slice(index + 1)] });
    setEditedKeys((all) => new Set(all).add(copyId));
    setSelected(copyId);
  };
  const remove = (id: string) => {
    const index = indexOf(id);
    if (index < 0) return;
    const name = form[index]!.label || form[index]!.key || "the field";
    commit({ form: form.filter((_, i) => i !== index), ids: ids.filter((_, i) => i !== index) });
    if (selected === id) setSelected(null);
    toast({ tone: "info", title: `Removed “${name}”.`, action: { label: "Undo", onClick: undo } });
  };
  const changeType = (id: string, value: string) => {
    const index = indexOf(id);
    if (index < 0) return;
    const losses = conversionLosses(form[index]!, value);
    if (losses.length) setConfirmType({ id, value, losses });
    else updateField(id, (field) => withType(field, value), "type");
  };

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) outside text boxes, which keep their own undo.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || TYPING.has((event.target as HTMLElement).tagName)) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  };

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return form
      .map((field, index) => ({ field, index, id: ids[index] ?? `${index}` }))
      .filter(({ field }) => words.every((word) => `${field.label} ${field.key} ${typeChoice(field)?.label ?? ""}`.toLowerCase().includes(word)));
  }, [form, ids, query]);
  const selectedIndex = selected ? indexOf(selected) : -1;
  const selectedField = selectedIndex >= 0 ? form[selectedIndex] : undefined;
  const deleting = confirmDelete ? form[indexOf(confirmDelete)] : undefined;

  const properties = (id: string, field: FormField) => (
    <FieldProperties
      key={id}
      field={field}
      form={form}
      locked={lockedKeys.includes(field.key)}
      keyFollows={!lockedKeys.includes(field.key) && !editedKeys.has(id)}
      recordOptions={recordOptions}
      onChange={(change, tag) => updateField(id, change, tag)}
      onKeyEdited={() => setEditedKeys((all) => new Set(all).add(id))}
      onTypeChange={(value) => changeType(id, value)}
    />
  );

  const library = (
    <nav aria-label="Add a field" className={wide ? "space-y-4" : "flex flex-wrap gap-1.5"} data-testid="field-library">
      {(["BASIC", "ADVANCED", "LAYOUT"] as FieldGroup[]).map((group) => (
        <div key={group} className={wide ? "space-y-1" : "contents"}>
          {wide && <p className="px-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">{GROUP_LABEL[group]}</p>}
          {TYPE_CHOICES.filter((choice) => choice.group === group).map((choice) => {
            const Icon = TYPE_ICON[choice.value] ?? Type;
            return (
              <button
                key={choice.value}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-ars-field-type", choice.value);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => add(choice.value)}
                aria-label={`Add a ${choice.short} field`}
                title={choice.label}
                className={
                  wide
                    ? "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-label text-ink hover:bg-surface-muted"
                    : "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-caption text-ink hover:bg-surface-muted"
                }
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                {choice.short}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <section ref={box} className="card" aria-labelledby="form-fields-title" onKeyDown={onKeyDown} data-testid="form-designer">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-1.5">
          <h2 id="form-fields-title" className="font-semibold">
            Form fields
          </h2>
          <Hint text={intro ?? "What the requester fills in. Steps can skip on these values, e.g. amount, a date or a department."} align="start" />
          <span className="text-caption text-ink-muted">
            {form.length} field{form.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="ml-auto flex items-center gap-1">
          <label className="relative">
            <span className="sr-only">Find a field</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a field" className="field-input h-8 w-40 pl-8 text-label" />
          </label>
          <button type="button" className="tb-btn" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2 aria-hidden="true" className="h-4 w-4" />
          </button>
          <button type="button" className="tb-btn" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl+Y)">
            <Redo2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className={wide ? "grid grid-cols-[13rem_minmax(0,1fr)_22rem] items-start" : ""}>
        {wide ? <aside className="sticky top-20 border-r border-line p-3">{library}</aside> : <div className="border-b border-line px-5 py-3">{library}</div>}

        <div className="min-w-0 p-3">
          {form.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-label text-ink-muted">No fields yet. Pick a field type to add the first one.</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-4 text-label text-ink-muted">No field matches “{query}”.</p>
          ) : (
            <ol
              aria-label="Fields, in order"
              className="space-y-2"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("application/x-ars-field-type") || dragging) event.preventDefault();
              }}
              onDrop={(event) => {
                const type = event.dataTransfer.getData("application/x-ars-field-type");
                if (type && dropAt === null) {
                  event.preventDefault();
                  add(type);
                }
              }}
            >
              {shown.map(({ field, index, id }) => {
                const name = field.label || field.key || `field ${index + 1}`;
                const problems = fieldProblems(field, form);
                const Icon = iconFor(field);
                const isSelected = selected === id;
                return (
                  <li
                    key={id}
                    data-testid="form-field"
                    data-selected={isSelected ? "true" : undefined}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDropAt(index);
                    }}
                    onDragLeave={() => setDropAt((value) => (value === index ? null : value))}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const type = event.dataTransfer.getData("application/x-ars-field-type");
                      if (type) add(type, index);
                      else if (dragging) move(dragging, index);
                      setDragging(null);
                      setDropAt(null);
                    }}
                    className={`rounded-lg border bg-surface transition-colors ${isSelected ? "border-primary-600 ring-2 ring-primary-100" : "border-line"} ${dropAt === index ? "border-t-4 border-t-primary-600" : ""} ${field.type === "SECTION" ? "bg-surface-muted" : ""}`}
                  >
                    <div className="flex items-start gap-1 p-2">
                      <span
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropAt(null);
                        }}
                        title="Drag to move"
                        className="mt-1.5 cursor-grab text-ink-faint active:cursor-grabbing"
                        aria-hidden="true"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <button
                        type="button"
                        aria-expanded={isSelected}
                        aria-label={`Edit ${name}`}
                        onClick={() => setSelected(isSelected ? null : id)}
                        onKeyDown={(event) => {
                          if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                            event.preventDefault();
                            move(id, index + (event.key === "ArrowUp" ? -1 : 1));
                          }
                        }}
                        className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-1 text-left hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate ${field.type === "SECTION" ? "font-semibold uppercase tracking-wide" : "font-medium"}`}>
                            {field.label || <span className="text-ink-faint">Untitled field</span>}
                            {field.required && (
                              <span className="text-danger-600" aria-label="required">
                                {" "}
                                *
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-caption text-ink-muted">
                            {typeChoice(field)?.short ?? field.type}
                            {field.key ? ` · ${field.key}` : ""}
                            {field.showIf ? " · shown when…" : ""}
                            {field.confidential ? " · confidential" : ""}
                            {field.help ? ` · ${field.help}` : ""}
                          </span>
                        </span>
                        {problems.length > 0 && (
                          <span className="shrink-0 rounded-full bg-warning-50 px-2 py-0.5 text-caption font-semibold text-warning-600" title={problems.join(" ")} data-testid="field-problem">
                            {problems.length} to fix
                          </span>
                        )}
                      </button>
                      <span className="flex shrink-0 items-center">
                        <IconButton label={`Move ${name} up`} disabled={index === 0 || Boolean(query)} onClick={() => move(id, index - 1)}>
                          <ChevronUp className="h-4 w-4" />
                        </IconButton>
                        <IconButton label={`Move ${name} down`} disabled={index === form.length - 1 || Boolean(query)} onClick={() => move(id, index + 1)}>
                          <ChevronDown className="h-4 w-4" />
                        </IconButton>
                        <IconButton label={`Duplicate ${name}`} onClick={() => duplicate(id)}>
                          <Copy className="h-4 w-4" />
                        </IconButton>
                        <IconButton label={`Remove field ${name}`} danger onClick={() => setConfirmDelete(id)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </span>
                    </div>
                    {!wide && isSelected && (
                      <div className="border-t border-line px-3 pb-3 pt-2" data-testid="field-inline-properties">
                        <Problems problems={problems} field={field} form={form} />
                        {properties(id, field)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => add("TEXT")} className="btn-secondary btn-compact">
              Add field
            </button>
            <span className="text-caption text-ink-muted">or pick a type{wide ? " on the left" : " above"}; drag fields, or Alt+↑/↓, to change the order.</span>
          </div>
        </div>

        {wide && (
          <aside className="sticky top-20 min-h-[12rem] border-l border-line p-4" aria-label="Field properties">
            {selectedField && selected ? (
              <>
                <p className="mb-3 truncate text-label font-semibold">{selectedField.label || "Untitled field"}</p>
                <Problems problems={fieldProblems(selectedField, form)} field={selectedField} form={form} />
                {properties(selected, selectedField)}
              </>
            ) : (
              <p className="text-label text-ink-muted">Choose a field to see and change its properties.</p>
            )}
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete && deleting)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) remove(confirmDelete);
          setConfirmDelete(null);
        }}
        title={`Remove “${deleting?.label || deleting?.key || "this field"}”?`}
        body={(() => {
          const users = deleting ? dependentsOf(form, deleting.key) : [];
          return users.length
            ? `${users.join(", ")} use${users.length === 1 ? "s" : ""} this field in a condition or formula; ${users.length === 1 ? "it" : "they"} will need fixing. You can undo this.`
            : "It is removed from the form. You can undo this until you leave the page.";
        })()}
        confirmLabel="Remove field"
        tone="danger"
      />
      <ConfirmDialog
        open={Boolean(confirmType)}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => {
          if (confirmType) updateField(confirmType.id, (field) => withType(field, confirmType.value), "type");
          setConfirmType(null);
        }}
        title="Change the type?"
        body={`As ${TYPE_CHOICES.find((choice) => choice.value === confirmType?.value)?.label ?? "the new type"}, this field loses ${confirmType?.losses.join(", ")}. You can undo this.`}
        confirmLabel="Change type"
      />
    </section>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted disabled:opacity-30 ${danger ? "hover:bg-danger-50 hover:text-danger-600" : "hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

// What needs fixing, above the properties. A formula's problem is shown
// beside the formula itself, so it isn't repeated here.
function Problems({ problems, field, form }: { problems: string[]; field: FormField; form: readonly FormField[] }) {
  const formula = field.type === "CALC" ? formulaProblem(field.formula ?? "", form, field.key) : null;
  const shown = problems.filter((problem) => problem !== formula);
  if (!shown.length) return null;
  return (
    <ul role="status" className="mb-3 space-y-0.5 rounded-md bg-warning-50 px-3 py-2 text-caption text-warning-600">
      {shown.map((problem) => (
        <li key={problem}>! {problem}</li>
      ))}
    </ul>
  );
}

// ---- conditions (the workflow builder's step and choice conditions) ---------------------
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
    <select
      aria-label="Value"
      value={current === undefined || current === null ? "" : String(current)}
      onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
      className="field-input w-auto min-w-40"
    >
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
