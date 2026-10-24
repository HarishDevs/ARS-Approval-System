import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { upsertSetting, clearSetting } from "@/lib/db/repositories/settings.repository";
import { encryptSecret } from "@/lib/security/encryption";
import { askAssistant, type AskPerson } from "@/server/ai/assistant";
import { decide } from "@/server/ai/proposals";
import { findProposal, listMessages, listProposalsToDecide, listConversations, ownsConversation } from "@/lib/db/repositories/ai.repository";
import { approvalsWaitingFor } from "@/lib/db/repositories/ai-data.repository";
import { syncSalesforce } from "@/server/ai/connectors/salesforce";
import { finishConnect, salesforceGet, startConnect } from "@/server/ai/connectors/salesforce-auth";
import { getConnection } from "@/lib/db/repositories/salesforce.repository";
import { runAiStep } from "@/server/ai/jobs";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { createUser } from "./helpers";
import { resetEnvCacheForTests } from "@/config/environment";

// D-169, D-172 Pic bot - ai against MySQL. No real provider or Salesforce is
// called: fetch is replaced. People are read from the database exactly as a
// signed-in session would see them.
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const key = () => crypto.randomUUID();

let adminId: number;
let managerId: number;
let personId: number;
let otherId: number;

async function setSetting(name: string, value: string, encrypted = false) {
  await upsertSetting({ key: name, group: name.startsWith("ai.salesforce") ? "AI_DATA" : "AI", valueType: "STRING", encrypted, storedValue: encrypted ? encryptSecret(value) : value, updatedBy: adminId });
}
async function access(id: number, modules: string, chatModes: string, scope = "NONE") {
  await getDbPool().query("UPDATE users SET module_access = ?, chat_modes = ?, salesforce_scope = ? WHERE id = ?", [modules, chatModes, scope, id]);
}
async function asked(id: number): Promise<AskPerson> {
  const user = (await findUserById(id))!;
  return { id: user.id, roles: user.roles, modules: user.modules, chatModes: user.chatModes, salesforceScope: user.salesforceScope, name: user.name, email: user.email };
}
function lastBody(fetchImpl: ReturnType<typeof vi.fn>, index = 0) {
  return JSON.parse(String((fetchImpl.mock.calls[index] as unknown as [string, RequestInit])[1].body));
}
const text = (value: string) => vi.fn(async () => json({ model: "claude-fake", content: [{ type: "text", text: value }], usage: { input_tokens: 5, output_tokens: 2 } }));

// A fake Claude that asks for one tool, then answers with what it was given (plus an invented 77).
function toolThenAnswer(tool: string, input: Record<string, unknown> = {}) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const last = body.messages[body.messages.length - 1];
    if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
      return json({ model: "claude-fake", content: [{ type: "text", text: `Verified: ${last.content[0].content.slice(0, 300)} Roughly 77 people agree.` }], usage: { input_tokens: 20, output_tokens: 10 } });
    }
    return json({ model: "claude-fake", content: [{ type: "tool_use", id: "tu1", name: tool, input }], usage: { input_tokens: 15, output_tokens: 5 } });
  });
}

