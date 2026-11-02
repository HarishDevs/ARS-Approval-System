import { Ban, CalendarClock, CheckCircle2, Clock, Hourglass, Layers, MessageSquareWarning, PauseCircle, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";
import { SafeText } from "@/features/ui/SafeText";
import { StepMap } from "@/features/requests/StepMap";
import { bannerKind, indiaDateTime, timeInProcess, type BannerKind, type ProcessFigures } from "@/features/requests/request-page";
import type { MapStage, TrackerSummary } from "@/server/approvals/step-map";

// v1.49 (owner's layout, 2 Nov 2026): the "Approval levels" card. A banner
// saying where the request is ("Waiting for … to decide", "At …"), the
// figures as tiles (progress ring, completed, remaining, time in process,
// last update), then every level (StepMap). Words and numbers always sit
// beside colour, never colour alone.
const BANNER: Record<BannerKind, { icon: LucideIcon; box: string; icon_: string }> = {
  waiting: { icon: Clock, box: "border-primary-600 bg-primary-50", icon_: "text-primary-600" },
  progress: { icon: Clock, box: "border-line bg-surface-muted", icon_: "text-ink-muted" },
  stuck: { icon: ShieldAlert, box: "border-warning-600 bg-warning-50", icon_: "text-warning-600" },
  hold: { icon: PauseCircle, box: "border-warning-600 bg-warning-50", icon_: "text-warning-600" },
  returned: { icon: MessageSquareWarning, box: "border-warning-600 bg-warning-50", icon_: "text-warning-600" },
  approved: { icon: CheckCircle2, box: "border-success-600 bg-success-50", icon_: "text-success-600" },
  rejected: { icon: XCircle, box: "border-danger-200 bg-danger-50", icon_: "text-danger-600" },
  withdrawn: { icon: Ban, box: "border-line bg-surface-muted", icon_: "text-ink-muted" },
};

function ProgressRing({ percent, done, total }: { percent: number; done: number; total: number }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90" role="progressbar" aria-label="Levels done" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${percent}%`}>
      <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4" stroke="currentColor" className="text-line" />
      <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="4" stroke="currentColor" strokeLinecap="round" className="text-success-600" strokeDasharray={`${(percent / 100) * length} ${length}`} />
    </svg>
  );
}

// dl > div > (dt, dd) only (axe definition-list): the icon sits inside the
// dt, placed at the tile's left edge.
function Tile({ icon: Icon, graphic, label, children, wide = false, valueClass = "" }: { icon?: LucideIcon; graphic?: React.ReactNode; label: string; children: React.ReactNode; wide?: boolean; valueClass?: string }) {
  return (
    <div className={`request-tile relative min-w-0 rounded-md border border-line bg-surface py-2.5 pr-3 ${graphic ? "pl-[3.75rem]" : "pl-10"} ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dt className="text-caption text-ink-muted">
        {graphic ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2">{graphic}</span>
        ) : (
          Icon && <Icon aria-hidden="true" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
        )}
        {label}
      </dt>
      <dd className={`font-semibold tabular-nums ${valueClass}`}>{children}</dd>
    </div>
  );
}

export function ApprovalLevels({ status, tracker, stages, figures, now = Date.now() }: { status: string; tracker: TrackerSummary; stages: MapStage[]; figures: ProcessFigures; now?: number }) {
  const kind = bannerKind(status, tracker.tone);
  const banner = BANNER[kind];
  const BannerIcon = banner.icon;
  return (
    <section className="card px-5 py-4" aria-labelledby="levels" data-testid="approval-levels">
      <h2 id="levels" className="mb-3 flex items-center gap-2 font-semibold">
        <Layers aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-600" />
        Approval levels
      </h2>
      <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 ${banner.box}`} data-testid="levels-banner" data-kind={kind}>
        <BannerIcon aria-hidden="true" className={`h-6 w-6 shrink-0 ${banner.icon_}`} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold">
            <span className="sr-only">Now: </span>
            <SafeText text={tracker.headline} />
          </p>
          {tracker.detail && (
            <p className="text-label text-ink-muted">
              <SafeText text={tracker.detail} />
            </p>
          )}
        </div>
        {tracker.total > 0 && (
          <span className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 text-caption font-semibold text-ink-muted tabular-nums">
            {tracker.done} of {tracker.total} steps done
          </span>
        )}
      </div>
      {/* The figures (the journey's road counts levels when it loaded). */}
      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-5" data-testid="road-summary">
        <Tile graphic={<ProgressRing percent={figures.percent} done={figures.done} total={figures.total} />} label="Progress" valueClass="text-success-600">
          {figures.percent}%
        </Tile>
        <Tile icon={CheckCircle2} label="Completed">
          {figures.done} of {figures.total}
        </Tile>
        <Tile icon={Hourglass} label="Remaining">
          {figures.remaining ?? "—"}
        </Tile>
        <Tile icon={Clock} label="Time in process">
          {timeInProcess(figures.startIso, figures.endIso, now) ?? "—"}
        </Tile>
        <Tile icon={CalendarClock} label="Last update" wide>
          {indiaDateTime(figures.lastUpdateIso) ?? "—"}
        </Tile>
      </dl>
      <StepMap stages={stages} />
    </section>
  );
}
