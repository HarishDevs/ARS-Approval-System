import { describe, expect, it, vi } from "vitest";
import { chat, ProviderError, redactSecrets, type ProviderConfig } from "@/server/ai/providers";
import { figuresIn, unverifiedFigures } from "@/server/ai/validate";
import { routeFor } from "@/server/ai/config";
import { canDecide, proposalHash } from "@/server/ai/proposals";
import { fetchAll, parseObjects, soqlFor } from "@/server/ai/connectors/salesforce";

// D-169 (AI module branch): the AI engine's rules, without any real provider.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const claude: ProviderConfig = { provider: "CLAUDE", apiKey: "sk-ant-test-1234567890", model: "claude-test" };
const openai: ProviderConfig = { provider: "OPENAI", apiKey: "sk-proj-test-1234567890", model: "gpt-test" };

describe("providers", () => {
  it("Claude: key in its header, system apart, tool calls and results in Anthropic's shape", async () => {
    const fetchImpl = vi.fn(async () => json({ model: "claude-test", content: [{ type: "tool_use", id: "t1", name: "my_tasks_summary", input: {} }], usage: { input_tokens: 10, output_tokens: 3 } }));
    const answer = await chat(
      claude,
      {
        system: "S",
        turns: [
          { role: "user", content: "Q" },
          { role: "assistant", content: "", toolCalls: [{ id: "t0", name: "x", args: {} }] },
          { role: "tool", toolCallId: "t0", name: "x", content: "{}" },
        ],
        tools: [{ name: "my_tasks_summary", description: "d", parameters: { type: "object" } }],
        maxTokens: 50,
        timeoutMs: 1000,
      },
      fetchImpl,
    );
    expect(answer.toolCalls).toEqual([{ id: "t1", name: "my_tasks_summary", args: {} }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(claude.apiKey);
    const body = JSON.parse(String(init.body));
    expect(body.system).toBe("S");
    expect(body.messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "t0", content: "{}" }] });
    expect(body.tools[0]).toMatchObject({ name: "my_tasks_summary", input_schema: { type: "object" } });
  });

  it("ChatGPT, Grok, DeepSeek, Groq, Gemini and NVIDIA: OpenAI shape at each provider's own address", async () => {
    const reply = { model: "m", choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: '{"period_days":30}' } }] } }], usage: { prompt_tokens: 5, completion_tokens: 2 } };
    const cases = [
      ["OPENAI", "https://api.openai.com/v1/chat/completions"],
      ["GROK", "https://api.x.ai/v1/chat/completions"],
      ["DEEPSEEK", "https://api.deepseek.com/chat/completions"],
      ["GROQ", "https://api.groq.com/openai/v1/chat/completions"],
      ["GEMINI", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"],
      ["NVIDIA", "https://integrate.api.nvidia.com/v1/chat/completions"],
    ] as const;
    for (const [provider, url] of cases) {
      const fetchImpl = vi.fn(async () => json(reply));
      const answer = await chat({ ...openai, provider }, { system: "S", turns: [{ role: "user", content: "Q" }], tools: [{ name: "f", description: "d", parameters: {} }], maxTokens: 50, timeoutMs: 1000 }, fetchImpl);
      expect(answer.toolCalls).toEqual([{ id: "c1", name: "f", args: { period_days: 30 } }]);
      const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(calledUrl).toBe(url);
      const body = JSON.parse(String(init.body));
      expect(body.messages[0]).toEqual({ role: "system", content: "S" });
      expect(body[provider === "OPENAI" ? "max_completion_tokens" : "max_tokens"]).toBe(50);
    }
  });

  it("a provider refusing a malformed tool call (Groq tool_use_failed) is retried up to twice; other 400s are not (D-177)", async () => {
    const bad = () => json({ error: { message: "Failed to parse tool call arguments as JSON", code: "tool_use_failed" } }, 400);
    const ok = { model: "m", choices: [{ message: { content: "Fine" } }] };
    const flaky = vi.fn().mockResolvedValueOnce(bad()).mockResolvedValueOnce(bad()).mockResolvedValueOnce(json(ok));
    const request = { system: "S", turns: [{ role: "user" as const, content: "Q" }], maxTokens: 50, timeoutMs: 1000 };
    expect((await chat({ ...openai, provider: "GROQ" }, request, flaky)).text).toBe("Fine");
    expect(flaky).toHaveBeenCalledTimes(3);
    const always = vi.fn(async () => bad());
    await expect(chat({ ...openai, provider: "GROQ" }, request, always)).rejects.toThrow(/tool call/);
    expect(always).toHaveBeenCalledTimes(3);
    const other = vi.fn(async () => json({ error: { message: "bad parameter" } }, 400));
    await expect(chat({ ...openai, provider: "GROQ" }, request, other)).rejects.toThrow(/refused the request/);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("a tool call without an id (Gemini) still runs, with a generated id", async () => {
    const reply = { model: "m", choices: [{ message: { content: null, tool_calls: [{ type: "function", function: { name: "f", arguments: "{}" } }] } }] };
    const answer = await chat({ ...openai, provider: "GEMINI" }, { system: "S", turns: [{ role: "user", content: "Q" }], maxTokens: 50, timeoutMs: 1000 }, vi.fn(async () => json(reply)));
    expect(answer.toolCalls).toEqual([{ id: "call_0", name: "f", args: {} }]);
  });

  it("errors say what happened, never the key; a refused key isn't retried elsewhere", async () => {
    const base = { system: "S", turns: [{ role: "user" as const, content: "Q" }], maxTokens: 5, timeoutMs: 1000 };
    const refused = await chat(openai, base, async () => json({ error: { message: "Incorrect API key provided: sk-proj-abcdef123456789" } }, 401)).catch((error) => error);
    expect(refused).toBeInstanceOf(ProviderError);
    expect(refused.kind).toBe("KEY_REFUSED");
    expect(refused.retryable).toBe(false);
    expect(refused.message).not.toContain("abcdef123456789");
    const busy = await chat(claude, base, async () => json({}, 529)).catch((error) => error);
    expect(busy).toMatchObject({ kind: "UNAVAILABLE", retryable: true });
    const down = await chat(claude, base, async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }))).catch((error) => error);
    expect(down).toMatchObject({ kind: "TIMEOUT", retryable: true });
    expect(redactSecrets("key xai-ABCDEF123456 and Bearer abc.def")).toBe("key ••• and Bearer •••");
  });
});

