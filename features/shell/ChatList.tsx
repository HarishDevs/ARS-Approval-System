"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Pencil, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/features/ui/Dialog";
import { inside } from "@/features/ui/inside";

export type ChatSummary = { id: number; title: string; pinned?: boolean };

// D-180 (owner): the AI Assistant group in the sidebar is the person's chat
// history (pinned first, then newest), with a search. About ten show at once;
// the rest scroll. D-182: each chat has a ⋯ menu to rename, pin or delete it.
// The server checks the owner on every change.
export function ChatList({ chats }: { chats: ChatSummary[] }) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/users/ai/assistant" ? params.get("c") : null;
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? chats.filter((chat) => chat.title.toLowerCase().includes(term)) : chats;
  }, [chats, query]);

  async function change(id: number, body: { title?: string; pinned?: boolean } | null) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/ai/conversations/${id}`, { method: body ? "PATCH" : "DELETE", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error();
      if (!body && current === String(id)) router.push("/users/ai/assistant");
      router.refresh();
    } catch {
      setProblem("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 py-1" data-testid="nav-chats">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search chats" placeholder="Search chats" className="h-8 w-full rounded-md border border-line bg-surface-muted pl-8 pr-2 text-label text-ink placeholder:text-ink-faint focus:border-primary-600 focus:outline-none" />
      </div>
      {problem && (
        <p role="alert" className="px-2 text-caption text-danger-600">
          {problem}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="px-2 py-1 text-caption text-ink-faint">{chats.length ? "No matching chats" : "No chats yet"}</p>
      ) : (
        <ul className="max-h-[21rem] space-y-0.5 overflow-y-auto overscroll-contain pr-1">
          {shown.map((chat) => {
            const active = current === String(chat.id);
            if (renaming === chat.id) {
              return (
                <li key={chat.id}>
                  <RenameBox
                    initial={chat.title}
                    onDone={(title) => {
                      setRenaming(null);
                      if (title && title !== chat.title) void change(chat.id, { title });
                    }}
                  />
                </li>
              );
            }
            return (
              <li key={chat.id} className={`group flex items-center rounded-md ${active ? "bg-primary-50" : "hover:bg-surface-muted"}`}>
                <Link href={`/users/ai/assistant?c=${chat.id}`} aria-current={active ? "page" : undefined} title={chat.title} className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-label ${active ? "font-medium text-primary-700" : "text-ink-muted hover:text-ink"}`}>
                  {chat.pinned && <Pin aria-label="Pinned" className="h-3 w-3 shrink-0 text-ink-faint" />}
                  <span className="truncate">{chat.title}</span>
                </Link>
                <ChatMenu
                  title={chat.title}
                  pinned={Boolean(chat.pinned)}
                  disabled={busy}
                  onRename={() => setRenaming(chat.id)}
                  onPin={() => void change(chat.id, { pinned: !chat.pinned })}
                  onDelete={() => setDeleting(chat)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void change(target.id, null);
        }}
        title="Delete this chat?"
        body={deleting ? `"${deleting.title}" and its messages are deleted for good.` : ""}
        confirmLabel="Yes, delete"
        tone="danger"
      />
    </div>
  );
}

function RenameBox({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  return (
    <input
      ref={box}
      defaultValue={initial}
      maxLength={200}
      aria-label="Chat name"
      className="h-8 w-full rounded-md border border-primary-600 bg-surface px-2 text-label text-ink focus:outline-none"
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(event.currentTarget.value.replace(/\s+/g, " ").trim() || null);
        if (event.key === "Escape") onDone(null);
      }}
      onBlur={(event) => onDone(event.currentTarget.value.replace(/\s+/g, " ").trim() || null)}
    />
  );
}

// A floating menu: positioned against the window, so the scrolling list
// never clips it. Arrow keys move, Escape closes and returns focus.
function ChatMenu({ title, pinned, disabled, onRename, onPin, onDelete }: { title: string; pinned: boolean; disabled: boolean; onRename: () => void; onPin: () => void; onDelete: () => void }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: Event) => {
      if (event.type === "mousedown" && inside(event, menu.current)) return;
      setAt(null);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [at]);
  const choose = (action: () => void) => {
    setAt(null);
    action();
  };
  const items = [
    { label: "Rename", icon: <Pencil aria-hidden="true" className="h-4 w-4" />, action: onRename, danger: false },
    { label: pinned ? "Unpin" : "Pin to top", icon: pinned ? <PinOff aria-hidden="true" className="h-4 w-4" /> : <Pin aria-hidden="true" className="h-4 w-4" />, action: onPin, danger: false },
    { label: "Delete", icon: <Trash2 aria-hidden="true" className="h-4 w-4" />, action: onDelete, danger: true },
  ];
  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        aria-label={`Options for ${title}`}
        title="Options"
        onClick={() => {
          const rect = button.current!.getBoundingClientRect();
          setAt(at ? null : { top: Math.min(rect.bottom + 4, window.innerHeight - 140), left: Math.min(rect.left, window.innerWidth - 180) });
        }}
        className={`mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-surface hover:text-ink focus-visible:opacity-100 ${at ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>
      {at && (
        <div
          ref={menu}
          role="menu"
          aria-label={`Options for ${title}`}
          style={{ position: "fixed", top: at.top, left: at.left }}
          className="z-drawer min-w-40 rounded-lg border border-line bg-raised p-1 shadow-overlay"
          onKeyDown={(event) => {
            const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            const index = entries.indexOf(document.activeElement as HTMLElement);
            if (event.key === "Escape") {
              setAt(null);
              button.current?.focus();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              entries[(index + 1) % entries.length]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              entries[(index - 1 + entries.length) % entries.length]?.focus();
            }
          }}
        >
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" tabIndex={-1} onClick={() => choose(item.action)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-label hover:bg-surface-muted focus:bg-surface-muted focus:outline-none ${item.danger ? "text-danger-600" : "text-ink"}`}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
