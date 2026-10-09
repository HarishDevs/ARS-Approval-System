import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { answerInfo, askForInfo, createWorkflow, decideTask, delegateTask, publishVersion, recallRequest, resubmitRequest, submitRequest, type Actor } from "@/server/approvals/service";
import { answerConsultation, consult, linkFollowUp, linkRequests, visibleLinks } from "@/server/approvals/consult";
import { loadRequestView } from "@/server/approvals/view";
import type { WorkflowDefinition } from "@/server/engine";
import { createUser, pendingTaskKey } from "./helpers";

// v1.6.0 Phase 6 on real MySQL: recall, questions, passing an approval on,
// advice, links. Each goes through the locked, versioned service.
let mgr: number;
let hod: number;
let raiser: number;
let colleague: number;
let nonApprover: number;
let stranger: number;
let admin: Actor;
let counter = 0;
const person = (id: number): Actor => ({ id, roles: ["USER"] });

const twoLevels = (): WorkflowDefinition => ({
  nodes: [
    { id: "start", kind: "START", label: "Start" },
    { id: "mgr", kind: "APPROVAL", label: "Manager", approvers: [{ type: "USER", userId: mgr }], completion: { type: "ALL" } },
    { id: "hod", kind: "APPROVAL", label: "HOD", approvers: [{ type: "USER", userId: hod }], completion: { type: "ALL" } },
    { id: "end", kind: "END", label: "End" },
  ],
  edges: [
    { id: "e1", from: "start", to: "mgr" },
    { id: "e2", from: "mgr", to: "hod" },
    { id: "e3", from: "hod", to: "end" },
  ],
});

async function raise(title = `R ${++counter}`): Promise<number> {
  const created = await createWorkflow({ code: `V160_${Date.now()}_${++counter}`, name: "V160", kind: "PREDEFINED", requestPrefix: "VS", definition: twoLevels() }, admin);
  if (!created.ok) throw new Error(created.message);
  await publishVersion(created.value.versionId, admin);
  const submitted = await submitRequest({ workflowId: created.value.workflowId, title, fields: {}, allowDuplicate: true }, person(raiser));
  if (!submitted.ok) throw new Error(submitted.message);
  return submitted.value.requestId;
}

const status = async (id: number) => {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT status FROM approval_requests WHERE id = ?", [id]);
  return String(row!.status);
};
const audit = async (id: number, action: string) => {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND entity_id = ?", [action, String(id)]);
  return Number(row!.n);
};
const notified = async (userId: number, eventType: string) => {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND event_type = ?", [userId, eventType]);
  return Number(row!.n);
};

beforeAll(async () => {
  mgr = await createUser({ name: "V6 Manager" });
  hod = await createUser({ name: "V6 HOD" });
  raiser = await createUser({ name: "V6 Raiser" });
  colleague = await createUser({ name: "V6 Colleague" });
  nonApprover = await createUser({ name: "V6 Clerk", approver: false });
  stranger = await createUser({ name: "V6 Stranger" });
  const adminId = await createUser({ roles: ["USER", "IT_ADMIN"] });
  admin = { id: adminId, roles: ["USER", "IT_ADMIN"] };
});

afterAll(async () => {
  await getDbPool().end();
});

describe("recall (EN-04)", () => {
  it("only the requester; approvers are told; resubmitting restarts the open step; audited", async () => {
    const id = await raise();
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, mgr), decision: "APPROVE" }, person(mgr));
    expect((await recallRequest({ requestId: id, reason: "Wrong quote" }, person(hod))).ok).toBe(false);
    expect((await recallRequest({ requestId: id, reason: "Wrong quote" }, person(raiser))).ok).toBe(true);
    expect(await status(id)).toBe("CHANGES_REQUIRED");
    expect(await notified(hod, "REQUEST_RECALLED")).toBeGreaterThanOrEqual(1);
    expect(await audit(id, "REQUEST_RECALLED")).toBe(1);
    expect((await resubmitRequest({ requestId: id }, person(raiser))).ok).toBe(true);
    // The manager already approved: it goes back to the HOD only.
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT approver_id FROM approval_tasks WHERE request_id = ? AND status = 'PENDING'", [id]);
    expect(rows.map((row) => row.approver_id)).toEqual([hod]);
  });

  it("a recall and the final approval at the same moment: exactly one wins, never both", async () => {
    const id = await raise();
    await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, mgr), decision: "APPROVE" }, person(mgr));
    const key = await pendingTaskKey(id, hod);
    const [a, b] = await Promise.all([recallRequest({ requestId: id, reason: "Change" }, person(raiser)), decideTask({ requestId: id, taskKey: key, decision: "APPROVE" }, person(hod))]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await status(id)).toBe(a.ok ? "CHANGES_REQUIRED" : "APPROVED");
  });
});

describe("ask for information (EN-05)", () => {
  it("holds it, tells the requester, and the answer resumes it and tells the approver", async () => {
    const id = await raise();
    const key = await pendingTaskKey(id, mgr);
    expect((await askForInfo({ requestId: id, taskKey: key, question: "Which cost centre?" }, person(mgr))).ok).toBe(true);
    expect(await status(id)).toBe("ON_HOLD");
    expect(await notified(raiser, "INFORMATION_REQUESTED")).toBeGreaterThanOrEqual(1);
    const view = await loadRequestView(id, person(raiser));
    expect(view?.question?.text).toBe("Which cost centre?");
    expect(view?.canAnswerQuestion).toBe(true);
    expect((await answerInfo({ requestId: id, answer: "CC-12" }, person(mgr))).ok).toBe(false); // not the requester
    expect((await answerInfo({ requestId: id, answer: "CC-12" }, person(raiser))).ok).toBe(true);
    expect(await status(id)).toBe("IN_PROGRESS");
    expect(await notified(mgr, "INFORMATION_ANSWERED")).toBeGreaterThanOrEqual(1);
    expect((await decideTask({ requestId: id, taskKey: key, decision: "APPROVE" }, person(mgr))).ok).toBe(true);
  });
});

