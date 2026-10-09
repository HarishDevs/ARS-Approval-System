import { describe, expect, it } from "vitest";
import { toDirectory, type DirectorySnapshot } from "@/lib/db/repositories/directory.repository";
import { messagesForEvents } from "@/server/approvals/messages";

const snapshot: DirectorySnapshot = {
  users: [
    { id: 1, active: true, managerId: 2, departmentId: 10, isBreakGlass: false },
    { id: 2, active: true, managerId: null, departmentId: 10, isBreakGlass: false },
    { id: 3, active: false, managerId: null, departmentId: null, isBreakGlass: false },
    { id: 9, active: true, managerId: null, departmentId: null, isBreakGlass: true },
  ],
  departmentHods: new Map([[10, 2]]),
  roleMembers: new Map([["IT_ADMIN", [2]]]),
  groupMembers: new Map([[5, [1, 2]]]),
  // 1 may act for 2 today; the inactive 3 was named by 2 but can't act.
  delegations: new Map([
    [1, new Set([2])],
    [3, new Set([2])],
  ]),
};

describe("directory snapshot → engine directory", () => {
  const directory = toDirectory(snapshot);

  it("resolves managers, HODs, roles and groups", () => {
    expect(directory.managerOf(1)).toBe(2);
    expect(directory.departmentHodOf(1)).toBe(2);
    expect(directory.hodOfDepartment(10)).toBe(2);
    expect(directory.usersWithRole("IT_ADMIN")).toEqual([2]);
    expect(directory.groupMembers(5)).toEqual([1, 2]);
    expect(directory.groupMembers(6)).toEqual([]);
  });

  it("inactive people and the break-glass account are never approvers", () => {
    expect(directory.isActive(1)).toBe(true);
    expect(directory.isActive(3)).toBe(false);
    expect(directory.isActive(9)).toBe(false);
    expect(directory.isActive(404)).toBe(false);
  });

  it("a delegate acts only for who named them, only while active, never in a chain", () => {
    expect(directory.canActFor(1, 2)).toBe(true);
    expect(directory.canActFor(2, 1)).toBe(false);
    expect(directory.canActFor(3, 2)).toBe(false);
    expect(directory.canActFor(1, 9)).toBe(false);
  });

  it("a delegate who is no longer approver-eligible can't act (#8)", () => {
    const changed = toDirectory({ ...snapshot, users: snapshot.users.map((user) => (user.id === 1 ? { ...user, approver: false } : user)) });
    expect(changed.canActFor(1, 2)).toBe(false);
  });
});

describe("who hears about what", () => {
  const request = { id: 7, requestNo: "PUR-2026-000007", title: "Crane motor", requesterId: 1, requesterName: "Asha" };
  const context = { baseUrl: "https://approval.arssteels.net/", adminIds: [2, 4] };

  it("each new task tells its approver, with a sign-in deep link", () => {
    const [message] = messagesForEvents([{ type: "TASK_CREATED", taskId: "t1", nodeId: "hod", approverId: 2 }], request, context);
    expect(message).toMatchObject({ eventType: "APPROVAL_NEEDED", userId: 2, deepLink: "https://approval.arssteels.net/users/requests/7" });
    expect(message!.email!.subject).toBe("Approval needed: PUR-2026-000007");
  });

  it("outcomes go to the requester; the rejection reason is included", () => {
    const messages = messagesForEvents(
      [
        { type: "INSTANCE_REJECTED", nodeId: "md", actorId: 3, comment: "Over budget" },
        { type: "CHANGES_REQUESTED", nodeId: "md", actorId: 3, comment: "Add quotes" },
        { type: "INSTANCE_APPROVED" },
      ],
      request,
      context,
    );
    expect(messages.map((m) => [m.eventType, m.userId])).toEqual([
      ["REQUEST_REJECTED", 1],
      ["CHANGES_REQUESTED", 1],
      ["REQUEST_APPROVED", 1],
    ]);
    expect(messages[0]!.message).toContain("Over budget");
  });

  it("a blocked step alerts every IT admin", () => {
    const messages = messagesForEvents([{ type: "NODE_BLOCKED", nodeId: "hod", reason: "NO_ELIGIBLE_APPROVER" }], request, context);
    expect(messages.map((m) => m.userId)).toEqual([2, 4]);
  });

  it("internal events send nothing", () => {
    expect(messagesForEvents([{ type: "NODE_ACTIVATED", nodeId: "a" }, { type: "BRANCH_TAKEN", nodeId: "c", edgeId: "e", isDefault: true }], request, context)).toEqual([]);
  });
});
