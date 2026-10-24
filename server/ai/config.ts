import "server-only";
import { getSettingValue } from "@/server/settings/values";
import { PROVIDERS, PROVIDER_SETTING, type ProviderCode, type ProviderConfig } from "@/server/ai/providers";

// D-169 (AI module branch): the AI settings as the server uses them. Read
// fresh on every request, so a change in Super Admin → AI settings applies at
// once. Keys stay on the server.
export interface ProviderState {
  provider: ProviderCode;
  configured: boolean; // has a key and a model
  businessData: boolean; // approved to see business data (tool results)
  model: string | null;
}

export interface AiSettings {
  active: ProviderCode | null;
  fallback: ProviderCode | null;
  providers: Record<ProviderCode, ProviderState>;
  dailyQuestions: number;
  maxQuestionChars: number;
  timeoutMs: number;
}

const asProvider = (value: string | null): ProviderCode | null => ((PROVIDERS as readonly string[]).includes(value ?? "") ? (value as ProviderCode) : null);

async function state(provider: ProviderCode): Promise<ProviderState & { apiKey: string | null }> {
  const prefix = `ai.${PROVIDER_SETTING[provider]}`;
  const [apiKey, model, businessData] = await Promise.all([getSettingValue(`${prefix}.api_key`), getSettingValue(`${prefix}.model`), getSettingValue(`${prefix}.business_data`)]);
  return { provider, apiKey, model, configured: Boolean(apiKey && model), businessData: businessData === "ALLOWED" };
}

export async function loadAiSettings(): Promise<AiSettings & { configs: Partial<Record<ProviderCode, ProviderConfig>> }> {
  const [active, fallback, daily, maxChars, timeout, ...states] = await Promise.all([
    getSettingValue("ai.active_provider"),
    getSettingValue("ai.fallback_provider"),
    getSettingValue("ai.daily_questions_per_person"),
    getSettingValue("ai.max_question_chars"),
    getSettingValue("ai.timeout_seconds"),
    ...PROVIDERS.map((provider) => state(provider)),
  ]);
  const providers = {} as Record<ProviderCode, ProviderState>;
  const configs: Partial<Record<ProviderCode, ProviderConfig>> = {};
  for (const item of states as (ProviderState & { apiKey: string | null })[]) {
    providers[item.provider] = { provider: item.provider, configured: item.configured, businessData: item.businessData, model: item.model };
    if (item.configured) configs[item.provider] = { provider: item.provider, apiKey: item.apiKey!, model: item.model! };
  }
  return {
    active: asProvider(active as string | null),
    fallback: asProvider(fallback as string | null),
    providers,
    configs,
    dailyQuestions: Number(daily) || 50,
    maxQuestionChars: Number(maxChars) || 4000,
    timeoutMs: (Number(timeout) || 60) * 1000,
  };
}

// The providers to try, in order: the active one, then the fallback. Only set-up
// providers; when the question needs business data, only providers approved
// for it (never a silent fallback to one that isn't). Pure.
export function routeFor(settings: Pick<AiSettings, "active" | "fallback" | "providers">, needsBusinessData: boolean): ProviderCode[] {
  return [settings.active, settings.fallback]
    .filter((provider, index, list): provider is ProviderCode => provider !== null && list.indexOf(provider) === index)
    .filter((provider) => settings.providers[provider]?.configured && (!needsBusinessData || settings.providers[provider].businessData));
}
