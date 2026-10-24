import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { upsertSetting, clearSetting } from "@/lib/db/repositories/settings.repository";
import { encryptSecret } from "@/lib/security/encryption";
import { askAssistant } from "@/server/ai/assistant";
import { decide } from "@/server/ai/proposals";
import { findProposal, listMessages, listProposalsToDecide, listConversations, ownsConversation } from "@/lib/db/repositories/ai.repository";
import { approvalsWaitingFor } from "@/lib/db/repositories/ai-data.repository";
import { syncSalesforce } from "@/server/ai/connectors/salesforce";
import { runAiStep } from "@/server/ai/jobs";
import { createUser } from "./helpers";

// D-169 (AI module branch): the assistant, proposals and the Salesforce copy
// against MySQL. No real provider or Salesforce is called: fetch is replaced.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let adminId: number;
let managerId: number;
let personId: number;
let otherId: number;
const person = () => ({ id: personId, roles: ["USER"] as const, modules: ["APPROVAL", "TASK", "INFORMATION", "AI"] as const, name: "Asker" });

async function setSetting(key: string, value: string, encrypted = false) {
  await upsertSetting({ key, group: key.startsWith("ai.salesforce") ? "AI_DATA" : "AI", valueType: "STRING", encrypted, storedValue: encrypted ? encryptSecret(value) : value, updatedBy: adminId });
}

// A fake Claude: first asks for approvals_waiting_for_me, then answers with the
// figure it was given plus one it invented (77).
function fakeClaude() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const last = body.messages[body.messages.length - 1];
    if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
      const data = JSON.parse(last.content[0].content).data;
      return json({ model: "claude-fake", content: [{ type: "text", text: `Verified: ${data.pending} approvals are waiting for you. Roughly 77 people agree.` }], usage: { input_tokens: 20, output_tokens: 10 } });
    }
    return json({ model: "claude-fake", content: [{ type: "tool_use", id: "tu1", name: "approvals_waiting_for_me", input: {} }], usage: { input_tokens: 15, output_tokens: 5 } });
  });
}

