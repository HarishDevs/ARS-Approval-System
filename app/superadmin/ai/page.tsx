import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { ProviderTestButton, SyncNowButton } from "@/features/ai/AiAdminForms";
import { requireArea } from "@/server/authorization/guards";
import { featureMode } from "@/server/settings/features";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { latestRuns, usageByProvider } from "@/lib/db/repositories/ai.repository";
import { loadAiSettings } from "@/server/ai/config";
import { PROVIDER_LABEL, PROVIDERS } from "@/server/ai/providers";
import { loadSalesforceConfig, SALESFORCE_KEY } from "@/server/ai/connectors/salesforce";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "AI settings" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): AI settings, Super Admin only. Keys are stored
// encrypted (AES-256-GCM) and never shown back; history and audit see a
// fingerprint only. Every change is recorded.
export default async function AiSettingsPage() {
  await requireArea("superadmin");
  const [mode, settings, raw, usage, sfConfigured, sfRuns] = await Promise.all([
    featureMode("ai"),
    loadAiSettings(),
    listRawSettings(),
    usageByProvider(30),
    loadSalesforceConfig().then(Boolean).catch(() => false),
    latestRuns(SALESFORCE_KEY),
  ]);
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const group = (name: "AI" | "AI_DATA") => SETTING_DEFINITIONS.filter((definition) => definition.group === name).map((definition) => resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null));

  return (
    <>
      <PageHeader title="AI settings" description="Providers and keys, which one answers, what data each may see, limits, retention and data sources. Keys are encrypted and never shown again." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
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
          <SettingsGroupForm group="AI_DATA" title="Data sources: Salesforce (read-only)" description="A dedicated integration user's connected app (client credentials). Test in a sandbox first. Nothing syncs until every field is set." settings={group("AI_DATA")} />
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
                      {row.answers} answers · {row.failures} failed · {row.people} people · {row.inputTokens.toLocaleString("en-IN")} in / {row.outputTokens.toLocaleString("en-IN")} out tokens
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
        </div>
      </div>
    </>
  );
}