describe("passing an approval on (EN-07)", () => {
  it("to an eligible colleague only; never back; audited; the new person can decide", async () => {
    const id = await raise();
    const key = await pendingTaskKey(id, mgr);
    expect((await delegateTask({ requestId: id, taskKey: key, toUserId: nonApprover, reason: "Busy" }, person(mgr))).ok).toBe(false); // not approver-eligible
    expect((await delegateTask({ requestId: id, taskKey: key, toUserId: raiser, reason: "Busy" }, person(mgr))).ok).toBe(false); // the requester
    expect((await delegateTask({ requestId: id, taskKey: key, toUserId: colleague, reason: "Busy" }, person(stranger))).ok).toBe(false); // not theirs
    expect((await delegateTask({ requestId: id, taskKey: key, toUserId: colleague, reason: "On site" }, person(mgr))).ok).toBe(true);
    expect(await audit(id, "TASK_DELEGATED")).toBe(1);
    expect(await notified(colleague, "APPROVAL_NEEDED")).toBeGreaterThanOrEqual(1);
    // Not back to the person who passed it on.
    const result = await delegateTask({ requestId: id, taskKey: key, toUserId: mgr, reason: "Back" }, person(colleague));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/can't go back/) });
    expect((await decideTask({ requestId: id, taskKey: key, decision: "APPROVE" }, person(mgr))).ok).toBe(false);
    expect((await decideTask({ requestId: id, taskKey: key, decision: "APPROVE" }, person(colleague))).ok).toBe(true);
  });
});

describe("advice (EN-06)", () => {
  it("the approver asks; the consultee can read it and answer once, but never decide", async () => {
    const id = await raise();
    expect((await consult({ requestId: id, consulteeId: colleague, question: "Fair price?" }, person(hod))).ok).toBe(false); // not waiting on HOD yet
    const asked = await consult({ requestId: id, consulteeId: colleague, question: "Fair price?" }, person(mgr));
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect((await consult({ requestId: id, consulteeId: colleague, question: "Again?" }, person(mgr))).ok).toBe(false); // already open
    const view = await loadRequestView(id, person(colleague));
    expect(view).not.toBeNull(); // can read it now
    expect(view?.myTasks).toEqual([]); // but no decision
    expect((await decideTask({ requestId: id, taskKey: await pendingTaskKey(id, mgr), decision: "APPROVE" }, person(colleague))).ok).toBe(false);
    expect((await answerConsultation({ consultationId: asked.value.id, answer: "Yes, market rate" }, person(stranger))).ok).toBe(false);
    expect((await answerConsultation({ consultationId: asked.value.id, answer: "Yes, market rate" }, person(colleague))).ok).toBe(true);
    expect((await answerConsultation({ consultationId: asked.value.id, answer: "Again" }, person(colleague))).ok).toBe(false);
    expect(await notified(mgr, "CONSULTATION_ANSWERED")).toBeGreaterThanOrEqual(1);
    expect(await audit(id, "REQUEST_CONSULTED")).toBe(1);
  });
});

describe("links and follow-ups (EN-08)", () => {
  it("both sides must be visible to the linker; a link gives nobody access", async () => {
    const a = await raise("Link A");
    const b = await raise("Link B");
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT request_no FROM approval_requests WHERE id = ?", [b]);
    expect((await linkRequests({ requestId: a, otherRequestNo: String(row!.request_no) }, person(stranger))).ok).toBe(false);
    expect((await linkRequests({ requestId: a, otherRequestNo: String(row!.request_no) }, person(raiser))).ok).toBe(true);
    expect((await linkRequests({ requestId: b, otherRequestNo: (await getDbPool().query<RowDataPacket[]>("SELECT request_no FROM approval_requests WHERE id = ?", [a]))[0][0]!.request_no }, person(raiser))).ok).toBe(false); // already linked
    expect((await visibleLinks(a, person(raiser))).map((link) => link.id)).toEqual([b]);
    expect(await visibleLinks(a, person(stranger))).toEqual([]);
  });

  it("a follow-up links only to an approved request the person can see", async () => {
    const source = await raise("Source");
    const follow = await raise("Follow");
    expect(await linkFollowUp({ sourceId: source, followUpId: follow }, person(raiser))).toBe(false); // not approved yet
    await decideTask({ requestId: source, taskKey: await pendingTaskKey(source, mgr), decision: "APPROVE" }, person(mgr));
    await decideTask({ requestId: source, taskKey: await pendingTaskKey(source, hod), decision: "APPROVE" }, person(hod));
    expect(await linkFollowUp({ sourceId: source, followUpId: follow }, person(stranger))).toBe(false);
    expect(await linkFollowUp({ sourceId: source, followUpId: follow }, person(raiser))).toBe(true);
    expect((await visibleLinks(follow, person(raiser)))[0]).toMatchObject({ id: source, kind: "FOLLOW_UP", direction: "from" });
  });
});
