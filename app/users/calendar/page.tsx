import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { RequestStatusPill } from "@/features/requests/StatusPill";
import { loadNeededBy } from "@/server/approvals/calendar";
import { monthGrid, parseMonth, shiftMonth } from "@/server/approvals/calendar-rules";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A2: needed-by calendar. Requests whose type has a "needed by" date field,
// by that date. "Mine" = raised by me or waiting on me; "All I can see"
// follows the same visibility rule as search (D-057).
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; show?: string }> }) {
  const { user } = await requireArea("users");
  const params = await searchParams;
  const month = parseMonth(params.month);
  const mine = params.show !== "all";
  const items = await loadNeededBy({ id: user.id, roles: user.roles }, month, { mine });
  const byDay = new Map<string, typeof items>();
  for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const title = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = parseMonth(undefined) === month ? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) : null;
  const href = (next: { month?: string; show?: string }) => {
    const query = new URLSearchParams({ month: next.month ?? month });
    if ((next.show ?? (mine ? "mine" : "all")) === "all") query.set("show", "all");
    return `/users/calendar?${query.toString()}`;
  };
  const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Needed-by calendar" description="Open and approved requests by the date they're needed. Only approval types with a “needed by” date field appear here." />
      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <Link href={href({ month: shiftMonth(month, -1) })} className="btn-secondary btn-compact" aria-label="Previous month">
          ←
        </Link>
        <h2 className="min-w-40 text-center text-body font-semibold" aria-live="polite">
          {title}
        </h2>
        <Link href={href({ month: shiftMonth(month, 1) })} className="btn-secondary btn-compact" aria-label="Next month">
          →
        </Link>
        <nav aria-label="Which requests" className="flex gap-2 sm:ml-auto">
          <Link href={href({ show: "mine" })} aria-current={mine ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${mine ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
            Mine and waiting on me
          </Link>
          <Link href={href({ show: "all" })} aria-current={!mine ? "page" : undefined} className={`rounded-md px-3 py-1.5 text-label ${!mine ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-muted hover:bg-surface-muted"}`}>
            All I can see
          </Link>
        </nav>
      </div>

      <div className="card mb-6 hidden overflow-hidden md:block">
        <table className="w-full table-fixed border-collapse text-caption" aria-label={`Requests needed in ${title}`}>
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
            {monthGrid(month).map((week, index) => (
              <tr key={index}>
                {week.map((date, cell) => (
                  <td key={cell} className={`h-24 border-b border-r border-line p-1.5 align-top last:border-r-0 ${date ? "" : "bg-surface-muted"}`}>
                    {date && (
                      <>
                        <span className={`inline-block rounded px-1 ${date === today ? "bg-primary-solid font-semibold text-on-solid" : "text-ink-muted"}`}>{Number(date.slice(8))}</span>
                        <ul className="mt-1 space-y-1">
                          {(byDay.get(date) ?? []).slice(0, 3).map((item) => (
                            <li key={item.id}>
                              <Link href={`/users/requests/${item.id}`} className="block truncate rounded bg-primary-50 px-1.5 py-0.5 text-primary-700 hover:underline" title={`${item.requestNo} · ${item.title}`}>
                                {item.requestNo}
                              </Link>
                            </li>
                          ))}
                          {(byDay.get(date)?.length ?? 0) > 3 && <li className="px-1.5 text-ink-muted">+{(byDay.get(date)?.length ?? 0) - 3} more</li>}
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

      <h2 className="mb-2 text-body font-semibold">In {title}</h2>
      {items.length === 0 ? (
        <p className="card px-4 py-6 text-label text-ink-muted" role="status">
          Nothing is needed this month.
        </p>
      ) : (
        <ul className="card divide-y divide-line" data-testid="needed-by-list">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="w-28 shrink-0 text-label font-semibold">{dayLabel(item.date)}</span>
              <Link href={`/users/requests/${item.id}`} className="link min-w-0 flex-1 truncate text-label">
                {item.requestNo} · {item.title}
              </Link>
              <span className="text-caption text-ink-muted">
                {item.workflowName} · {item.requesterName}
              </span>
              <RequestStatusPill status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
