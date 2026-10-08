"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Email } from "@/features/ui/SafeText";

// One user menu at the top right (S9-01..03): who you are, which space
// you're in, switching space, and signing out. Closes on a click outside,
// Escape, or a page change.
export interface SpaceLink {
  href: string;
  label: string;
}

export function ProfileMenu({
  name,
  email,
  initials,
  spaceLabel,
  otherSpaces,
  unread,
}: {
  name: string;
  email: string;
  initials: string;
  spaceLabel: string;
  otherSpaces: SpaceLink[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  const item = "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-label text-ink hover:bg-surface-muted";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 hover:bg-surface-muted sm:rounded-lg sm:pl-2"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-label font-semibold leading-tight text-ink">{name}</span>
          <span className="mt-0.5 inline-block rounded-full bg-primary-50 px-2 py-px text-[11px] font-semibold leading-4 text-primary-700">{spaceLabel}</span>
        </span>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600 text-caption font-semibold text-white">
          {initials}
        </span>
        <svg viewBox="0 0 20 20" className="hidden h-4 w-4 text-ink-faint sm:block" fill="currentColor" aria-hidden="true">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-line bg-surface p-2 shadow-lg">
          <div className="border-b border-line px-3 pb-3 pt-1">
            <p className="font-semibold leading-tight">{name}</p>
            <p className="mt-0.5 break-all text-caption text-ink-muted">
              <Email address={email} />
            </p>
            <p className="mt-2 text-caption text-ink-muted">
              Space: <span className="rounded-full bg-primary-50 px-2 py-px font-semibold text-primary-700">{spaceLabel}</span>
            </p>
          </div>
          {otherSpaces.length > 0 && (
            <div className="border-b border-line py-2">
              <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wider text-ink-faint">Switch space</p>
              {otherSpaces.map((space) => (
                <Link key={space.href} href={space.href} role="menuitem" className={item}>
                  {space.label}
                  <span aria-hidden="true" className="text-ink-faint">→</span>
                </Link>
              ))}
            </div>
          )}
          <div className="py-2">
            <Link href="/users/notifications" role="menuitem" className={item}>
              Notifications
              {unread > 0 && <span className="rounded-full bg-danger-600 px-1.5 text-[11px] font-semibold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link href="/users/security" role="menuitem" className={item}>
              Sign-in &amp; devices
            </Link>
          </div>
          <div className="border-t border-line pt-2">
            <button type="button" role="menuitem" onClick={signOut} disabled={busy} className={`${item} text-danger-600`}>
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
