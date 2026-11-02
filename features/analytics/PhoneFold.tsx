// v1.46.0 (V143-16): on a phone the dashboard, "whose numbers" and period
// choices fold into one row above the numbers (open it to change them); on a
// computer they show as before.
export function PhoneFold({ mobile, summary, children }: { mobile: boolean; summary: string; children: React.ReactNode }) {
  if (!mobile) return <>{children}</>;
  return (
    <details className="mob-section card mb-4 overflow-hidden" data-testid="m-analytics-filters">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 text-[15px] font-semibold">
        <span aria-hidden="true" className="mob-caret text-ink-muted">
          ▾
        </span>
        <span className="min-w-0 flex-1">
          Dashboard and filters
          <span className="block truncate text-[13px] font-normal text-ink-muted">{summary}</span>
        </span>
      </summary>
      <div className="border-t border-line p-2 [&_.card]:mb-2 [&_.card]:border-0 [&_.card]:shadow-none">{children}</div>
    </details>
  );
}