beforeAll(async () => {
  adminId = await createUser({ name: "AI admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  managerId = await createUser({ name: "AI manager" });
  personId = await createUser({ name: "AI asker", managerId });
  otherId = await createUser({ name: "AI other" });
  await access(personId, "APPROVAL,TASK,INFORMATION,AI", "APPROVAL,TASK,INFORMATION");
  await access(otherId, "APPROVAL,AI", "APPROVAL");
  await setSetting("ai.active_provider", "CLAUDE");
  await setSetting("ai.claude.api_key", "sk-ant-integration-test-key", true);
  await setSetting("ai.claude.model", "claude-fake");
  await setSetting("ai.claude.business_data", "ALLOWED");
  await setSetting("ai.requests_per_minute", "60");
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  for (const name of ["ai.active_provider", "ai.claude.api_key", "ai.claude.business_data", "ai.daily_questions_per_person", "ai.requests_per_minute", "ai.general_chat", "ai.emergency_stop", "ai.salesforce.client_id", "ai.salesforce.client_secret", "ai.salesforce.objects", "ai.salesforce.copy_hourly"]) await clearSetting(name, adminId);
  await getDbPool().query("UPDATE ai_salesforce_connection SET status = 'DISCONNECTED', access_token_enc = NULL, refresh_token_enc = NULL, instance_url = NULL WHERE id = 1");
  await getDbPool().end();
});

describe("chat modes are enforced on the server", () => {
  it("an Approval chat gets Approval tools only; a Salesforce or task tool the model asks for is refused", async () => {
    const calls: unknown[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const last = body.messages[body.messages.length - 1];
      if (Array.isArray(last.content)) return json({ model: "m", content: [{ type: "text", text: "That's outside this chat." }] });
      return json({ model: "m", content: [{ type: "tool_use", id: "x", name: "salesforce_query", input: { object: "Account", fields: ["Name"], limit: 5 } }, { type: "tool_use", id: "y", name: "my_tasks_summary", input: {} }] });
    });
    const result = await askAssistant(await asked(otherId), { conversationId: null, mode: "APPROVAL", question: "Show me Salesforce accounts and my tasks", requestKey: key(), fetchImpl });
    if (!result.ok) throw new Error(result.message);
    const first = calls[0] as { tools: { name: string }[]; system: string };
    expect(first.tools.map((tool) => tool.name).sort()).toEqual(["approvals_waiting_for_me", "my_requests_summary", "propose_action"]);
    expect(first.system).toContain("This chat is limited to Approvals");
    const replies = (calls[1] as { messages: { content: { content: string }[] }[] }).messages.at(-1)!.content.map((item) => item.content);
    expect(replies.every((reply) => reply.includes("isn't available in this chat"))).toBe(true);
  });

  it("modes the person may not use are refused (general off; a mode they don't have; no AI module)", async () => {
    expect(await askAssistant(await asked(otherId), { conversationId: null, mode: "GENERAL", question: "hi", requestKey: key() })).toMatchObject({ ok: false, code: "MODE_DENIED" });
    expect(await askAssistant(await asked(otherId), { conversationId: null, mode: "SALESFORCE", question: "hi", requestKey: key() })).toMatchObject({ ok: false, code: "MODE_DENIED" });
    const noAi = await createUser({ name: "No AI" });
    expect(await askAssistant(await asked(noAi), { conversationId: null, mode: "APPROVAL", question: "hi", requestKey: key() })).toMatchObject({ ok: false, code: "NO_ACCESS" });
  });

  it("a General chat (switched on) gets no tools and is told it has no data", async () => {
    await setSetting("ai.general_chat", "ON");
    await access(otherId, "APPROVAL,AI", "APPROVAL,GENERAL");
    const fetchImpl = text("Paris.");
    const result = await askAssistant(await asked(otherId), { conversationId: null, mode: "GENERAL", question: "What is the capital of France?", requestKey: key(), fetchImpl });
    expect(result.ok).toBe(true);
    const body = lastBody(fetchImpl);
    expect(body.tools).toBeUndefined();
    expect(body.system).toContain("NO access to ARS or Salesforce data");
    expect(JSON.stringify(body)).not.toContain("sk-ant-integration-test-key");
    await access(otherId, "APPROVAL,AI", "APPROVAL");
    await clearSetting("ai.general_chat", adminId);
  });

  it("revoking a mode applies to an open conversation at once; the emergency stop refuses everything", async () => {
    const started = await askAssistant(await asked(personId), { conversationId: null, mode: "TASK", question: "my tasks?", requestKey: key(), fetchImpl: text("No tasks.") });
    if (!started.ok) throw new Error(started.message);
    await access(personId, "APPROVAL,INFORMATION,AI", "APPROVAL,TASK,INFORMATION"); // Task module removed
    expect(await askAssistant(await asked(personId), { conversationId: started.conversationId, question: "and now?", requestKey: key(), fetchImpl: text("x") })).toMatchObject({ ok: false, code: "MODE_REVOKED" });
    await access(personId, "APPROVAL,TASK,INFORMATION,AI", "APPROVAL,TASK,INFORMATION");
    await setSetting("ai.emergency_stop", "ON");
    expect(await askAssistant(await asked(personId), { conversationId: started.conversationId, question: "and now?", requestKey: key() })).toMatchObject({ ok: false, code: "STOPPED" });
    await clearSetting("ai.emergency_stop", adminId);
  });

  it("evidence is saved and an invented figure is flagged", async () => {
    const result = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "What is waiting for me?", requestKey: key(), fetchImpl: toolThenAnswer("approvals_waiting_for_me") });
    if (!result.ok) throw new Error(result.message);
    const answer = (await listMessages(personId, result.conversationId)).find((message) => message.role === "assistant")!;
    const real = await approvalsWaitingFor(personId);
    expect(answer.evidence).toEqual([expect.objectContaining({ tool: "approvals_waiting_for_me", result: expect.objectContaining({ pending: real.pending }) })]);
    expect(answer.unverified).toContain("77");
  });
});

