import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { departmentOf, rulesForPerson } from "@/lib/db/repositories/page-access.repository";
import { PATH_HEADER, PATH_SIGNATURE_HEADER, verifyPath } from "@/lib/security/path-signature";
import { effectiveLevel, pageForPath, PAGES, type PageDef, type PageLevel } from "@/server/authorization/pages";
import { logError } from "@/lib/logging/logger";

// v1.8.0 (owner): page access set by the Super Admin, checked on the server
// for every page view, Server Action and API call of My approvals and the
// Admin space. Never applies to the Super Admin. A feature switch or a
// hidden link is never the only protection: this is.
type Person = { id: number; roles: readonly string[] };
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

export type PageCheck = { ok: true; level: PageLevel | null } | { ok: false; reason: "HIDDEN" | "VIEW_ONLY" | "UNKNOWN_PAGE"; pageKey: string | null };

// change: the request changes something (a Server Action or a POST API).
export async function checkPageAccess(person: Person, change: boolean): Promise<PageCheck> {
  if (isPageExempt(person)) return { ok: true, level: null };
  try {
    const access = await accessFor(person.id);
    const restricted = [...access.values()].some((level) => level !== "FULL");
    const { known, page } = await requestPage();
    // Without a trustworthy page address, someone with restrictions is
    // refused (fail closed); nobody else is affected.
    if (!known) return restricted ? { ok: false, reason: "UNKNOWN_PAGE", pageKey: null } : { ok: true, level: null };
    if (!page) return { ok: true, level: null };
    const level = access.get(page.key) ?? "FULL";
    if (level === "HIDDEN") return { ok: false, reason: "HIDDEN", pageKey: page.key };
    if (change && level === "VIEW") return { ok: false, reason: "VIEW_ONLY", pageKey: page.key };
    return { ok: true, level };
  } catch (error) {
    logError("page access check failed", error);
    return { ok: false, reason: "UNKNOWN_PAGE", pageKey: null };
  }
}

// For the sidebar and the "view only" note: the pages this person can't
// open, and those they can only view (as address patterns for the browser).
export async function navAccess(person: Person): Promise<{ hidden: Set<string>; viewOnly: string[] }> {
  if (isPageExempt(person)) return { hidden: new Set(), viewOnly: [] };
  try {
    const access = await accessFor(person.id);
    const hidden = new Set(PAGES.filter((page) => access.get(page.key) === "HIDDEN").map((page) => page.key));
    const viewOnly = PAGES.filter((page) => access.get(page.key) === "VIEW").flatMap((page) => page.paths.map((pattern) => pattern.source));
    return { hidden, viewOnly };
  } catch (error) {
    logError("page access for navigation failed", error);
    return { hidden: new Set(), viewOnly: [] };
  }
}

// Is a link (sidebar, palette) to a hidden page?
export function isHiddenHref(href: string, hidden: Set<string>): boolean {
  const page = pageForPath(href);
  return Boolean(page && hidden.has(page.key));
}
