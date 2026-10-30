import { describe, expect, it } from "vitest";
import { applyGrid, DEFAULT_GRID, filterCount, parseGridConfig, type GridTask } from "@/server/work/grid";

// D-220: the shared task table's filters, sort and groups.
const task = (over: Partial<GridTask>): GridTask => ({
  id: 1,
  taskNo: "TSK-1",
  title: "Task",
  status: "OPEN",
  priority: "NORMAL",
  assigneeId: 1,
  assigneeName: "Ravi",
  createdBy: 1,
  createdByName: "Ravi",
  dueAt: null,
  startsOn: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  completedAt: null,
  likes: 0,
  comments: 0,
  subtasks: 0,
  isPeriodic: false,
  isMilestone: false,
  projects: [],
  tags: [],
  followers: [],
  sectionId: null,
  position: 0,
  canEdit: true,
  canComplete: true,
  ...over,
});
const today = "2026-10-30"; // a Friday
const at = (day: string) => `${day}T12:30:00.000Z`;
const rows = [
  task({ id: 1, title: "Bank reco", assigneeId: 1, assigneeName: "Ravi", dueAt: at("2026-10-29"), priority: "HIGH", sectionId: 10, position: 2 }),
  task({ id: 2, title: "Audit", assigneeId: 2, assigneeName: "Asha", dueAt: at("2026-11-03"), isPeriodic: true, sectionId: 10, position: 1, projects: [{ id: 5, name: "Close", color: "teal" }] }),
  task({ id: 3, title: "Old one", status: "COMPLETED", completedAt: "2026-10-29T10:00:00.000Z", sectionId: 11 }),
  task({ id: 4, title: "Later work", assigneeId: 2, assigneeName: "Asha", createdBy: 2, createdByName: "Asha", dueAt: at("2026-12-20"), sectionId: 11, tags: [{ id: 7, name: "site" }] }),
];
const ids = (groups: ReturnType<typeof applyGrid>) => groups.flatMap((group) => group.rows.map((row) => row.id));

describe("task table (D-220)", () => {
  it("by default: incomplete tasks, in manual order, in one group", () => {
    const groups = applyGrid(rows, DEFAULT_GRID, { today, meId: 1 });
    expect(groups).toHaveLength(1);
    expect(ids(groups)).toEqual([1, 2, 4].sort((a, b) => rows.find((row) => row.id === a)!.position - rows.find((row) => row.id === b)!.position || a - b));
    expect(filterCount(DEFAULT_GRID)).toBe(0);
  });
  it("quick filters: completed, due this week / next week", () => {
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, incomplete: false, completed: "all" }, { today, meId: 1 }))).toEqual([3]);
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, completed: "today" }, { today, meId: 1 }))).not.toContain(3);
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, dueThisWeek: true }, { today, meId: 1 }))).toEqual([1]);
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, dueNextWeek: true }, { today, meId: 1 }))).toEqual([2]);
    expect(filterCount({ ...DEFAULT_GRID, dueNextWeek: true, filters: [{ field: "priority", value: "HIGH" }] })).toBe(2);
  });
  it("field filters: assignee (me), project, periodic, due, tag", () => {
    const run = (field: string, value: string) => ids(applyGrid(rows, { ...DEFAULT_GRID, filters: [{ field: field as never, value }] }, { today, meId: 1 }));
    expect(run("assignee", "me")).toEqual([1]);
    expect(run("project", "5")).toEqual([2]);
    expect(run("project", "none")).toEqual(expect.arrayContaining([1, 4]));
    expect(run("kind", "periodic")).toEqual([2]);
    expect(run("kind", "adhoc")).toEqual(expect.arrayContaining([1, 4]));
    expect(run("due", "overdue")).toEqual([1]);
    expect(run("tag", "site")).toEqual([4]);
  });
  it("search, sort and groups", () => {
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, search: "audit" }, { today, meId: 1 }))).toEqual([2]);
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, sort: "alpha" }, { today, meId: 1 }))).toEqual([2, 1, 4]);
    expect(ids(applyGrid(rows, { ...DEFAULT_GRID, sort: "due" }, { today, meId: 1 }))).toEqual([1, 2, 4]);
    const byAssignee = applyGrid(rows, { ...DEFAULT_GRID, group: "assignee" }, { today, meId: 1 });
    expect(byAssignee.map((group) => [group.name, group.person, group.rows.length])).toEqual([
      ["Asha", "Asha", 2],
      ["Ravi", "Ravi", 1],
    ]);
    const byDue = applyGrid(rows, { ...DEFAULT_GRID, group: "due" }, { today, meId: 1 });
    expect(byDue.map((group) => group.name)).toEqual(["Overdue", "Next 7 days", "Later"]);
    const bySection = applyGrid(rows, { ...DEFAULT_GRID, group: "section" }, { today, meId: 1, sections: [{ id: 10, name: "To do" }, { id: 11, name: "Done" }, { id: 12, name: "Empty" }] });
    expect(bySection.map((group) => [group.name, group.sectionId, group.rows.map((row) => row.id)])).toEqual([
      ["To do", 10, [2, 1]],
      ["Done", 11, [4]],
      ["Empty", 12, []],
    ]);
  });
  it("saved settings are read safely", () => {
    expect(parseGridConfig(null)).toEqual(DEFAULT_GRID);
    expect(parseGridConfig('{"group":"assignee","sort":"due"}')).toMatchObject({ group: "assignee", sort: "due", incomplete: true });
    expect(parseGridConfig({ group: "nonsense" })).toEqual(DEFAULT_GRID);
  });
});
