import "server-only";
import type { WhatsAppConfig } from "@/server/settings/values";

// CEOITBox WhatsApp API, same contract as the Power BI website's live
// adapter (D-029): POST {base}/api/v1/whatsapp/sendMessage with x-api-key,
// body {templateName, language, to, templateVariables} → {id, waMessageId}.
export type CeoitboxErrorCode = "CEOITBOX_NOT_CONFIGURED" | "CEOITBOX_REQUEST_FAILED" | "CEOITBOX_TIMEOUT" | "CEOITBOX_RATE_LIMITED";

export class CeoitboxError extends Error {
  constructor(
    readonly code: CeoitboxErrorCode,
    message: string,
    readonly providerStatus?: number,
    readonly providerBody?: unknown,
  ) {
    super(message);
    this.name = "CeoitboxError";
  }
}

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  templateVariables: string[];
}

export interface SendTemplateResult {
  id: string;
  waMessageId: string;
}

export interface CeoitboxDeps {
  fetch: typeof fetch;
  tryConsumeRateLimit: (limitPerMinute: number) => Promise<boolean>;
}

// Digits only, country code included, no "+".
export function normalizeWhatsAppNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function sendTemplateMessage(
  config: WhatsAppConfig,
  input: SendTemplateInput,
  deps: CeoitboxDeps,
): Promise<SendTemplateResult> {
  if (!config.apiKey) throw new CeoitboxError("CEOITBOX_NOT_CONFIGURED", "CEOITBox API key is not configured.");
  if (!(await deps.tryConsumeRateLimit(config.rateLimitPerMinute))) {
    throw new CeoitboxError("CEOITBOX_RATE_LIMITED", `WhatsApp send limit (${config.rateLimitPerMinute}/min) reached.`);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": config.apiKey,
  };
  if (config.phoneId) headers["x-phone-id"] = config.phoneId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await deps.fetch(`${config.baseUrl.replace(/\/$/, "")}/api/v1/whatsapp/sendMessage`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        templateName: input.templateName,
        language: input.language,
        to: normalizeWhatsAppNumber(input.to),
        templateVariables: input.templateVariables,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CeoitboxError("CEOITBOX_TIMEOUT", `CEOITBox request timed out after ${config.timeoutMs}ms.`);
    }
    throw new CeoitboxError("CEOITBOX_REQUEST_FAILED", "CEOITBox request failed.", undefined, String(error));
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CeoitboxError("CEOITBOX_REQUEST_FAILED", `CEOITBox rejected the message (HTTP ${response.status}).`, response.status, body);
  }
  return body as SendTemplateResult;
}
