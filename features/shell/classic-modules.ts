// D-210 (owner, sketch: "use Tally as reference"): the Classic view's map of
// the workspace. The sidebar's groups become modules ("Approval Management",
// "Tasks Management"…) with their pages; single entries (Search, Calendar,
// Analytics) are modules of one page. Each module gets a shortcut letter,
// like Tally's highlighted letters. Pure: used by the server and the browser.
import type { NavItem } from "@/features/shell/SideNav";

export interface ClassicPage {
  href: string;
  label: string;
  count?: number;
}

export interface ClassicModule {
  key: string;
  label: string;
  hotkey: string; // one lower-case letter or digit
  href: string; // the module's menu, or its only page
  pages: ClassicPage[];
}

export const GATEWAY = "/users";
export const MENU_BASE = "/users/menu";

const MODULE_NAME: Record<string, { key: string; label: string }> = {
  "My Approvals": { key: "approvals", label: "Approval Management" },
  Tasks: { key: "tasks", label: "Tasks Management" },
  Projects: { key: "projects", label: "Project Management" }, // D-307: its own module
  Information: { key: "information", label: "Information Management" },
  Meetings: { key: "meetings", label: "Meeting Management" },
  "AI Assistant": { key: "ai", label: "Pico Bot (AI Assistant)" },
};

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Letters in the order a person would guess them: word starts first.
function pickHotkey(label: string, used: Set<string>): string {
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const candidates = [...words.map((word) => word[0]!), ...label.toLowerCase().replace(/[^a-z0-9]/g, "")];
  const choice = candidates.find((letter) => !used.has(letter)) ?? "";
  if (choice) used.add(choice);
  return choice;
}

export function classicModules(items: readonly NavItem[]): ClassicModule[] {
  const modules: ClassicModule[] = [];
  for (const item of items) {
    if (item.href === GATEWAY) {
      modules.push({ key: "overview", label: "Home dashboard", hotkey: "", href: `${GATEWAY}?view=overview`, pages: [] });
      continue;
    }
    const section = item.section ? (MODULE_NAME[item.section] ?? { key: slug(item.section), label: item.section }) : null;
    if (!section) {
      modules.push({ key: slug(item.label), label: item.label, hotkey: "", href: item.href, pages: [] });
      continue;
    }
    const existing = modules.find((entry) => entry.key === section.key);
    const page = { href: item.href, label: item.label, ...(item.count !== undefined ? { count: item.count } : {}) };
    if (existing) existing.pages.push(page);
    else modules.push({ key: section.key, label: section.label, hotkey: "", href: `${MENU_BASE}/${section.key}`, pages: [page] });
  }
  // A module with one page (the AI Assistant) opens that page directly.
  for (const entry of modules) if (entry.pages.length === 1) entry.href = entry.pages[0]!.href;
  // As in the owner's sketch: the modules first, then Overview, Search, Calendar, Analytics.
  const ordered = [...modules.filter((entry) => entry.pages.length > 0), ...modules.filter((entry) => entry.pages.length === 0)];
  const used = new Set<string>();
  for (const entry of ordered) entry.hotkey = pickHotkey(entry.label, used);
  return ordered;
}

const within = (pathname: string, href: string) => {
  const path = href.split("?")[0]!;
  return pathname === path || (path.split("/").length > 2 && pathname.startsWith(`${path}/`));
};

// The module and page the person is on (the longest matching page wins).
export function locate(modules: readonly ClassicModule[], pathname: string): { entry: ClassicModule | null; page: ClassicPage | null } {
  if (pathname.startsWith(`${MENU_BASE}/`)) {
    const key = pathname.slice(MENU_BASE.length + 1).split("/")[0];
    return { entry: modules.find((entry) => entry.key === key) ?? null, page: null };
  }
  let best: { entry: ClassicModule; page: ClassicPage | null; length: number } | null = null;
  for (const entry of modules) {
    const candidates: (ClassicPage | null)[] = entry.pages.length ? entry.pages : [null];
    for (const page of candidates) {
      const href = page?.href ?? entry.href;
      if (href === GATEWAY || !within(pathname, href)) continue;
      const length = href.split("?")[0]!.length;
      if (!best || length > best.length) best = { entry, page, length };
    }
  }
  if (best) return { entry: best.entry, page: best.page };
  // v1.48.2 (owner: "the header navigation is missing"): the older task lists
  // (/users/tasks, a task's own page) belong to Tasks Management too, so its
  // tab bar shows there; the table list counts as My tasks.
  if (pathname === "/users/tasks" || pathname.startsWith("/users/tasks/")) {
    const tasks = modules.find((entry) => entry.key === "tasks");
    if (tasks) return { entry: tasks, page: pathname === "/users/tasks" ? (tasks.pages.find((page) => page.href.split("?")[0] === "/users/work/my-tasks") ?? null) : null };
  }
  return { entry: null, page: null };
}

// Letters for extra Gateway entries (other spaces, Quit), avoiding those in use.
export function extraHotkeys(labels: readonly string[], taken: readonly string[]): string[] {
  const used = new Set(taken.filter(Boolean));
  return labels.map((label) => pickHotkey(label, used));
}

// Letters for a module's own menu (its pages).
export function pageHotkeys(pages: readonly ClassicPage[]): string[] {
  const used = new Set<string>();
  return pages.map((page) => pickHotkey(page.label, used));
}
