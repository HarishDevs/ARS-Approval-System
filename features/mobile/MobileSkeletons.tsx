import { SkeletonBlock } from "@/features/ui/Spinner";
import { PageSkeleton } from "@/features/ui/Skeleton";

// v1.44.1 (owner): a skeleton for each phone screen, shaped like the screen
// itself (features/mobile/*, the request and task pages), so nothing jumps
// when the content arrives. loading.tsx files stay static: they render the
// phone and the computer skeleton side by side and globals.css shows the one
// that matches [data-layout]. Screen readers hear one "Loading…" line.

export type MobileScreen = "home" | "approvals" | "tasks" | "inbox" | "more" | "request" | "task" | "page";
type DesktopKind = "list" | "dashboard" | "table" | "detail" | "form";

export function ScreenLoading({ screen, desktop = "list", label = "Loading…" }: { screen: MobileScreen; desktop?: DesktopKind; label?: string }) {
  return (
    <>
      <div className="mob-skel" data-testid="mobile-skeleton" data-screen={screen}>
        <MobileSkeleton screen={screen} label={label} />
      </div>
      <div className="desk-skel">
        <PageSkeleton kind={desktop} label={label} />
      </div>
    </>
  );
}

export function MobileSkeleton({ screen, label = "Loading…" }: { screen: MobileScreen; label?: string }) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      {screen === "home" && <HomeSkeleton />}
      {screen === "approvals" && <ListScreen card={ApprovalCardSkeleton} />}
      {screen === "tasks" && <TasksSkeleton />}
      {screen === "inbox" && <InboxSkeleton />}
      {screen === "more" && <MoreSkeleton />}
      {screen === "request" && <RequestSkeleton />}
      {screen === "task" && <TaskSkeleton />}
      {screen === "page" && <PageScreenSkeleton />}
    </div>
  );
}

function Title() {
  return (
    <div className="-mx-4 flex items-center justify-between gap-3 border-b border-line px-4 pb-3">
      <SkeletonBlock className="h-7 w-36" />
      <SkeletonBlock className="h-6 w-8 rounded-full" />
    </div>
  );
}

// The floating Choose view pill (v1.45.0).
function Dock() {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex justify-center">
      <SkeletonBlock className="h-14 w-64 rounded-full" />
    </div>
  );
}

function SectionHead() {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <SkeletonBlock className="h-5 w-44" />
      <SkeletonBlock className="h-4 w-16" />
    </div>
  );
}

function ListScreen({ card: Card }: { card: () => React.ReactElement }) {
  return (
    <div className="space-y-4">
      <Title />
      <ul className="space-y-3">
        {[0, 1, 2, 3].map((index) => (
          <li key={index}>
            <Card />
          </li>
        ))}
      </ul>
      <Dock />
    </div>
  );
}

// My tasks: flat rows (circle, title and details, the date chip).
function TasksSkeleton() {
  return (
    <div>
      <Title />
      <div className="-mx-4 flex min-h-[52px] items-center gap-3 px-4">
        <SkeletonBlock className="h-4 w-4" />
        <SkeletonBlock className="h-5 w-40" />
      </div>
      <ul className="-mx-4">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <li key={index} className="flex items-center gap-3 pl-4">
            <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
            <div className="flex min-h-[72px] flex-1 items-center gap-3 border-b border-line pr-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-3 w-1/2" />
              </div>
              <SkeletonBlock className="h-7 w-16" />
            </div>
          </li>
        ))}
      </ul>
      <Dock />
    </div>
  );
}

function ApprovalCardSkeleton() {
  return (
    <div className="mob-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-5 w-4/5" />
        </div>
        <SkeletonBlock className="h-5 w-5 shrink-0" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-1.5">
            <SkeletonBlock className="h-2.5 w-16" />
            <SkeletonBlock className="h-3.5 w-24" />
          </div>
        ))}
      </div>
      <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
      <div className="mt-3 flex gap-2">
        <SkeletonBlock className="h-6 w-20 rounded-full" />
        <SkeletonBlock className="h-6 w-14 rounded-full" />
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2.5 rounded-2xl bg-[color:var(--m-navy)] p-4">
        <SkeletonBlock className="h-3.5 w-32 opacity-40" />
        <SkeletonBlock className="h-5 w-4/5 opacity-40" />
        <SkeletonBlock className="mt-1 h-11 w-44 rounded-full opacity-40" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="mob-card flex min-h-[92px] flex-col justify-between p-3">
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <SkeletonBlock className="h-6 w-10" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonBlock key={index} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <section>
        <SectionHead />
        <ApprovalCardSkeleton />
      </section>
      <section>
        <SectionHead />
        <RowsCard rows={3} />
      </section>
    </div>
  );
}

function RowsCard({ rows, icon = true }: { rows: number; icon?: boolean }) {
  return (
    <ul className="mob-card divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
          {icon && <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock className="h-4 w-3/5" />
            <SkeletonBlock className="h-3 w-2/5" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function InboxSkeleton() {
  return (
    <div>
      <Title />
      <div className="-mx-4">
        <div className="border-b border-line bg-surface-muted px-4 py-2">
          <SkeletonBlock className="h-4 w-14" />
        </div>
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2.5 border-b border-line px-4 py-4">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-7 w-24" />
              <SkeletonBlock className="ml-auto h-7 w-16" />
            </div>
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-11/12" />
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
        ))}
      </div>
      <Dock />
    </div>
  );
}

function MoreSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 pt-2">
        <SkeletonBlock className="h-24 w-24 rounded-full" />
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-24 rounded-[14px]" />
        <SkeletonBlock className="h-24 rounded-[14px]" />
      </div>
      {[4, 3].map((rows, index) => (
        <section key={index} className="-mx-4 border-t-8 border-[color:var(--m-bg)] px-4 pt-4">
          <SkeletonBlock className="mb-3 h-3 w-20" />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex min-h-[56px] items-center gap-4">
              <SkeletonBlock className="h-6 w-6 rounded-md" />
              <SkeletonBlock className="h-4 w-1/2" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// The request page: title, the approval journey (road and van), then the
// details and levels cards.
function RequestSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-7 w-4/5" />
        <SkeletonBlock className="h-6 w-24 rounded-full" />
      </div>
      <JourneySkeleton />
      <DetailCard rows={4} />
      <RowsCard rows={3} />
    </div>
  );
}

function JourneySkeleton() {
  return (
    <div className="mob-card space-y-3 p-4" data-testid="journey-skeleton">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="h-6 w-14 rounded-full" />
      </div>
      <div className="relative h-16 overflow-hidden rounded-lg bg-surface-muted">
        <div className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 bg-[#1f2937] opacity-60" />
        <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="h-3 w-3 rounded-full bg-surface opacity-80" />
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        {[0, 1, 2].map((index) => (
          <SkeletonBlock key={index} className="h-3 w-16" />
        ))}
      </div>
    </div>
  );
}

function DetailCard({ rows }: { rows: number }) {
  return (
    <div className="mob-card space-y-3 p-4">
      <SkeletonBlock className="h-4 w-28" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-1.5">
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

function TaskSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-7 w-3/4" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-6 w-20 rounded-full" />
          <SkeletonBlock className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <DetailCard rows={4} />
      <div className="mob-card space-y-2 p-4">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
  );
}

// Any other users page on a phone: a title and a list.
function PageScreenSkeleton() {
  return (
    <div className="space-y-4">
      <Title />
      <SkeletonBlock className="h-11 w-full rounded-xl" />
      <RowsCard rows={6} />
    </div>
  );
}