describe("conversations: isolation and idempotency", () => {
  it("a conversation is its owner's alone", async () => {
    const [mine] = await listConversations(personId, 1);
    expect(await ownsConversation(otherId, mine!.id)).toBe(false);
    expect(await listMessages(otherId, mine!.id)).toEqual([]);
    expect(await askAssistant(await asked(otherId), { conversationId: mine!.id, question: "show me", requestKey: key() })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("the same request key twice is one question, one charge; a failed one is retried without storing it twice", async () => {
    const requestKey = key();
    const fetchImpl = text("Done.");
    const first = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "once please", requestKey, fetchImpl });
    const again = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "once please", requestKey, fetchImpl });
    if (!first.ok) throw new Error(first.message);
    expect(again).toEqual({ ok: true, conversationId: first.conversationId, duplicate: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await listMessages(personId, first.conversationId)).filter((message) => message.role === "user")).toHaveLength(1);

    const failingKey = key();
    const failed = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "try me", requestKey: failingKey, fetchImpl: vi.fn(async () => json({ error: { message: "bad" } }, 400)) });
    expect(failed.ok).toBe(false);
    const retried = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "try me", requestKey: failingKey, fetchImpl: text("Now it works.") });
    if (!retried.ok) throw new Error(retried.message);
    expect(retried.conversationId).toBe(failed.conversationId);
    const messages = await listMessages(personId, retried.conversationId);
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({ role: "assistant", content: "Now it works.", error: null });
  });

  it("the per-minute and daily limits stop bursts", async () => {
    await setSetting("ai.requests_per_minute", "1");
    const someone = await createUser({ name: "Burst" });
    await access(someone, "APPROVAL,AI", "APPROVAL");
    try {
      // The counter is per minute and shared, so the second question in the same minute is refused.
      const first = await askAssistant(await asked(someone), { conversationId: null, mode: "APPROVAL", question: "one", requestKey: key(), fetchImpl: text("ok") });
      expect(first.ok).toBe(true);
      expect(await askAssistant(await asked(someone), { conversationId: null, mode: "APPROVAL", question: "two", requestKey: key(), fetchImpl: text("ok") })).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    } finally {
      await setSetting("ai.requests_per_minute", "60");
    }
    await setSetting("ai.daily_questions_per_person", "1");
    try {
      const daily = await createUser({ name: "Daily" });
      await access(daily, "APPROVAL,AI", "APPROVAL");
      expect((await askAssistant(await asked(daily), { conversationId: null, mode: "APPROVAL", question: "one", requestKey: key(), fetchImpl: text("ok") })).ok).toBe(true);
      expect(await askAssistant(await asked(daily), { conversationId: null, mode: "APPROVAL", question: "two", requestKey: key(), fetchImpl: text("ok") })).toMatchObject({ ok: false, code: "DAILY_LIMIT" });
    } finally {
      await clearSetting("ai.daily_questions_per_person", adminId);
    }
  });
});

