import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { SalesforceDisconnectButton, SalesforceTestButton, SyncNowButton } from "@/features/ai/AiAdminForms";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { latestRuns } from "@/lib/db/repositories/ai.repository";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";
import { CALLBACK_PATH } from "@/server/ai/connectors/salesforce-auth";
import { getEnv } from "@/config/environment";
import { loadSalesforceConfig, SALESFORCE_KEY } from "@/server/ai/connectors/salesforce";
import { formatIndiaTime } from "@/server/notifications/security-messages";

export const metadata: Metadata = { title: "Salesforce Settings" };
export const dynamic = "force-dynamic";

// D-181 (owner): everything Salesforce in one place, moved from AI settings:
// the OAuth connection (Connect, Test, Disconnect), the app's key and secret,
// the objects Pic bot may read, and the optional hourly copy. Super Admin
// only (layout). Keys and tokens are encrypted and never shown.
const SF_RESULT: Record<string, { ok: boolean; text: string }> = {
  CONNECTED: { ok: true, text: "Salesforce connected. Press Test connection to check it." },
  CONFIG: { ok: false, text: "Enter the Salesforce app's consumer key and secret (and make sure APP_BASE_URL is set), then Connect again." },
  STATE: { ok: false, text: "That connection attempt expired or wasn't started here. Press Connect Salesforce again." },
  DENIED: { ok: false, text: "Salesforce didn't give permission, so nothing was connected." },
  TOKEN: { ok: false, text: "Salesforce didn't complete the connection. Check the callback URL and the app's settings, then try again." },
  ERROR: { ok: false, text: "Something went wrong. Please try again." },
};

export default async function SalesforceSettingsPage({ searchParams }: { searchParams: Promise<{ salesforce?: string }> }) {
  const sfResult = SF_RESULT[(await searchParams).salesforce ?? ""];
  const [raw, sfConfigured, sfRuns, connection] = await Promise.all([listRawSettings(), loadSalesforceConfig().then(Boolean).catch(() => false), latestRuns(SALESFORCE_KEY), getConnection()]);
  const base = getEnv().APP_BASE_URL;
  const callbackUrl = base ? new URL(CALLBACK_PATH, base).toString() : `(set APP_BASE_URL)${CALLBACK_PATH}`;
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const settings = SETTING_DEFINITIONS.filter((definition) => definition.group === "AI_DATA").map((definition) => resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null));

  return (
    <>
      <PageHeader title="Salesforce Settings" description="Connect Salesforce (OAuth with PKCE, read-only), the app's key and secret, which objects Pico Bot may read, and the optional hourly copy." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {sfResult && (
            <p role={sfResult.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-label ${sfResult.ok ? "bg-success-50 text-success-600" : "border border-danger-200 bg-danger-50 text-danger-600"}`}>
              {sfResult.text}
            </p>
          )}
          <section className="card space-y-3 px-5 py-4" aria-labelledby="sf-connection" data-testid="sf-connection">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="sf-connection" className="font-semibold">
                Salesforce connection
              </h2>
              <Hint text="OAuth 2.0 with PKCE, read-only. Tokens are encrypted on the server and never shown. Each person reads only what their Salesforce scope allows (their own records, or all allowed), and Salesforce applies its own sharing and field security." align="start" />
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
                <dt className="flex items-center gap-1 text-ink-muted">
                  Callback URL
                  <Hint text="Enter it in the Salesforce app." align="start" />
                </dt>
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
          </section>
          <SettingsGroupForm group="AI_DATA" title="Salesforce app and allowed data" description="Create a Connected App (or External Client App) in Salesforce with the callback URL above, OAuth scopes api and refresh_token, PKCE required. Test in a sandbox first. Only the objects and fields listed here can be read (* = all)." settings={settings} />
        </div>
        <div className="space-y-6">
          <section className="card space-y-3 px-5 py-4" aria-labelledby="ai-sf">
            <div className="flex items-center gap-1.5">
              <h2 id="ai-sf" className="font-semibold">
                Salesforce sync
              </h2>
              <Hint text="Fill in the Salesforce fields to copy data hourly (read-only). Oracle ERP isn't connected: the hosting can't reach an internal Oracle server. See the AI module design notes for the relay option." align="start" />
            </div>
            {!sfConfigured ? (
              <p className="text-label text-ink-muted">Not set up.</p>
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
          </section>
          <p className="text-label">
            <Link href="/superadmin/ai" className="link">
              AI settings
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
