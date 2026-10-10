import Link from "next/link";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { CreateHoldForm, ReleaseHoldForm } from "@/features/superadmin/HoldForms";
import { listHolds, retentionDryRun } from "@/server/ops/governance";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const dynamic = "force-dynamic";

// FN10 retention and legal holds (Super Admin). Holds are enforced; the
// retention section is a dry run only.
export default async function RetentionPage() {
  await requireArea("superadmin");
  const [holds, dryRun] = await Promise.all([listHolds(), retentionDryRun()]);
  const active = holds.filter((hold) => !hold.releasedAt);

  return (
    <>
      <PageHeader title="Retention & legal holds" description="Holds keep records from being deleted while a matter is open. Retention shows what a policy would affect; nothing is deleted automatically." />

      <section aria-labelledby="holds-title" className="card mb-6 px-5 py-4">
        <h2 id="holds-title" className="mb-1 font-semibold">
          Legal holds ({active.length} active)
        </h2>
        <p className="mb-3 text-label text-ink-muted">A held request can&apos;t be deleted (not even by the Super Admin), and housekeeping keeps its related records. Release a hold when the matter closes.</p>
        {holds.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Legal holds</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Covers</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((hold) => (
                  <tr key={hold.id}>
                    <td className="min-w-48">
                      <span className="font-semibold">{hold.reference}</span>
                      <span className="block text-caption text-ink-muted">{hold.reason}</span>
                    </td>
                    <td className="text-label">
                      {hold.scopeType === "REQUEST" ? "Request " : hold.scopeType === "REQUESTER" ? "Everything raised by " : "Every request of "}
                      {hold.scopeLabel}
                      <span className="block text-caption text-ink-muted">
                        {hold.covered} request{hold.covered === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="text-label">{hold.ownerName}</td>
                    <td className="text-label">
                      {formatIndiaTime(hold.createdAt)}
                      <span className="block text-caption text-ink-muted">by {hold.createdByName}</span>
                    </td>
                    <td className="min-w-56">
                      {hold.releasedAt ? (
                        <span className="text-label">
                          <Badge tone="neutral">Released</Badge> {formatIndiaTime(hold.releasedAt)}
                          <span className="block text-caption text-ink-muted">{hold.releaseReason}</span>
                        </span>
                      ) : (
                        <>
                          <Badge tone="warning">Active</Badge>
                          <ReleaseHoldForm holdId={hold.id} reference={hold.reference} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mb-2 text-label font-semibold">Place a hold</h3>
        <CreateHoldForm />
      </section>

      <section aria-labelledby="retention-title" className="card px-5 py-4">
        <h2 id="retention-title" className="mb-1 font-semibold">
          Retention (dry run)
        </h2>
        <p className="mb-3 text-label text-ink-muted">
          What the current retention settings would affect today. Nothing is archived or deleted: a clean-up run needs an approved policy and a separate decision. Set the durations in{" "}
          <Link href="/superadmin/settings" className="link">
            Providers &amp; security → Retention
          </Link>
          .
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Retention dry run</caption>
            <thead>
              <tr>
                <th scope="col">Records</th>
                <th scope="col">Kept for</th>
                <th scope="col" className="text-right">
                  Past the date
                </th>
                <th scope="col" className="text-right">
                  Kept by a hold
                </th>
                <th scope="col">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {dryRun.map((row) => (
                <tr key={row.key}>
                  <td className="text-label">{row.label}</td>
                  <td className="text-label">{row.duration ? `${row.duration} ${row.unit}` : <Badge tone="neutral">Not set: kept for ever</Badge>}</td>
                  <td className="text-right tabular-nums">{row.duration ? row.eligible.toLocaleString("en-IN") : "—"}</td>
                  <td className="text-right tabular-nums">{row.duration ? row.held.toLocaleString("en-IN") : "—"}</td>
                  <td className="text-label">{row.oldest ? formatIndiaTime(row.oldest) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