describe("numbers must come from the data", () => {
  it("finds figures, ignoring list markers", () => {
    expect(figuresIn("1. You have 12 approvals, 3 overdue; 1,250.5 total")).toEqual(["12", "3", "1250.5"]);
  });
  it("flags figures that aren't in the tool results or the question", () => {
    const data = JSON.stringify({ pending: 12, overdue: 3 });
    expect(unverifiedFigures("You have 12 waiting and 3 are overdue.", [data])).toEqual([]);
    expect(unverifiedFigures("You have 12 waiting, about 25% of the team's 48.", [data])).toEqual(["25", "48"]);
    expect(unverifiedFigures("Last 30 days", ["what about the last 30 days?"])).toEqual([]);
  });
  it("dates and times aren't figures (D-178)", () => {
    expect(figuresIn("Logins today (24 Oct 2026): 1. On 2026-10-24T11:51:00Z, at 11:51 pm, Oct 24, March 2025, 24/10/2026; 17 users")).toEqual(["1", "17"]);
  });
});

describe("routing", () => {
  const providers = {
    CLAUDE: { provider: "CLAUDE" as const, configured: true, businessData: false, model: "m" },
    OPENAI: { provider: "OPENAI" as const, configured: true, businessData: true, model: "m" },
    GROK: { provider: "GROK" as const, configured: false, businessData: true, model: null },
    DEEPSEEK: { provider: "DEEPSEEK" as const, configured: true, businessData: false, model: "m" },
    GROQ: { provider: "GROQ" as const, configured: false, businessData: false, model: null },
    GEMINI: { provider: "GEMINI" as const, configured: false, businessData: false, model: null },
    NVIDIA: { provider: "NVIDIA" as const, configured: false, businessData: false, model: null },
  };
  it("active then fallback, only set-up providers", () => {
    expect(routeFor({ active: "CLAUDE", fallback: "OPENAI", providers }, false)).toEqual(["CLAUDE", "OPENAI"]);
    expect(routeFor({ active: "GROK", fallback: "CLAUDE", providers }, false)).toEqual(["CLAUDE"]);
    expect(routeFor({ active: null, fallback: null, providers }, false)).toEqual([]);
  });
  it("business data never goes to a provider not approved for it, not even as a fallback", () => {
    expect(routeFor({ active: "CLAUDE", fallback: "OPENAI", providers }, true)).toEqual(["OPENAI"]);
    expect(routeFor({ active: "DEEPSEEK", fallback: "CLAUDE", providers }, true)).toEqual([]);
  });
});

