// D-169 (AI module branch): one way to talk to every AI provider. Claude uses
// Anthropic's Messages API; ChatGPT, Grok, DeepSeek, Groq, Gemini and NVIDIA use the OpenAI-style
// chat completions API at their own addresses. Calls are made from the
// server only; keys never reach the browser, the log or an error message.
// The conversation is kept in one neutral shape (with tool calls and tool
// results) and converted per provider. `fetchImpl` is replaceable so tests
// never call a real provider.
// D-174: Groq (groq.com, not xAI's Grok), Gemini (Google AI Studio) and NVIDIA (Nemotron, build.nvidia.com) added.
export type ProviderCode = "CLAUDE" | "OPENAI" | "GROK" | "DEEPSEEK" | "GROQ" | "GEMINI" | "NVIDIA";
export const PROVIDERS: readonly ProviderCode[] = ["CLAUDE", "OPENAI", "GROK", "DEEPSEEK", "GROQ", "GEMINI", "NVIDIA"];
export const PROVIDER_LABEL: Record<ProviderCode, string> = { CLAUDE: "Claude (Anthropic)", OPENAI: "ChatGPT (OpenAI)", GROK: "Grok (xAI)", DEEPSEEK: "DeepSeek", GROQ: "Groq", GEMINI: "Gemini (Google AI Studio)", NVIDIA: "NVIDIA (Nemotron)" };
export const PROVIDER_SETTING: Record<ProviderCode, string> = { CLAUDE: "claude", OPENAI: "openai", GROK: "grok", DEEPSEEK: "deepseek", GROQ: "groq", GEMINI: "gemini", NVIDIA: "nvidia" };

type OpenAiStyle = Exclude<ProviderCode, "CLAUDE">;
const OPENAI_STYLE_URL: Record<OpenAiStyle, string> = {
  OPENAI: "https://api.openai.com/v1/chat/completions",
  GROK: "https://api.x.ai/v1/chat/completions",
  DEEPSEEK: "https://api.deepseek.com/chat/completions",
  GROQ: "https://api.groq.com/openai/v1/chat/completions",
  GEMINI: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  NVIDIA: "https://integrate.api.nvidia.com/v1/chat/completions",
};
const ANTHROPIC_DEFAULT = "https://api.anthropic.com";

// D-172: an optional base address for Claude (an approved company gateway or
// proxy, or a local mock for load tests), from the server environment only.
// Only https, or plain http to this machine itself, is accepted.
export function anthropicUrl(base: string | undefined = process.env.AI_CLAUDE_BASE_URL): string {
  const value = base?.trim().replace(/\/$/, "");
  const allowed = value && (/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(value) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(value));
  return `${allowed ? value : ANTHROPIC_DEFAULT}/v1/messages`;
}

export interface ProviderConfig {
  provider: ProviderCode;
  apiKey: string;
  model: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (object)
}

export interface ChatRequest {
  system: string;
  turns: Turn[];
  tools?: ToolSpec[];
  // D-204: "none" keeps the tools described (earlier tool calls stay valid) but asks for a written answer now.
  toolChoice?: "none";
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal; // D-172: the person pressed Stop or closed the panel
}

export interface ChatAnswer {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  truncated?: boolean; // D-204: the answer hit the output-token limit
}

// What went wrong, in words safe to show. `retryable` says whether another
// provider may be tried (not for a refused key, a bad model or a bad request).
export class ProviderError extends Error {
  constructor(
    readonly kind: "KEY_REFUSED" | "MODEL_NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE" | "TIMEOUT" | "BAD_REQUEST" | "BAD_ANSWER" | "CANCELLED",
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// Anything that looks like a key or a bearer token is removed from provider
// messages before they're shown or stored.
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk-ant|sk-proj|sk|xai)[-_][A-Za-z0-9_-]{4,}/g, "•••")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer •••")
    .replace(/[A-Za-z0-9_-]{32,}/g, "•••")
    .slice(0, 200);
}

