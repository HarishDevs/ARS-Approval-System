import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge } from "@/features/ui/Display";
import { Hint } from "@/features/ui/Hint";
import { SettingsGroupForm } from "@/features/superadmin/SettingsGroupForm";
import { SettingsConsole } from "@/features/superadmin/SettingsConsole";
import { ProviderTestButton } from "@/features/ai/AiAdminForms";
import { requireArea } from "@/server/authorization/guards";
import { featureMode } from "@/server/settings/features";
import { SETTING_DEFINITIONS } from "@/server/settings/definitions";
import { resolveSettingForDisplay } from "@/server/settings/resolve";
import { listRawSettings } from "@/lib/db/repositories/settings.repository";
import { aiGate } from "@/server/ai/limits";
import { getSettingValue } from "@/server/settings/values";
import { loadAiSettings } from "@/server/ai/config";
import { PROVIDER_LABEL, PROVIDER_SETTING, PROVIDERS } from "@/server/ai/providers";
import { splitLabel } from "@/features/superadmin/split-label";
import type { DisplaySetting } from "@/server/settings/resolve";

export const metadata: Metadata = { title: "AI settings" };
export const dynamic = "force-dynamic";

// D-169 (AI module branch): AI settings, Super Admin only. Keys are stored
// encrypted (AES-256-GCM) and never shown back; history and audit see a
// fingerprint only. Every change is recorded.

const GENERAL_KEYS = ["ai.active_provider", "ai.fallback_provider", "ai.emergency_stop", "ai.launcher", "ai.general_chat", "ai.combined_chat", "ai.module_modes"] as const;
const COMMON_KEYS = [
  "ai.daily_questions_per_person",
  "ai.requests_per_minute",
  "ai.concurrent_per_person",
  "ai.concurrent_global",
  "ai.max_question_chars",
  "ai.max_output_tokens",
  "ai.history_turns",
  "ai.timeout_seconds",
  "ai.conversation_keep_days",
  "ai.price_in_per_million",
  "ai.price_out_per_million",
] as const;

// Inside a provider's card the provider's name is the title, so fields say
// just "API key", "Model"; any explanation stays in the hover hint.
function renamed(list: DisplaySetting[], names: Record<string, string>): DisplaySetting[] {
  return list.map((setting) => {
    const name = names[setting.key.split(".").at(-1) ?? ""];
    if (!name) return setting;
    const hint = splitLabel(setting.label).hint;
    return { ...setting, label: hint ? `${name} (${hint})` : name };
  });
}

export default async function AiSettingsPage() {
  await requireArea("superadmin");
  const [mode, settings, raw, emergency] = await Promise.all([featureMode("ai"), loadAiSettings(), listRawSettings(), getSettingValue("ai.emergency_stop")]);
  const gate = aiGate.stats();
  const byKey = new Map(raw.map((row) => [row.key, row]));
  const pick = (keys: readonly string[]) =>
    keys
      .map((key) => SETTING_DEFINITIONS.find((definition) => definition.key === key))
      .filter((definition) => definition !== undefined)
      .map((definition) => resolveSettingForDisplay(definition, byKey.get(definition.key) ?? null));

  return (
    <>
      <PageHeader title="AI settings" description="Providers and keys, which one answers, what data each may see, limits and retention. Keys are encrypted and never shown again. Salesforce has its own page." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {emergency === "ON" && (
            <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-600" data-testid="ai-emergency">
              Emergency stop is ON: every Pico Bot request is refused. Turn it OFF below when it is safe.
            </p>
          )}
          {/* D-184 (owner): General, then each provider on its own, then the common settings.
              D-240: one AI form with one Save (it was nine), in the settings console. */}
          <SettingsConsole
            sections={[
              { id: "ai-part-general", title: "General", keywords: `General provider fallback emergency launcher chats ${GENERAL_KEYS.join(" ")}` },
              { id: "ai-part-providers", title: "Providers", keywords: `Providers API key model business data ${PROVIDERS.map((provider) => PROVIDER_LABEL[provider]).join(" ")}` },
              { id: "ai-part-common", title: "Common settings", keywords: `Common limits speed answer retention price ${COMMON_KEYS.join(" ")}` },
            ]}
          >
            <SettingsGroupForm
              group="AI"
              id="settings-AI"
              title="AI settings"
              description="Everything here is saved together, in one change with its history and audit. Keys are stored encrypted and never shown again; leave a key empty to keep the saved one."
              parts={[
                {
                  id: "ai-part-general",
                  title: "General",
                  description: "Which provider answers (and the fallback), the emergency stop, the floating launcher and which chats exist.",
                  settings: pick(GENERAL_KEYS),
                  testId: "ai-general",
                },
                {
                  id: "ai-part-providers",
                  title: "Providers",
                  description: "Business data: whether a provider may see ARS and Salesforce data.",
                  testId: "ai-providers",
                  parts: PROVIDERS.map((provider) => {
                    const state = settings.providers[provider];
                    const prefix = `ai.${PROVIDER_SETTING[provider]}`;
                    return {
                      title: PROVIDER_LABEL[provider],
                      testId: `ai-provider-${provider}`,
                      settings: renamed(pick([`${prefix}.api_key`, `${prefix}.model`, `${prefix}.business_data`]), { api_key: "API key", model: "Model", business_data: "May see business data" }),
                      actions: (
                        <>
                          {state.configured ? <Badge tone="success">Set up</Badge> : <Badge tone="neutral">Not set up</Badge>}
                          {settings.active === provider && <Badge tone="info">Active</Badge>}
                          {settings.fallback === provider && <Badge tone="info">Fallback</Badge>}
                          {state.configured && <ProviderTestButton provider={provider} label={PROVIDER_LABEL[provider]} />}
                        </>
                      ),
                    };
                  }),
                },
                {
                  id: "ai-part-common",
                  title: "Common settings",
                  description: "Limits, speed, answer length, retention and price estimates; they apply whichever provider answers.",
                  settings: pick(COMMON_KEYS),
                  testId: "ai-common",
                },
              ]}
            />
          </SettingsConsole>
        </div>
        <div className="space-y-6">
          <section className="card space-y-2 px-5 py-4">
            <h2 className="flex items-center gap-1.5 font-semibold">
              AI module
              <Hint text="People also need the AI module ticked on their user page." align="start" />
            </h2>
            <p className="text-label">
              Switch: <strong>{mode === "ON" ? "On" : mode === "OFF" ? "Off" : "IT team only"}</strong>
            </p>
            <Link href="/superadmin/settings" className="link text-label">
              Change in Feature switches
            </Link>
          </section>
          <section className="card space-y-1 px-5 py-4" aria-labelledby="ai-live" data-testid="ai-live">
            <h2 id="ai-live" className="flex items-center gap-1.5 font-semibold">
              Right now (this server)
              <Hint text="Measured live in this server process." align="start" />
            </h2>
            <p className="text-label">
              {gate.running} question{gate.running === 1 ? "" : "s"} being answered · {gate.queued} waiting · {gate.people} {gate.people === 1 ? "person" : "people"}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
