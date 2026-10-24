import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { ProviderTestButton, SalesforceDisconnectButton, SalesforceTestButton, SyncNowButton } from "@/features/ai/AiAdminForms";
import { requireArea } from "@/server/authorization/guards";
import { featureMode } from "@/server/settings/features";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { latestRuns, recentAiEvents, recentFailures, usageByPerson, usageByProvider } from "@/lib/db/repositories/ai.repository";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";
import { CALLBACK_PATH } from "@/server/ai/connectors/salesforce-auth";
import { aiGate } from "@/server/ai/limits";
import { getSettingValue } from "@/server/settings/values";
import { getEnv } from "@/config/environment";
import { loadAiSettings } from "@/server/ai/config";
import { PROVIDER_LABEL, PROVIDERS } from "@/server/ai/providers";
import { loadSalesforceConfig, SALESFORCE_KEY } from "@/server/ai/connectors/salesforce";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI settings" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): AI settings, Super Admin only. Keys are stored
// encrypted (AES-256-GCM) and never shown back; history and audit see a
// fingerprint only. Every change is recorded.
const SF_RESULT: Record<string, { ok: boolean; text: string }> = {
  CONNECTED: { ok: true, text: "Salesforce connected. Press Test connection to check it." },
  CONFIG: { ok: false, text: "Enter the Salesforce app's consumer key and secret (and make sure APP_BASE_URL is set), then Connect again." },
  STATE: { ok: false, text: "That connection attempt expired or wasn't started here. Press Connect Salesforce again." },
  DENIED: { ok: false, text: "Salesforce didn't give permission, so nothing was connected." },
  TOKEN: { ok: false, text: "Salesforce didn't complete the connection. Check the callback URL and the app's settings, then try again." },
  ERROR: { ok: false, text: "Something went wrong. Please try again." },
};

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<{ salesforce?: string }> }) {
  await requireArea("superadmin");
  const sfResult = SF_RESULT[(await searchParams).salesforce ?? ""];
  const [mode, settings, raw, usage, sfConfigured, sfRuns, connection, people, failures, events, priceIn, priceOut, emergency] = await Promise.all([
    featureMode("ai"),
    loadAiSettings(),
    listRawSettings(),
    usageByProvider(30),
    loadSalesforceConfig().then(Boolean).catch(() => false),
    latestRuns(SALESFORCE_KEY),
    getConnection(),
    usageByPerson(30),
    recentFailures(15),
    recentAiEvents(20),
    getSettingValue("ai.price_in_per_million"),
    getSettingValue("ai.price_out_per_million"),
    getSettingValue("ai.emergency_stop"),
  ]);
  const gate = aiGate.stats();
  const base = getEnv().APP_BASE_URL;
  const callbackUrl = base ? new URL(CALLBACK_PATH, base).toString() : `(set APP_BASE_URL)${CALLBACK_PATH}`;
  // An estimate only, from the prices entered here; the provider's bill is the real figure.
  const cost = (inTokens: number, outTokens: number) =>
    priceIn && priceOut ? `≈ ₹${((inTokens / 1e6) * Number(priceIn) + (outTokens / 1e6) * Number(priceOut)).toFixed(2)} (estimate)` : null;
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const group = (name: "AI" | "AI_DATA") => SETTING_DEFINITIONS.filter((definition) => definition.group === name).map((definition) => resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null));

  return (
    <>
      <PageHeader title="AI settings" description="Providers and keys, which one answers, what data each may see, limits, retention and data sources. Keys are encrypted and never shown again." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {emergency === "ON" && (
            <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600" data-testid="ai-emergency">
              Emergency stop is ON: every Pic bot request is refused. Turn it OFF below when it is safe.
            </p>
          )}
          {sfResult && (
            <p role={sfResult.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-label ${sfResult.ok ? "bg-success-50 text-success-600" : "border border-danger-200 bg-danger-50 text-danger-600"}`}>
              {sfResult.text}
            </p>
          )}
          <section className="card" aria-labelledby="ai-providers">
            <h2 id="ai-providers" className="border-b border-line px-5 py-4 font-semibold">
              Providers
            </h2>
            <ul className="divide-y divide-line" data-testid="ai-providers">
              {PROVIDERS.map((provider) => {
                const state = settings.providers[provider];
                return (
                  <li key={provider} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{PROVIDER_LABEL[provider]}</span>
                      {state.configured ? <Badge tone="success">Set up</Badge> : <Badge tone="neutral">Not set up</Badge>}
                      {settings.active === provider && <Badge tone="info">Active</Badge>}
                      {settings.fallback === provider && <Badge tone="info">Fallback</Badge>}
                      <Badge tone={state.businessData ? "warning" : "neutral"}>{state.businessData ? "May see business data" : "No business data"}</Badge>
                      {state.model && <span className="text-caption text-ink-muted">Model: {state.model}</span>}
                    </div>
                    {state.configured && <ProviderTestButton provider={provider} label={PROVIDER_LABEL[provider]} />}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-5 py-3 text-label text-ink-muted">
              Enter keys below, choose the active provider (and a fallback), then press Test. A provider sees ARS business data only when it is marked ALLOWED; otherwise it answers without data.
            </p>
          </section>
          <SettingsGroupForm group="AI" title="Providers, limits and retention" description="API keys are stored encrypted. Leave a key empty to keep the saved one; tick Remove to delete it." settings={group("AI")} />
          <section className="card space-y-3 px-5 py-4" aria-labelledby="sf-connection" data-testid="sf-connection">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="sf-connection" className="font-semibold">
                Salesforce connection
              </h2>
              <Badge tone={connection.status === "CONNECTED" ? "success" : connection.status === "NEEDS_REAUTH" ? "warning" : "neutral"}>
                {connection.status === "CONNECTED" ? "Connected" : connection.status === "NEEDS_REAUTH" ? "Needs reconnecting" : "Not connected"}
              </Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-label sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Connected as</dt>
                <dd className="break-all">{connection.connectedUserName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Instance</dt>
                <dd className="break-all">{connection.instanceUrl ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Last test</dt>
                <dd>{connection.lastTestAt ? `${connection.lastTestOk ? "Passed" : "Failed"} · ${formatIndiaTime(connection.lastTestAt)}` : "Never"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Callback URL (enter it in the Salesforce app)</dt>
                <dd className="break-all font-mono text-caption">{callbackUrl}</dd>
              </div>
            </dl>
            {connection.lastError && <p className="text-label text-danger-600">Last problem: {connection.lastError}</p>}
            <div className="flex flex-wrap items-start gap-3">
              <a href="/api/integrations/salesforce/connect" className="btn-primary btn-compact">
                {connection.status === "DISCONNECTED" ? "Connect Salesforce" : "Reconnect"}
              </a>
              {connection.status !== "DISCONNECTED" && <SalesforceTestButton />}
              {connection.status !== "DISCONNECTED" && <SalesforceDisconnectButton />}
            </div>
            <p className="text-caption text-ink-muted">
              OAuth 2.0 with PKCE, read-only. Tokens are encrypted on the server and never shown. Each person reads only what their Salesforce scope allows (their own records, or all allowed), and Salesforce applies its own sharing and field security.
            </p>
          </section>
          <SettingsGroupForm group="AI_DATA" title="Salesforce app and allowed data" description="Create a Connected App (or External Client App) in Salesforce with the callback URL above, OAuth scopes 'api refresh_token', PKCE required. Test in a sandbox first. Only the objects and fields listed here can be read." settings={group("AI_DATA")} />
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
        </div>
        <div className="space-y-6">
          <section className="card space-y-2 px-5 py-4">
            <h2 className="font-semibold">AI module</h2>
            <p className="text-label">
              Switch: <strong>{mode === "ON" ? "On" : mode === "OFF" ? "Off" : "IT team only"}</strong>. People also need the <strong>AI</strong> module ticked on their user page.
            </p>
            <Link href="/superadmin/settings" className="link text-label">
              Change the switch in Providers &amp; security → Feature switches
            </Link>
          </section>
          <section className="card space-y-1 px-5 py-4" aria-labelledby="ai-live" data-testid="ai-live">
            <h2 id="ai-live" className="font-semibold">
              Right now (this server)
            </h2>
            <p className="text-label">
              {gate.running} question{gate.running === 1 ? "" : "s"} being answered · {gate.queued} waiting · {gate.people} {gate.people === 1 ? "person" : "people"}
            </p>
            <p className="text-caption text-ink-muted">Measured live in this server process.</p>
          </section>
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
          <section className="card space-y-3 px-5 py-4" aria-labelledby="ai-sf">
            <h2 id="ai-sf" className="font-semibold">
              Salesforce sync
            </h2>
            {!sfConfigured ? (
              <p className="text-label text-ink-muted">Not set up. Fill in the Salesforce fields to copy data hourly (read-only).</p>
            ) : (
              <>
                <SyncNowButton />
                <ul className="text-label">
                  {sfRuns.map((run) => (
                    <li key={run.dataset}>
                      {run.dataset}: {run.status === "SUCCEEDED" ? "succeeded" : run.status === "RUNNING" ? "running" : `failed (${run.error ?? "unknown"})`} · {formatIndiaTime(run.startedAt)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-caption text-ink-muted">Oracle ERP isn&apos;t connected: the hosting can&apos;t reach an internal Oracle server. See the AI module design notes for the relay option.</p>
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
