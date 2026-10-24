import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { clearSetting, upsertSetting } from "@/lib/db/repositories/settings.repository";
import { encryptSecret } from "@/lib/security/encryption";
import { askAssistant, type AskPerson } from "@/server/ai/assistant";
import { listMessages } from "@/lib/db/repositories/ai.repository";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { aiGate } from "@/server/ai/limits";
import { createUser } from "./helpers";

// D-172 Pic bot - ai: 10 different signed-in people asking at the same moment,
// against the real MySQL and the real concurrency gate, with a MOCKED provider
// (300 ms per call, a tool call then an answer naming the asker). Checks that
// every answer reaches its own asker, nothing crosses between conversations,
// writes stay consistent, and one person's failure doesn't affect others.
// Measured numbers are written to test-results/picbot-concurrency.json for
// docs/CHATBOT_CONCURRENCY_TEST_REPORT.md.
const CLIENTS = 10;
const PROVIDER_MS = 300;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let adminId: number;
const people: number[] = [];
let inFlight = 0;
let peakInFlight = 0;

async function setSetting(name: string, value: string, encrypted = false) {
  await upsertSetting({ key: name, group: "AI", valueType: "STRING", encrypted, storedValue: encrypted ? encryptSecret(value) : value, updatedBy: adminId });
}

async function asked(id: number): Promise<AskPerson> {
  const user = (await findUserById(id))!;
  return { id: user.id, roles: user.roles, modules: user.modules, chatModes: user.chatModes, salesforceScope: user.salesforceScope, name: user.name, email: user.email };
}

// The mock provider: counts calls in flight; the answer repeats the tool data
// and the system prompt's name, so a crossed wire would show.
function mockProvider(failFor: string | null = null) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      await sleep(PROVIDER_MS);
      const body = JSON.parse(String(init?.body));
      const name = /You are helping (.+?)\. Today/.exec(body.system)?.[1] ?? "?";
      if (failFor && name === failFor) return json({ error: { message: "boom" } }, 500);
      const last = body.messages[body.messages.length - 1];
      if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
        const data = JSON.parse(last.content[0].content).data;
        return json({ model: "mock", content: [{ type: "text", text: `Answer for ${name}: ${data.pending} waiting.` }], usage: { input_tokens: 30, output_tokens: 8 } });
      }
      return json({ model: "mock", content: [{ type: "tool_use", id: "t", name: "approvals_waiting_for_me", input: {} }], usage: { input_tokens: 20, output_tokens: 4 } });
    } finally {
      inFlight -= 1;
    }
  };
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

const report: Record<string, unknown> = { clients: CLIENTS, providerMsPerCall: PROVIDER_MS, callsPerQuestion: 2, mocked: true, date: new Date().toISOString() };

