import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, mayShareTasks, mayUpdateField, parseProjectPermissions, taskRights } from "@/server/work/access";
import { allowedTaskActions } from "@/server/modules/task-rules";
import { DEFAULT_TASK_SETTINGS } from "@/server/modules/settings";

// D-222: ad hoc tasks are their creator's to change; project permissions.
const none = { isAssignee: false, isCreator: false, isFollower: false, managesAssignee: false, isAdmin: false, bestProjectRole: null };

describe("ad hoc and periodic task rights", () => {
  it("ad hoc: only the creator (and IT) change details and plans", () => {
    expect(taskRights({ ...none, isAssignee: true, adhoc: true })).toMatchObject({ details: false, planning: false, comment: true });
    expect(taskRights({ ...none, bestProjectRole: "EDITOR", adhoc: true })).toMatchObject({ details: false, planning: false, edit: true });
    expect(taskRights({ ...none, isCreator: true, isOriginalCreator: false, adhoc: true })).toMatchObject({ details: false }); // assigned it, didn't create it
    expect(taskRights({ ...none, isCreator: true, isOriginalCreator: true, adhoc: true })).toMatchObject({ details: true, planning: true });
    expect(taskRights({ ...none, isAdmin: true, adhoc: true })).toMatchObject({ details: true, planning: true });
  });
  it("periodic: editors change details; the assignee plans dates", () => {
    expect(taskRights({ ...none, bestProjectRole: "EDITOR", adhoc: false })).toMatchObject({ details: true, planning: true });
    expect(taskRights({ ...none, isAssignee: true, adhoc: false })).toMatchObject({ details: false, planning: true });
  });
  it("ad hoc: the assignee may start and complete but not edit, reassign or cancel", () => {
    const task = { status: "OPEN" as const, createdBy: 1, assigneeId: 2, assignedBy: 1 };
    const assignee = allowedTaskActions(task, { id: 2, isAdmin: false, managesAssignee: false, creatorOnly: true }, DEFAULT_TASK_SETTINGS);
    expect([...assignee]).toEqual(expect.arrayContaining(["START", "COMPLETE", "COMMENT"]));
    expect(assignee.has("EDIT")).toBe(false);
    expect(assignee.has("REASSIGN")).toBe(false);
    const editor = allowedTaskActions(task, { id: 3, isAdmin: false, managesAssignee: false, workSee: true, workEdit: true, workComment: true, creatorOnly: true }, DEFAULT_TASK_SETTINGS);
    expect(editor.has("EDIT")).toBe(false);
    expect(editor.has("COMPLETE")).toBe(true);
    const creator = allowedTaskActions(task, { id: 1, isAdmin: false, managesAssignee: false, creatorOnly: true }, DEFAULT_TASK_SETTINGS);
    expect(creator.has("EDIT")).toBe(true);
  });
});

describe("project permissions", () => {
  it("are read safely", () => {
    expect(parseProjectPermissions(null)).toEqual(DEFAULT_PERMISSIONS);
    expect(parseProjectPermissions('{"fields":[{"field":"due","role":"OWNER"},{"field":"due","role":"EDITOR"},{"field":"evil","role":"OWNER"},{"field":"field:12","role":"EDITOR"}],"shareTasks":"OWNER"}')).toEqual({
      fields: [
        { field: "due", role: "OWNER" },
        { field: "field:12", role: "EDITOR" },
      ],
      shareTasks: "OWNER",
    });
  });
  it("field restrictions and sharing follow the role", () => {
    const permissions = { fields: [{ field: "due", role: "OWNER" as const }], shareTasks: "OWNER" as const };
    expect(mayUpdateField(permissions, "due", "EDITOR", false)).toBe(false);
    expect(mayUpdateField(permissions, "due", "OWNER", false)).toBe(true);
    expect(mayUpdateField(permissions, "due", null, true)).toBe(true); // IT
    expect(mayUpdateField(permissions, "priority", "VIEWER", false)).toBe(true); // not restricted
    expect(mayShareTasks(permissions, "EDITOR", false)).toBe(false);
    expect(mayShareTasks(DEFAULT_PERMISSIONS, "EDITOR", false)).toBe(true);
    expect(mayShareTasks({ ...DEFAULT_PERMISSIONS, shareTasks: "COMMENTER" }, "COMMENTER", false)).toBe(true);
  });
});
