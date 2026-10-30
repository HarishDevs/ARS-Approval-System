import { describe, expect, it } from "vitest";
import { checkFormDefinition, displayValue, parseFormSubmission, type FormField } from "@/server/forms/fields";
import { ruleHolds } from "@/server/forms/dynamic";
import { checkTypeDraft, DEFAULT_INFO_SETTINGS, DEFAULT_TASK_SETTINGS, indiaLocalToUtc, mayCreate, parseTaskSettings, utcToIndiaLocal } from "@/server/modules/settings";
import { allowedTaskActions, canSeeTask, completionProblems, isOverdue, mayAssignTo, type TaskFacts } from "@/server/modules/task-rules";
import { allowedInfoActions, canSeeInfo, infoState, resolveAck, resolveRecipients, targetProblems } from "@/server/modules/info-rules";
import { parseTaskFilters, taskListSql, taskQuery } from "@/server/modules/task-lists";
import { infoListSql, parseInfoFilters } from "@/server/modules/info-lists";
import { appPath, categoryOf, CATEGORY_SQL, entityFromLink, parseCategory } from "@/server/notifications/categories";
import { routeChanged } from "@/server/engine/conditions";
import { decide, resubmit, startInstance } from "@/server/engine/engine";
import { EngineError, type InstanceState } from "@/server/engine/types";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

// v1.9.0: the shared field types, module settings, the task and information
// rules, list filters, notification categories, and the approval fixes
// (one vote per step, resubmit re-routing).
describe("new field types", () => {
  const form: FormField[] = [
    { key: "cost", label: "Cost", type: "CURRENCY", required: true, min: 0 },
    { key: "meet", label: "Meeting", type: "DATETIME", required: false },
    { key: "tags", label: "Tags", type: "MULTI_CHOICE", required: false, options: ["Red", "Blue", "Green"] },
    { key: "agree", label: "I confirm", type: "CHECKBOX", required: true },
    { key: "size", label: "Size", type: "RADIO", required: false, options: ["S", "M"] },
    { key: "link", label: "Link", type: "URL", required: false },
  ];
  it("the form definition is valid, and option fields need two choices", () => {
    expect(checkFormDefinition(form)).toEqual([]);
    expect(checkFormDefinition([{ key: "x", label: "X", type: "MULTI_CHOICE", required: false, options: ["one"] }]).join(" ")).toMatch(/at least two choices/);
    expect(checkFormDefinition([{ key: "u", label: "U", type: "URL", required: false, defaultValue: "javascript:alert(1)" }]).join(" ")).toMatch(/web link/);
  });
  it("parses typed values and refuses bad ones", () => {
    const ok = parseFormSubmission(form, { cost: "12,500.50", meet: "2026-10-20T14:30", tags: '["Blue","Red"]', agree: "Yes", size: "M", link: "https://example.com/a" }, new Set());
    expect(ok).toEqual({ ok: true, data: { cost: 12500.5, meet: "2026-10-20T14:30", tags: ["Red", "Blue"], agree: "Yes", size: "M", link: "https://example.com/a" } });
    const bad = parseFormSubmission(form, { cost: "1.234", meet: "2026-02-31T10:00", tags: '["Pink"]', size: "XL", link: "javascript:alert(1)" }, new Set());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["agree", "cost", "link", "meet", "size", "tags"]);
  });
  it("shows values and evaluates rules on a multi-select", () => {
    expect(displayValue(form[0]!, 1250.5, new Map())).toBe("₹1,250.50");
    expect(displayValue(form[2]!, ["Red", "Blue"], new Map())).toBe("Red, Blue");
    expect(displayValue(form[1]!, "2026-10-20T14:30", new Map())).toMatch(/20 Oct 2026, 14:30/);
    expect(ruleHolds({ field: "tags", op: "EQ", value: "blue" }, { tags: ["Red", "Blue"] })).toBe(true);
    expect(ruleHolds({ field: "tags", op: "NEQ", value: "Green" }, { tags: ["Red"] })).toBe(true);
    expect(ruleHolds({ field: "tags", op: "FILLED" }, { tags: [] })).toBe(false);
  });
});

