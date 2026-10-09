import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  CircleDot,
  FileUp,
  Flag,
  MessageSquareWarning,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  SkipForward,
  UserPlus,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SafeText } from "@/features/ui/SafeText";
import { formatIndiaTime } from "@/server/notifications/security-messages";
import { indiaDay, relativeTime, type TimelineKind } from "@/server/approvals/timeline";

// RD-01 the request's history: only stored events, grouped by India day,
// each with an icon, the sentence, how long ago, and the exact time.
const ICON: Record<TimelineKind, { icon: LucideIcon; tone: string }> = {
  submit: { icon: Send, tone: "text-primary-600" },
  file: { icon: FileUp, tone: "text-ink-muted" },
  assign: { icon: UserPlus, tone: "text-ink-muted" },
  approve: { icon: CheckCircle2, tone: "text-success-600" },
  reject: { icon: XCircle, tone: "text-danger-600" },
  changes: { icon: MessageSquareWarning, tone: "text-warning-600" },
  step: { icon: CircleDot, tone: "text-success-600" },
  skip: { icon: SkipForward, tone: "text-ink-faint" },
  block: { icon: ShieldAlert, tone: "text-danger-600" },
  hold: { icon: PauseCircle, tone: "text-warning-600" },
  resume: { icon: PlayCircle, tone: "text-primary-600" },
  resubmit: { icon: RotateCcw, tone: "text-primary-600" },
  handover: { icon: ArrowRightLeft, tone: "text-ink-muted" },
  withdraw: { icon: Ban, tone: "text-ink-muted" },
  done: { icon: Flag, tone: "text-success-600" },
  info: { icon: CircleDot, tone: "text-ink-faint" },
  admin: { icon: Wrench, tone: "text-ink-muted" },
};

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export function Timeline({ entries, now = new Date() }: { entries: { id: number; at: Date; text: string; kind: TimelineKind }[]; now?: Date }) {
  const days: { day: string; label: string; items: typeof entries }[] = [];
  for (const entry of entries) {
    const day = indiaDay(entry.at);
    const last = days.at(-1);
    if (last && last.day === day) last.items.push(entry);
    else days.push({ day, label: DAY.format(entry.at), items: [entry] });
  }
  return (
    <div className="space-y-4">
      {days.map((group) => (
        <section key={group.day} aria-label={group.label}>
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wider text-ink-faint">{group.label}</h3>
          <ol className="space-y-3 border-l border-line pl-4">
            {group.items.map((entry) => {
              const { icon: Icon, tone } = ICON[entry.kind];
              return (
                <li key={entry.id} className="relative text-label">
                  <span aria-hidden="true" className={`absolute -left-[25px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface ${tone}`}>
                    <Icon className="h-[15px] w-[15px]" />
                  </span>
                  <p>
                    <SafeText text={entry.text} />
                  </p>
                  <p className="text-caption text-ink-faint">
                    <time dateTime={entry.at.toISOString()} title={formatIndiaTime(entry.at)}>
                      {relativeTime(entry.at, now)}
                    </time>
                    <span className="sr-only">, {formatIndiaTime(entry.at)}</span>
                    <span aria-hidden="true"> · {formatIndiaTime(entry.at).split(", ").at(-1)}</span>
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
