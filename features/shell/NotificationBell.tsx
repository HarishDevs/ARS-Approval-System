"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Spinner } from "@/features/ui/Spinner";

// v1.9.0 (owner, D-146): the bell opens a dropdown with the latest 10
// notifications (newest first) and filters All / Approvals / Tasks /
// Information. Opening one marks only that one read and opens its record;
// "Read more" opens the Notifications page with the same filter and marks
// nothing. Data comes from /api/me/notifications (the signed-in person only).
type Category = "APPROVAL" | "TASK" | "INFORMATION" | "SYSTEM";
interface Item {
  id: number;
  title: string;
  message: string;
  category: Category;
  createdAt: string;
  read: boolean;
  path: string | null;
}
type Filter = "ALL" | "APPROVAL" | "TASK" | "INFORMATION";
const FILTERS: { key: Filter; label: string; slug: string }[] = [
  { key: "ALL", label: "All", slug: "" },
  { key: "APPROVAL", label: "Approvals", slug: "approvals" },
  { key: "TASK", label: "Tasks", slug: "tasks" },
  { key: "INFORMATION", label: "Information", slug: "information" },
];
const TYPE_LABEL: Record<Category, string> = { APPROVAL: "Approval", TASK: "Task", INFORMATION: "Information", SYSTEM: "System" };
const TYPE_CLASS: Record<Category, string> = {
  APPROVAL: "bg-primary-50 text-primary-700",
  TASK: "bg-warning-50 text-warning-600",
  INFORMATION: "bg-success-50 text-success-600",
  SYSTEM: "bg-surface-muted text-ink-muted",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({ ALL: initialUnread });
  const [state, setState] = useState<"idle" | "loading" | "error" | "signed-out">("idle");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const panelId = useId();

  const load = useCallback(async (which: Filter) => {
    setState("loading");
    try {
      const response = await fetch(`/api/me/notifications${which === "ALL" ? "" : `?type=${which}`}`, { cache: "no-store", headers: { Accept: "application/json" } });
      if (response.status === 404 || response.status === 401) {
        setState("signed-out");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { items: Item[]; unread: Record<string, number> };
      setItems(data.items);
      setUnread(data.unread);
      setState("idle");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (open) void load(filter);
  }, [open, filter, load]);

  // Close on Escape or a click outside; focus goes back to the bell.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const post = (body: unknown) => fetch("/api/me/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function openItem(item: Item) {
    if (!item.read) {
      setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, read: true } : row)) ?? null);
      await post({ action: "read", ids: [item.id] }).catch(() => undefined);
    }
    setOpen(false);
    router.push(item.path ?? "/users/notifications");
    router.refresh();
  }

  async function markAll() {
    const response = await post({ action: "read-all" }).catch(() => null);
    if (response?.ok) {
      setItems((current) => current?.map((row) => ({ ...row, read: true })) ?? null);
      setUnread({ ALL: 0 });
      router.refresh();
    }
  }

  const total = unread.ALL ?? 0;
  const readMore = `/users/notifications${filter === "ALL" ? "" : `?type=${FILTERS.find((entry) => entry.key === filter)!.slug}`}`;
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={total ? `Notifications, ${total} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
        data-testid="notification-bell"
        data-tour="bell"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger-solid px-1 text-center text-[11px] font-semibold leading-[18px] text-on-solid">{total > 99 ? "99+" : total}</span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Latest notifications"
          className="absolute right-0 top-11 z-dialog flex max-h-[min(80vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-overlay"
          data-testid="notification-dropdown"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="font-semibold">Notifications</p>
            {total > 0 && (
              <button type="button" onClick={markAll} className="link text-label">
                Mark all read
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Show" className="flex gap-1 border-b border-line px-2 py-1.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={`rounded-full px-2.5 py-1 text-caption ${filter === entry.key ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}
              >
                {entry.label}
                {(unread[entry.key] ?? 0) > 0 && <span className="ml-1 tabular-nums">({unread[entry.key]})</span>}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {state === "loading" && items === null ? (
              <p className="flex items-center gap-2 px-4 py-6 text-label text-ink-muted">
                <Spinner /> Loading…
              </p>
            ) : state === "signed-out" ? (
              <p className="px-4 py-6 text-label text-ink-muted">Your session has ended. Sign in again to see your notifications.</p>
            ) : state === "error" ? (
              <p className="px-4 py-6 text-label text-danger-600">
                Couldn&apos;t load notifications.{" "}
                <button type="button" className="link" onClick={() => void load(filter)}>
                  Try again
                </button>
              </p>
            ) : items && items.length === 0 ? (
              <p className="px-4 py-6 text-label text-ink-muted">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="notification-items">
                {items?.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void openItem(item)} className={`block w-full px-4 py-3 text-left hover:bg-surface-muted ${item.read ? "" : "bg-primary-50/40"}`}>
                      <span className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_CLASS[item.category]}`}>{TYPE_LABEL[item.category]}</span>
                        {!item.read && <span className="h-2 w-2 rounded-full bg-primary-600" aria-label="Unread" />}
                        <span className="ml-auto text-caption text-ink-faint">{when(item.createdAt)}</span>
                      </span>
                      <span className={`mt-1 block text-label ${item.read ? "" : "font-semibold"}`}>{item.title}</span>
                      <span className="line-clamp-2 block text-caption text-ink-muted">{item.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-right">
            <Link href={readMore} className="link text-label" onClick={() => setOpen(false)}>
              Read more
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