describe("module type set-up", () => {
  it("checks reserved keys, line items, access and assignment lists", () => {
    expect(checkTypeDraft("TASK", [], DEFAULT_TASK_SETTINGS)).toEqual([]);
    const problems = checkTypeDraft("TASK", [{ key: "title", label: "Title", type: "TEXT", required: false }, { key: "lines", label: "Lines", type: "LINE_ITEMS", required: false }], { ...DEFAULT_TASK_SETTINGS, assignScope: "GROUPS", access: { mode: "PEOPLE", departmentIds: [], userIds: [] } });
    expect(problems.join(" ")).toMatch(/used by the page itself/);
    expect(problems.join(" ")).toMatch(/line items/);
    expect(problems.join(" ")).toMatch(/at least one group/);
    expect(problems.join(" ")).toMatch(/at least one person who may create/);
    expect(checkTypeDraft("INFO", [], { ...DEFAULT_INFO_SETTINGS, allowPeople: false, allowDepartments: false, allowGroups: false, allowEveryone: false }).join(" ")).toMatch(/at least one way/);
  });
  it("who may create: everyone, departments or people", () => {
    expect(mayCreate({ mode: "EVERYONE", departmentIds: [], userIds: [] }, { id: 1, departmentId: null })).toBe(true);
    expect(mayCreate({ mode: "DEPARTMENTS", departmentIds: [5], userIds: [] }, { id: 1, departmentId: 5 })).toBe(true);
    expect(mayCreate({ mode: "DEPARTMENTS", departmentIds: [5], userIds: [] }, { id: 1, departmentId: null })).toBe(false);
    expect(mayCreate({ mode: "PEOPLE", departmentIds: [], userIds: [2] }, { id: 1, departmentId: 5 })).toBe(false);
  });
  it("bad stored settings fall back to the defaults; India time round trip", () => {
    expect(parseTaskSettings("{nonsense")).toEqual(DEFAULT_TASK_SETTINGS);
    const due = indiaLocalToUtc("2026-10-20T18:00")!;
    expect(due.toISOString()).toBe("2026-10-20T12:30:00.000Z");
    expect(utcToIndiaLocal(due)).toBe("2026-10-20T18:00");
    expect(indiaLocalToUtc("2026-02-31T10:00")).toBeNull();
  });
});

