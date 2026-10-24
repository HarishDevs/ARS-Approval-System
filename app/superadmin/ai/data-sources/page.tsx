import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { PLANNED_SOURCES } from "@/features/ai/sources";
import { lastSuccess, latestRuns } from "@/lib/db/repositories/ai.repository";
import { sourceDatasetCounts } from "@/lib/db/repositories/ai-data.repository";
import { SALESFORCE_KEY } from "@/server/ai/connectors/salesforce";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "Data Sources" };
export const dynamic = "force-dynamic";

// D-169: where the AI's data comes from, its status and how fresh it is.
// Credentials are never shown here. D-180: Super Admin only (moved from /users/ai).
export default async function AiDataSourcesPage() {
  const [connection, sfRuns, sfLast, sfCounts] = await Promise.all([
    getConnection(),
    latestRuns(SALESFORCE_KEY),
    lastSuccess(SALESFORCE_KEY),
    sourceDatasetCounts(SALESFORCE_KEY),
  ]);
  const sfFailed = sfRuns.some((run) => run.status === "FAILED");
  const status: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; text: string; last: string }> = {
    ars: { tone: "success", text: "Connected (live)", last: "Read live at each question" },
    // D-172: live queries through the OAuth connection; the hourly copy (optional) shows its own runs below.
    salesforce:
      connection.status === "CONNECTED"
        ? { tone: sfFailed ? "warning" : "success", text: sfFailed ? "Connected (last copy failed; older copy kept)" : "Connected (live, read-only)", last: sfLast ? `Copy: ${formatIndiaTime(new Date(sfLast))}` : connection.lastTestAt ? `Tested: ${formatIndiaTime(connection.lastTestAt)}` : "Live at each question" }
        : connection.status === "NEEDS_REAUTH"
          ? { tone: "danger", text: "Needs reconnecting", last: sfLast ? formatIndiaTime(new Date(sfLast)) : "—" }
          : { tone: "neutral", text: "Not connected", last: "Never" },
    oracle: { tone: "neutral", text: "Not connected", last: "Never" },
    powerbi: { tone: "neutral", text: "Not connected", last: "Never" },
  };
  return (
    <>
      <PageHeader title="Data Sources" description="Where the AI's data comes from, whether it is connected, and how fresh it is. Read-only access only." />
      <div className="space-y-6">
        <div className="card overflow-x-auto">
          <table className="data-table" data-testid="ai-sources">
            <caption className="sr-only">Data sources</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">What it provides</th>
                <th scope="col">Status</th>
                <th scope="col">Last successful sync</th>
                <th scope="col">Needed before connecting</th>
              </tr>
            </thead>
            <tbody>
              {PLANNED_SOURCES.map((source) => (
                <tr key={source.key}>
                  <td className="font-medium">{source.name}</td>
                  <td className="text-label">{source.what}</td>
                  <td>
                    <Badge tone={status[source.key]!.tone}>{status[source.key]!.text}</Badge>
                  </td>
                  <td className="text-label text-ink-muted">{status[source.key]!.last}</td>
                  <td className="text-label text-ink-muted">{source.key === "ars" ? "Nothing: limited to what each person may see." : source.needs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sfRuns.length > 0 && (
          <section className="card overflow-x-auto" aria-labelledby="sf-runs">
            <h2 id="sf-runs" className="px-5 pt-4 font-semibold">
              Salesforce objects
            </h2>
            <table className="data-table" data-testid="ai-sf-runs">
              <thead>
                <tr>
                  <th scope="col">Object</th>
                  <th scope="col">Records copied</th>
                  <th scope="col">Last run</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {sfRuns.map((run) => (
                  <tr key={run.dataset}>
                    <td className="font-medium">{run.dataset}</td>
                    <td>{sfCounts.find((item) => item.dataset === run.dataset)?.records ?? 0}</td>
                    <td className="text-label text-ink-muted">{formatIndiaTime(run.startedAt)}</td>
                    <td className="text-label">{run.status === "SUCCEEDED" ? `Succeeded (${run.rowsFetched} changed)` : run.status === "RUNNING" ? "Running" : `Failed: ${run.error ?? "unknown"} (the last good copy is kept)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </>
  );
}
