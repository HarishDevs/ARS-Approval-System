import { describe, expect, it } from "vitest";
import { classicModules, locate, pageHotkeys } from "@/features/shell/classic-modules";

// D-210: the Classic (Tally-style) view's map of the workspace.
const nav = [
  { href: "/users", label: "Overview" },
  { href: "/users/custom", label: "New request", section: "My Approvals" },
  { href: "/users/requests", label: "My pending requests", section: "My Approvals" },
  { href: "/users/queue", label: "Waiting for me", section: "My Approvals", count: 3 },
  { href: "/users/tasks/new", label: "New task", section: "Tasks" },
  { href: "/users/tasks", label: "My tasks", section: "Tasks" },
  { href: "/users/ai/assistant", label: "AI Assistant", section: "AI Assistant", chats: true },
  { href: "/users/search", label: "Search" },
  { href: "/users/calendar", label: "Calendar" },
];

describe("Classic modules", () => {
  const modules = classicModules(nav);
  it("modules first (as in the sketch), then the single pages; each with its own letter", () => {
    expect(modules.map((entry) => entry.label)).toEqual(["Approval Management", "Tasks Management", "Pico Bot (AI Assistant)", "Home dashboard", "Search", "Calendar"]);
    expect(modules.map((entry) => entry.hotkey)).toEqual(["a", "t", "p", "h", "s", "c"]);
    expect(new Set(modules.map((entry) => entry.hotkey)).size).toBe(modules.length);
  });
  it("a module with several pages opens its menu; one page opens directly; Overview keeps its dashboard", () => {
    expect(modules[0]).toMatchObject({ key: "approvals", href: "/users/menu/approvals" });
    expect(modules[0]!.pages.find((page) => page.href === "/users/queue")?.count).toBe(3);
    expect(modules[2]!.href).toBe("/users/ai/assistant");
    expect(modules[3]!.href).toBe("/users?view=overview");
  });
  it("finds the module and page from the address (the most specific page wins)", () => {
    expect(locate(modules, "/users/tasks/new")).toMatchObject({ entry: { key: "tasks" }, page: { label: "New task" } });
    expect(locate(modules, "/users/tasks/42")).toMatchObject({ entry: { key: "tasks" }, page: { label: "My tasks" } });
    expect(locate(modules, "/users/menu/approvals")).toMatchObject({ entry: { key: "approvals" }, page: null });
    expect(locate(modules, "/users/profile")).toEqual({ entry: null, page: null });
  });
  it("v1.48.2: the older task lists keep the Tasks Management tabs (My tasks is under Tasks & projects)", () => {
    const today = classicModules([
      { href: "/users", label: "Overview" },
      { href: "/users/tasks/new", label: "New task", section: "Tasks" },
      { href: "/users/work/my-tasks", label: "My tasks", section: "Tasks" },
      { href: "/users/work/projects", label: "Projects", section: "Tasks" },
    ]);
    expect(locate(today, "/users/tasks")).toMatchObject({ entry: { key: "tasks" }, page: { label: "My tasks" } });
    expect(locate(today, "/users/tasks/7")).toMatchObject({ entry: { key: "tasks" } });
    expect(locate(today, "/users/tasks/assigned")).toMatchObject({ entry: { key: "tasks" } });
  });
  it("page letters don't repeat within a menu", () => {
    const keys = pageHotkeys(modules[0]!.pages);
    expect(keys).toEqual(["n", "m", "w"]);
  });
});
