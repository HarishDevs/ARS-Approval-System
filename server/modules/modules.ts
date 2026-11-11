import type { ModuleCode } from "@/types/auth";

// AI module branch (D-168): the four modules of ARS Approvals and the rules
// for who may use them. Pure and unit-tested.
export type { ModuleCode };
export const MODULES: readonly ModuleCode[] = ["APPROVAL", "TASK", "INFORMATION", "AI", "MEETING"];
export const MODULE_LABEL: Record<ModuleCode, string> = { APPROVAL: "Approval", TASK: "Task", INFORMATION: "Information", AI: "AI", MEETING: "Meeting" };
export const MODULE_HELP: Record<ModuleCode, string> = {
  APPROVAL: "Raise requests, custom approvals, approve what is assigned, search requests.",
  TASK: "My tasks, tasks given to others, team tasks.",
  INFORMATION: "The information inbox and sending information.",
  AI: "The AI dashboard, assistant, business intelligence and reports.",
  MEETING: "Meetings: schedule, meeting points, MOM, action items and follow-ups.",
};
// What everyone could use before modules existed; new people start here too.
export const DEFAULT_MODULES: readonly ModuleCode[] = ["APPROVAL", "TASK", "INFORMATION", "MEETING"];

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
