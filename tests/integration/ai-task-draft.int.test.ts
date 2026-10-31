import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { clearSetting, upsertSetting } from "@/lib/db/repositories/settings.repository";
import { encryptSecret } from "@/lib/security/encryption";
import { findUserById } from "@/lib/db/repositories/users.repository";
import { draftTaskDescription, type DraftPerson } from "@/server/ai/task-draft";
import { createUser } from "./helpers";

// D-238: ✨ in the Draft task. No real provider is called (fetch is replaced).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let adminId: number;
let withAi: number;
let withoutAi: number;

async function setSetting(name: string, value: string, encrypted = false) {
  await upsertSetting({ key: name, group: "AI", valueType: "STRING", encrypted, storedValue: encrypted ? encryptSecret(value) : value, updatedBy: adminId });
}
async function person(id: number): Promise<DraftPerson> {
  const user = (await findUserById(id))!;
  return { id: user.id, roles: user.roles, modules: user.modules, chatModes: user.chatModes, salesforceScope: user.salesforceScope };
}

beforeAll(async () => {
  adminId = await createUser({ name: "Draft admin", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  withAi = await createUser({ name: "Draft writer" });
  withoutAi = await createUser({ name: "Draft no AI" });
  await getDbPool().query("UPDATE users SET module_access = 'APPROVAL,TASK,AI', chat_modes = 'APPROVAL,TASK' WHERE id = ?", [withAi]);
  await getDbPool().query("UPDATE users SET module_access = 'APPROVAL,TASK', chat_modes = '' WHERE id = ?", [withoutAi]);
  await setSetting("ai.active_provider", "CLAUDE");
  await setSetting("ai.claude.api_key", "sk-ant-integration-test-key", true);
  await setSetting("ai.claude.model", "claude-fake");
});

afterAll(async () => {
  for (const name of ["ai.active_provider", "ai.claude.api_key", "ai.claude.model", "ai.emergency_stop"]) await clearSetting(name, adminId);
});

describe("Pico Bot writes a task description (D-238)", () => {
  it("sends only the name and what was typed, without tools, and returns the text; it is audited", async () => {
    const fetchImpl = vi.fn(async () => json({ model: "claude-fake", content: [{ type: "text", text: "- Visit the yard\n- Count the coils" }], usage: { input_tokens: 5, output_tokens: 9 } }));
    const result = await draftTaskDescription(await person(withAi), { title: "Stock check", description: "with @[Asha](user:4)" }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, text: "- Visit the yard\n- Count the coils" });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.tools ?? []).toEqual([]);
    expect(JSON.stringify(body.messages)).toContain("Stock check");
    expect(JSON.stringify(body.messages)).toContain("@[Asha](user:4)");
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE actor_user_id = ? AND action = 'AI_TASK_DRAFTED'", [withAi]);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("is refused without Pico Bot, when switched off, and with nothing to go on", async () => {
    const fetchImpl = vi.fn();
    expect(await draftTaskDescription(await person(withoutAi), { title: "x", description: "" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, message: "Pico Bot isn't available to you." });
    expect(await draftTaskDescription(await person(withAi), { title: " ", description: "" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false });
    await setSetting("ai.emergency_stop", "ON");
    expect(await draftTaskDescription(await person(withAi), { title: "x", description: "" }, fetchImpl as unknown as typeof fetch)).toMatchObject({ ok: false, message: "Pico Bot is switched off for now." });
    await clearSetting("ai.emergency_stop", adminId);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a provider failure comes back in words, never a key", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { type: "authentication_error", message: "invalid x-api-key sk-ant-integration-test-key" } }, 401));
    const result = await draftTaskDescription(await person(withAi), { title: "Stock check", description: "" }, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sk-ant");
  });
});
