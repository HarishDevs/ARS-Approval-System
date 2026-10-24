import Link from "next/link";
import { Badge } from "@/features/ui/Display";

// D-168 (AI module branch): shared pieces of the AI pages. Until the AI engine
// and the data sources are connected, every page says so plainly.
export function NotConnectedYet({ what, next }: { what: string; next: string }) {
  return (
    <section className="card space-y-2 px-5 py-4" data-testid="ai-not-connected">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Not connected yet</Badge>
        <span className="text-label text-ink-muted">No data is shown until it comes from an approved source.</span>
      </div>
      <p>{what}</p>
      <p className="text-label text-ink-muted">{next}</p>
    </section>
  );
}

export function ProviderNotice({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <p className="text-label text-ink-muted">
      No AI provider is set up yet.{" "}
      {isSuperAdmin ? (
        <Link href="/superadmin/ai" className="link">
          Set one up in AI settings
        </Link>
      ) : (
        "The Super Admin sets one up in AI settings."
      )}
    </p>
  );
}