beforeAll(async () => {
  adminId = await createUser({ name: "Load admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  for (let index = 0; index < CLIENTS + 1; index += 1) {
    const id = await createUser({ name: `Load person ${index + 1}` });
    await getDbPool().query("UPDATE users SET module_access = 'APPROVAL,AI', chat_modes = 'APPROVAL' WHERE id = ?", [id]);
    people.push(id);
  }
  await setSetting("ai.active_provider", "CLAUDE");
  await setSetting("ai.claude.api_key", "sk-ant-load-test-key", true);
  await setSetting("ai.claude.model", "mock");
  await setSetting("ai.claude.business_data", "ALLOWED");
  await setSetting("ai.requests_per_minute", "60");
});

afterAll(async () => {
  for (const name of ["ai.active_provider", "ai.claude.api_key", "ai.claude.model", "ai.claude.business_data", "ai.requests_per_minute", "ai.concurrent_global"]) await clearSetting(name, adminId);
  fs.mkdirSync(path.resolve("test-results"), { recursive: true });
  fs.writeFileSync(path.resolve("test-results/picbot-concurrency.json"), JSON.stringify(report, null, 2));
  await getDbPool().end();
});

async function run(ids: number[], provider: ReturnType<typeof mockProvider>) {
  const memoryBefore = process.memoryUsage().rss;
  const cpuBefore = process.cpuUsage();
  const started = Date.now();
  const results = await Promise.all(
    ids.map(async (id) => {
      const t0 = Date.now();
      const result = await askAssistant(await asked(id), { conversationId: null, mode: "APPROVAL", question: `What's waiting for me? (${id})`, requestKey: crypto.randomUUID(), fetchImpl: provider as unknown as typeof fetch });
      return { id, result, ms: Date.now() - t0 };
    }),
  );
  const cpu = process.cpuUsage(cpuBefore);
  return { results, wallMs: Date.now() - started, rssMb: Math.round(process.memoryUsage().rss / 1e6), rssDeltaMb: Math.round((process.memoryUsage().rss - memoryBefore) / 1e6), cpuMs: Math.round((cpu.user + cpu.system) / 1000) };
}

describe(`${CLIENTS} people at once (mocked provider)`, () => {
  it("every question is answered, to its own asker, with consistent writes (global limit 10)", async () => {
    await setSetting("ai.concurrent_global", "10");
    peakInFlight = 0;
    const ids = people.slice(0, CLIENTS);
    const { results, wallMs, rssMb, rssDeltaMb, cpuMs } = await run(ids, mockProvider());
    const latencies = results.map((item) => item.ms);
    expect(results.every((item) => item.result.ok)).toBe(true);
    for (const item of results) {
      if (!item.result.ok) continue;
      const messages = await listMessages(item.id, item.result.conversationId);
      const user = (await findUserById(item.id))!;
      expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
      expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
      expect(messages.at(-1)!.content).toBe(`Answer for ${user.name}: 0 waiting.`); // never another person's
      expect(messages[0]!.content).toContain(`(${item.id})`);
    }
    const [[counts]] = await getDbPool().query<RowDataPacket[]>(
      "SELECT COUNT(DISTINCT c.id) AS conversations, COUNT(m.id) AS messages FROM ai_conversations c JOIN ai_messages m ON m.conversation_id = c.id WHERE c.owner_user_id IN (?)",
      [ids],
    );
    expect(Number(counts!.conversations)).toBe(CLIENTS);
    expect(Number(counts!.messages)).toBe(CLIENTS * 2);
    expect(aiGate.stats()).toEqual({ running: 0, queued: 0, people: 0 });
    report.unlimited = { succeeded: results.filter((item) => item.result.ok).length, failed: results.filter((item) => !item.result.ok).length, peakProviderCallsInFlight: peakInFlight, avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length), p95Ms: percentile(latencies, 95), maxMs: Math.max(...latencies), wallMs, rssMb, rssDeltaMb, cpuMs, dbConversations: Number(counts!.conversations), dbMessages: Number(counts!.messages) };
  });

  it("with a global limit of 4, the rest wait their turn (bounded) and still all succeed", async () => {
    await setSetting("ai.concurrent_global", "4");
    peakInFlight = 0;
    const { results, wallMs } = await run(people.slice(0, CLIENTS), mockProvider());
    const latencies = results.map((item) => item.ms);
    expect(results.every((item) => item.result.ok)).toBe(true);
    expect(peakInFlight).toBeLessThanOrEqual(4);
    report.globalLimit4 = { succeeded: results.filter((item) => item.result.ok).length, failed: results.filter((item) => !item.result.ok).length, peakProviderCallsInFlight: peakInFlight, avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length), p95Ms: percentile(latencies, 95), maxMs: Math.max(...latencies), wallMs };
  });

  it("one person's provider failure doesn't affect the others", async () => {
    await setSetting("ai.concurrent_global", "10");
    const failing = (await findUserById(people[0]!))!.name;
    const { results } = await run(people.slice(0, CLIENTS), mockProvider(failing));
    expect(results.find((item) => item.id === people[0])!.result.ok).toBe(false);
    expect(results.filter((item) => item.id !== people[0]).every((item) => item.result.ok)).toBe(true);
    report.oneFailure = { failedAsExpected: 1, othersSucceeded: results.filter((item) => item.id !== people[0] && item.result.ok).length };
  });

  it("a person firing 3 at once gets 2 answered and 1 refused (per-person limit 2)", async () => {
    const id = people[CLIENTS]!;
    const person = await asked(id);
    const results = await Promise.all([1, 2, 3].map((n) => askAssistant(person, { conversationId: null, mode: "APPROVAL", question: `burst ${n}`, requestKey: crypto.randomUUID(), fetchImpl: mockProvider() as unknown as typeof fetch })));
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok && result.code === "PERSON_BUSY")).toHaveLength(1);
    report.perPersonLimit = { sent: 3, answered: 2, refusedPersonBusy: 1 };
  });
});