// How long a rate-limited provider asks us to wait: the retry-after header
// (seconds, decimals allowed), else D-201 the message's "try again in
// 11.53s" / "in 502.5ms" (Groq), rounded up to whole seconds.
export function retryAfterSeconds(header: string | null, message: string): number | null {
  if (header !== null && /^\d{1,4}(\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header));
  const said = message.match(/try again in\s+(\d{1,4}(?:\.\d+)?)\s*(ms|s)\b/i);
  if (!said) return null;
  return Math.max(1, Math.ceil(said[2]!.toLowerCase() === "ms" ? Number(said[1]) / 1000 : Number(said[1])));
}

function errorFor(status: number, detail: string, retryAfter: string | null = null): ProviderError {
  const said = detail ? ` (${redactSecrets(detail)})` : "";
  const after = retryAfterSeconds(retryAfter, detail);
  if (status === 401 || status === 403) return new ProviderError("KEY_REFUSED", `The provider refused the API key${said}.`, false);
  if (status === 404) return new ProviderError("MODEL_NOT_FOUND", `The provider doesn't know this model${said}.`, false);
  if (status === 429) return new ProviderError("RATE_LIMITED", `The provider's rate limit or quota was reached${said}.`, true, after);
  if (status >= 500) return new ProviderError("UNAVAILABLE", `The provider is unavailable right now (HTTP ${status}).`, true);
  return new ProviderError("BAD_REQUEST", `The provider refused the request (HTTP ${status})${said}.`, false);
}

async function providerMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; message?: string };
    if (typeof body.error === "string") return body.error;
    return body.error?.message ?? body.message ?? "";
  } catch {
    return "";
  }
}

// ---- Anthropic shape ----
function anthropicMessages(turns: Turn[]): unknown[] {
  const out: { role: "user" | "assistant"; content: unknown }[] = [];
  for (const turn of turns) {
    if (turn.role === "user") out.push({ role: "user", content: turn.content });
    else if (turn.role === "assistant") {
      const blocks: unknown[] = [];
      if (turn.content) blocks.push({ type: "text", text: turn.content });
      for (const call of turn.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      out.push({ role: "assistant", content: blocks.length ? blocks : turn.content });
    } else {
      // Tool results go back as a user turn; consecutive results share one.
      const block = { type: "tool_result", tool_use_id: turn.toolCallId, content: turn.content };
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) (last.content as unknown[]).push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

// ---- OpenAI shape (ChatGPT, Grok, DeepSeek) ----
function openAiMessages(system: string, turns: Turn[]): unknown[] {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") out.push({ role: "user", content: turn.content });
    else if (turn.role === "assistant") {
      out.push({
        role: "assistant",
        content: turn.content || null,
        ...(turn.toolCalls?.length ? { tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}),
      });
    } else out.push({ role: "tool", tool_call_id: turn.toolCallId, content: turn.content });
  }
  return out;
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// D-172: one bounded retry. A 429 is retried once only when the provider says
// how long to wait (Retry-After, at most MAX_WAIT_SECONDS); a 5xx or a network
// failure once after a short random backoff. Never more than two attempts, so
// a busy provider can't cause a retry storm or double charges. Stop (the
// person's signal) ends it at once.
const MAX_WAIT_SECONDS = 20; // D-201: free tiers (Groq) ask for up to ~20 s
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new ProviderError("CANCELLED", "Stopped.", false));
    }, { once: true });
  });

async function sendOnce(fetchImpl: typeof fetch, url: string, init: RequestInit, request: ChatRequest): Promise<Response> {
  if (request.signal?.aborted) throw new ProviderError("CANCELLED", "Stopped.", false);
  const signal = request.signal ? AbortSignal.any([AbortSignal.timeout(request.timeoutMs), request.signal]) : AbortSignal.timeout(request.timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal });
  } catch (error) {
    if (request.signal?.aborted) throw new ProviderError("CANCELLED", "Stopped.", false);
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("TIMEOUT", `No answer within ${Math.round(request.timeoutMs / 1000)} seconds.`, true);
    throw new ProviderError("UNAVAILABLE", "Couldn't reach the provider.", true);
  }
  if (!response.ok) throw errorFor(response.status, await providerMessage(response), response.headers.get("retry-after"));
  return response;
}

const isBadToolCall = (error: ProviderError) => error.kind === "BAD_REQUEST" && /tool call|tool_use_failed/i.test(error.message);

