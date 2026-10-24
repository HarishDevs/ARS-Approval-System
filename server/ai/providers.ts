// D-169 (AI module branch): one way to talk to every AI provider. Claude uses
// Anthropic's Messages API; ChatGPT, Grok and DeepSeek use the OpenAI-style
// chat completions API at their own addresses. Calls are made from the
// server only; keys never reach the browser, the log or an error message.
// The conversation is kept in one neutral shape (with tool calls and tool
// results) and converted per provider. `fetchImpl` is replaceable so tests
// never call a real provider.
export type ProviderCode = "CLAUDE" | "OPENAI" | "GROK" | "DEEPSEEK";
export const PROVIDERS: readonly ProviderCode[] = ["CLAUDE", "OPENAI", "GROK", "DEEPSEEK"];
export const PROVIDER_LABEL: Record<ProviderCode, string> = { CLAUDE: "Claude (Anthropic)", OPENAI: "ChatGPT (OpenAI)", GROK: "Grok (xAI)", DEEPSEEK: "DeepSeek" };
export const PROVIDER_SETTING: Record<ProviderCode, string> = { CLAUDE: "claude", OPENAI: "openai", GROK: "grok", DEEPSEEK: "deepseek" };

type OpenAiStyle = Exclude<ProviderCode, "CLAUDE">;
const OPENAI_STYLE_URL: Record<OpenAiStyle, string> = {
  OPENAI: "https://api.openai.com/v1/chat/completions",
  GROK: "https://api.x.ai/v1/chat/completions",
  DEEPSEEK: "https://api.deepseek.com/chat/completions",
};
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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
  maxTokens: number;
  timeoutMs: number;
}

export interface ChatAnswer {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

// What went wrong, in words safe to show. `retryable` says whether another
// provider may be tried (not for a refused key, a bad model or a bad request).
export class ProviderError extends Error {
  constructor(
    readonly kind: "KEY_REFUSED" | "MODEL_NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE" | "TIMEOUT" | "BAD_REQUEST" | "BAD_ANSWER",
    message: string,
    readonly retryable: boolean,
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

function errorFor(status: number, detail: string): ProviderError {
  const said = detail ? ` (${redactSecrets(detail)})` : "";
  if (status === 401 || status === 403) return new ProviderError("KEY_REFUSED", `The provider refused the API key${said}.`, false);
  if (status === 404) return new ProviderError("MODEL_NOT_FOUND", `The provider doesn't know this model${said}.`, false);
  if (status === 429) return new ProviderError("RATE_LIMITED", `The provider's rate limit or quota was reached${said}.`, true);
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

export async function chat(config: ProviderConfig, request: ChatRequest, fetchImpl: typeof fetch = fetch): Promise<ChatAnswer> {
  const claude = config.provider === "CLAUDE";
  const url = claude ? ANTHROPIC_URL : OPENAI_STYLE_URL[config.provider as OpenAiStyle];
  const headers: Record<string, string> = { "content-type": "application/json" };
  const tools = request.tools ?? [];
  let body: Record<string, unknown>;
  if (claude) {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: config.model, max_tokens: request.maxTokens, system: request.system, messages: anthropicMessages(request.turns) };
    if (tools.length) body.tools = tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
  } else {
    headers.authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, messages: openAiMessages(request.system, request.turns) };
    // OpenAI's newer models take max_completion_tokens; xAI and DeepSeek take max_tokens.
    body[config.provider === "OPENAI" ? "max_completion_tokens" : "max_tokens"] = request.maxTokens;
    if (tools.length) body.tools = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
  }

  let response: Response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(request.timeoutMs) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new ProviderError("TIMEOUT", `No answer within ${Math.round(request.timeoutMs / 1000)} seconds.`, true);
    throw new ProviderError("UNAVAILABLE", "Couldn't reach the provider.", true);
  }
  if (!response.ok) throw errorFor(response.status, await providerMessage(response));

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) throw new ProviderError("BAD_ANSWER", "The provider's answer couldn't be read.", true);
  if (claude) {
    const content = Array.isArray(data.content) ? (data.content as { type?: string; text?: string; id?: string; name?: string; input?: unknown }[]) : [];
    const text = content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
    const toolCalls = content.filter((part) => part.type === "tool_use" && part.id && part.name).map((part) => ({ id: part.id!, name: part.name!, args: parseArgs(part.input) }));
    const usage = (data.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    if (!text && !toolCalls.length) throw new ProviderError("BAD_ANSWER", "The provider sent an empty answer.", true);
    return { text, toolCalls, model: String(data.model ?? config.model), inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null };
  }
  const choices = Array.isArray(data.choices) ? (data.choices as { message?: { content?: unknown; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[]) : [];
  const message = choices[0]?.message;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  const toolCalls = (message?.tool_calls ?? []).filter((call) => call.id && call.function?.name).map((call) => ({ id: call.id!, name: call.function!.name!, args: parseArgs(call.function!.arguments) }));
  const usage = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  if (!text && !toolCalls.length) throw new ProviderError("BAD_ANSWER", "The provider sent an empty answer.", true);
  return { text, toolCalls, model: String(data.model ?? config.model), inputTokens: usage.prompt_tokens ?? null, outputTokens: usage.completion_tokens ?? null };
}