describe("proposals", () => {
  const proposal = { requestedBy: 5, approverUserId: 9 as number | null, status: "PENDING" as const };
  it("only the named approver decides; never the person who asked; IT Admins when nobody is named", () => {
    expect(canDecide({ id: 9, roles: ["USER"] }, proposal)).toEqual({ ok: true });
    expect(canDecide({ id: 5, roles: ["USER", "SUPER_ADMIN"] }, proposal).ok).toBe(false);
    expect(canDecide({ id: 7, roles: ["USER", "IT_ADMIN"] }, proposal).ok).toBe(false);
    expect(canDecide({ id: 7, roles: ["USER", "IT_ADMIN"] }, { ...proposal, approverUserId: null })).toEqual({ ok: true });
    expect(canDecide({ id: 8, roles: ["USER"] }, { ...proposal, approverUserId: null }).ok).toBe(false);
    expect(canDecide({ id: 9, roles: ["USER"] }, { ...proposal, status: "APPROVED" as never }).ok).toBe(false);
  });
  it("the hash changes with any change to what the approver reads", () => {
    const base = { kind: "REMINDER", title: "Remind Ravi", details: "Three approvals waiting" };
    expect(proposalHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(proposalHash({ ...base, details: "Four approvals waiting" })).not.toBe(proposalHash(base));
  });
});

describe("Salesforce (read-only)", () => {
  it("objects and fields are checked by name; Id and SystemModstamp are always read", () => {
    expect(parseObjects("Account:Name,Industry;Opportunity:Amount")).toEqual([
      { object: "Account", fields: ["Id", "SystemModstamp", "Name", "Industry"] },
      { object: "Opportunity", fields: ["Id", "SystemModstamp", "Amount"] },
    ]);
    expect(() => parseObjects("Account:Name FROM User--")).toThrow();
    expect(soqlFor({ object: "Account", fields: ["Id", "Name"] }, "2026-10-01T10:00:00.000Z")).toBe("SELECT Id, Name FROM Account WHERE SystemModstamp > 2026-10-01T10:00:00.000Z ORDER BY SystemModstamp ASC");
    expect(soqlFor({ object: "Account", fields: ["Id"] }, "1 OR 1=1")).toBe("SELECT Id FROM Account ORDER BY SystemModstamp ASC");
  });
  it("reads every page and keeps the latest change time; a failed page fails the whole run", async () => {
    const pages: unknown[] = [
      { done: false, nextRecordsUrl: "/services/data/v61.0/query/01g-2000", records: [{ attributes: {}, Id: "001A", SystemModstamp: "2026-10-01T10:00:00.000+0000", Name: "A" }] },
      { done: true, records: [{ attributes: {}, Id: "001B", SystemModstamp: "2026-10-02T10:00:00.000+0000", Name: "B" }] },
    ];
    const get = vi.fn(async () => pages.shift());
    const fetched = await fetchAll(get, "SELECT Id FROM Account");
    expect(fetched.records.map((record) => record.id)).toEqual(["001A", "001B"]);
    expect(fetched.records[0]!.data).not.toHaveProperty("attributes");
    expect(fetched.latest).toBe("2026-10-02T10:00:00.000+0000");
    expect(get.mock.calls[1]).toEqual(["/services/data/v61.0/query/01g-2000"]);
    const failing = [async () => ({ done: false, nextRecordsUrl: "/services/data/v61.0/query/01g-2000", records: [] }), async () => Promise.reject(new Error("Salesforce refused the request (HTTP 401)."))];
    await expect(fetchAll(async () => failing.shift()!(), "q")).rejects.toThrow(/401/);
    await expect(fetchAll(async () => ({ done: false, nextRecordsUrl: "https://evil.example/x", records: [] }), "q")).rejects.toThrow(/Unexpected next-page/);
  });
});
