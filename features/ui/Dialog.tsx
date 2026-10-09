"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button, type ButtonVariant } from "@/features/ui/Button";

// Dialogs and drawers (UI-03) on the native <dialog> element: showModal()
// makes the rest of the page inert (focus stays inside), Escape closes it,
// and focus goes back to whatever opened it.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "dialog",
  size = "md",
  role,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "dialog" | "drawer";
  size?: "sm" | "md" | "lg";
  role?: "alertdialog";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      // showModal focuses the first control (the close button); a field
      // marked data-autofocus (e.g. the comment box) is where typing starts.
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onNativeClose = () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
      onClose();
    };
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, [onClose]);

  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";
  const placement =
    variant === "drawer"
      ? `mb-0 mt-auto w-full max-w-none rounded-b-none rounded-t-xl sm:mb-auto sm:mr-0 sm:ml-auto sm:mt-0 sm:h-full sm:max-h-none sm:w-[28rem] sm:rounded-none`
      : `w-[calc(100%-2rem)] rounded-xl ${width}`;
  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) ref.current?.close();
      }}
      className={`z-dialog max-h-[90vh] border border-line bg-raised p-0 text-ink shadow-overlay backdrop:bg-overlay ${placement}`}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="font-semibold">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-label text-ink-muted">
                  {description}
                </div>
              )}
            </div>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// FB: one confirmation pattern for high-impact actions. Says what will
// happen, names the item, and names the action on the button.
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy = false,
  tone = "primary",
  children,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  tone?: Extract<ButtonVariant, "primary" | "danger">;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} loading={busy} loadingLabel={busyLabel}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
