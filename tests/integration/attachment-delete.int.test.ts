import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { listAttachments } from "@/lib/db/repositories/attachments.repository";
import { listTimeline } from "@/lib/db/repositories/approvals.repository";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { addAttachments, deleteAttachment, prepareFiles } from "@/server/attachments/service";
import { createUser, pendingTaskKey } from "./helpers";

// v1.52.3 (owner): "attachments can be deleted until the first approval; after
// the first approval not, unless an approver asks for changes".
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const admin = (id: number): Actor => ({ id, roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
const pdf = (name: string) => new File([`%PDF-1.4\n${name}\n%%EOF`], name, { type: "application/pdf" });
let adminId: number;
let requester: number;
let first: number;
let second: number;
let outsider: number;
let workflowId: number;

async function attach(requestId: number, name: string, by: number) {
  const files = await prepareFiles([pdf(name)]);
  if (!files.ok) throw new Error(files.message);
  const added = await addAttachments(requestId, files.files, person(by));
  if (!added.ok) throw new Error(added.message);
  return (await listAttachments(requestId)).find((file) => file.name === name)!;
}

beforeAll(async () => {
  adminId = await createUser({ name: "IT del", roles: ["USER", "IT_ADMIN", "SUPER_ADMIN"] });
  requester = await createUser({ name: "Requester del" });
  first = await createUser({ name: "First approver del" });
  second = await createUser({ name: "Second approver del" });
  outsider = await createUser({ name: "Outsider del" });
  const created = await createWorkflow(
    {
      code: `DEL_${Date.now().toString(36)}`.toUpperCase(),
      name: "Delete files",
      kind: "PREDEFINED",
      requestPrefix: "DLF",
      builder: {
        stages: [
          { kind: "STEP", step: { id: "a", label: "First", approvers: { kind: "PEOPLE", userIds: [first] }, rule: "ALL" } },
          { kind: "STEP", step: { id: "b", label: "Second", approvers: { kind: "PEOPLE", userIds: [second] }, rule: "ALL" } },
        ],
      },
      form: [],
    } as unknown as Parameters<typeof createWorkflow>[0],
    admin(adminId),
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin(adminId));
  workflowId = created.value.workflowId;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("deleting a request's files (D-306)", () => {
  it("before the first approval: the requester deletes it, outsiders can't; it leaves every list and is in the timeline", async () => {
    const raised = await submitRequest({ workflowId, title: "Files to tidy", fields: {}, allowDuplicate: true }, person(requester));
    if (!raised.ok) throw new Error(raised.message);
    const requestId = raised.value.requestId;
    const file = await attach(requestId, "old-quote.pdf", requester);
    expect(await deleteAttachment(file.id, person(outsider))).toMatchObject({ ok: false });
    expect(await deleteAttachment(file.id, person(first))).toMatchObject({ ok: false }); // an approver who didn't add it
    expect(await deleteAttachment(file.id, person(requester))).toMatchObject({ ok: true, value: { name: "old-quote.pdf" } });
    expect(await listAttachments(requestId)).toEqual([]);
    expect((await listTimeline(requestId)).some((row) => row.payload.type === "ATTACHMENT_DELETED")).toBe(true);
    const [audit] = await getDbPool().query<RowDataPacket[]>("SELECT 1 FROM audit_logs WHERE action = 'REQUEST_FILE_DELETED' AND entity_id = ?", [String(requestId)]);
    expect(audit.length).toBe(1);
    // Kept for the record.
    const [kept] = await getDbPool().query<RowDataPacket[]>("SELECT deleted_at, deleted_by FROM request_attachments WHERE id = ?", [file.id]);
    expect(Number(kept[0]!.deleted_by)).toBe(requester);

    // After the first approval: locked.
    const locked = await attach(requestId, "new-quote.pdf", requester);
    expect((await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, first), decision: "APPROVE" }, person(first))).ok).toBe(true);
    expect(await deleteAttachment(locked.id, person(requester))).toMatchObject({ ok: false, message: expect.stringMatching(/already approved/) });

    // An approver asks for changes: deleting is allowed again.
    const changes = await decideTask({ requestId, taskKey: await pendingTaskKey(requestId, second), decision: "REQUEST_CHANGES", comment: "Attach the revised quote" }, person(second));
    expect(changes.ok).toBe(true);
    expect(await deleteAttachment(locked.id, person(requester))).toMatchObject({ ok: true });
  });
});
