import type { ModuleCode } from "@/types/auth";

// AI module branch (D-168): the modules of ARS-CMS and the rules for who may
// use them. Pure and unit-tested.
// D-307 (owner, v1.53.0): the main modules, in this order, released one at a
// time: Approvals (live), Tasks, Projects, Meeting Management, Information,
// then the AI assistant. Projects is its own module (it was part of Tasks).
// Home, Inbox, Calendar and Analytics are common to every module.
export type { ModuleCode };
export const MODULES: readonly ModuleCode[] = ["APPROVAL", "TASK", "PROJECT", "INFORMATION", "MEETING", "AI"];
export const MODULE_LABEL: Record<ModuleCode, string> = { APPROVAL: "Approvals", TASK: "Tasks", PROJECT: "Projects", INFORMATION: "Information", MEETING: "Meeting Management", AI: "AI Assistant" };
export const MODULE_HELP: Record<ModuleCode, string> = {
  APPROVAL: "Raise requests, custom approvals, approve what is assigned, search requests.",
  TASK: "My tasks, tasks given to others, team tasks.",
  PROJECT: "Projects: lists, boards, timelines, status updates, members and templates.",
  INFORMATION: "The information inbox and sending information.",
  MEETING: "Meetings: schedule, meeting points, MOM, action items and follow-ups.",
  AI: "The AI dashboard, assistant, business intelligence and reports.",
};
// D-307 (owner): new people start with the released modules: Approvals and Tasks.
export const DEFAULT_MODULES: readonly ModuleCode[] = ["APPROVAL", "TASK"];

// D-308 (owner): a project holds tasks, so Projects is never given without Tasks.
export const PROJECTS_NEED_TASKS = "Projects needs Tasks: tick Tasks too (or take Projects away first).";
export function modulesProblem(modules: readonly ModuleCode[]): string | null {
  return modules.includes("PROJECT") && !modules.includes("TASK") ? PROJECTS_NEED_TASKS : null;
}

const isModule = (value: string): value is ModuleCode => (MODULES as readonly string[]).includes(value);

// The database SET value ("APPROVAL,TASK") in a fixed order; unknown parts are dropped.
export function parseModuleSet(value: string | null | undefined): ModuleCode[] {
  const parts = new Set((value ?? "").split(",").map((part) => part.trim()));
  return MODULES.filter((module) => parts.has(module));
}

// The form's check boxes. Anything that isn't a module is refused, not ignored.
export function normaliseModules(values: readonly string[]): { ok: true; value: ModuleCode[] } | { ok: false; invalid: string[] } {
  const invalid = values.filter((value) => !isModule(value));
  if (invalid.length) return { ok: false, invalid };
  const chosen = new Set(values);
  return { ok: true, value: MODULES.filter((module) => chosen.has(module)) };
}

// The Super Admin is exempt, as from page access (D-039); everyone else needs the module.
export function hasModule(person: { roles: readonly string[]; modules: readonly ModuleCode[] }, module: ModuleCode): boolean {
  return person.roles.includes("SUPER_ADMIN") || person.modules.includes(module);
}

// The calendar's kinds of entry, by module (personal entries are everyone's).
const KIND_MODULE = { approval: "APPROVAL", needed: "APPROVAL", task: "TASK", info: "INFORMATION", personal: null } as const;
export function calendarKindAllowed(person: { roles: readonly string[]; modules: readonly ModuleCode[] }, kind: keyof typeof KIND_MODULE): boolean {
  const needed = KIND_MODULE[kind];
  return needed === null || hasModule(person, needed);
}

export const sameModules = (a: readonly ModuleCode[], b: readonly ModuleCode[]) => MODULES.every((module) => a.includes(module) === b.includes(module));

// v1.51.1 (owner: "multi select the employees and assign modules"): the
// modules a person ends with after a bulk change. ADD gives the chosen ones,
// REMOVE takes them away, SET makes them exactly the chosen ones.
export type ModuleChange = "ADD" | "REMOVE" | "SET";
export function applyModuleChange(current: readonly ModuleCode[], change: ModuleChange, chosen: readonly ModuleCode[]): ModuleCode[] {
  const pick = new Set(chosen);
  const have = new Set(current);
  if (change === "SET") return MODULES.filter((module) => pick.has(module));
  if (change === "ADD") return MODULES.filter((module) => have.has(module) || pick.has(module));
  return MODULES.filter((module) => have.has(module) && !pick.has(module));
}