describe("task rules", () => {
  const task: TaskFacts = { status: "OPEN", createdBy: 1, assigneeId: 2, assignedBy: 1 };
  const settings = { allowBlocked: true, allowReopen: true, allowReassign: true, assigneeMayCancel: false };
  const as = (id: number, extra: Partial<{ isAdmin: boolean; managesAssignee: boolean }> = {}) => ({ id, isAdmin: false, managesAssignee: false, ...extra });
  it("who may see a task", () => {
    expect(canSeeTask(task, as(1))).toBe(true);
    expect(canSeeTask(task, as(2))).toBe(true);
    expect(canSeeTask(task, as(9))).toBe(false);
    expect(canSeeTask(task, as(9, { managesAssignee: true }))).toBe(true);
    expect(canSeeTask(task, as(9, { isAdmin: true }))).toBe(true);
  });
  it("the assignee works it; the creator reassigns, cancels and reopens", () => {
    expect([...allowedTaskActions(task, as(2), settings)].sort()).toEqual(["BLOCK", "COMMENT", "COMPLETE", "START"]);
    expect([...allowedTaskActions(task, as(1), settings)].sort()).toEqual(["CANCEL", "COMMENT", "EDIT", "REASSIGN"]);
    expect([...allowedTaskActions({ ...task, status: "COMPLETED" }, as(1), settings)].sort()).toEqual(["COMMENT", "REOPEN"]);
    expect(allowedTaskActions({ ...task, status: "COMPLETED" }, as(1), { ...settings, allowReopen: false }).has("REOPEN")).toBe(false);
    expect(allowedTaskActions({ ...task, status: "BLOCKED" }, as(2), settings).has("UNBLOCK")).toBe(true);
    expect(allowedTaskActions(task, as(2), { ...settings, allowBlocked: false }).has("BLOCK")).toBe(false);
    expect(allowedTaskActions(task, as(2), { ...settings, assigneeMayCancel: true }).has("CANCEL")).toBe(true);
    // A manager can see but not act; a stranger nothing.
    expect([...allowedTaskActions(task, as(9, { managesAssignee: true }), settings)]).toEqual([]);
    expect(allowedTaskActions({ ...task, status: "CANCELLED" }, as(1), settings).size).toBe(1); // comment only
  });
  it("completion evidence and overdue", () => {
    expect(completionProblems("NONE", "", 0)).toEqual([]);
    expect(completionProblems("NOTE_AND_FILE", "", 0)).toHaveLength(2);
    expect(completionProblems("FILE", "", 1)).toEqual([]);
    const now = new Date("2026-10-20T10:00:00Z");
    expect(isOverdue({ status: "OPEN", dueAt: new Date("2026-10-20T09:00:00Z") }, now)).toBe(true);
    expect(isOverdue({ status: "COMPLETED", dueAt: new Date("2026-10-20T09:00:00Z") }, now)).toBe(false);
  });
  it("assignment scope", () => {
    const candidate = { id: 5, active: true, departmentId: 3, managerId: 1, groupIds: [7] };
    const base = { creatorId: 1, creatorDepartmentId: 3, candidate };
    expect(mayAssignTo({ assignScope: "SAME_DEPARTMENT", assignGroupIds: [], assignUserIds: [] }, base, false)).toBe(true);
    expect(mayAssignTo({ assignScope: "SAME_DEPARTMENT", assignGroupIds: [], assignUserIds: [] }, { ...base, creatorDepartmentId: 4 }, false)).toBe(false);
    expect(mayAssignTo({ assignScope: "MY_TEAM", assignGroupIds: [], assignUserIds: [] }, { ...base, creatorId: 2 }, false)).toBe(false);
    expect(mayAssignTo({ assignScope: "GROUPS", assignGroupIds: [7], assignUserIds: [] }, base, false)).toBe(true);
    expect(mayAssignTo({ assignScope: "PEOPLE", assignGroupIds: [], assignUserIds: [6] }, base, false)).toBe(false);
    expect(mayAssignTo({ assignScope: "PEOPLE", assignGroupIds: [], assignUserIds: [6] }, base, true)).toBe(true); // IT
    expect(mayAssignTo({ assignScope: "PEOPLE", assignGroupIds: [], assignUserIds: [] }, { ...base, candidate: { ...candidate, id: 1 } }, false)).toBe(true); // self
    expect(mayAssignTo({ assignScope: "ANYONE", assignGroupIds: [], assignUserIds: [] }, { ...base, candidate: { ...candidate, active: false } }, false)).toBe(false);
  });
});

