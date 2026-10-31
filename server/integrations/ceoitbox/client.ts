import "server-only";
import type { WhatsAppConfig } from "@/server/settings/values";

// CEOITBox WhatsApp API (D-029, D-076). Reference: docs/CEOITBOX-API.md,
// from the owner's CEOITBOX API Master Documentation (8 Oct 2026).
// Every call goes to {baseUrl} with x-api-key (and x-phone-id when set).
// The key never leaves the server and is never logged.
//   send:   POST /api/v1/whatsapp/sendMessage
//   create: POST /api/v1/messageTemplate/create
//   sync:   GET  /api/v1/whatsapp/syncTemplatesFromMeta
//   list:   POST /api/v1/messageTemplate/getTemplates
export type CeoitboxErrorCode =
  | "CEOITBOX_NOT_CONFIGURED"
  | "CEOITBOX_REQUEST_FAILED" // network or 5xx: worth retrying
  | "CEOITBOX_TIMEOUT"
  | "CEOITBOX_RATE_LIMITED" // our own send limit, or CEOITBox's 429 (D-243): worth retrying
  | "CEOITBOX_UNAUTHORIZED" // 401: wrong, switched-off or deleted key
  | "CEOITBOX_REJECTED" // 400: Meta refused (bad number, template, variable count)
  | "CEOITBOX_BLOCKED"; // 200 with an error object: wallet too low, or the number opted out

export class CeoitboxError extends Error {
  constructor(
    readonly code: CeoitboxErrorCode,
    message: string,
    readonly providerStatus?: number,
    readonly providerBody?: unknown,
    // D-243: CEOITBox's Retry-After on a 429, in seconds (when it sent one).
    readonly retryAfterSeconds?: number,
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
  userMessageId?: string; // our own reference, for CEOITBox reports
  // D-243: a sign-in code may use the slots kept back from bulk messages.
  priority?: WhatsAppSendPriority;
}

export type WhatsAppSendPriority = "OTP" | "BULK";

export interface SendTemplateResult {
  id: string;
  waMessageId: string;
}

export interface CeoitboxDeps {
  fetch: typeof fetch;
  tryConsumeRateLimit: (limitPerMinute: number, priority: WhatsAppSendPriority) => Promise<boolean>;
}

// Digits only, country code included, no "+".
export function normalizeWhatsAppNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}

// D-243: Retry-After as seconds or an HTTP date; null when absent or unreadable.
// Capped at an hour so a bad header can't park a message for days.
export function retryAfterSeconds(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const value = header.trim();
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  if (!Number.isFinite(seconds)) return null;
  return Math.min(Math.max(seconds, 0), 3600);
}

// The text of a problem+json reply, without anything from the request.
function problemText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const detail = [record.detail, record.title, record.message].find((value) => typeof value === "string" && value.trim());
  return typeof detail === "string" ? detail.slice(0, 300) : "";
}

async function call(config: WhatsAppConfig, fetcher: typeof fetch, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  if (!config.apiKey) throw new CeoitboxError("CEOITBOX_NOT_CONFIGURED", "CEOITBox API key is not configured.");
  const headers: Record<string, string> = { Accept: "application/json", "x-api-key": config.apiKey };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (config.phoneId) headers["x-phone-id"] = config.phoneId;

  // D-243: the timer runs until the body is read, not only the headers, so a
  // provider that sends headers and then stalls can't hang the send.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    text = await response.text().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return "";
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new CeoitboxError("CEOITBOX_TIMEOUT", `CEOITBox request timed out after ${config.timeoutMs}ms.`);
    }
    throw new CeoitboxError("CEOITBOX_REQUEST_FAILED", "CEOITBox request failed.", undefined, String(error));
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  // D-243: CEOITBox throttling us is temporary, never a refusal of the message.
  if (response.status === 429) {
    const wait = retryAfterSeconds(response.headers?.get?.("retry-after") ?? null);
    throw new CeoitboxError("CEOITBOX_RATE_LIMITED", `CEOITBox is limiting requests (HTTP 429)${wait !== null ? `; retry after ${wait}s` : ""}.`, 429, parsed, wait ?? undefined);
  }
  if (response.status === 401) throw new CeoitboxError("CEOITBOX_UNAUTHORIZED", "CEOITBox refused the API key (401). Check the key in Providers & security.", 401, parsed);
  if (response.status >= 400 && response.status < 500) {
    throw new CeoitboxError("CEOITBOX_REJECTED", `CEOITBox rejected the request (HTTP ${response.status})${problemText(parsed) ? `: ${problemText(parsed)}` : "."}`, response.status, parsed);
  }
  if (!response.ok) throw new CeoitboxError("CEOITBOX_REQUEST_FAILED", `CEOITBox error (HTTP ${response.status}).`, response.status, parsed);
  // A send blocked before it reaches Meta comes back as 200 with an error object.
  if (parsed && typeof parsed === "object" && "error" in parsed && (parsed as { error: unknown }).error) {
    const error = (parsed as { error: unknown }).error;
    const reason = typeof error === "string" ? error : problemText(error) || JSON.stringify(error).slice(0, 200);
    throw new CeoitboxError("CEOITBOX_BLOCKED", `CEOITBox blocked the message: ${reason}`, 200, parsed);
  }
  return parsed;
}

