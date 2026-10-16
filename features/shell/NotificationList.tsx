"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markAllReadAction, markReadAction, markUnreadAction } from "@/app/users/collab-actions";
import { guardAction } from "@/features/ui/form";
import { useToast } from "@/features/ui/Toast";
import { SafeText } from "@/features/ui/SafeText";

// The inbox (P1-44) with instant read state (WS / FB-03): marking as read
// shows at once, is confirmed by the server, rolls back if it fails, and
// "Mark all as read" can be undone.
export interface InboxRow {
  id: number;
  title: string;
  message: string;
  when: string;
  read: boolean;
  path: string | null;
  type?: string; // v1.9.0: Approval / Task / Information / System
}

const ids = (list: readonly number[]) => {
  const data = new FormData();
  data.set("ids", list.join(","));
  return data;
};

export function NotificationList({ items, showMarkAll }: { items: InboxRow[]; showMarkAll: boolean }) {
  const [readNow, setReadNow] = useState<Set<number>>(new Set());
  const [busy, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const isRead = (item: InboxRow) => item.read || readNow.has(item.id);
  const unread = items.filter((item) => !isRead(item));

  const markAll = () =>
    start(async () => {
      const before = new Set(readNow);
      setReadNow(new Set(items.map((item) => item.id)));
      const result = await guardAction(markAllReadAction)(null, new FormData());
      if (!result.ok) {
        setReadNow(before);
        toast({ tone: "error", title: "Not marked as read", body: result.message });
        return;
      }
      const changed = ((result.data as { ids?: number[] } | undefined)?.ids ?? []) as number[];
      router.refresh();
      toast({
        tone: "success",
        title: changed.length === 1 ? "1 marked as read" : `${changed.length} marked as read`,
        action: changed.length
          ? {
              label: "Undo",
              onClick: async () => {
                const undo = await guardAction(markUnreadAction)(null, ids(changed));
                setReadNow(new Set());
                router.refresh();
                toast(undo.ok ? { tone: "info", title: "Back to unread" } : { tone: "error", title: "Couldn't undo", body: undo.message });
              },
            }
          : undefined,
      });
    });

  // Opening one marks it read (in the background; the link opens at once).
  const open = (item: InboxRow) => {
    if (isRead(item)) return;
    setReadNow((current) => new Set(current).add(item.id));
    void guardAction(markReadAction)(null, ids([item.id])).then((result) => {
      if (!result.ok)
        setReadNow((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
    });
  };

  return (
    <>
      {showMarkAll && unread.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={markAll} disabled={busy} className="btn-secondary btn-compact">
            <CheckCheck aria-hidden="true" className="h-4 w-4" />
            {busy ? "Working…" : "Mark all as read"}
          </button>
        </div>
      )}
      <ul className="card divide-y divide-line">
        {items.map((item) => {
          const read = isRead(item);
          const body = (
            <>
              <p className="flex items-center gap-2 font-medium">
                {!read && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary-600">
                    <span className="sr-only">Unread</span>
                  </span>
                )}
                {item.type && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">{item.type}</span>}
                <SafeText text={item.title} />
              </p>
              <p className="text-label text-ink-muted">
                <SafeText text={item.message} />
              </p>
              <p className="text-caption text-ink-faint">{item.when}</p>
            </>
          );
          return (
            <li key={item.id} className={read ? "" : "bg-primary-50/40"}>
              {item.path ? (
                <Link href={item.path} onClick={() => open(item)} className="block px-5 py-3 hover:bg-surface-muted">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start justify-between gap-3 px-5 py-3">
                  <div>{body}</div>
                  {!read && (
                    <button type="button" className="link shrink-0 text-label" onClick={() => open(item)}>
                      Mark as read
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
