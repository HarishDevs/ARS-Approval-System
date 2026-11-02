import type { Metadata } from "next";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { TaskCheck } from "@/features/work/client";
import { calendarKindAllowed } from "@/server/modules/modules";
import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Hint } from "@/features/ui/Hint";
import { EntryForm } from "@/features/calendar/EntryForm";
import { loadEntries, type CalendarEntry } from "@/server/calendar/entries";
import { indiaToday, KIND_LABEL, KINDS, parseView, periodTitle, viewHref, type CalendarView, type Kind } from "@/server/calendar/views";
import { availability } from "@/server/calendar/service";
import { connectionByUser } from "@/lib/db/repositories/gcal.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Kinds are told apart by their label as well as their colour.
// v1.46.0: the Show dropdown's colour dot per kind (solid, readable in both themes).
const KIND_DOT: Record<Kind, string> = { approval: "bg-primary-solid", task: "bg-warning-solid", info: "bg-success-solid", needed: "bg-ink-muted", personal: "bg-info-600" };
const KIND_STYLE: Record<Kind, string> = {
  approval: "bg-primary-50 text-primary-700",
  task: "bg-warning-50 text-warning-600",
  info: "bg-success-50 text-success-600",
  needed: "bg-surface-muted text-ink",
  personal: "bg-info-50 text-info-600",
};
// D-259 (owner's Calendar reference): a coloured stripe per kind, beside its label.
const KIND_ACCENT: Record<Kind, string> = {
  approval: "border-l-primary-600",
  task: "border-l-warning-600",
  info: "border-l-success-600",
  needed: "border-l-line-strong",
  personal: "border-l-info-600",
};
const SYNC_TEXT = { synced: "Synced with Google", pending: "Waiting to sync", error: "Sync problem", conflict: "Conflict to review" } as const;

