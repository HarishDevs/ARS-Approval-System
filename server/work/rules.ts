// D-215: pure rules of Task & Project Management (unit-tested).

// ---- order ---------------------------------------------------------------------------
// Rows keep a number; a move takes the midpoint of its new neighbours, so one
// row changes per move. The repository renumbers a list when gaps get tiny.
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return (after as number) - 1024;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}
export const needsRenumber = (before: number | null, after: number | null) => before !== null && after !== null && Math.abs(after - before) < 1e-6;

// ---- subtasks --------------------------------------------------------------------------
export const MAX_DEPTH = 5; // levels of subtasks below a top task
export const MAX_PROJECTS_PER_TASK = 20;
export const MAX_DEPENDENCIES = 30;

// May `task` become a subtask of `parent`? `ancestorsOfParent` lists the
// parent's chain up to its top task; `subtreeHeight` is how many levels the
// task carries below itself.
export function subtaskProblem(input: { taskId: number; parentId: number; parentDepth: number; ancestorsOfParent: readonly number[]; subtreeHeight: number }): string | null {
  if (input.taskId === input.parentId) return "A task can't be its own subtask.";
  if (input.ancestorsOfParent.includes(input.taskId)) return "That would put the task inside itself.";
  if (input.parentDepth + 1 + input.subtreeHeight > MAX_DEPTH) return `Subtasks go at most ${MAX_DEPTH} levels deep.`;
  return null;
}

// ---- dependencies ----------------------------------------------------------------------
// Would "blocker blocks blocked" close a loop? `edges` are existing
// [blocker, blocked] pairs.
export function dependencyLoop(blocker: number, blocked: number, edges: readonly (readonly [number, number])[]): boolean {
  if (blocker === blocked) return true;
  // A loop exists if `blocker` can already be reached from `blocked`.
  const next = new Map<number, number[]>();
  for (const [from, to] of edges) next.set(from, [...(next.get(from) ?? []), to]);
  const seen = new Set<number>();
  const stack = [blocked];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === blocker) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(next.get(node) ?? []));
  }
  return false;
}

// ---- My Tasks ---------------------------------------------------------------------------
// D-225 (owner): Overdue is the first section.
export type MySystemSection = "OVERDUE" | "RECENT" | "TODAY" | "UPCOMING" | "LATER";
export const MY_SECTION_NAMES: Record<MySystemSection, string> = { OVERDUE: "Overdue", RECENT: "Recently assigned", TODAY: "Today", UPCOMING: "Upcoming", LATER: "Later" };
export const MY_SECTION_ORDER: readonly MySystemSection[] = ["OVERDUE", "RECENT", "TODAY", "UPCOMING", "LATER"];
export const RECENT_DAYS = 3;
export const UPCOMING_DAYS = 7;

// Where a task shows in My Tasks. A task the person placed stays where they
// put it, except that tasks in Upcoming or Later move forward to Today (or
// Later to Upcoming) as their due date comes near: never backwards, never out
// of Recently assigned or the person's own sections. A task never placed is
// in Recently assigned for a few days after it was assigned, then by date.
// D-225: an open task past its due day is always in Overdue, wherever it was
// put; it leaves when it is completed or its date moves.
export function myTaskBucket(
  task: { dueDay: string | null; assignedAt: Date | null; selfAssigned: boolean; open?: boolean },
  placement: { system: MySystemSection | null; sectionId: number } | null,
  today: string,
  now: Date,
): { system: MySystemSection | null; sectionId: number | null } {
  if (task.open !== false && task.dueDay !== null && task.dueDay < today) return { system: "OVERDUE", sectionId: null };
  const byDate = (): MySystemSection => (task.dueDay === null ? "LATER" : task.dueDay <= today ? "TODAY" : task.dueDay <= addDays(today, UPCOMING_DAYS) ? "UPCOMING" : "LATER");
  if (placement) {
    if (placement.system === "UPCOMING" || placement.system === "LATER") {
      const dated = byDate();
      if (dated === "TODAY") return { system: "TODAY", sectionId: null };
      if (dated === "UPCOMING" && placement.system === "LATER") return { system: "UPCOMING", sectionId: null };
    }
    return { system: placement.system, sectionId: placement.system ? null : placement.sectionId };
  }
  const recent = !task.selfAssigned && task.assignedAt !== null && now.getTime() - task.assignedAt.getTime() < RECENT_DAYS * 86_400_000;
  return { system: recent ? "RECENT" : byDate(), sectionId: null };
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// India's calendar day for a UTC time.
export function indiaDay(value: Date): string {
  return new Date(value.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

// ---- mentions ---------------------------------------------------------------------------
// Comments keep mentions as @[Name](user:12). Only ids are trusted; the name
// shown is looked up again when the comment is drawn.
const MENTION = /@\[([^\]\n]{1,80})\]\(user:(\d{1,10})\)/g;
export function mentionedIds(body: string): number[] {
  return [...new Set([...body.matchAll(MENTION)].map((match) => Number(match[2])))];
}
export type CommentPart = { kind: "text"; text: string } | { kind: "mention"; userId: number; label: string };
export function commentParts(body: string): CommentPart[] {
  const parts: CommentPart[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    if (match.index! > last) parts.push({ kind: "text", text: body.slice(last, match.index) });
    parts.push({ kind: "mention", userId: Number(match[2]), label: match[1]! });
    last = match.index! + match[0].length;
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) });
  return parts;
}

