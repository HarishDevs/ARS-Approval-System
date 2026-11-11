"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";
import { RichText } from "@/features/work/RichText";

// v1.52.1 (owner: "activity of the task shown separately", Asana's task
// page): Comments and All activity are two tabs over one card.
// v1.52.2 (owner: "shown like Asana activity"): All activity reads like
// Asana: a round badge with the person's initials, "Name did this · when",
// comments in full with their formatting, completion with a green tick, and
// runs of small updates folded under "Show N previous updates".
export interface ActivityEntry {
  id: number;
  when: string; // ISO
  who: string | null;
  what: string;
  detail: string | null;
  kind?: "comment" | "done" | "created" | "update";
}

const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const indiaDay = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);

// "Today at 2:27 pm", "Yesterday at 3:41 pm", "28 Oct at 9:05 am".
function whenText(iso: string): string {
  const date = new Date(iso);
  const today = indiaDay(new Date());
  const yesterday = indiaDay(new Date(Date.now() - 86_400_000));
  const day = indiaDay(date);
  const time = TIME.format(date).toLowerCase();
  if (day === today) return `Today at ${time}`;
  if (day === yesterday) return `Yesterday at ${time}`;
  return `${DAY.format(date)} at ${time}`;
}

const initialsOf = (name: string | null) =>
  (name ?? "ARS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

type Row = { kind: "entry"; entry: ActivityEntry } | { kind: "fold"; key: string; entries: ActivityEntry[] };

// Three or more updates in a row: the earlier ones fold, the last one shows.
function fold(entries: ActivityEntry[]): Row[] {
  const rows: Row[] = [];
  let run: ActivityEntry[] = [];
  const close = () => {
    if (run.length >= 3) {
      rows.push({ kind: "fold", key: `fold-${run[0]!.id}`, entries: run.slice(0, -1) });
      rows.push({ kind: "entry", entry: run.at(-1)! });
    } else for (const entry of run) rows.push({ kind: "entry", entry });
    run = [];
  };
  for (const entry of entries) {
    if ((entry.kind ?? "update") === "update") run.push(entry);
    else {
      close();
      rows.push({ kind: "entry", entry });
    }
  }
  close();
  return rows;
}

function Badge({ entry }: { entry: ActivityEntry }) {
  if (entry.kind === "done")
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-success-solid text-on-solid" aria-hidden="true">
        <Check className="h-4 w-4" />
      </span>
    );
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700" aria-hidden="true">
      {initialsOf(entry.who)}
    </span>
  );
}

function Entry({ entry }: { entry: ActivityEntry }) {
  const kind = entry.kind ?? "update";
  const verb = entry.what.charAt(0).toLowerCase() + entry.what.slice(1);
  const time = (
    <span className="text-caption text-ink-muted" title={WHEN.format(new Date(entry.when))} suppressHydrationWarning>
      {" "}
      · {whenText(entry.when)}
    </span>
  );
  if (kind === "update")
    return (
      <p className="pl-10 text-caption text-ink-muted">
        <span className="font-semibold text-ink">{entry.who ?? "ARS"}</span> {verb}
        {entry.detail ? `: ${entry.detail}` : ""}
        {time}
      </p>
    );
  return (
    <div className="flex gap-3">
      <Badge entry={entry} />
      <div className="min-w-0 flex-1">
        <p className="text-label">
          <span className={`font-semibold ${kind === "done" ? "text-success-600" : ""}`}>{entry.who ?? "ARS"}</span> <span className={kind === "done" ? "text-success-600" : ""}>{kind === "comment" ? "commented" : kind === "created" ? "created this task" : verb}</span>
          {time}
        </p>
        {kind === "comment" && entry.detail && <RichText text={entry.detail} className="mt-1 text-body" />}
        {kind !== "comment" && entry.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-label text-ink-muted">{entry.detail}</p>}
      </div>
    </div>
  );
}

export function TaskActivity({ comments, commentCount, activity }: { comments: React.ReactNode; commentCount: number; activity: ActivityEntry[] }) {
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [oldest, setOldest] = useState(true);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const rows = useMemo(() => fold([...activity].sort((a, b) => (oldest ? 1 : -1) * (new Date(a.when).getTime() - new Date(b.when).getTime() || a.id - b.id))), [activity, oldest]);
  const tabClass = (on: boolean) => `rounded-md px-3 py-1.5 text-label font-medium ${on ? "bg-primary-50 text-primary-700" : "text-ink-muted hover:text-ink"}`;
  return (
    <div className="space-y-3" data-testid="task-activity">
      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-2" role="tablist" aria-label="Comments and activity">
        <button type="button" role="tab" aria-selected={tab === "comments"} className={tabClass(tab === "comments")} onClick={() => setTab("comments")}>
          Comments{commentCount > 0 ? ` (${commentCount})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "activity"} className={tabClass(tab === "activity")} onClick={() => setTab("activity")}>
          All activity
        </button>
        {tab === "activity" && (
          <button
            type="button"
            onClick={() => setOldest((value) => !value)}
            className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-label text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label={oldest ? "Oldest first: show newest first" : "Newest first: show oldest first"}
          >
            <ArrowUpDown aria-hidden="true" className="h-4 w-4" /> {oldest ? "Oldest" : "Newest"}
          </button>
        )}
      </div>
      <div role="tabpanel" hidden={tab !== "comments"}>
        {comments}
      </div>
      <div role="tabpanel" hidden={tab !== "activity"} className="card px-5 py-4">
        {rows.length === 0 ? (
          <p className="text-label text-ink-muted">Nothing yet.</p>
        ) : (
          <ol className="space-y-3" data-testid="record-history">
            {rows.map((row) =>
              row.kind === "entry" ? (
                <li key={row.entry.id}>
                  <Entry entry={row.entry} />
                </li>
              ) : opened.has(row.key) ? (
                row.entries.map((entry) => (
                  <li key={entry.id}>
                    <Entry entry={entry} />
                  </li>
                ))
              ) : (
                <li key={row.key} className="pl-10">
                  <button type="button" className="link text-label font-medium" onClick={() => setOpened((current) => new Set([...current, row.key]))}>
                    Show {row.entries.length} previous update{row.entries.length === 1 ? "" : "s"}
                  </button>
                </li>
              ),
            )}
          </ol>
        )}
        {tab === "activity" && (
          <button type="button" onClick={() => setTab("comments")} className="link mt-4 text-label">
            Add a comment
          </button>
        )}
      </div>
    </div>
  );
}
