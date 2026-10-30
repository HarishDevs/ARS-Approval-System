import { describe, expect, it } from "vitest";
import { effectiveProjectRole, leavesAnOwner, projectAbilities, taskRights, type ProjectFacts, type WorkViewer } from "@/server/work/access";
import { addDays, commentParts, dependencyLoop, indiaDay, mentionedIds, myTaskBucket, needsRenumber, parseWorkSearch, positionBetween, subtaskProblem, workSearchQuery } from "@/server/work/rules";
import { chainAbove, teamBelow } from "@/server/work/hierarchy";

// D-215 / D-216: Task & Project Management rules.
const viewer = (over: Partial<WorkViewer> = {}): WorkViewer => ({ id: 1, departmentId: 10, isAdmin: false, teamIds: [], ...over });
const project = (over: Partial<ProjectFacts> = {}): ProjectFacts => ({ privacy: "PRIVATE", departmentId: 10, defaultAccessRole: "COMMENTER", members: [], ...over });

describe("project roles", () => {
  it("a private project is seen by its members only", () => {
    expect(effectiveProjectRole(project(), viewer())).toBeNull();
    expect(effectiveProjectRole(project({ members: [{ type: "USER", id: 1, role: "EDITOR" }] }), viewer())).toBe("EDITOR");
  });
  it("a department grant counts for the department's people, never as owner", () => {
    expect(effectiveProjectRole(project({ members: [{ type: "DEPARTMENT", id: 10, role: "OWNER" }] }), viewer())).toBe("EDITOR");
    expect(effectiveProjectRole(project({ members: [{ type: "DEPARTMENT", id: 11, role: "EDITOR" }] }), viewer())).toBeNull();
    expect(effectiveProjectRole(project({ members: [{ type: "DEPARTMENT", id: 10, role: "EDITOR" }] }), viewer({ departmentId: null }))).toBeNull();
  });
  it("shared projects give their default role; the highest grant wins", () => {
    expect(effectiveProjectRole(project({ privacy: "ORGANISATION" }), viewer({ departmentId: null }))).toBe("COMMENTER");
    expect(effectiveProjectRole(project({ privacy: "DEPARTMENT" }), viewer())).toBe("COMMENTER");
    expect(effectiveProjectRole(project({ privacy: "DEPARTMENT" }), viewer({ departmentId: 99 }))).toBeNull();
    expect(effectiveProjectRole(project({ privacy: "ORGANISATION", members: [{ type: "USER", id: 1, role: "VIEWER" }] }), viewer())).toBe("COMMENTER");
  });
  it("D-216: a manager can look into projects their reporting line is in (view only)", () => {
    const withReport = project({ members: [{ type: "USER", id: 50, role: "EDITOR" }] });
    expect(effectiveProjectRole(withReport, viewer({ teamIds: [50] }))).toBe("VIEWER");
    expect(effectiveProjectRole(withReport, viewer({ teamIds: [51] }))).toBeNull();
    expect(projectAbilities("VIEWER")).toMatchObject({ view: true, edit: false, comment: false });
  });
  it("IT acts as owner everywhere", () => {
    expect(effectiveProjectRole(project(), viewer({ isAdmin: true }))).toBe("OWNER");
  });
  it("what each role may do", () => {
    expect(projectAbilities("OWNER")).toEqual({ view: true, manage: true, share: true, edit: true, comment: true });
    expect(projectAbilities("EDITOR")).toEqual({ view: true, manage: false, share: true, edit: true, comment: true });
    expect(projectAbilities("COMMENTER")).toEqual({ view: true, manage: false, share: false, edit: false, comment: true });
    expect(projectAbilities(null).view).toBe(false);
  });
  it("a project keeps at least one person as owner", () => {
    const members = [{ type: "USER" as const, id: 1, role: "OWNER" as const }, { type: "USER" as const, id: 2, role: "EDITOR" as const }];
    expect(leavesAnOwner(members, { type: "USER", id: 1, role: null })).toBe(false);
    expect(leavesAnOwner(members, { type: "USER", id: 1, role: "EDITOR" })).toBe(false);
    expect(leavesAnOwner(members, { type: "USER", id: 2, role: "OWNER" })).toBe(true);
    expect(leavesAnOwner(members, { type: "DEPARTMENT", id: 5, role: "EDITOR" })).toBe(true);
  });
});

