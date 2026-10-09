import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { addComment } from "@/server/approvals/collab";
import { createWorkflow, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { createUser } from "./helpers";

// #9: a mention reaches only someone who can already see the request, once.
let approver: number;
let raiser: number;
let stranger: number;
let requestId: number;

const loginOf = async (id: number) => {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT login_id FROM users WHERE id = ?", [id]);
  return String(row!.login_id);
};
const events = async (userId: number) => {
  const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT event_type FROM notifications WHERE user_id = ? AND event_type IN ('REQUEST_COMMENT', 'REQUEST_MENTION') ORDER BY id", [userId]);
  return rows.map((row) => row.event_type as string);
};

beforeAll(async () => {
  approver = await createUser({ name: "Mention Approver" });
  raiser = await createUser({ name: "Mention Raiser" });
  stranger = await createUser({ name: "Mention Stranger" });
  const admin = await createUser({ roles: ["USER", "IT_ADMIN"] });
  const itAdmin: Actor = { id: admin, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `MENTION_${Date.now()}`,
      name: "Mentions",
      kind: "PREDEFINED",
      requestPrefix: "MN",
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    itAdmin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, itAdmin);
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title: "Mention me", fields: {}, allowDuplicate: true }, { id: raiser, roles: ["USER"] });
  if (!submitted.ok) throw new Error(submitted.message);
  requestId = submitted.value.requestId;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("@mentions", () => {
  it("tells a mentioned participant once, and never someone who can't see the request", async () => {
    const result = await addComment(requestId, `@${await loginOf(approver)} please look. Also @${await loginOf(stranger)} and @nobody-here`, { id: raiser, roles: ["USER"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.notVisible).toHaveLength(2);
    expect(await events(approver)).toEqual(["REQUEST_MENTION"]);
    expect(await events(stranger)).toEqual([]);
    const [[audit]] = await getDbPool().query<RowDataPacket[]>("SELECT metadata_json FROM audit_logs WHERE action = 'REQUEST_COMMENTED' AND entity_id = ? ORDER BY id DESC LIMIT 1", [String(requestId)]);
    const metadata = typeof audit!.metadata_json === "string" ? JSON.parse(audit!.metadata_json) : audit!.metadata_json;
    expect(metadata.mentioned).toEqual([approver]);
  });
});
