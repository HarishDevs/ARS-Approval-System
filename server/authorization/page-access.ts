import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { departmentOf, rulesForPerson } from "@/lib/db/repositories/page-access.repository";
import { PATH_HEADER, PATH_SIGNATURE_HEADER, verifyPath } from "@/lib/security/path-signature";
import { effectiveLevel, isOpenAddress, pageForPath, PAGES, type PageDef, type PageLevel } from "@/server/authorization/pages";
import { logError } from "@/lib/logging/logger";
import { hasModule, MODULES } from "@/server/modules/modules";
import type { ModuleCode } from "@/types/auth";
import { isApproverDesignation } from "@/lib/db/repositories/profile.repository";
import { countPendingTasksFor } from "@/lib/db/repositories/approvals.repository";

// v1.8.0 (owner): page access set by the Super Admin, checked on the server
// for every page view, Server Action and API call of My approvals and the
// Admin space. Never applies to the Super Admin. A feature switch or a
// hidden link is never the only protection: this is.
type Person = { id: number; roles: readonly string[]; modules: readonly ModuleCode[] };

// D-168: a page of a module the person doesn't have is refused like a hidden one.
const lacksModule = (person: Person, page: PageDef | null | undefined) => Boolean(page?.module && !page.partyOpen && !hasModule(person, page.module));
export const isPageExempt = (person: Pick<Person, "roles">) => person.roles.includes("SUPER_ADMIN");

// Every page's level for this person (once per request).
export const accessFor = cache(async (userId: number): Promise<Map<string, PageLevel>> => {
  const departmentId = await departmentOf(userId);
  const rules = await rulesForPerson(userId, departmentId);
  return new Map(PAGES.map((page) => [page.key, effectiveLevel(page.key, rules, { id: userId, departmentId })]));
});

// The page this request is for, from the middleware's signed address.
export const requestPage = cache(async (): Promise<{ known: boolean; page: PageDef | null; isAction: boolean }> => {
  const list = await headers();
  const path = list.get(PATH_HEADER);
  const valid = await verifyPath(path, list.get(PATH_SIGNATURE_HEADER), process.env.SESSION_SECRET).catch(() => false);
  return { known: valid, page: valid && path ? pageForPath(path) : null, isAction: list.has("next-action") };
});

export type PageCheck = { ok: true; level: PageLevel | null } | { ok: false; reason: "HIDDEN" | "VIEW_ONLY" | "UNKNOWN_PAGE" | "MODULE"; pageKey: string | null };

// change: the request changes something (a Server Action or a POST API).
export async function checkPageAccess(person: Person, change: boolean): Promise<PageCheck> {
  if (isPageExempt(person)) return { ok: true, level: null };
  try {
    const access = await accessFor(person.id);
    const restricted = [...access.values()].some((level) => level !== "FULL") || MODULES.some((module) => !hasModule(person, module));
    const { known, page } = await requestPage();
    // Without a trustworthy page address, someone with restrictions is
    // refused (fail closed); nobody else is affected.
    if (!known) return restricted ? { ok: false, reason: "UNKNOWN_PAGE", pageKey: null } : { ok: true, level: null };
    // G-3 (v1.10.0): Super Admin pages are never a way in for anyone else
    // (an admin action posted to /superadmin/import skipped the rules).
    if (!page) {
      const path = await requestPath();
      if (path?.startsWith("/superadmin")) return { ok: false, reason: "UNKNOWN_PAGE", pageKey: null };
      // V181-A7 (AUD-14): for a person with any restriction, an address that
      // is no configured page and not a listed open one fails closed (it
      // could carry a shared action past a Hidden or View-only rule).
      // People without restrictions are unaffected.
      if (restricted && !(path && isOpenAddress(path))) return { ok: false, reason: "UNKNOWN_PAGE", pageKey: null };
      return { ok: true, level: null };
    }
    if (lacksModule(person, page)) return { ok: false, reason: "MODULE", pageKey: page.key };
    const level = access.get(page.key) ?? "FULL";
    if (level === "HIDDEN") return { ok: false, reason: "HIDDEN", pageKey: page.key };
    if (change && level === "VIEW") return { ok: false, reason: "VIEW_ONLY", pageKey: page.key };
    return { ok: true, level };
  } catch (error) {
    logError("page access check failed", error);
    return { ok: false, reason: "UNKNOWN_PAGE", pageKey: null };
  }
}

async function requestPath(): Promise<string | null> {
  return (await headers()).get(PATH_HEADER);
}

// G-3 (v1.10.0): an action that belongs to a page names it, so the page's
// rule applies wherever the action is posted from (another page sharing the
// action, or an address that is no configured page).
export async function checkPageKey(person: Person, pageKey: string, change: boolean): Promise<PageCheck> {
  if (isPageExempt(person)) return { ok: true, level: null };
  if (lacksModule(person, PAGES.find((page) => page.key === pageKey))) return { ok: false, reason: "MODULE", pageKey };
  try {
    const level = (await accessFor(person.id)).get(pageKey) ?? "FULL";
    if (level === "HIDDEN") return { ok: false, reason: "HIDDEN", pageKey };
    if (change && level === "VIEW") return { ok: false, reason: "VIEW_ONLY", pageKey };
    return { ok: true, level };
  } catch (error) {
    logError("page access check failed", error);
    return { ok: false, reason: "UNKNOWN_PAGE", pageKey };
  }
}

// For the sidebar and the "view only" note: the pages this person can't
// open, and those they can only view (as address patterns for the browser).
export async function navAccess(person: Person): Promise<{ hidden: Set<string>; viewOnly: string[] }> {
  if (isPageExempt(person)) return { hidden: new Set(), viewOnly: [] };
  try {
    const access = await accessFor(person.id);
    const hidden = new Set(PAGES.filter((page) => access.get(page.key) === "HIDDEN" || lacksModule(person, page)).map((page) => page.key));
    // v1.49.5 (owner): a requester (designation not ticked Approver) sees
    // only New request, My pending requests, My approved requests and
    // Collaborating; approvers see every My Approvals page. Anyone with a
    // step waiting for them keeps the approver pages, so nothing is stranded.
    // Navigation only: the pages themselves still open by address.
    if (!(await approverPages(person.id))) for (const key of APPROVER_PAGES) hidden.add(key);
    const viewOnly = PAGES.filter((page) => access.get(page.key) === "VIEW").flatMap((page) => page.paths.map((pattern) => pattern.source));
    return { hidden, viewOnly };
  } catch (error) {
    logError("page access for navigation failed", error);
    return { hidden: new Set(), viewOnly: [] };
  }
}

// The My Approvals pages only approvers see in the navigation.
export const APPROVER_PAGES = ["users.queue", "users.approved_by_me", "users.new"] as const;
const approverPages = cache(async (userId: number): Promise<boolean> => {
  const [approver, waiting] = await Promise.all([isApproverDesignation(userId).catch(() => true), countPendingTasksFor(userId).catch(() => 1)]);
  return approver || waiting > 0;
});

// Is a link (sidebar, palette) to a hidden page?
export function isHiddenHref(href: string, hidden: Set<string>): boolean {
  const page = pageForPath(href);
  return Boolean(page && hidden.has(page.key));
}