// A2 + v1.11.0 (D-155): the calendar. Approvals waiting on me, my tasks,
// information on the calendar, needed-by dates and my personal entries, by
// month, week or day. With Google Calendar connected, each entry shows
// whether it is synced, and entries from Google are marked.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const parsed = parseView(query);
  // D-259: Agenda = the period as a list, on every screen size.
  const agenda = query.layout === "agenda";
  // D-168: only the kinds of entry the person's modules cover.
  const allowedKinds = KINDS.filter((kind) => calendarKindAllowed(user, kind));
  const state = { ...parsed, kinds: parsed.kinds.filter((kind) => allowedKinds.includes(kind)) };
  const [{ active }, connection] = await Promise.all([availability(), connectionByUser(user.id)]);
  const connected = active && connection?.status === "ACTIVE";
  const entries = await loadEntries({ id: user.id, roles: user.roles }, state, connected);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  const today = indiaToday();
  const title = periodTitle(state);
  const unit = state.view === "month" ? "month" : state.view === "week" ? "week" : "day";
  const href = (change: Parameters<typeof viewHref>[1]) => viewHref(state, change, state.anchor);
  const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const countOf = (kind: Kind) => entries.filter((entry) => entry.kind === kind).length;
  const toggle = (kind: Kind) => (state.kinds.includes(kind) ? state.kinds.filter((item) => item !== kind) : [...state.kinds, kind]);

  const shownKinds = allowedKinds.filter((kind) => state.kinds.includes(kind)).map((kind) => KIND_LABEL[kind]);
  const shownLabel = shownKinds.length === 0 ? "nothing" : shownKinds.length === allowedKinds.length ? "everything" : shownKinds.length <= 2 ? shownKinds.join(", ") : `${shownKinds.slice(0, 2).join(", ")} +${shownKinds.length - 2}`;
  return (
    <>
      <PageHeader title="Calendar" icon={CalendarDays} description="Your approvals, tasks, information and needed-by dates, and your own entries, in one place." />

      <div className="card mb-3 flex flex-wrap items-center gap-2 px-4 py-3">
        <Link href={href({ date: state.prev })} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface-muted" aria-label={`Previous ${unit}`}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </Link>
        <h2 className="min-w-0 px-1 text-center text-body font-semibold sm:min-w-40 sm:text-title" aria-live="polite">
          {title}
        </h2>
        <Link href={href({ date: state.next })} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface-muted" aria-label={`Next ${unit}`}>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link href={href({ date: today })} className="btn-secondary btn-compact">
          Today
        </Link>
        <nav aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-line sm:ml-auto">
          {(["month", "week", "day"] as CalendarView[]).map((view) => (
            <Link
              key={view}
              href={href({ view })}
              aria-current={state.view === view && !agenda ? "page" : undefined}
              className={`border-l border-line px-3 py-1.5 text-label capitalize first:border-l-0 ${state.view === view && !agenda ? "bg-primary-solid font-semibold text-on-solid" : "text-ink-muted hover:bg-surface-muted"}`}
            >
              {view}
            </Link>
          ))}
          <Link
            href={`${href({})}${href({}).includes("?") ? "&" : "?"}layout=agenda`}
            aria-current={agenda ? "page" : undefined}
            className={`border-l border-line px-3 py-1.5 text-label ${agenda ? "bg-primary-solid font-semibold text-on-solid" : "text-ink-muted hover:bg-surface-muted"}`}
          >
            Agenda
          </Link>
        </nav>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-label">
        {/* v1.46.0 (owner): "Show" is one dropdown: what is shown, ticked, with counts; choosing one shows or hides it. */}
        <details className="mob-section relative" data-testid="calendar-show">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-4 font-semibold">
            Show: {shownLabel}
            <span aria-hidden="true" className="mob-caret text-ink-muted">
              ▾
            </span>
          </summary>
          <ul className="absolute left-0 top-full z-header mt-1 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-overlay" aria-label="Show on the calendar">
            {allowedKinds.map((kind) => {
              const on = state.kinds.includes(kind);
              return (
                <li key={kind}>
                  <Link href={href({ kinds: toggle(kind) })} data-on={on ? "1" : "0"} className="flex min-h-11 items-center gap-3 px-3 hover:bg-surface-muted">
                    <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded border ${on ? "border-transparent bg-primary-solid text-on-solid" : "border-line-strong"}`}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${KIND_DOT[kind]}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      {KIND_LABEL[kind]}
                      <span className="sr-only">{on ? " (shown; select to hide)" : " (hidden; select to show)"}</span>
                    </span>
                    {on && <span className="rounded-full bg-surface-muted px-1.5 text-caption tabular-nums">{countOf(kind)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
        {state.kinds.includes("needed") && (
          <nav aria-label="Which requests" className="flex gap-1 sm:ml-auto">
            <Link href={href({ showAll: false })} aria-current={!state.showAll ? "page" : undefined} className={`rounded-md px-3 py-1 ${!state.showAll ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
              Mine and waiting on me
            </Link>
            <Link href={href({ showAll: true })} aria-current={state.showAll ? "page" : undefined} className={`rounded-md px-3 py-1 ${state.showAll ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
              All I can see
            </Link>
          </nav>
        )}
      </div>

      <p className="mb-4 text-caption text-ink-muted" data-testid="calendar-sync-status">
        {connected ? (
          <>
            Synced with Google Calendar ({connection!.calendarName ?? "primary"}) · last sync {connection!.lastSyncAt ? formatIndiaTime(connection!.lastSyncAt) : "pending"} ·{" "}
            <Link href="/users/profile/calendar" className="link">
              Sync now or review conflicts
            </Link>
          </>
        ) : active ? (
          <Link href="/users/profile/calendar" className="link">
            Connect your Google Calendar
          </Link>
        ) : (
          "Google Calendar sync isn't switched on."
        )}
      </p>

      {state.view === "month" && state.grid && !agenda && (
        <div className="card mb-6 hidden overflow-hidden md:block">
          <table className="w-full table-fixed border-collapse text-caption" aria-label={`Calendar for ${title}`}>
            <thead>
              <tr>
                {WEEKDAYS.map((day) => (
                  <th key={day} scope="col" className="border-b border-line px-2 py-2 text-left font-semibold text-ink-muted">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.grid.map((week, index) => (
                <tr key={index}>
                  {week.map((date, cell) => (
                    <td key={cell} className={`h-28 border-b border-r border-line p-1.5 align-top last:border-r-0 ${date ? (cell >= 5 ? "bg-surface-muted" : "") : "bg-page"}`}>
                      {date && (
                        <>
                          <Link
                            href={href({ view: "day", date })}
                            className={`grid h-7 w-7 place-items-center rounded-full text-label ${date === today ? "bg-primary-solid font-semibold text-on-solid" : "text-ink-muted hover:bg-surface-muted"}`}
                            aria-label={`${dayLabel(date)}: open the day`}
                          >
                            {Number(date.slice(8))}
                          </Link>
                          <ul className="mt-1 space-y-1">
                            {(byDay.get(date) ?? []).slice(0, 3).map((entry) => (
                              <li key={entry.key}>
                                <Chip entry={entry} />
                              </li>
                            ))}
                            {(byDay.get(date)?.length ?? 0) > 3 && (
                              <li>
                                <Link href={href({ view: "day", date })} className="px-1.5 text-ink-muted hover:underline">
                                  +{(byDay.get(date)?.length ?? 0) - 3} more
                                </Link>
                              </li>
                            )}
                          </ul>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {state.view === "week" && !agenda && (
        <div className="mb-6 hidden grid-cols-7 gap-2 md:grid" aria-label={`Week of ${title}`}>
          {state.days.map((day) => (
            <section key={day} className="card min-w-0 p-2" aria-label={dayLabel(day)}>
              <h3 className={`mb-2 text-caption font-semibold ${day === today ? "text-primary-700" : "text-ink-muted"}`}>
                <Link href={href({ view: "day", date: day })} className="hover:underline">
                  {dayLabel(day)}
                </Link>
              </h3>
              <ul className="space-y-1 text-caption">
                {(byDay.get(day) ?? []).map((entry) => (
                  <li key={entry.key}>
                    <Chip entry={entry} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-body font-semibold">{state.view === "day" ? "On this day" : `In ${title}`}</h2>
      {entries.length === 0 ? (
        <p className="card mb-6 px-4 py-6 text-label text-ink-muted" role="status">
          Nothing on the calendar for this {unit}.
        </p>
      ) : (
        <ul className={`card mb-6 divide-y divide-line ${state.view === "day" || agenda ? "" : "md:hidden"}`} data-testid="calendar-list">
          {entries.map((entry) => (
            <li key={entry.key} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-l-4 px-4 py-3 ${KIND_ACCENT[entry.kind]}`}>
              <span className="w-28 shrink-0 text-label font-semibold">
                {state.view === "day" ? (entry.time ?? "All day") : dayLabel(entry.day)}
                {state.view !== "day" && entry.time && <span className="block text-caption font-normal text-ink-muted">{entry.time}</span>}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-caption font-semibold ${KIND_STYLE[entry.kind]}`}>{KIND_LABEL[entry.kind]}</span>
              {/* D-219: your tasks tick off here too. */}
              {entry.kind === "task" && /^TASK:\d+$/.test(entry.key) && <TaskCheck taskId={Number(entry.key.slice(5))} done={false} label={entry.title} />}
              <Link href={entry.href} className="link min-w-0 flex-1 truncate text-label">
                {entry.ref ? `${entry.ref} · ` : ""}
                {entry.title}
              </Link>
              <Marks entry={entry} />
            </li>
          ))}
        </ul>
      )}

      <details className="card max-w-2xl p-4">
        <summary className="cursor-pointer text-body font-semibold">
          Add a personal entry <Hint text={`Only you see your entries${connected ? "; they also appear in your Google Calendar" : ""}.`} align="start" />
        </summary>
        <div className="mt-3">
          <EntryForm values={{ title: "", notes: "", allDay: false, date: state.view === "day" ? state.anchor : today, endDate: "", start: "09:00", end: "09:30" }} submitLabel="Add entry" />
        </div>
      </details>
    </>
  );
}

function Chip({ entry }: { entry: CalendarEntry }) {
  return (
    <Link href={entry.href} className={`block truncate rounded border-l-[3px] px-1.5 py-0.5 hover:underline ${KIND_STYLE[entry.kind]} ${KIND_ACCENT[entry.kind]}`} title={`${KIND_LABEL[entry.kind]}: ${entry.ref ? `${entry.ref} · ` : ""}${entry.title}`}>
      {entry.time && <span className="tabular-nums">{entry.time} </span>}
      {entry.ref ?? entry.title}
      {entry.source === "GOOGLE" && <span className="sr-only"> (from Google Calendar)</span>}
    </Link>
  );
}

function Marks({ entry }: { entry: CalendarEntry }) {
  return (
    <span className="flex flex-wrap gap-2 text-caption text-ink-muted">
      {entry.source === "GOOGLE" && <span>From Google</span>}
      {entry.recurring && <span>Repeats (see Google)</span>}
      {entry.sync && <span className={entry.sync === "error" || entry.sync === "conflict" ? "text-danger-600" : ""}>{SYNC_TEXT[entry.sync]}</span>}
    </span>
  );
}
