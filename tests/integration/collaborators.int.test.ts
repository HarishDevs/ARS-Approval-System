import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createWorkflow, decideTask, publishVersion, submitRequest, type Actor } from "@/server/approvals/service";
import { isParticipant } from "@/lib/db/repositories/approvals.repository";
import { addCollaborators, listCollaborators, MAX_COLLABORATORS, removeCollaborator } from "@/server/approvals/collaborators";
import { searchRequests } from "@/lib/db/repositories/search.repository";
import { parseSearchFilters } from "@/server/search/filters";
import { existingFieldCounts, prepareFieldFiles, saveFieldFiles } from "@/server/attachments/field-files";
import { listAttachments } from "@/lib/db/repositories/attachments.repository";
import type { FormField } from "@/server/forms/fields";
import { createUser, pendingTaskKey } from "./helpers";

// v1.6.1 on real MySQL: collaborators (visibility, limits, notifications)
// and attachment fields (counted by the server, stored against the field).
let approver: number;
let requester: number;
let friend: number;
let other: number;
let admin: Actor;
let workflowId: number;
const person = (id: number): Actor => ({ id, roles: ["USER"] });
const FORM: FormField[] = [
  { key: "amount", label: "Amount", type: "NUMBER", required: true },
  { key: "quotes", label: "Quotes", type: "ATTACHMENT", required: true, maxFiles: 2 },
];
const pdf = (name: string) => new File([`%PDF-1.4\n${name}\n%%EOF`], name, { type: "application/pdf" });

async function raise(title: string, fields: Record<string, string> = { amount: "10", quotes: "1" }) {
  const result = await submitRequest({ workflowId, title, fields }, person(requester));
  if (!result.ok) throw new Error(result.message);
  return result.value.requestId;
}

