"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { userCommandAction } from "@/app/admin/users/actions";
import { guardAction } from "@/features/ui/form";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { useToast } from "@/features/ui/Toast";
import { inside } from "@/features/ui/inside";

// v1.49.3 (owner: "actions in a three-dot menu in the last column: Re-invite,
// Send set-password link, Deactivate / Activate user"): the user page's
// account actions on the users list. Each one runs the same server command
// (checked again there) after a confirmation naming the person, and the
// answer shows as a toast. People this admin can't change get "Open user".
type Command = "invite" | "set-password-link" | "reset-password" | "deactivate" | "reactivate";

interface Item {
  command: Command;
  label: string;
  confirm: string;
  confirmLabel: string;
  danger?: boolean;
}

const run = guardAction(userCommandAction);

export function UserRowMenu({
  id,
  name,
  active,
  signInMethod,
  hasPassword,
  canEdit,
}: {
  id: number;
  name: string;
  active: boolean;
  signInMethod: "GOOGLE" | "PASSWORD" | "BOTH";
  hasPassword: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; right: number } | null>(null);
  const [asking, setAsking] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const router = useRouter();

  const items: Item[] = !canEdit
    ? []
    : [
        ...(active
          ? [
              {
                command: "invite" as const,
                label: "Re-invite",
                confirm: signInMethod !== "GOOGLE" ? `Email ${name} a welcome with their User ID and a link (valid 12 hours) to set their password? Older links stop working.` : `Email ${name} a welcome telling them to sign in with Google?`,
                confirmLabel: "Yes, send",
              },
            ]
          : []),
        ...(active && signInMethod !== "GOOGLE"
          ? [
              hasPassword
                ? { command: "reset-password" as const, label: "Send reset-password link", confirm: `Email ${name} a link (valid 12 hours) to choose a new password? Their current password keeps working until then.`, confirmLabel: "Yes, send" }
                : { command: "set-password-link" as const, label: "Send set-password link", confirm: `Email ${name} a link (valid 12 hours) to set a password, confirmed by a WhatsApp code? Older links stop working.`, confirmLabel: "Yes, send" },
            ]
          : []),
        active
          ? { command: "deactivate" as const, label: "Deactivate user", confirm: `Deactivate ${name}? They will be signed out everywhere and can't sign in. History is kept; you can activate them again.`, confirmLabel: "Yes, deactivate", danger: true }
          : { command: "reactivate" as const, label: "Activate user", confirm: `Activate ${name}? They can sign in again.`, confirmLabel: "Yes, activate" },
      ];

  const toggle = () => {
    if (!open && box.current) {
      const rect = box.current.getBoundingClientRect();
      const height = 44 * (items.length + 1) + 40;
      setSpot({ top: rect.bottom + height > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const close = (event: MouseEvent) => box.current && !inside(event, box.current) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const away = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  async function confirmed() {
    if (!asking) return;
    const formData = new FormData();
    formData.set("id", String(id));
    formData.set("command", asking.command);
    setBusy(true);
    const result = await run(null, formData);
    setBusy(false);
    setAsking(null);
    toast({ tone: result.ok ? "success" : "error", title: result.ok ? `${name}: ${asking.label.toLowerCase()} done.` : `${name}: ${asking.label.toLowerCase()} didn't work.`, body: result.message });
    if (result.ok) router.refresh();
  }

  const itemClass = "block w-full rounded-md px-3 py-2 text-left text-label hover:bg-surface-muted focus:bg-surface-muted focus:outline-none";
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        onClick={toggle}
        className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        data-testid="user-row-menu"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label={`Actions for ${name}`} className="fixed z-[var(--z-drawer)] w-60 rounded-lg border border-line bg-raised p-1 shadow-overlay" style={spot ? { top: spot.top, right: spot.right } : undefined}>
          {items.map((item) => (
            <button
              key={item.command}
              type="button"
              role="menuitem"
              className={`${itemClass} ${item.danger ? "text-danger-600" : ""}`}
              onClick={() => {
                setOpen(false);
                setAsking(item);
              }}
            >
              {item.label}
            </button>
          ))}
          {!canEdit && <p className="px-3 py-2 text-caption text-ink-muted">Only the Super Admin can change this account.</p>}
          <Link role="menuitem" href={`/admin/users/${id}`} className={`${itemClass} ${items.length ? "border-t border-line" : ""}`} onClick={() => setOpen(false)}>
            Open user
          </Link>
        </div>
      )}
      <ConfirmDialog
        open={asking !== null}
        title={asking ? `${asking.label}?` : ""}
        body={asking?.confirm ?? ""}
        confirmLabel={asking?.confirmLabel ?? "Yes"}
        busy={busy}
        busyLabel="Working…"
        tone={asking?.danger ? "danger" : "primary"}
        onCancel={() => !busy && setAsking(null)}
        onConfirm={() => void confirmed()}
      />
    </div>
  );
}
