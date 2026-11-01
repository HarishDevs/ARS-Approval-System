import { SkeletonBlock } from "@/features/ui/Spinner";

// FB-01 loading skeletons that match each page's layout, so nothing jumps
// when the content arrives. Screen readers hear one "Loading…" line.
export { SkeletonBlock };

function Announce({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

export function HeaderSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonBlock className="h-4 w-80 max-w-[70vw]" />
      </div>
      {actions && <SkeletonBlock className="h-9 w-32" />}
    </div>
  );
}

export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card flex items-center gap-3 p-4">
          <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="card">
      {title && (
        <div className="border-b border-line px-5 py-4">
          <SkeletonBlock className="h-5 w-40" />
        </div>
      )}
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex items-center gap-4 px-5 py-4">
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
            <SkeletonBlock className="hidden h-6 w-20 sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-4 border-b border-line px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonBlock key={index} className="h-3 w-2/3" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid gap-4 border-b border-line px-4 py-3.5 last:border-b-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, index) => (
            <SkeletonBlock key={index} className={`h-4 ${index === 0 ? "w-4/5" : "w-1/2"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Bars rising from a baseline, while a chart's numbers load (Analytics).
export function ChartSkeleton({ bars = 7 }: { bars?: number }) {
  return (
    <div className="card p-5" data-testid="chart-skeleton">
      <SkeletonBlock className="mb-4 h-4 w-40" />
      <div className="flex h-40 items-end gap-3 border-b border-line">
        {Array.from({ length: bars }, (_, index) => (
          <SkeletonBlock key={index} className="flex-1 rounded-b-none" style={{ height: `${35 + ((index * 37) % 60)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="card max-w-3xl space-y-5 p-5">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
      ))}
      <SkeletonBlock className="h-11 w-40" />
    </div>
  );
}

// Whole-page skeletons used by loading.tsx files.
export function PageSkeleton({ kind = "list", label = "Loading…" }: { kind?: "list" | "dashboard" | "table" | "detail" | "form"; label?: string }) {
  return (
    <div aria-busy="true">
      <Announce label={label} />
      <HeaderSkeleton actions={kind !== "detail"} />
      {kind === "dashboard" && (
        <>
          <TilesSkeleton />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <ListSkeleton rows={4} />
            <ChartSkeleton />
          </div>
        </>
      )}
      {kind === "list" && <ListSkeleton rows={6} />}
      {kind === "table" && <TableSkeleton />}
      {kind === "form" && <FormSkeleton />}
      {kind === "detail" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <div className="card space-y-3 p-5">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
            <FormSkeleton fields={3} />
          </div>
          <ListSkeleton rows={5} />
        </div>
      )}
    </div>
  );
}
