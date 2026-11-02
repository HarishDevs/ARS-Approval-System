import { History } from "lucide-react";
import { SafeText } from "@/features/ui/SafeText";
import { TIMELINE_ICON } from "@/features/requests/Timeline";
import { TimelineShowMore } from "@/features/requests/TimelineShowMore";
import { indiaDateTime, splitTimeline } from "@/features/requests/request-page";
import { relativeTime, type TimelineKind } from "@/server/approvals/timeline";

// v1.49 (owner's layout, 2 Nov 2026): the request's history in the bottom
// row: the latest 3 events, newest first; "Show more" opens the rest in a
// scrolling box. Each event: an icon for its kind, the sentence, the time.
type Entry = { id: number; at: Date; text: string; kind: TimelineKind };

function Event({ entry, now }: { entry: Entry; now: Date }) {
  const { icon: Icon, tone } = TIMELINE_ICON[entry.kind] ?? TIMELINE_ICON.info;
  const exact = indiaDateTime(entry.at, true) ?? "";
  return (
    <li className="flex gap-3 text-label" data-kind={entry.kind}>
      <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words">
          <SafeText text={entry.text} />
        </p>
        <p className="text-caption text-ink-muted">
          <time dateTime={entry.at.toISOString()} title={exact}>
            {exact}
          </time>
          <span aria-hidden="true"> · {relativeTime(entry.at, now)}</span>
        </p>
      </div>
    </li>
  );
}

export function RequestTimeline({ entries, now = new Date() }: { entries: Entry[]; now?: Date }) {
  const { shown, rest } = splitTimeline(entries);
  return (
    <section className="card h-full px-5 py-4" aria-labelledby="history">
      <h2 id="history" className="mb-3 flex items-center gap-2 font-semibold">
        <History aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
        Timeline
      </h2>
      {shown.length === 0 ? (
        <p className="text-label text-ink-muted">Nothing yet.</p>
      ) : (
        <TimelineShowMore shown={shown.map((entry) => <Event key={entry.id} entry={entry} now={now} />)} rest={rest.map((entry) => <Event key={entry.id} entry={entry} now={now} />)} />
      )}
    </section>
  );
}