beforeAll(async () => {
  adminId = await createUser({ name: "AI admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  managerId = await createUser({ name: "AI manager" });
  personId = await createUser({ name: "AI asker", managerId });
  otherId = await createUser({ name: "AI other" });
  await setSetting("ai.active_provider", "CLAUDE");
  await setSetting("ai.claude.api_key", "sk-ant-integration-test-key", true);
  await setSetting("ai.claude.model", "claude-fake");
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  for (const key of ["ai.active_provider", "ai.claude.api_key", "ai.claude.business_data", "ai.daily_questions_per_person", "ai.salesforce.instance_url", "ai.salesforce.client_id", "ai.salesforce.client_secret", "ai.salesforce.objects"]) await clearSetting(key, adminId);
  await getDbPool().end();
});

describe("the assistant", () => {
  it("without business-data approval the provider gets no data tools and is told it has no data", async () => {
    const fetchImpl = vi.fn(async () => json({ model: "claude-fake", content: [{ type: "text", text: "I don't have access to ARS data here." }] }));
    vi.stubGlobal("fetch", fetchImpl);
    const result = await askAssistant(person(), { conversationId: null, question: "How many approvals are waiting for me?" });
    expect(result.ok).toBe(true);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    // Only propose_action (records a suggestion; no business data) is offered.
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(["propose_action"]);
    expect(body.system).toContain("NO access to ARS business data");
    expect(JSON.stringify(body)).not.toContain("sk-ant-integration-test-key"); // the key is a header, never in the body
  });

  it("approved for business data: the tool runs on the server, evidence is saved, an invented figure is flagged", async () => {
    await setSetting("ai.claude.business_data", "ALLOWED");
    vi.stubGlobal("fetch", fakeClaude());
    const result = await askAssistant(person(), { conversationId: null, question: "What is waiting for me?" });
    if (!result.ok) throw new Error(result.message);
    const messages = await listMessages(personId, result.conversationId);
    const answer = messages.find((message) => message.role === "assistant")!;
    const real = await approvalsWaitingFor(personId);
    expect(answer.content).toContain(`Verified: ${real.pending} approvals`);
    expect(answer.evidence).toEqual([expect.objectContaining({ tool: "approvals_waiting_for_me", source: "ARS Approvals (live)", result: expect.objectContaining({ pending: real.pending }) })]);
    expect(answer.unverified).toEqual(["77"]);
    expect(answer).toMatchObject({ provider: "CLAUDE", model: "claude-fake", inputTokens: 35, outputTokens: 15 });
  });

  it("a conversation is its owner's alone: others can't read it or add to it", async () => {
    const [mine] = await listConversations(personId, 1);
    expect(await ownsConversation(otherId, mine!.id)).toBe(false);
    expect(await listMessages(otherId, mine!.id)).toEqual([]);
    expect(await askAssistant({ ...person(), id: otherId }, { conversationId: mine!.id, question: "show me" })).toEqual({ ok: false, message: "Not found." });
  });

  it("a person without a module doesn't get that module's tools, even if the model asks for them", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        const last = body.messages[body.messages.length - 1];
        if (Array.isArray(last.content)) return json({ model: "m", content: [{ type: "text", text: "Done." }] });
        return json({ model: "m", content: [{ type: "tool_use", id: "x", name: "my_tasks_summary", input: {} }] });
      }),
    );
    const result = await askAssistant({ ...person(), modules: ["APPROVAL", "AI"] }, { conversationId: null, question: "my tasks?" });
    if (!result.ok) throw new Error(result.message);
    const first = calls[0] as { tools: { name: string }[] };
    expect(first.tools.map((tool) => tool.name)).not.toContain("my_tasks_summary");
    const toolReply = (calls[1] as { messages: { content: { content: string }[] }[] }).messages.at(-1)!.content[0]!.content;
    expect(toolReply).toContain("isn't available to this person");
  });

  it("the daily limit stops further questions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ model: "m", content: [{ type: "text", text: "Hello." }] })));
    await setSetting("ai.daily_questions_per_person", "1");
    try {
      const result = await askAssistant({ ...person(), id: otherId }, { conversationId: null, question: "hello" });
      expect(result.ok).toBe(true); // first question today for this person
      expect(await askAssistant({ ...person(), id: otherId }, { conversationId: null, question: "again" })).toMatchObject({ ok: false, message: expect.stringContaining("today's limit") });
    } finally {
      await clearSetting("ai.daily_questions_per_person", adminId);
    }
  });
});