describe("Salesforce: OAuth, tokens and live queries", () => {
  beforeAll(() => {
    // The callback address is built from APP_BASE_URL (as on the server).
    process.env.APP_BASE_URL = "https://approval.example.test";
    resetEnvCacheForTests();
  });
  it("the callback needs the right state from the same Super Admin; tokens are stored encrypted", async () => {
    await setSetting("ai.salesforce.client_id", "connected-app-key-123", true);
    await setSetting("ai.salesforce.client_secret", "connected-app-secret-123", true);
    const started = await startConnect(adminId);
    if (!started.ok) throw new Error(started.message);
    const state = new URL(started.url).searchParams.get("state")!;
    expect(await finishConnect(adminId, { code: "c", state: "wrong", error: null })).toEqual({ ok: false, error: "STATE" });
    // A wrong state uses up the attempt; start again.
    const again = await startConnect(adminId);
    if (!again.ok) throw new Error(again.message);
    const goodState = new URL(again.url).searchParams.get("state")!;
    expect(goodState).not.toBe(state);
    expect(await finishConnect(managerId, { code: "c", state: goodState, error: null })).toEqual({ ok: false, error: "STATE" }); // someone else
    const third = await startConnect(adminId);
    if (!third.ok) throw new Error(third.message);
    const tokenCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/services/oauth2/token")) {
        tokenCalls.push(String(init?.body));
        return json({ access_token: "00D-access-token-abc", refresh_token: "refresh-token-xyz", instance_url: "https://ars-test.my.salesforce.com", id: "https://test.salesforce.com/id/00D/005", scope: "api refresh_token" });
      }
      return json({ username: "integration@ars.test" });
    });
    expect(await finishConnect(adminId, { code: "the-code", state: new URL(third.url).searchParams.get("state")!, error: null }, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true });
    expect(tokenCalls[0]).toContain("code_verifier=");
    expect(tokenCalls[0]).toContain("grant_type=authorization_code");
    const connection = await getConnection();
    expect(connection).toMatchObject({ status: "CONNECTED", instanceUrl: "https://ars-test.my.salesforce.com", connectedUserName: "integration@ars.test" });
    const [raw] = await getDbPool().query<RowDataPacket[]>("SELECT access_token_enc, refresh_token_enc FROM ai_salesforce_connection WHERE id = 1");
    expect(String(raw[0]!.access_token_enc)).not.toContain("00D-access-token-abc");
    expect(String(raw[0]!.refresh_token_enc)).not.toContain("refresh-token-xyz");
  });

  it("an expired session is refreshed once; a refused refresh asks for reconnecting", async () => {
    const seen: string[] = [];
    const refreshing = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push(url);
      if (url.endsWith("/services/oauth2/token")) return json({ access_token: "00D-new-token" });
      const auth = (init?.headers as Record<string, string>).authorization;
      return auth === "Bearer 00D-new-token" ? json({ ok: true }) : json([{ errorCode: "INVALID_SESSION_ID" }], 401);
    });
    expect(await salesforceGet("/services/data/v61.0/limits", refreshing as unknown as typeof fetch)).toEqual({ ok: true });
    expect(seen.filter((url) => url.endsWith("/services/oauth2/token"))).toHaveLength(1);
    const refused = vi.fn(async (url: string) => (url.endsWith("/services/oauth2/token") ? json({ error: "invalid_grant" }, 400) : json([{ errorCode: "INVALID_SESSION_ID" }], 401)));
    await expect(salesforceGet("/services/data/v61.0/limits", refused as unknown as typeof fetch)).rejects.toThrow(/reconnecting/);
    expect((await getConnection()).status).toBe("NEEDS_REAUTH");
    await getDbPool().query("UPDATE ai_salesforce_connection SET status = 'CONNECTED', access_token_enc = ? WHERE id = 1", [encryptSecret("00D-new-token")]);
  });

  it("a Salesforce chat reads only allowed fields, scoped to the person's own records with USER_MODE; the token never reaches the model", async () => {
    await setSetting("ai.salesforce.objects", "Account:Name,Industry");
    await access(personId, "APPROVAL,TASK,INFORMATION,AI", "APPROVAL,SALESFORCE", "OWN");
    const soql: string[] = [];
    const salesforce = vi.fn(async (url: string) => {
      const query = decodeURIComponent(url.split("q=")[1] ?? "");
      soql.push(query);
      if (query.startsWith("SELECT Id FROM User")) return json({ totalSize: 1, done: true, records: [{ Id: "0055g00000ABCDEAAA" }] });
      return json({ totalSize: 1, done: true, records: [{ attributes: { type: "Account" }, Id: "001A", Name: "Dealer One" }] });
    });
    const provider = toolThenAnswer("salesforce_query", { object: "Account", fields: ["Name"], limit: 10 });
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => (String(url).includes("salesforce.com") ? salesforce(String(url)) : provider(url, init)));
    const result = await askAssistant(await asked(personId), { conversationId: null, mode: "SALESFORCE", question: "my accounts?", requestKey: key(), fetchImpl });
    if (!result.ok) throw new Error(result.message);
    const user = (await findUserById(personId))!;
    expect(soql[0]).toBe(`SELECT Id FROM User WHERE Email = '${user.email}' AND IsActive = true LIMIT 2`);
    expect(soql[1]).toBe("SELECT Id, Name FROM Account WHERE OwnerId = '0055g00000ABCDEAAA' WITH USER_MODE LIMIT 10");
    const answer = (await listMessages(personId, result.conversationId)).at(-1)!;
    expect(answer.content).toContain("Dealer One");
    expect(JSON.stringify(provider.mock.calls)).not.toContain("00D-new-token");
    await access(personId, "APPROVAL,TASK,INFORMATION,AI", "APPROVAL,TASK,INFORMATION", "NONE");
  });

  it("with '*' (D-175) any queryable object can be read, but only fields Salesforce's describe lists", async () => {
    await setSetting("ai.salesforce.objects", "*");
    await access(personId, "APPROVAL,TASK,INFORMATION,AI", "SALESFORCE", "ALL");
    const soql: string[] = [];
    const salesforce = vi.fn(async (url: string) => {
      if (url.endsWith("/sobjects/Opportunity/describe")) return json({ queryable: true, fields: [{ name: "Id" }, { name: "Name" }, { name: "StageName" }] });
      soql.push(decodeURIComponent(url.split("q=")[1] ?? ""));
      return json({ totalSize: 1, done: true, records: [{ attributes: { type: "Opportunity" }, Id: "006A", Name: "Big deal", StageName: "Closed Won" }] });
    });
    const run = async (args: Record<string, unknown>) => {
      const provider = toolThenAnswer("salesforce_query", args);
      const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => (String(url).includes("salesforce.com") ? salesforce(String(url)) : provider(url, init)));
      const result = await askAssistant(await asked(personId), { conversationId: null, mode: "SALESFORCE", question: "deals?", requestKey: key(), fetchImpl });
      if (!result.ok) throw new Error(result.message);
      return JSON.stringify(provider.mock.calls);
    };
    await run({ object: "Opportunity", fields: ["Name", "StageName"], filters: [{ field: "StageName", op: "=", value: "Closed Won" }], limit: 5 });
    expect(soql.at(-1)).toBe("SELECT Id, Name, StageName FROM Opportunity WHERE StageName = 'Closed Won' WITH USER_MODE LIMIT 5");
    const refused = await run({ object: "Opportunity", fields: ["Secret__c"], limit: 5 });
    expect(refused).toContain("The field Secret__c isn't available.");
    expect(soql).toHaveLength(1);
    await setSetting("ai.salesforce.objects", "Account:Name");
    await access(personId, "APPROVAL,TASK,INFORMATION,AI", "APPROVAL,TASK,INFORMATION", "NONE");
  });
});

