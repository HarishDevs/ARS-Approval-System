"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";

// v1.52.2 (owner: "when uploading multiple files I want to see each file's
// name separately, delete and re-upload; choosing files a second time must
// add them, not replace the first ones"): a file chooser that keeps a list.
// Each pick adds to the list (the same file twice is kept once); each file
// has a remove button. The form still sends a normal file field (`name`),
// filled from the list, so the server side is unchanged.
const MB = 1024 * 1024;
const sizeText = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

export function FileListInput({
  id,
  name,
  accept,
  multiple = true,
  maxFiles = 5,
  maxBytes = 10 * MB,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  buttonLabel = "Choose files",
  testId,
}: {
  id?: string;
  name: string;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  buttonLabel?: string;
  testId?: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const most = multiple ? maxFiles : 1;

  // The named field carries the list (what the form sends).
  const publish = (next: File[]) => {
    setFiles(next);
    const node = field.current;
    if (!node) return;
    try {
      const transfer = new DataTransfer();
      for (const file of next) transfer.items.add(file);
      node.files = transfer.files;
    } catch {
      // Very old browsers can't set files: the last pick is sent as it is.
    }
    node.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // Emptied with its form (after a successful send, or Reset).
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const reset = () => {
      setFiles([]);
      setNote(null);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return (
    <div data-testid={testId ?? "file-list-input"}>
      <input ref={field} id={id ? `${id}-field` : undefined} name={name} type="file" multiple={multiple} accept={accept} tabIndex={-1} aria-hidden="true" aria-label="Files to send" className="sr-only" />
      <input
        ref={picker}
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        className="sr-only"
        onChange={(event) => {
          const picked = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          if (!picked.length) return;
          const tooBig = picked.filter((file) => file.size > maxBytes);
          const fresh = picked.filter((file) => file.size <= maxBytes && !files.some((kept) => sameFile(kept, file)));
          const next = multiple ? [...files, ...fresh].slice(0, most) : fresh.slice(-1);
          const dropped = (multiple ? files.length + fresh.length : fresh.length ? 1 : 0) - next.length;
          const notes = [
            tooBig.length ? `${tooBig.map((file) => file.name).join(", ")}: over ${sizeText(maxBytes)}, not added.` : "",
            dropped > 0 ? `Up to ${most} file${most === 1 ? "" : "s"}: ${dropped} not added.` : "",
          ].filter(Boolean);
          setNote(notes.length ? notes.join(" ") : null);
          publish(next);
        }}
      />
      <div className="rounded-lg border-2 border-dashed border-line-strong bg-surface-muted/40 px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => picker.current?.click()} disabled={files.length >= most} className="btn-primary btn-compact w-auto disabled:opacity-60" aria-controls={id}>
            <Paperclip aria-hidden="true" className="h-4 w-4" /> {files.length ? (multiple ? "Add more files" : "Choose another file") : buttonLabel}
          </button>
          <span className="text-caption text-ink-muted" aria-live="polite">
            {files.length ? `${files.length} of ${most} file${most === 1 ? "" : "s"} chosen` : `Up to ${most} file${most === 1 ? "" : "s"}, ${sizeText(maxBytes)} each`}
          </span>
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5" aria-label="Chosen files" data-testid="chosen-files">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-label">
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-caption text-ink-muted">{sizeText(file.size)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setNote(null);
                    publish(files.filter((_, at) => at !== index));
                  }}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-danger-600"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && (
          <p className="mt-2 text-caption text-warning-600" role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
