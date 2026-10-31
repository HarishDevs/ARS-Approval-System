"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/features/ui/Dialog";

// D-234 (Fitts, Similarity): a small delete or remove control that asks
// first, in the app's own dialog, and waits for the answer before closing.
// One look and one behaviour for every "delete this" in a list row.
export function ConfirmButton({
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  ariaLabel,
  className,
  children,
}: {
  onConfirm: () => Promise<unknown> | unknown;
  title: string;
  body: string;
  confirmLabel?: string;
  ariaLabel?: string;
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" aria-label={ariaLabel} className={className} disabled={busy} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setOpen(false);
          }
        }}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        busy={busy}
        busyLabel="Working…"
        tone="danger"
      />
    </>
  );
}