describe("proposals", () => {
  async function propose(): Promise<number> {
    const result = await askAssistant(await asked(personId), { conversationId: null, mode: "APPROVAL", question: "Suggest a follow-up", requestKey: key(), fetchImpl: toolThenAnswer("propose_action", { kind: "FOLLOW_UP", title: "Follow up the oldest approval", details: "It has waited longest; ask the approver." }) });
    if (!result.ok) throw new Error(result.message);
    const [row] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM ai_proposals WHERE requested_by = ? ORDER BY id DESC LIMIT 1", [personId]);
    return row[0]!.id;
  }

  it("go to the asker's manager; nobody else decides; a changed one is refused; nothing is executed", async () => {
    const id = await propose();
    const proposal = (await findProposal(id))!;
    expect(proposal).toMatchObject({ status: "PENDING", approverUserId: managerId, requestedBy: personId });
    expect((await listProposalsToDecide(managerId, false)).map((item) => item.id)).toContain(id);
    const input = { proposalId: id, version: proposal.version, contentHash: proposal.contentHash, decision: "APPROVED" as const, note: null };
    expect(await decide({ id: personId, roles: ["USER", "SUPER_ADMIN"] }, input)).toMatchObject({ ok: false });
    expect(await decide({ id: otherId, roles: ["USER"] }, input)).toMatchObject({ ok: false });
    expect(await decide({ id: managerId, roles: ["USER"] }, { ...input, contentHash: "0".repeat(64) })).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
    expect(await decide({ id: managerId, roles: ["USER"] }, input)).toEqual({ ok: true, status: "APPROVED" });
    expect(await decide({ id: managerId, roles: ["USER"] }, input)).toMatchObject({ ok: false });
  });

  it("expire after their time, by the job or at decision", async () => {
    const id = await propose();
    await getDbPool().query("UPDATE ai_proposals SET expires_at = CURRENT_TIMESTAMP - INTERVAL 1 MINUTE WHERE id = ?", [id]);
    expect((await runAiStep()).proposalsExpired).toBeGreaterThanOrEqual(1);
    expect((await findProposal(id))!.status).toBe("EXPIRED");
  });
});