// Up to three attempts. A rate limit with a short requested wait is waited
// out; an unavailable provider gets a short pause; a malformed tool call
// (D-177: gpt-oss on Groq now and then writes one, which the provider
// refuses) is simply asked again. D-201: these can follow one another (a
// retried tool call hitting the rate limit), so each attempt is judged anew.
async function sendWithRetry(fetchImpl: typeof fetch, url: string, init: RequestInit, request: ChatRequest): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sendOnce(fetchImpl, url, init, request);
    } catch (error) {
      if (!(error instanceof ProviderError) || attempt >= 3) throw error;
      const jitter = Math.floor(Math.random() * 500);
      if (error.kind === "RATE_LIMITED" && error.retryAfterSeconds !== null && error.retryAfterSeconds <= MAX_WAIT_SECONDS) await sleep(error.retryAfterSeconds * 1000 + jitter, request.signal);
      else if (error.kind === "UNAVAILABLE") await sleep(500 + jitter * 2, request.signal);
      else if (!isBadToolCall(error)) throw error;
    }
  }
}

export async function chat(config: ProviderConfig, request: ChatRequest, fetchImpl: typeof fetch = fetch): Promise<ChatAnswer> {
  const claude = config.provider === "CLAUDE";
  const url = claude ? anthropicUrl() : OPENAI_STYLE_URL[config.provider as OpenAiStyle];
  const headers: Record<string, string> = { "content-type": "application/json" };
  const tools = request.tools ?? [];
  let body: Record<string, unknown>;
  if (claude) {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: config.model, max_tokens: request.maxTokens, system: request.system, messages: anthropicMessages(request.turns) };
    if (tools.length) body.tools = tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
    if (tools.length && request.toolChoice === "none") body.tool_choice = { type: "none" };
  } else {
    headers.authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, messages: openAiMessages(request.system, request.turns) };
    // OpenAI's newer models take max_completion_tokens; the others take max_tokens.
    body[config.provider === "OPENAI" ? "max_completion_tokens" : "max_tokens"] = request.maxTokens;
    if (tools.length) body.tools = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
    if (tools.length && request.toolChoice === "none") body.tool_choice = "none";
  }

  const response = await sendWithRetry(fetchImpl, url, { method: "POST", headers, body: JSON.stringify(body) }, request);

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) throw new ProviderError("BAD_ANSWER", "The provider's answer couldn't be read.", true);
  if (claude) {
    const content = Array.isArray(data.content) ? (data.content as { type?: string; text?: string; id?: string; name?: string; input?: unknown }[]) : [];
    const text = content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
    const toolCalls = content.filter((part) => part.type === "tool_use" && part.id && part.name).map((part) => ({ id: part.id!, name: part.name!, args: parseArgs(part.input) }));
    const usage = (data.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    if (!text && !toolCalls.length) throw new ProviderError("BAD_ANSWER", "The provider sent an empty answer.", true);
    return { text, toolCalls, model: String(data.model ?? config.model), inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null, truncated: data.stop_reason === "max_tokens" };
  }
  const choices = Array.isArray(data.choices) ? (data.choices as { finish_reason?: string; message?: { content?: unknown; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[]) : [];
  const message = choices[0]?.message;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  const toolCalls = (message?.tool_calls ?? []).filter((call) => call.function?.name).map((call, index) => ({ id: call.id || `call_${index}`, name: call.function!.name!, args: parseArgs(call.function!.arguments) })); // some providers (Gemini) may omit the id
  const usage = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  // A reasoning model can spend the whole allowance thinking and return no text.
  if (!text && !toolCalls.length && choices[0]?.finish_reason === "length") throw new ProviderError("BAD_ANSWER", "The answer ran out of room (this model thinks first). Raise \"Longest answer (output tokens)\" or choose a non-reasoning model.", true);
  if (!text && !toolCalls.length) throw new ProviderError("BAD_ANSWER", "The provider sent an empty answer.", true);
  return { text, toolCalls, model: String(data.model ?? config.model), inputTokens: usage.prompt_tokens ?? null, outputTokens: usage.completion_tokens ?? null, truncated: choices[0]?.finish_reason === "length" };
}