describe("information rules", () => {
  const item = { status: "PUBLISHED" as const, createdBy: 1, ackRequired: true, expiresOn: "2026-10-30" };
  it("expiry, visibility and actions", () => {
    expect(infoState(item, "2026-10-31")).toBe("EXPIRED");
    expect(infoState(item, "2026-10-30")).toBe("PUBLISHED");
    expect(canSeeInfo({ status: "DRAFT", createdBy: 1 }, { id: 2, isAdmin: false, recipient: { readAt: null, acknowledgedAt: null } })).toBe(false);
    const recipient = { id: 2, isAdmin: false, recipient: { readAt: new Date(), acknowledgedAt: null } };
    expect([...allowedInfoActions(item, recipient, { editableAfterPublish: false }, "2026-10-20")]).toEqual(["ACKNOWLEDGE"]);
    expect(allowedInfoActions(item, { ...recipient, recipient: { readAt: new Date(), acknowledgedAt: new Date() } }, { editableAfterPublish: false }, "2026-10-20").size).toBe(0);
    expect([...allowedInfoActions(item, { id: 1, isAdmin: false, recipient: null }, { editableAfterPublish: true }, "2026-10-20")].sort()).toEqual(["ARCHIVE", "EDIT_PUBLISHED", "WITHDRAW"]);
    expect(allowedInfoActions(item, { id: 9, isAdmin: false, recipient: null }, { editableAfterPublish: true }, "2026-10-20").size).toBe(0);
  });
  it("acknowledgement and targets", () => {
    expect(resolveAck("ALWAYS", false)).toBe(true);
    expect(resolveAck("NEVER", true)).toBe(false);
    expect(resolveAck("SENDER_CHOOSES", true)).toBe(true);
    expect(targetProblems({ people: [], departments: [], groups: [], everyone: false }, DEFAULT_INFO_SETTINGS).join(" ")).toMatch(/Choose who/);
    expect(targetProblems({ people: [], departments: [], groups: [], everyone: true }, DEFAULT_INFO_SETTINGS).join(" ")).toMatch(/everyone/);
  });
  it("recipients are resolved once, the sender excluded, direct choice wins", () => {
    const directory = { active: new Map([[1, { departmentId: 5 }], [2, { departmentId: 5 }], [3, { departmentId: 6 }], [4, { departmentId: null }]]), groupMembers: new Map([[9, [3, 4, 99]]]) };
    const out = resolveRecipients({ people: [2], departments: [5], groups: [9], everyone: false }, directory, 1);
    expect([...out.entries()]).toEqual([
      [2, "USER"],
      [3, "GROUP"],
      [4, "GROUP"],
    ]);
    expect(resolveRecipients({ people: [], departments: [], groups: [], everyone: true }, directory, 1).size).toBe(3);
  });
});

describe("list filters (tasks and information)", () => {
  it("task filters parse from the address and give bound SQL", () => {
    const f = parseTaskFilters({ tab: "overdue", q: "pump", type: "3", priority: "HIGH,BOGUS", dueFrom: "2026-10-10", dueTo: "2026-10-01", sort: "priority", size: "50" });
    expect(f).toMatchObject({ tab: "overdue", typeId: 3, priorities: ["HIGH"], dueFrom: "2026-10-01", dueTo: "2026-10-10", sort: "priority", size: 50 });
    const now = new Date("2026-10-20T00:00:00Z");
    const sql = taskListSql(f, "MINE", { id: 7, isAdmin: false }, ["serial"], now);
    expect(sql.where[0]).toBe("t.deleted_at IS NULL"); // D-215: deleted tasks are in no list
    expect(sql.where[1]).toBe("t.assignee_id = ?");
    expect(sql.params).toContain(7);
    expect(sql.params).toContain("$.serial");
    expect(sql.where.join(" ")).not.toContain("pump");
    expect(taskQuery(f, { page: 2 })).toContain("page=2");
    expect(taskListSql(f, "TEAM", { id: 7, isAdmin: true }, [], now).where.join(" ")).not.toContain("reporting_manager_id");
    expect(taskListSql(f, "TEAM", { id: 7, isAdmin: false }, [], now).where[1]).toBe("a.reporting_manager_id = ?");
    // D-216: with the reporting line known, Team tasks is everyone below, every level.
    expect(taskListSql(f, "TEAM", { id: 7, isAdmin: false, teamIds: [8, 9] }, [], now).where[1]).toBe("t.assignee_id IN (?)");
  });
  it("information filters: inbox only shows published items sent to me", () => {
    const f = parseInfoFilters({ tab: "to_ack" }, "INBOX");
    expect(f.tab).toBe("to_ack");
    expect(parseInfoFilters({ tab: "drafts" }, "INBOX").tab).toBe("current");
    const sql = infoListSql(f, "INBOX", 7, "2026-10-20", []);
    expect(sql.where[0]).toContain("me.user_id IS NOT NULL");
    expect(sql.where.join(" ")).toContain("me.acknowledged_at IS NULL");
    expect(infoListSql(parseInfoFilters({}, "SENT"), "SENT", 7, "2026-10-20", []).params[0]).toBe(7);
  });
});

