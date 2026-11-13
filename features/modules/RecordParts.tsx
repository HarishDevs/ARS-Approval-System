import { displayValue, OPTION_TYPES, type FormField } from "@/server/forms/fields";
import { optionColor } from "@/server/forms/option-colors";
import { ChoicePills } from "@/features/ui/ChoicePill";
import { formatSize } from "@/server/attachments/files";
import { indiaDateTimeText } from "@/server/modules/settings";
import type { RecordFile } from "@/server/modules/files";

// v1.9.0: shared pieces of the task and information pages (server-rendered).
export function FieldValues({ form, data, names, lookupNames }: { form: readonly FormField[]; data: Record<string, unknown>; names: ReadonlyMap<number, string>; lookupNames: ReadonlyMap<string, string> }) {
  const shown = form.filter((field) => field.type !== "SECTION" && field.type !== "ATTACHMENT" && data[field.key] !== undefined && data[field.key] !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-testid="field-values">
      {shown.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-caption font-semibold uppercase tracking-wide text-ink-faint">{field.label}</dt>
          <dd className="break-words">
            {field.type === "URL" && typeof data[field.key] === "string" ? (
              <a href={String(data[field.key])} target="_blank" rel="noopener noreferrer nofollow" className="link">
                {String(data[field.key])}
              </a>
            ) : OPTION_TYPES.includes(field.type) && field.optionColors ? (
              // v1.47.0: coloured choice values (Form Designer option colours).
              <ChoicePills values={choiceValues(field, data[field.key])} />
            ) : (
              <span className="whitespace-pre-wrap">{displayValue(field, data[field.key], names, lookupNames)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// v1.47.0: a choice field's stored value(s) with each option's colour.
export function choiceValues(field: FormField, value: unknown): { label: string; color: string | null }[] {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item !== "").map((item) => ({ label: item, color: optionColor(field, item) }));
}

export function FileLinks({ files, label = "Files" }: { files: readonly RecordFile[]; label?: string }) {
  if (files.length === 0) return null;
  return (
    <div>
      {label && <h3 className="mb-1 text-label font-semibold">{label}</h3>}
      <ul className="space-y-1" data-testid="record-files">
        {files.map((file) => (
          <li key={file.id} className="text-label">
            <a href={`/api/files/${file.id}`} className="link">
              {file.name}
            </a>
            <span className="text-ink-muted">
              {" "}
              · {formatSize(file.size)} · {file.uploadedByName}
              {file.purpose === "EVIDENCE" ? " · completion evidence" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface HistoryEntry {
  id: number;
  when: Date;
  who: string | null;
  what: string;
  detail?: string | null;
}

export function HistoryList({ entries }: { entries: readonly HistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-label text-ink-muted">Nothing yet.</p>;
  return (
    <ol className="space-y-3" data-testid="record-history">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-line pl-3">
          <p className="text-label">
            <span className="font-medium">{entry.what}</span>
            <span className="text-ink-muted">
              {" "}
              · {entry.who ?? "System"} · {indiaDateTimeText(entry.when)}
            </span>
          </p>
          {entry.detail && <p className="whitespace-pre-wrap text-label text-ink-muted">{entry.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