describe("proposals", () => {
  async function propose(): Promise<number> {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const last = body.messages[body.messages.length - 1];
        if (Array.isArray(last.content)) return json({ model: "m", content: [{ type: "text", text: "Recorded for your manager to decide." }] });
        return json({ model: "m", content: [{ type: "tool_use", id: "p", name: "propose_action", input: { kind: "FOLLOW_UP", title: "Follow up the oldest approval", details: "It has waited longest; ask the approver." } }] });
      }),
    );
    const result = await askAssistant(person(), { conversationId: null, question: "Suggest a follow-up" });
    if (!result.ok) throw new Error(result.message);
    const [row] = await getDbPool().query<RowDataPacket[]>("SELECT id FROM ai_proposals WHERE requested_by = ? ORDER BY id DESC LIMIT 1", [personId]);
    return row[0]!.id;
  }

  it("goes to the asker's manager; the asker and others can't decide; a changed proposal is refused; nothing is executed", async () => {
    const id = await propose();
    const proposal = (await findProposal(id))!;
    expect(proposal).toMatchObject({ status: "PENDING", approverUserId: managerId, requestedBy: personId });
    expect((await listProposalsToDecide(managerId, false)).map((item) => item.id)).toContain(id);
    const input = { proposalId: id, version: proposal.version, contentHash: proposal.contentHash, decision: "APPROVED" as const, note: null };
    expect(await decide({ id: personId, roles: ["USER", "SUPER_ADMIN"] }, input)).toMatchObject({ ok: false, message: expect.stringContaining("someone else") });
    expect(await decide({ id: otherId, roles: ["USER"] }, input)).toMatchObject({ ok: false });
    expect(await decide({ id: managerId, roles: ["USER"] }, { ...input, contentHash: "0".repeat(64) })).toMatchObject({ ok: false, message: expect.stringContaining("changed") });
    expect(await decide({ id: managerId, roles: ["USER"] }, { ...input, decision: "REJECTED" })).toMatchObject({ ok: false, message: expect.stringContaining("why") });
    expect(await decide({ id: managerId, roles: ["USER"] }, input)).toEqual({ ok: true, status: "APPROVED" });
    expect(await decide({ id: managerId, roles: ["USER"] }, input)).toMatchObject({ ok: false }); // already decided
    const [audit] = await getDbPool().query<RowDataPacket[]>("SELECT metadata_json FROM audit_logs WHERE action = 'AI_PROPOSAL_APPROVED' AND entity_id = ?", [String(id)]);
    const metadata = typeof audit[0]!.metadata_json === "string" ? JSON.parse(audit[0]!.metadata_json) : audit[0]!.metadata_json;
    expect(metadata.executed).toBe(false);
  });

  it("an expired proposal can't be decided and is marked expired by the job", async () => {
    const id = await propose();
    await getDbPool().query("UPDATE ai_proposals SET expires_at = CURRENT_TIMESTAMP - INTERVAL 1 MINUTE WHERE id = ?", [id]);
    const proposal = (await findProposal(id))!;
    expect(await decide({ id: managerId, roles: ["USER"] }, { proposalId: id, version: proposal.version, contentHash: proposal.contentHash, decision: "APPROVED", note: null })).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
    expect((await findProposal(id))!.status).toBe("EXPIRED");
    const second = await propose();
    await getDbPool().query("UPDATE ai_proposals SET expires_at = CURRENT_TIMESTAMP - INTERVAL 1 MINUTE WHERE id = ?", [second]);
    expect((await runAiStep()).proposalsExpired).toBeGreaterThanOrEqual(1);
    expect((await findProposal(second))!.status).toBe("EXPIRED");
  });
});

describe("Salesforce copy (read-only)", () => {
  it("copies every page, never duplicates, and a failed run keeps the last good checkpoint", async () => {
    await setSetting("ai.salesforce.instance_url", "https://ars-test.my.salesforce.com");
    await setSetting("ai.salesforce.client_id", "connected-app-key", true);
    await setSetting("ai.salesforce.client_secret", "connected-app-secret", true);
    await setSetting("ai.salesforce.objects", "Account:Name");
    const record = (id: string, at: string) => ({ attributes: { type: "Account" }, Id: id, SystemModstamp: at, Name: `Dealer ${id}` });
    let failQuery = false;
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/services/oauth2/token")) return json({ access_token: "token", instance_url: "https://ars-test.my.salesforce.com" });
        queries.push(decodeURIComponent(url));
        if (failQuery) return json([{ message: "Server busy" }], 503);
        if (url.includes("/query/next")) return json({ done: true, records: [record("001B", "2026-10-02T10:00:00.000+0000")] });
        return json({ done: false, nextRecordsUrl: "/services/data/v61.0/query/next", records: [record("001A", "2026-10-01T10:00:00.000+0000"), record("001B", "2026-10-01T11:00:00.000+0000")] });
      }),
    );
    expect(await syncSalesforce(adminId)).toMatchObject({ ok: true, datasets: [{ dataset: "Account", ok: true, rows: 3 }] });
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT record_id FROM ai_source_records WHERE source_key = 'salesforce' AND dataset = 'Account' ORDER BY record_id");
    expect(rows.map((row) => row.record_id)).toEqual(["001A", "001B"]); // 001B twice in the pages, once stored

    failQuery = true;
    expect(await syncSalesforce(adminId)).toMatchObject({ ok: false, datasets: [{ ok: false, error: expect.stringContaining("503") }] });
    const firstQueries = () => queries.filter((url) => url.includes("/query?q="));
    expect(firstQueries().at(-1)).toContain("SystemModstamp > 2026-10-02T10:00:00.000Z"); // continued from the last good run
    failQuery = false;
    await syncSalesforce(adminId);
    expect(firstQueries().at(-1)).toContain("SystemModstamp > 2026-10-02T10:00:00.000Z"); // the failed run didn't move it
  });
});