describe("notification categories", () => {
  it("maps events to modules and links to records", () => {
    expect(categoryOf("WORK_TASK_ASSIGNED")).toBe("TASK");
    expect(categoryOf("TASK_ASSIGNED")).toBe("APPROVAL"); // the approval engine's work step
    expect(categoryOf("INFO_PUBLISHED")).toBe("INFORMATION");
    expect(categoryOf("NEW_LOGIN")).toBe("SYSTEM");
    expect(categoryOf("APPROVAL_NEEDED")).toBe("APPROVAL");
    expect(parseCategory("tasks")).toBe("TASK");
    expect(parseCategory("INFORMATION")).toBe("INFORMATION");
    expect(parseCategory("nope")).toBeNull();
    expect(entityFromLink("https://approval.arssteels.net/users/tasks/12")).toEqual({ type: "TASK", id: 12 });
    expect(entityFromLink("/users/requests/5?x=1")).toEqual({ type: "REQUEST", id: 5 });
    expect(appPath("https://evil.example/users/tasks/1")).toBe("/users/tasks/1");
    expect(appPath("https://approval.arssteels.net/admin")).toBeNull();
    expect(CATEGORY_SQL).toContain("'WORK_TASK_ASSIGNED'");
  });
});

describe("approval integrity (v1.9.0)", () => {
  const directory = makeDirectory();
  const pending = (state: InstanceState, nodeId: string) => state.tasks.filter((task) => task.nodeId === nodeId && task.status === "PENDING");
  it("one person, one vote per step (AUD-05)", () => {
    const def = chain(approval("pair", [user(7), user(12)], { type: "ALL" }));
    let { state } = startInstance(def, ctx(), directory);
    const own = pending(state, "pair").find((task) => task.approverId === 12)!;
    const eds = pending(state, "pair").find((task) => task.approverId === 7)!;
    // 12 approves their own part, then tries the ED's part as the ED's delegate.
    state = decide(def, state, { taskId: own.id, actorId: 12, decision: "APPROVE" }, ctx(), directory).state;
    expect(() => decide(def, state, { taskId: eds.id, actorId: 12, decision: "APPROVE" }, ctx(), directory)).toThrow(EngineError);
    // The real ED can still approve their own part.
    const edTask = pending(state, "pair").find((task) => task.approverId === 7)!;
    state = decide(def, state, { taskId: edTask.id, actorId: 7, decision: "APPROVE" }, ctx(), directory).state;
    expect(state.status).toBe("APPROVED");
  });
  it("a resubmit whose values change the route is detected (AUD-02)", () => {
    const def = chain(approval("cfo", [user(9)], { type: "ALL" }, { skipIf: { field: "amount", operator: "LT", value: 100000 } }), approval("ed", [user(7)]));
    expect(routeChanged(def, { amount: 5000 }, { amount: 5000000 })).toBe(true);
    expect(routeChanged(def, { amount: 5000 }, { amount: 9000 })).toBe(false);
    let { state } = startInstance(def, ctx({ amount: 5000 }), directory);
    state = decide(def, state, { taskId: pending(state, "ed")[0]!.id, actorId: 7, decision: "REQUEST_CHANGES", comment: "revise" }, ctx({ amount: 5000 }), directory).state;
    // The service restarts from the beginning when the route changed; the CFO step then runs.
    state = resubmit(def, state, "BEGINNING", ctx({ amount: 5000000 }), directory).state;
    expect(pending(state, "cfo")).toHaveLength(1);
  });
});
