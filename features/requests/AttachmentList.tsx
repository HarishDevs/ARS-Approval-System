"use client";

import { Download, Eye, ExternalLink, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { deleteAttachmentAction } from "@/app/users/actions";
import { ResultMessage, useActionForm } from "@/features/ui/form";
import { useState } from "react";
import { Dialog } from "@/features/ui/Dialog";

// RD-02 files on a request: name, type, size and who added them; images
// open in a preview, PDFs in the browser's viewer in a new tab, every file
// can be downloaded. The server checks access on every one.
export interface AttachmentRow {
  id: number;
  name: string;
  size: string;
  meta: string;
  preview: "image" | "pdf" | null;
  deletable?: boolean; // v1.52.3: until the first approval, or while changes are asked for
}

export function AttachmentList({ files }: { files: AttachmentRow[] }) {
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <ul className="mb-4 space-y-2">
        {files.map((file) => (
          <li key={file.id} className="flex items-start gap-3 text-label">
            <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink-muted">
              {file.preview === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-all font-medium">{file.name}</p>
              <p className="text-caption text-ink-faint">
                {file.size} · {file.meta}
              </p>
              <p className="mt-1 flex flex-wrap gap-3">
                {file.preview === "image" && (
                  <button
                    type="button"
                    className="link inline-flex items-center gap-1"
                    onClick={() => {
                      setFailed(false);
                      setViewing(file);
                    }}
                    aria-label={`Preview ${file.name}`}
                  >
                    <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                    Preview
                  </button>
                )}
                {file.preview === "pdf" && (
                  <a href={`/api/attachments/${file.id}?inline=1`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1" aria-label={`Open ${file.name} in a new tab`}>
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    Open
                  </a>
                )}
                <a href={`/api/attachments/${file.id}`} className="link inline-flex items-center gap-1" download aria-label={`Download ${file.name}`}>
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  Download
                </a>
                {file.deletable && <DeleteFileButton id={file.id} name={file.name} />}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.name ?? ""} size="lg">
        {viewing &&
          (failed ? (
            <p className="text-label text-danger-600">This file couldn&apos;t be shown. It may have been removed, or you may no longer have access. Try Download instead.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a private file streamed by our own access-checked route
            <img src={`/api/attachments/${viewing.id}?inline=1`} alt={viewing.name} className="mx-auto max-h-[70vh] w-auto rounded-md" onError={() => setFailed(true)} />
          ))}
      </Dialog>
    </>
  );
}

// v1.52.3 (owner): delete a file before the first approval (or while the
// request is back for changes); it asks first. The server checks the rule.
function DeleteFileButton({ id, name }: { id: number; name: string }) {
  const { result, pending, onSubmit, confirmBar } = useActionForm(deleteAttachmentAction, {
    confirm: `${name} will be removed from this request. You can attach a new file afterwards.`,
    confirmTitle: "Delete this file?",
    confirmLabel: "Delete file",
    confirmTone: "danger",
  });
  return (
    <form onSubmit={onSubmit} className="inline">
      <input type="hidden" name="attachmentId" value={id} />
      <button type="submit" disabled={pending} className="inline-flex items-center gap-1 text-danger-600 hover:underline disabled:opacity-60" aria-label={`Delete ${name}`}>
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        Delete
      </button>
      {result && !result.ok && <ResultMessage result={result} />}
      {confirmBar}
    </form>
  );
}
