"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { followAction, tagAction } from "@/app/users/work/actions";
import { useWorkCall } from "@/features/work/client";
import { initials } from "@/features/ui/Display";

// D-260 (owner: "in project and task tables only task is typable"): the
// table's Collaborators and Tags cells open a small editor in place. The
// panel is placed on the page (the table scrolls inside its own box, which
// would clip it). The same actions, and the same permission checks on the
// server, as the task pane.

function useCellPanel() {
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Where the panel goes: under the cell, or above it near the bottom of the window.
  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return null;
    const width = 288;
    return { top: rect.bottom + 260 > window.innerHeight ? Math.max(8, rect.top - 264) : rect.bottom + 4, left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8) };
  };
  const open = () => setSpot(place());
  const close = () => setSpot(null);
  useEffect(() => {
    if (!spot) return;
    panel.current?.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true });
    const outside = (event: MouseEvent) => !panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node) && setSpot(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSpot(null);
        button.current?.focus();
      }
    };
    // Scrolling moves the panel with its cell; it closes only once the cell has left the window.
    const away = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      const rect = button.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setSpot(null);
      else setSpot(place());
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", away, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(spot)]);
  return { spot, button, panel, open, close };
}

const panelClass = "fixed z-[var(--z-drawer)] w-72 rounded-lg border border-line bg-raised p-3 text-ink shadow-overlay";

export function CollaboratorsCell({ taskId, title, followers, people, canEdit }: { taskId: number; title: string; followers: { id: number; name: string }[]; people: { id: number; label: string }[]; canEdit: boolean }) {
  const { call, pending } = useWorkCall();
  const { spot, button, panel, open, close } = useCellPanel();
  const [adding, setAdding] = useState("");
  const avatars = (
    <span className="flex -space-x-1.5">
      {followers.slice(0, 4).map((person) => (
        <span key={person.id} title={person.name} className="grid h-6 w-6 place-items-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700 ring-2 ring-surface">
          {initials(person.name)}
        </span>
      ))}
      {followers.length > 4 && <span className="ml-2 text-caption text-ink-muted">+{followers.length - 4}</span>}
      {followers.length === 0 && canEdit && <Plus aria-hidden="true" className="h-4 w-4 text-ink-faint" />}
    </span>
  );
  if (!canEdit) return avatars;
  const choices = people.filter((person) => !followers.some((follower) => follower.id === person.id));
  return (
    <>
      <button ref={button} type="button" onClick={() => (spot ? close() : open())} aria-expanded={Boolean(spot)} aria-label={`Collaborators of ${title}: ${followers.length ? followers.map((person) => person.name).join(", ") : "none"}. Change`} className="flex min-h-8 w-full items-center rounded px-1 hover:bg-surface-muted" data-testid="cell-collaborators">
        {avatars}
      </button>
      {spot && (
        <div ref={panel} role="dialog" aria-label={`Collaborators of ${title}`} className={panelClass} style={{ top: spot.top, left: spot.left }}>
          <p className="mb-2 text-label font-semibold">Collaborators</p>
          {followers.length === 0 ? (
            <p className="mb-2 text-caption text-ink-muted">Nobody follows this task yet.</p>
          ) : (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {followers.map((person) => (
                <li key={person.id} className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pl-2 pr-1 text-label">
                  {person.name}
                  <button type="button" disabled={pending} aria-label={`Remove ${person.name}`} onClick={() => void call(() => followAction(taskId, person.id, false), { success: false })} className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-danger-600">
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="block text-caption text-ink-muted">
            Add someone
            <select
              value={adding}
              disabled={pending}
              onChange={(event) => {
                const id = Number(event.target.value);
                setAdding("");
                if (id) void call(() => followAction(taskId, id, true), { success: false });
              }}
              className="field-input mt-1 h-9 w-full text-label"
            >
              <option value="">Choose a person…</option>
              {choices.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </>
  );
}

export function TagsCell({ taskId, title, tags, canEdit }: { taskId: number; title: string; tags: { name: string }[]; canEdit: boolean }) {
  const { call, pending } = useWorkCall();
  const { spot, button, panel, open, close } = useCellPanel();
  const [text, setText] = useState("");
  const shown = <span className="truncate text-caption text-ink-muted">{tags.length ? tags.map((tag) => `#${tag.name}`).join(" ") : canEdit ? <Plus aria-hidden="true" className="h-4 w-4 text-ink-faint" /> : ""}</span>;
  if (!canEdit) return shown;
  const add = () => {
    const name = text.trim().replace(/^#/, "");
    if (!name) return;
    setText("");
    void call(() => tagAction(taskId, name, true), { success: false });
  };
  return (
    <>
      <button ref={button} type="button" onClick={() => (spot ? close() : open())} aria-expanded={Boolean(spot)} aria-label={`Tags of ${title}: ${tags.length ? tags.map((tag) => tag.name).join(", ") : "none"}. Change`} className="flex min-h-8 w-full min-w-0 items-center rounded px-1 text-left hover:bg-surface-muted" data-testid="cell-tags">
        {shown}
      </button>
      {spot && (
        <div ref={panel} role="dialog" aria-label={`Tags of ${title}`} className={panelClass} style={{ top: spot.top, left: spot.left }}>
          <p className="mb-2 text-label font-semibold">Tags</p>
          {tags.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag.name} className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pl-2 pr-1 text-label">
                  #{tag.name}
                  <button type="button" disabled={pending} aria-label={`Remove tag ${tag.name}`} onClick={() => void call(() => tagAction(taskId, tag.name, false), { success: false })} className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:text-danger-600">
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={`tag-${taskId}`} className="sr-only">
              New tag
            </label>
            <input id={`tag-${taskId}`} value={text} maxLength={40} onChange={(event) => setText(event.target.value)} placeholder="New tag" className="field-input h-9 min-w-0 flex-1 text-label" />
            <button type="submit" disabled={pending || !text.trim()} className="btn-secondary btn-compact">
              Add
            </button>
          </form>
        </div>
      )}
    </>
  );
}
