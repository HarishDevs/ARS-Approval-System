import type { Metadata } from "next";
import { PageHeader } from "@/features/shell/PageHeader";
import { recentAiEvents, recentFailures, usageByPerson, usageByProvider } from "@/lib/db/repositories/ai.repository";
import { getSettingValue } from "@/server/settings/values";
import { PROVIDER_LABEL } from "@/server/ai/providers";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI Reports" };
export const dynamic = "force-dynamic";

// D-180 (owner): AI usage for the Super Admin (moved from AI settings):
// by person and provider over 30 days, failed answers with their technical
// reason, and security and setting events. Super Admin only (layout).
export default async function AiReportsPage() {
  const [usage, people, failures, events, priceIn, priceOut] = await Promise.all([usageByProvider(30), usageByPerson(30, 100), recentFailures(30), recentAiEvents(40), getSettingValue("ai.price_in_per_million"), getSettingValue("ai.price_out_per_million")]);
  // An estimate only, from the prices entered in AI settings; the provider's bill is the real figure.
  const cost = (inTokens: number, outTokens: number) =>
    priceIn && priceOut ? `≈ ₹${((inTokens / 1e6) * Number(priceIn) + (outTokens / 1e6) * Number(priceOut)).toFixed(2)} (estimate)` : null;
  return (
    <>
      <PageHeader title="AI Reports" description="AI usage over the last 30 days, failed answers and security events." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="card" aria-labelledby="ai-people">
            <h2 id="ai-people" className="border-b border-line px-5 py-4 font-semibold">
              Usage by person, last 30 days
            </h2>
            {people.length === 0 ? (
              <p className="px-5 py-4 text-label text-ink-muted">No questions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table" data-testid="ai-usage-people">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Questions</th>
                      <th scope="col">Failed</th>
                      <th scope="col">Tokens in / out</th>
                      <th scope="col">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.name}</td>
                        <td>{row.questions}</td>
                        <td>{row.failures}</td>
                        <td className="text-label">
                          {row.inputTokens.toLocaleString("en-IN")} / {row.outputTokens.toLocaleString("en-IN")} {cost(row.inputTokens, row.outputTokens) ?? ""}
                        </td>
                        <td className="text-label text-ink-muted">{row.lastAt ? formatIndiaTime(row.lastAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card" aria-labelledby="ai-failures">
            <h2 id="ai-failures" className="border-b border-line px-5 py-4 font-semibold">
              Recent failed answers
            </h2>
            {failures.length === 0 ? (
              <p className="px-5 py-4 text-label text-ink-muted">None.</p>
            ) : (
              <ul className="divide-y divide-line text-label" data-testid="ai-failures">
                {failures.map((row, index) => (
                  <li key={index} className="px-5 py-2">
                    <p>{row.error}</p>
                    <p className="text-caption text-ink-muted">
                      {row.name} · {formatIndiaTime(row.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <section className="card" aria-labelledby="ai-usage">
            <h2 id="ai-usage" className="border-b border-line px-5 py-4 font-semibold">
              Usage, last 30 days
            </h2>
            {usage.length === 0 ? (
              <p className="px-5 py-4 text-label text-ink-muted">No questions yet.</p>
            ) : (
              <ul className="divide-y divide-line text-label" data-testid="ai-usage">
                {usage.map((row) => (
                  <li key={row.provider} className="px-5 py-3">
                    <p className="font-medium">{PROVIDER_LABEL[row.provider as keyof typeof PROVIDER_LABEL] ?? row.provider}</p>
                    <p className="text-ink-muted">
                      {row.answers} answers · {row.failures} failed · {row.people} people · {row.inputTokens.toLocaleString("en-IN")} in / {row.outputTokens.toLocaleString("en-IN")} out tokens {cost(row.inputTokens, row.outputTokens) ?? ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card" aria-labelledby="ai-events">
            <h2 id="ai-events" className="border-b border-line px-5 py-4 font-semibold">
              Security and setting events
            </h2>
            {events.length === 0 ? (
              <p className="px-5 py-4 text-label text-ink-muted">None yet.</p>
            ) : (
              <ul className="divide-y divide-line text-label" data-testid="ai-events">
                {events.map((row, index) => (
                  <li key={index} className="px-5 py-2">
                    <p>
                      {row.action.replace(/_/g, " ").toLowerCase()} {row.result === "FAILURE" ? "(failed)" : ""}
                    </p>
                    <p className="text-caption text-ink-muted">
                      {row.actor ?? "System"} · {formatIndiaTime(row.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