export async function sendTemplateMessage(config: WhatsAppConfig, input: SendTemplateInput, deps: CeoitboxDeps): Promise<SendTemplateResult> {
  if (!config.apiKey) throw new CeoitboxError("CEOITBOX_NOT_CONFIGURED", "CEOITBox API key is not configured.");
  if (!(await deps.tryConsumeRateLimit(config.rateLimitPerMinute, input.priority ?? "BULK"))) {
    throw new CeoitboxError("CEOITBOX_RATE_LIMITED", `WhatsApp send limit (${config.rateLimitPerMinute}/min) reached.`);
  }
  const body = await call(config, deps.fetch, "POST", "/api/v1/whatsapp/sendMessage", {
    templateName: input.templateName,
    language: input.language,
    to: normalizeWhatsAppNumber(input.to),
    templateVariables: input.templateVariables,
    ...(input.userMessageId ? { userMessageId: input.userMessageId } : {}),
  });
  return body as SendTemplateResult;
}

// ---- templates (S7-05) ------------------------------------------------------------
export type TemplateCategory = "UTILITY" | "MARKETING";

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  body: string; // with {{1}}, {{2}} …
  examples: string[]; // one sample per variable, in order
  footer?: string | null;
}

// The CreateTemplate body (Master Documentation §Templates). Pure.
export function createTemplatePayload(input: CreateTemplateInput) {
  return {
    name: input.name,
    language: input.language,
    category: input.category,
    components: [
      { type: "BODY", text: input.body, ...(input.examples.length ? { example: { body_text: [input.examples] } } : {}) },
      ...(input.footer ? [{ type: "FOOTER", text: input.footer }] : []),
    ],
  };
}

export async function createTemplate(config: WhatsAppConfig, input: CreateTemplateInput, deps: Pick<CeoitboxDeps, "fetch">): Promise<{ message: string }> {
  const body = (await call(config, deps.fetch, "POST", "/api/v1/messageTemplate/create", createTemplatePayload(input))) as { success?: boolean; message?: string } | null;
  if (body && body.success === false) throw new CeoitboxError("CEOITBOX_REJECTED", `CEOITBox didn't accept the template: ${body.message ?? "no reason given"}`, 200, body);
  return { message: body?.message ?? "Template submitted to Meta for review." };
}

export async function syncTemplatesFromMeta(config: WhatsAppConfig, deps: Pick<CeoitboxDeps, "fetch">): Promise<void> {
  await call(config, deps.fetch, "GET", "/api/v1/whatsapp/syncTemplatesFromMeta");
}

export interface ProviderTemplate {
  name: string;
  language: string;
  status: string; // Meta's status: APPROVED, PENDING, REJECTED, PAUSED, DISABLED …
  category: string | null;
  rejectedReason: string | null;
}

// Reads the stored Meta definition inside each result (field names as Meta
// uses them). Pure; tolerant of missing fields.
export function readProviderTemplates(body: unknown): ProviderTemplate[] {
  const results = (body as { results?: unknown[] } | null)?.results ?? [];
  const out: ProviderTemplate[] = [];
  for (const result of results) {
    const template = (result as { template?: Record<string, unknown> } | null)?.template;
    if (!template || typeof template.name !== "string") continue;
    const reason = template.rejected_reason ?? template.rejectedReason;
    out.push({
      name: template.name,
      language: typeof template.language === "string" ? template.language : "en",
      status: typeof template.status === "string" ? template.status.toUpperCase() : "UNKNOWN",
      category: typeof template.category === "string" ? template.category : null,
      rejectedReason: typeof reason === "string" && reason && reason !== "NONE" ? reason : null,
    });
  }
  return out;
}

// Every template on the account, newest first (pages of 100, at most 20 pages).
export async function listTemplates(config: WhatsAppConfig, deps: Pick<CeoitboxDeps, "fetch">): Promise<ProviderTemplate[]> {
  const all: ProviderTemplate[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await call(config, deps.fetch, "POST", "/api/v1/messageTemplate/getTemplates", {
      pagination: { current: page, pageSize: 100 },
      order: [{ fieldName: "creationTime", dir: "desc" }],
      search: [],
    });
    const batch = readProviderTemplates(body);
    all.push(...batch);
    const total = Number((body as { total?: number } | null)?.total ?? 0);
    if (batch.length < 100 || all.length >= total) break;
  }
  return all;
}