describe("task rights", () => {
  const none = { isAssignee: false, isCreator: false, isFollower: false, managesAssignee: false, isAdmin: false, bestProjectRole: null } as const;
  it("strangers see nothing", () => {
    expect(taskRights(none)).toMatchObject({ view: false, edit: false, comment: false });
  });
  it("followers and managers (any level) read and comment, not edit", () => {
    expect(taskRights({ ...none, isFollower: true })).toMatchObject({ view: true, edit: false, comment: true });
    expect(taskRights({ ...none, managesAssignee: true })).toMatchObject({ view: true, edit: false, comment: true });
  });
  it("project roles carry over to the project's tasks", () => {
    expect(taskRights({ ...none, bestProjectRole: "VIEWER" })).toMatchObject({ view: true, edit: false, comment: false, like: true });
    expect(taskRights({ ...none, bestProjectRole: "COMMENTER" })).toMatchObject({ view: true, edit: false, comment: true });
    expect(taskRights({ ...none, bestProjectRole: "EDITOR" })).toMatchObject({ view: true, edit: true });
  });
  it("the assignee progresses their task; the creator edits it", () => {
    expect(taskRights({ ...none, isAssignee: true })).toMatchObject({ view: true, edit: false, progress: true, comment: true });
    expect(taskRights({ ...none, isCreator: true })).toMatchObject({ edit: true });
  });
});

describe("reporting hierarchy (D-216)", () => {
  // 1 ← 2 ← 4 ← 6 ; 1 ← 3 ; 5 reports to nobody; 7 ↔ 8 loop
  const map = new Map<number, number | null>([
    [1, null],
    [2, 1],
    [3, 1],
    [4, 2],
    [6, 4],
    [5, null],
    [7, 8],
    [8, 7],
  ]);
  it("everyone below, at every level", () => {
    expect(teamBelow(map, 1).sort()).toEqual([2, 3, 4, 6]);
    expect(teamBelow(map, 2).sort()).toEqual([4, 6]);
    expect(teamBelow(map, 6)).toEqual([]);
    expect(teamBelow(map, 5)).toEqual([]);
  });
  it("a loop in the data is cut", () => {
    expect(teamBelow(map, 7)).toEqual([8]);
    expect(chainAbove(map, 7)).toEqual([8]);
  });
  it("the chain above a person", () => {
    expect(chainAbove(map, 6)).toEqual([4, 2, 1]);
    expect(chainAbove(map, 1)).toEqual([]);
  });
});

describe("order, subtasks and dependencies", () => {
  it("a move takes the midpoint of its neighbours", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(10, null)).toBe(1034);
    expect(positionBetween(null, 10)).toBe(-1014);
    expect(positionBetween(10, 20)).toBe(15);
    expect(needsRenumber(1, 1 + 1e-7)).toBe(true);
    expect(needsRenumber(1, 2)).toBe(false);
  });
  it("subtasks: no loops, at most five levels", () => {
    expect(subtaskProblem({ taskId: 1, parentId: 1, parentDepth: 0, ancestorsOfParent: [], subtreeHeight: 0 })).toMatch(/own subtask/);
    expect(subtaskProblem({ taskId: 1, parentId: 5, parentDepth: 2, ancestorsOfParent: [1, 3], subtreeHeight: 0 })).toMatch(/inside itself/);
    expect(subtaskProblem({ taskId: 1, parentId: 5, parentDepth: 3, ancestorsOfParent: [], subtreeHeight: 2 })).toMatch(/5 levels/);
    expect(subtaskProblem({ taskId: 1, parentId: 5, parentDepth: 3, ancestorsOfParent: [], subtreeHeight: 1 })).toBeNull();
  });
  it("dependencies never wait in a loop", () => {
    const edges: [number, number][] = [
      [1, 2],
      [2, 3],
    ];
    expect(dependencyLoop(3, 1, edges)).toBe(true); // 3 blocks 1, but 1 → 2 → 3
    expect(dependencyLoop(1, 3, edges)).toBe(false);
    expect(dependencyLoop(4, 4, edges)).toBe(true);
  });
});