// ---- search -----------------------------------------------------------------------------
export const SEARCH_STATUSES = ["open", "completed", "cancelled", "all"] as const;
export interface WorkSearch {
  q: string;
  status: (typeof SEARCH_STATUSES)[number];
  assignee: number | "me" | null;
  createdBy: number | "me" | null;
  project: number | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | null;
  tag: number | null;
  dueFrom: string | null;
  dueTo: string | null;
  followed: boolean;
  overdue: boolean;
  team: boolean; // D-216: assigned to anyone below me in the reporting line
  kind: "periodic" | "adhoc" | null; // D-219
  page: number;
}
const id = (value: unknown) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : null);
const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
export function parseWorkSearch(raw: Record<string, unknown>): WorkSearch {
  const text = typeof raw.q === "string" ? raw.q.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  const status = (SEARCH_STATUSES as readonly string[]).includes(String(raw.status)) ? (raw.status as WorkSearch["status"]) : "open";
  const assignee = raw.assignee === "me" ? "me" : id(raw.assignee);
  const createdBy = raw.created_by === "me" ? "me" : id(raw.created_by);
  const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(String(raw.priority)) ? (raw.priority as WorkSearch["priority"]) : null;
  const page = Math.min(500, Math.max(1, id(raw.page) ?? 1));
  return { q: text, status, assignee, createdBy, project: id(raw.project), priority, tag: id(raw.tag), dueFrom: day(raw.due_from), dueTo: day(raw.due_to), followed: raw.followed === "1", overdue: raw.overdue === "1", team: raw.team === "1", kind: raw.kind === "periodic" || raw.kind === "adhoc" ? raw.kind : null, page };
}
export function workSearchQuery(search: WorkSearch): Record<string, string> {
  const out: Record<string, string> = {};
  if (search.q) out.q = search.q;
  if (search.status !== "open") out.status = search.status;
  if (search.assignee !== null) out.assignee = String(search.assignee);
  if (search.createdBy !== null) out.created_by = String(search.createdBy);
  if (search.project !== null) out.project = String(search.project);
  if (search.priority) out.priority = search.priority;
  if (search.tag !== null) out.tag = String(search.tag);
  if (search.dueFrom) out.due_from = search.dueFrom;
  if (search.dueTo) out.due_to = search.dueTo;
  if (search.followed) out.followed = "1";
  if (search.overdue) out.overdue = "1";
  if (search.team) out.team = "1";
  if (search.kind) out.kind = search.kind;
  if (search.page > 1) out.page = String(search.page);
  return out;
}
// Built-in searches (Asana's presets), shown beside the saved ones.
export const SEARCH_PRESETS: readonly { key: string; label: string; query: Record<string, string> }[] = [
  { key: "assigned-by-me", label: "Assigned by me", query: { created_by: "me" } },
  { key: "overdue", label: "Overdue", query: { overdue: "1" } },
  { key: "following", label: "Tasks I follow", query: { followed: "1" } },
  { key: "team", label: "My team (all levels)", query: { team: "1" } },
  { key: "periodic", label: "Periodic tasks", query: { kind: "periodic" } },
  { key: "adhoc", label: "Ad hoc tasks", query: { kind: "adhoc" } },
  { key: "team-overdue", label: "My team: overdue", query: { team: "1", overdue: "1" } },
  { key: "completed", label: "Completed", query: { status: "completed" } },
];
