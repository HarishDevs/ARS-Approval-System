"use server";

import { revalidatePath } from "next/cache";
import { requireApiArea } from "@/server/authorization/guards";
import { loadAiSettings } from "@/server/ai/config";
import { chat, PROVIDER_LABEL, PROVIDERS, ProviderError, type ProviderCode } from "@/server/ai/providers";
import { syncSalesforce } from "@/server/ai/connectors/salesforce";
import { disconnect as disconnectSalesforce, testConnection } from "@/server/ai/connectors/salesforce-auth";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { logError } from "@/lib/logging/logger";
import type { ActionResult } from "@/lib/http/action-result";

// D-169 (AI module branch): Super Admin AI tools: test a provider (a harmless
// one-word request; no business data) and copy Salesforce now.
const NOT_FOUND: ActionResult = { ok: false, message: "Not found." };

export async function testProviderAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const provider = String(formData.get("provider") ?? "") as ProviderCode;
  if (!PROVIDERS.includes(provider)) return NOT_FOUND;
  const settings = await loadAiSettings();
  const config = settings.configs[provider];
  if (!config) return { ok: false, message: `${PROVIDER_LABEL[provider]} needs an API key and a model first.` };
  const started = Date.now();
  try {
    const answer = await chat(config, { system: "You are a connection test. Reply with the single word OK.", turns: [{ role: "user", content: "Connection test: reply OK." }], maxTokens: 1024, timeoutMs: 30_000 }); // room for reasoning models, which think before answering
    await recordAudit({ actorUserId: session.user.id, action: "AI_PROVIDER_TESTED", entityType: "AI_PROVIDER", entityId: provider, sessionId: session.sessionId, metadata: { ok: true, model: answer.model } });
    return { ok: true, message: `${PROVIDER_LABEL[provider]} answered in ${((Date.now() - started) / 1000).toFixed(1)} s with model ${answer.model}: "${answer.text.slice(0, 40)}".` };
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : "The test failed.";
    if (!(error instanceof ProviderError)) logError("AI provider test failed", error, { provider });
    await recordAudit({ actorUserId: session.user.id, action: "AI_PROVIDER_TESTED", entityType: "AI_PROVIDER", entityId: provider, result: "FAILURE", sessionId: session.sessionId, metadata: { kind: error instanceof ProviderError ? error.kind : "UNKNOWN" } });
    return { ok: false, message: `${PROVIDER_LABEL[provider]}: ${message}` };
  }
}

export async function syncSalesforceAction(): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  try {
    const summary = await syncSalesforce(session.user.id);
    await recordAudit({ actorUserId: session.user.id, action: "AI_SOURCE_SYNCED", entityType: "AI_SOURCE", entityId: "salesforce", result: summary.ok ? "SUCCESS" : "FAILURE", sessionId: session.sessionId, metadata: { datasets: summary.datasets.map((item) => ({ dataset: item.dataset, ok: item.ok, rows: item.rows })) } });
    revalidatePath("/superadmin", "layout");
    revalidatePath("/superadmin/ai/data-sources");
    return summary.ok ? { ok: true, message: summary.message } : { ok: false, message: summary.message };
  } catch (error) {
    logError("syncSalesforceAction failed", error);
    return { ok: false, message: "The sync couldn't run. See the server log." };
  }
}

// D-172: test the Salesforce connection (a read of the org's API limits).
export async function testSalesforceAction(): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  const result = await testConnection();
  await recordAudit({ actorUserId: session.user.id, action: "AI_SALESFORCE_TESTED", entityType: "AI_SOURCE", entityId: "salesforce", result: result.ok ? "SUCCESS" : "FAILURE", sessionId: session.sessionId });
  revalidatePath("/superadmin", "layout");
  return { ok: result.ok, message: result.message };
}

// D-172: disconnect: revoke the token at Salesforce and delete it here.
export async function disconnectSalesforceAction(): Promise<ActionResult> {
  let session;
  try {
    session = await requireApiArea("superadmin");
  } catch {
    return NOT_FOUND;
  }
  try {
    await disconnectSalesforce();
    await recordAudit({ actorUserId: session.user.id, action: "AI_SALESFORCE_DISCONNECTED", entityType: "AI_SOURCE", entityId: "salesforce", sessionId: session.sessionId });
    revalidatePath("/superadmin", "layout");
    return { ok: true, message: "Salesforce disconnected. Its token was revoked and deleted." };
  } catch (error) {
    logError("disconnectSalesforceAction failed", error);
    return { ok: false, message: "Couldn't disconnect. Please try again." };
  }
}