describe("My Tasks sections", () => {
  const now = new Date("2026-10-30T06:00:00Z");
  const today = "2026-10-30";
  const task = (over: Partial<{ dueDay: string | null; assignedAt: Date | null; selfAssigned: boolean }> = {}) => ({ dueDay: null, assignedAt: new Date("2026-10-01T00:00:00Z"), selfAssigned: false, ...over });
  it("newly assigned by someone else: Recently assigned", () => {
    expect(myTaskBucket(task({ assignedAt: new Date("2026-10-29T00:00:00Z") }), null, today, now).system).toBe("RECENT");
    expect(myTaskBucket(task({ assignedAt: new Date("2026-10-29T00:00:00Z"), selfAssigned: true }), null, today, now).system).toBe("LATER");
  });
  it("otherwise by due date", () => {
    expect(myTaskBucket(task({ dueDay: "2026-10-30" }), null, today, now).system).toBe("TODAY");
    expect(myTaskBucket(task({ dueDay: "2026-10-01" }), null, today, now).system).toBe("TODAY");
    expect(myTaskBucket(task({ dueDay: "2026-11-05" }), null, today, now).system).toBe("UPCOMING");
    expect(myTaskBucket(task({ dueDay: "2026-12-30" }), null, today, now).system).toBe("LATER");
  });
  it("placed tasks stay put, but move forward as their date nears", () => {
    expect(myTaskBucket(task({ dueDay: "2026-10-30" }), { system: "LATER", sectionId: 4 }, today, now).system).toBe("TODAY");
    expect(myTaskBucket(task({ dueDay: "2026-11-02" }), { system: "LATER", sectionId: 4 }, today, now).system).toBe("UPCOMING");
    expect(myTaskBucket(task({ dueDay: "2026-12-30" }), { system: "TODAY", sectionId: 2 }, today, now).system).toBe("TODAY"); // never backwards
    expect(myTaskBucket(task({ dueDay: "2026-10-30" }), { system: "RECENT", sectionId: 1 }, today, now).system).toBe("RECENT");
    expect(myTaskBucket(task({ dueDay: "2026-10-30" }), { system: null, sectionId: 9 }, today, now)).toEqual({ system: null, sectionId: 9 });
  });
  it("India's day", () => {
    expect(indiaDay(new Date("2026-10-30T19:00:00Z"))).toBe("2026-10-31");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("mentions and search", () => {
  it("mentions keep only the person's id", () => {
    const body = "Hi @[Ravi K](user:12), see @[Asha](user:7) and @[Ravi K](user:12)";
    expect(mentionedIds(body)).toEqual([12, 7]);
    expect(commentParts("Ping @[Asha](user:7)!")).toEqual([
      { kind: "text", text: "Ping " },
      { kind: "mention", userId: 7, label: "Asha" },
      { kind: "text", text: "!" },
    ]);
    expect(mentionedIds("@[x](user:abc) plain")).toEqual([]);
  });
  it("search filters parse from the address and round-trip", () => {
    const search = parseWorkSearch({ q: "  pump   repair ", status: "all", assignee: "me", project: "4", priority: "HIGH", due_from: "2026-10-01", team: "1", page: "2", junk: "x" });
    expect(search).toMatchObject({ q: "pump repair", status: "all", assignee: "me", project: 4, priority: "HIGH", dueFrom: "2026-10-01", team: true, page: 2 });
    expect(parseWorkSearch(workSearchQuery(search))).toEqual(search);
    expect(parseWorkSearch({ status: "nope", priority: "MEGA", project: "1; DROP" })).toMatchObject({ status: "open", priority: null, project: null });
  });
});
