"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Bookmark, BookmarkCheck, CheckCheck } from "lucide-react";
import { inboxStateAction, markAllReadAction, markReadAction, markUnreadAction } from "@/app/users/collab-actions";
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
  bookmarked?: boolean; // D-237: the one Inbox
  archived?: boolean;
  day?: string; // v1.45.0 phone: "Today", "Yesterday", "28 Oct" (groups the list)
}

const ids = (list: readonly number[]) => {
  const data = new FormData();
  data.set("ids", list.join(","));
  return data;
};

export function NotificationList({ items, showMarkAll, manage = false, variant }: { items: InboxRow[]; showMarkAll: boolean; manage?: boolean; variant?: "mobile" }) {
  const [readNow, setReadNow] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
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

  // D-237: bookmark or archive one (the page refreshes with the server's answer).
  const setState = (item: InboxRow, command: string, done: string) =>
    start(async () => {
      const data = ids([item.id]);
      data.set("command", command);
      const result = await guardAction(inboxStateAction)(null, data);
      if (!result.ok) {
        toast({ tone: "error", title: "Not changed", body: result.message });
        return;
      }
      router.refresh();
      toast({ tone: "success", title: done });
    });

  const manageButtons = (item: InboxRow, size: string) => (
    <>
      <button
        type="button"
        disabled={busy}
        aria-label={item.bookmarked ? `Remove bookmark: ${item.title}` : `Bookmark: ${item.title}`}
        title={item.bookmarked ? "Remove bookmark" : "Bookmark"}
        onClick={() => setState(item, item.bookmarked ? "UNBOOKMARK" : "BOOKMARK", item.bookmarked ? "Bookmark removed" : "Bookmarked")}
        className={`grid ${size} place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink`}
      >
        {item.bookmarked ? <BookmarkCheck aria-hidden="true" className="h-4 w-4 text-primary-700" /> : <Bookmark aria-hidden="true" className="h-4 w-4" />}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={item.archived ? `Move back to the inbox: ${item.title}` : `Archive: ${item.title}`}
        title={item.archived ? "Move back to the inbox" : "Archive"}
        onClick={() => setState(item, item.archived ? "UNARCHIVE" : "ARCHIVE", item.archived ? "Moved back to the inbox" : "Archived")}
        className={`grid ${size} place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink`}
      >
        {item.archived ? <ArchiveRestore aria-hidden="true" className="h-4 w-4" /> : <Archive aria-hidden="true" className="h-4 w-4" />}
      </button>
    </>
  );

  // v1.45.0 (owner's Asana screens): on a phone, cards grouped by day: the
  // kind, the title, the message (See more), when; bookmark and archive.
  if (variant === "mobile")
    return (
      <div className="-mx-4" data-testid="notification-items">
        {showMarkAll && unread.length > 0 && (
          <div className="flex justify-end px-4 pt-2">
            <button type="button" onClick={markAll} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--m-navy-text)]">
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
              {busy ? "Working…" : "Mark all as read"}
            </button>
          </div>
        )}
        <ul>
          {items.map((item, index) => {
            const read = isRead(item);
            const long = item.message.length > 140;
            const more = expanded.has(item.id);
            const title = (
              <span className={`block text-[16px] leading-snug ${read ? "" : "font-semibold"}`}>
                <SafeText text={item.title} />
              </span>
            );
            return (
              <li key={item.id} data-read={read ? "1" : "0"}>
                {item.day && item.day !== items[index - 1]?.day && <h2 className="border-y border-line bg-surface-muted px-4 py-2 text-[15px] text-ink-muted">{item.day}</h2>}
                <div className={`border-b border-line px-4 py-4 ${read ? "" : "bg-primary-50/40"}`}>
                  <div className="flex items-center gap-2">
                    {item.type && <span className="rounded-md bg-surface-muted px-2 py-1 text-[13px] font-medium text-ink">{item.type}</span>}
                    {!read && (
                      <span className="h-2.5 w-2.5 rounded-full bg-primary-600">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                    {manage && <span className="ml-auto flex gap-1">{manageButtons(item, "h-10 w-10")}</span>}
                  </div>
                  <div className="mt-2">
                    {item.path ? (
                      <Link href={item.path} onClick={() => open(item)} className="block">
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </div>
                  <p className={`mt-1 whitespace-pre-line text-[15px] text-ink-muted ${long && !more ? "line-clamp-3" : ""}`}>
                    <SafeText text={item.message} />
                  </p>
                  {long && (
                    <button
                      type="button"
                      className="mt-1 min-h-9 text-[15px] text-[color:var(--brand-accent-text)]"
                      aria-expanded={more}
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                    >
                      {more ? "See less" : "See more"}
                    </button>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-[14px] text-ink-faint">{item.when}</p>
                    {!item.path && !read && (
                      <button type="button" className="min-h-9 text-[14px] font-semibold text-[color:var(--m-navy-text)]" onClick={() => open(item)}>
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );

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
                {item.type && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[length:calc(11px*var(--text-scale,1))] font-semibold text-ink-muted">{item.type}</span>}
                <SafeText text={item.title} />
              </p>
              <p className="text-label text-ink-muted">
                <SafeText text={item.message} />
              </p>
              <p className="text-caption text-ink-faint">{item.when}</p>
            </>
          );
          return (
            <li key={item.id} className={`flex items-start ${read ? "" : "bg-primary-50/40"}`}>
              <div className="min-w-0 flex-1">
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
              </div>
              {manage && (
                <span className="flex shrink-0 gap-1 px-3 py-3">
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={item.bookmarked ? `Remove bookmark: ${item.title}` : `Bookmark: ${item.title}`}
                    title={item.bookmarked ? "Remove bookmark" : "Bookmark"}
                    onClick={() => setState(item, item.bookmarked ? "UNBOOKMARK" : "BOOKMARK", item.bookmarked ? "Bookmark removed" : "Bookmarked")}
                    className="grid h-8 w-8 place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
                  >
                    {item.bookmarked ? <BookmarkCheck aria-hidden="true" className="h-4 w-4 text-primary-700" /> : <Bookmark aria-hidden="true" className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={item.archived ? `Move back to the inbox: ${item.title}` : `Archive: ${item.title}`}
                    title={item.archived ? "Move back to the inbox" : "Archive"}
                    onClick={() => setState(item, item.archived ? "UNARCHIVE" : "ARCHIVE", item.archived ? "Moved back to the inbox" : "Archived")}
                    className="grid h-8 w-8 place-items-center rounded text-ink-muted hover:bg-surface-muted hover:text-ink"
                  >
                    {item.archived ? <ArchiveRestore aria-hidden="true" className="h-4 w-4" /> : <Archive aria-hidden="true" className="h-4 w-4" />}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
