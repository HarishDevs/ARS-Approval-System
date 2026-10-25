import { beforeAll, describe, expect, it } from "vitest";
import type { ResultSetHeader } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { aiByDepartment, aiByMode, aiByPerson, aiByProvider, aiDaily, aiEnabledPeople, aiFailureReasons, aiLimitDays, aiTools, aiTotals, aiWeekHours } from "@/lib/db/repositories/ai-analytics.repository";
import { createDepartment, createUser, setDepartment } from "./helpers";

// D-193: the AI Analytics queries against the real schema, with a period of
// their own (a far-future day nothing else uses).
const from = new Date("2030-03-04T00:00:00Z");
const range = { from, to: new Date("2030-03-05T00:00:00Z") };
let person = 0;

beforeAll(async () => {
  person = await createUser({ name: "Analytics Asker" });
  await setDepartment(person, await createDepartment(null));
  const db = getDbPool();
  const [conversation] = await db.query<ResultSetHeader>("INSERT INTO ai_conversations (owner_user_id, title, mode, created_at) VALUES (?, 'Pipeline', 'SALESFORCE', ?)", [person, from]);
  const add = (role: string, extra: Record<string, unknown>, minutes: number) =>
    db.query(
      "INSERT INTO ai_messages (conversation_id, role, content, provider, model, input_tokens, output_tokens, latency_ms, error, evidence_json, unverified_json, created_at) VALUES (?, ?, 'x', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [conversation.insertId, role, extra.provider ?? null, extra.model ?? null, extra.input ?? null, extra.output ?? null, extra.latency ?? null, extra.error ?? null, extra.evidence ? JSON.stringify(extra.evidence) : null, extra.unverified ? JSON.stringify(extra.unverified) : null, new Date(from.getTime() + minutes * 60_000)],
    );
  await add("user", {}, 600);
  await add("assistant", { provider: "NVIDIA", model: "nemo", input: 1000, output: 200, latency: 1500, evidence: [{ tool: "salesforce_group" }, { tool: "salesforce_objects" }], unverified: ["35"] }, 601);
  await add("user", {}, 610);
  await add("assistant", { provider: "GROQ", model: "oss", error: "Groq: The provider's rate limit or quota was reached" }, 611);
});

describe("AI Analytics queries (D-193)", () => {
  it("count questions, answers, failures, people, tokens and time for the period", async () => {
    expect(await aiTotals(range)).toMatchObject({ questions: 2, answers: 1, failures: 1, askers: 1, conversations: 1, inputTokens: 1000, outputTokens: 200, avgLatencyMs: 1500, p90LatencyMs: 1500, withData: 1, calculated: 1 });
    expect((await aiTotals({ from: new Date("2030-03-06T00:00:00Z"), to: new Date("2030-03-07T00:00:00Z") })).questions).toBe(0);
  });
  it("break down by day, chat, provider, person, department, hour, lookup, failure and the daily limit", async () => {
    expect(await aiDaily(range)).toEqual([{ day: "2030-03-04", questions: 2, answers: 1, failures: 1 }]);
    expect(await aiByMode(range)).toEqual([{ mode: "SALESFORCE", questions: 2, people: 1 }]);
    expect((await aiByProvider(range)).map((row) => [row.provider, row.answers, row.failures])).toEqual([["NVIDIA", 1, 0], ["GROQ", 0, 1]]);
    expect((await aiByPerson(range))[0]).toMatchObject({ userId: person, questions: 2, conversations: 1, failures: 1, tokens: 1200 });
    expect((await aiByDepartment(range))[0]).toMatchObject({ questions: 2, people: 1 });
    expect(await aiWeekHours(range)).toEqual([{ weekday: 0, hour: 15, questions: 2 }]); // 10:00 UTC = 15:30 India, a Monday
    expect(await aiTools(range)).toEqual(expect.arrayContaining([{ tool: "salesforce_group", uses: 1 }, { tool: "salesforce_objects", uses: 1 }]));
    expect((await aiFailureReasons(range))[0]).toMatchObject({ count: 1 });
    expect(await aiLimitDays(range, 2)).toEqual({ personDays: 1, people: 1 });
    expect(await aiLimitDays(range, 3)).toEqual({ personDays: 0, people: 0 });
    expect(await aiEnabledPeople()).toBeGreaterThanOrEqual(0);
  });
});