beforeAll(async () => {
  approver = await createUser({ name: "Col Approver" });
  requester = await createUser({ name: "Col Requester" });
  friend = await createUser({ name: "Col Friend" });
  other = await createUser({ name: "Col Other" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
  const created = await createWorkflow(
    {
      code: `COL_${Date.now()}`,
      name: "Collaborator type",
      kind: "PREDEFINED",
      requestPrefix: "CL",
      form: FORM,
      definition: {
        nodes: [
          { id: "start", kind: "START", label: "Start" },
          { id: "a", kind: "APPROVAL", label: "Check", approvers: [{ type: "USER", userId: approver }], completion: { type: "ALL" } },
          { id: "end", kind: "END", label: "End" },
        ],
        edges: [
          { id: "e1", from: "start", to: "a" },
          { id: "e2", from: "a", to: "end" },
        ],
      },
    },
    admin,
  );
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  workflowId = created.value.workflowId;
});

afterAll(async () => {
  await getDbPool().end();
});

describe("collaborators", () => {
  it("the requester adds people; they can then see the request (page and search) and are told", async () => {
    const id = await raise("Col shared one");
    expect(await isParticipant(id, friend)).toBe(false);
    const result = await addCollaborators(id, [friend, requester, friend], person(requester));
    expect(result).toMatchObject({ ok: true, added: [friend], skipped: ["Col Requester (the requester)"] });
    expect(await isParticipant(id, friend)).toBe(true);
    expect(await isParticipant(id, other)).toBe(false);
    const found = await searchRequests({ id: friend, isAdmin: false }, parseSearchFilters({ q: "Col shared one" }));
    expect(found.items.map((item) => item.id)).toContain(id);
    expect((await searchRequests({ id: other, isAdmin: false }, parseSearchFilters({ q: "Col shared one" }))).items).toHaveLength(0);
    const [[outbox]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notification_outbox WHERE request_id = ? AND JSON_EXTRACT(payload_json, '$.eventType') = 'COLLABORATOR_ADDED'", [id]);
    expect(Number(outbox!.n)).toBe(1);
    expect((await listCollaborators(id)).map((row) => row.userId)).toEqual([friend]);
  });

  it("only the requester or IT adds; inactive people are skipped; at most 20", async () => {
    const id = await raise("Col limits");
    expect(await addCollaborators(id, [friend], person(other))).toMatchObject({ ok: false });
    expect(await addCollaborators(id, [friend], person(approver))).toMatchObject({ ok: false });
    expect((await addCollaborators(id, [friend], admin)).ok).toBe(true);
    const leaver = await createUser({ name: "Col Leaver" });
    await getDbPool().query("UPDATE users SET active = FALSE WHERE id = ?", [leaver]);
    expect(await addCollaborators(id, [leaver], person(requester))).toMatchObject({ ok: true, added: [], skipped: ["Col Leaver (inactive)"] });
    const many: number[] = [];
    for (let index = 0; index < MAX_COLLABORATORS; index += 1) many.push(await createUser({ name: `Col Many ${index}` }));
    expect(await addCollaborators(id, many, person(requester))).toMatchObject({ ok: false, message: expect.stringMatching(/at most 20/) });
  });

  it("removal: the requester removes, a collaborator can leave, others can't; access ends", async () => {
    const id = await raise("Col remove");
    await addCollaborators(id, [friend, other], person(requester));
    expect(await removeCollaborator(id, other, person(friend))).toMatchObject({ ok: false });
    expect(await removeCollaborator(id, friend, person(friend))).toEqual({ ok: true });
    expect(await isParticipant(id, friend)).toBe(false);
    expect(await removeCollaborator(id, other, person(requester))).toEqual({ ok: true });
    expect(await isParticipant(id, other)).toBe(false);
    const [events] = await getDbPool().query<RowDataPacket[]>("SELECT event_type FROM approval_events WHERE request_id = ? AND event_type LIKE 'COLLABORATOR%' ORDER BY id", [id]);
    expect(events.map((row) => row.event_type)).toEqual(["COLLABORATORS_ADDED", "COLLABORATOR_REMOVED", "COLLABORATOR_REMOVED"]);
  });

  it("collaborators are told when it is approved; they never get a task", async () => {
    const id = await raise("Col outcome");
    await addCollaborators(id, [friend], person(requester));
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, approver), decision: "APPROVE" }, person(approver));
    const [[update]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notification_outbox WHERE request_id = ? AND JSON_EXTRACT(payload_json, '$.eventType') = 'COLLABORATOR_UPDATE' AND JSON_EXTRACT(payload_json, '$.userId') = ?", [id, friend]);
    expect(Number(update!.n)).toBe(1);
    const [[tasks]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND approver_id = ?", [id, friend]);
    expect(Number(tasks!.n)).toBe(0);
  });
});

describe("attachment fields", () => {
  it("a required attachment field needs a file; the server counts the files, not the browser", async () => {
    const missing = await submitRequest({ workflowId, title: "Col no files", fields: { amount: "5", quotes: "0" } }, person(requester));
    expect(missing).toMatchObject({ ok: false, fieldErrors: { quotes: "Attach at least one file to Quotes." } });
    // The browser claims 2 files but sends one: the server's count wins.
    const form = new FormData();
    form.append("file:quotes", pdf("quote-a.pdf"));
    form.set("quotes", "2");
    const prepared = await prepareFieldFiles(form, FORM);
    expect(prepared.ok && prepared.values).toEqual({ quotes: "1" });
    // Too many for the field.
    const tooMany = new FormData();
    for (const name of ["a.pdf", "b.pdf", "c.pdf"]) tooMany.append("file:quotes", pdf(name));
    const counted = await prepareFieldFiles(tooMany, FORM);
    const over = await submitRequest({ workflowId, title: "Col too many", fields: { amount: "5", ...(counted.ok ? counted.values : {}) } }, person(requester));
    expect(over).toMatchObject({ ok: false, fieldErrors: { quotes: "Add at most 2 files here." } });
  });

  it("files are stored against their field and count again on resubmit", async () => {
    const form = new FormData();
    form.append("file:quotes", pdf("vendor-quote.pdf"));
    const prepared = await prepareFieldFiles(form, FORM);
    if (!prepared.ok) throw new Error(prepared.message);
    const id = await raise("Col field files", { amount: "5", ...prepared.values });
    expect(await saveFieldFiles(id, prepared.byField, person(requester))).toBe(true);
    const files = await listAttachments(id);
    expect(files).toEqual([expect.objectContaining({ name: "vendor-quote.pdf", fieldKey: "quotes" })]);
    expect(await existingFieldCounts(id)).toEqual({ quotes: 1 });
    // On resubmit with no new file, the one already there still counts.
    const again = await prepareFieldFiles(new FormData(), FORM, await existingFieldCounts(id));
    expect(again.ok && again.values).toEqual({ quotes: "1" });
  });
});