describe("Salesforce hourly copy (optional, through the same connection)", () => {
  it("copies every page, never duplicates, and a failed run keeps the last good checkpoint", async () => {
    await setSetting("ai.salesforce.objects", "Account:Name");
    await setSetting("ai.salesforce.copy_hourly", "ON");
    const record = (id: string, at: string) => ({ attributes: { type: "Account" }, Id: id, SystemModstamp: at, Name: `Dealer ${id}` });
    let fail = false;
    const queries: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      queries.push(decodeURIComponent(url));
      if (fail) return json([{ errorCode: "SERVER_UNAVAILABLE" }], 503);
      if (url.includes("/query/next")) return json({ done: true, records: [record("001B", "2026-10-02T10:00:00.000+0000")] });
      return json({ done: false, nextRecordsUrl: "/services/data/v61.0/query/next", records: [record("001A", "2026-10-01T10:00:00.000+0000"), record("001B", "2026-10-01T11:00:00.000+0000")] });
    });
    expect(await syncSalesforce(adminId, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: true, datasets: [{ dataset: "Account", ok: true, rows: 3 }] });
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT record_id FROM ai_source_records WHERE source_key = 'salesforce' AND dataset = 'Account' ORDER BY record_id");
    expect(rows.map((row) => row.record_id)).toEqual(["001A", "001B"]);
    fail = true;
    expect(await syncSalesforce(adminId, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false });
    const firsts = () => queries.filter((url) => url.includes("/query?q="));
    expect(firsts().at(-1)).toContain("SystemModstamp > 2026-10-02T10:00:00.000Z");
    fail = false;
    await syncSalesforce(adminId, fetchImpl as unknown as typeof fetch);
    expect(firsts().at(-1)).toContain("SystemModstamp > 2026-10-02T10:00:00.000Z");
  });
});

// Keeps the hashing helper used by proposals honest in this file's imports.
void createHash;
