import { describe, expect, it } from "vitest";
import { DEFAULT_MODULES, hasModule, MODULE_LABEL, MODULES, modulesProblem, parseModuleSet, PROJECTS_NEED_TASKS } from "@/server/modules/modules";
import { effectiveProjectRole } from "@/server/work/access";
import { visibleProjectClause, visibleTaskClause } from "@/lib/db/repositories/work.repository";
import { VISIBLE_TO_MODULES_SQL } from "@/server/notifications/categories";
import { PAGES, pageForPath } from "@/server/authorization/pages";
import { boardsFor, soonBoards } from "@/server/analytics/center";
import { classicModules } from "@/features/shell/classic-modules";

// D-307 (owner, v1.53.0): the main modules in their order, Projects separate
// from Tasks, modules released one at a time.
describe("the main modules (D-307)", () => {
  it("are Approvals, Tasks, Projects, Information, Meeting Management, then the AI assistant", () => {
    expect(MODULES).toEqual(["APPROVAL", "TASK", "PROJECT", "INFORMATION", "MEETING", "AI"]);
    expect(MODULES.map((module) => MODULE_LABEL[module])).toEqual(["Approvals", "Tasks", "Projects", "Information", "Meeting Management", "AI Assistant"]);
    expect(parseModuleSet("PROJECT,TASK")).toEqual(["TASK", "PROJECT"]);
  });

  it("new people start with the released modules only", () => {
    expect(DEFAULT_MODULES).toEqual(["APPROVAL", "TASK"]);
  });

  it("the project pages belong to Projects, the task pages to Tasks", () => {
    expect(pageForPath("/users/work/projects")?.module).toBe("PROJECT");
    expect(pageForPath("/users/work/projects/12")?.module).toBe("PROJECT");
    expect(pageForPath("/users/work/projects/new")?.module).toBe("PROJECT");
    expect(pageForPath("/users/work/my-tasks")?.module).toBe("TASK");
    expect(pageForPath("/users/tasks/5")?.module).toBe("TASK");
    expect(PAGES.filter((page) => page.module === "PROJECT").map((page) => page.key)).toEqual(["users.projects"]);
  });

  it("Tasks without Projects: the Task module doesn't open projects", () => {
    const person = { roles: ["USER"], modules: ["APPROVAL", "TASK"] as const };
    expect(hasModule({ ...person, modules: [...person.modules] }, "TASK")).toBe(true);
    expect(hasModule({ ...person, modules: [...person.modules] }, "PROJECT")).toBe(false);
    expect(hasModule({ roles: ["USER", "SUPER_ADMIN"], modules: [] }, "PROJECT")).toBe(true);
  });

  it("Analytics lists the dashboards of modules not given, locked, never the given ones", () => {
    const modules = { approval: true, task: true, information: false, meeting: false };
    expect(soonBoards(modules)).toEqual(["information", "meetings"]);
    const open = boardsFor({ modules, scopes: ["MINE"] });
    expect(soonBoards(modules).some((key) => open.includes(key))).toBe(false);
    expect(soonBoards({ approval: true, task: true, information: true, meeting: true })).toEqual([]);
  });

  it("the Classic view has Project Management as its own module, after Tasks", () => {
    const modules = classicModules([
      { href: "/users/work/my-tasks", label: "My tasks", section: "Tasks" },
      { href: "/users/tasks/team", label: "Team tasks", section: "Tasks" },
      { href: "/users/work/projects", label: "Projects", section: "Projects" },
    ]);
    expect(modules.map((entry) => entry.label)).toEqual(["Tasks Management", "Project Management"]);
    expect(modules[1]!.href).toBe("/users/work/projects");
  });
});

// D-308 (owner's answers to Q-028 to Q-031).

describe("D-308: the owner's interlink answers", () => {
  it("Projects is never given without Tasks", () => {
    expect(modulesProblem(["APPROVAL", "PROJECT"])).toBe(PROJECTS_NEED_TASKS);
    expect(modulesProblem(["APPROVAL", "TASK", "PROJECT"])).toBeNull();
    expect(modulesProblem(["APPROVAL"])).toBeNull();
  });

  it("without Projects, a project grants nothing: no role, no project seen, no task seen through one", () => {
    const project = { privacy: "ORGANISATION" as const, departmentId: null, defaultAccessRole: "EDITOR" as const, members: [{ type: "USER" as const, id: 7, role: "OWNER" as const }] };
    const viewer = { id: 7, departmentId: null, isAdmin: false, teamIds: [] };
    expect(effectiveProjectRole(project, viewer)).toBe("OWNER");
    expect(effectiveProjectRole(project, { ...viewer, projects: false })).toBeNull();
    expect(visibleProjectClause({ ...viewer, projects: false }).sql).toBe("FALSE");
    const off = visibleTaskClause({ ...viewer, projects: false });
    expect(off.sql).not.toContain("task_projects");
    expect(off.sql).toContain("t.assignee_id IN (?)"); // the tasks the person is on stay
    expect((off.sql.match(/\?/g) ?? []).length).toBe(off.params.length);
    expect(visibleTaskClause(viewer).sql).toContain("task_projects");
  });

  it("project notifications are filtered by the notification's own person", () => {
    expect(VISIBLE_TO_MODULES_SQL).toContain("WORK_PROJECT_MEMBER");
    expect(VISIBLE_TO_MODULES_SQL).toContain("n.user_id");
    expect(VISIBLE_TO_MODULES_SQL).toContain("SUPER_ADMIN");
  });
});
