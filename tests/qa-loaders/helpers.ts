import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, Route } from "@playwright/test";
import { db, sessionCookie } from "../e2e/db";

// Helpers for the loader audit. Server Actions are POSTs to the page URL
// with a `next-action` header; client-side navigations fetch the RSC payload
// with an `rsc: 1` header. Both can be intercepted to make a request slow,
// fail, never answer, or answer with garbage, deterministically.
const OUT = path.join("test-results", "loader-audit");
mkdirSync(OUT, { recursive: true });

// Measurements and observations, one JSON line each, for the report.
export function record(tc: string, data: Record<string, unknown>): void {
  appendFileSync(path.join(OUT, "observations.jsonl"), `${JSON.stringify({ tc, at: new Date().toISOString(), ...data })}\n`);
}

export async function as(context: BrowserContext, loginId: string): Promise<void> {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

export const isAction = (route: Route) => route.request().method() === "POST" && Boolean(route.request().headers()["next-action"]);
const isRsc = (route: Route) => route.request().headers()["rsc"] === "1";

export interface Gate {
  release: () => void;
  count: () => number;
}

// Server Actions on this page: hold them (until released), delay, fail,
// abort or answer with a fixed body. Returns how many were seen.
export async function interceptActions(
  page: Page,
  mode: { hold?: boolean; delayMs?: number; status?: number; abort?: boolean; body?: string; contentType?: string; times?: number },
): Promise<Gate> {
  let seen = 0;
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let remaining = mode.times ?? Infinity;
  await page.route("**/*", async (route) => {
    if (!isAction(route) || remaining <= 0) return route.fallback();
    remaining -= 1;
    seen += 1;
    if (mode.hold) await gate;
    if (mode.delayMs) await new Promise((resolve) => setTimeout(resolve, mode.delayMs));
    if (mode.abort) return route.abort("failed").catch(() => undefined);
    if (mode.status || mode.body !== undefined) {
      return route.fulfill({ status: mode.status ?? 200, contentType: mode.contentType ?? "text/plain", body: mode.body ?? "Internal Server Error" }).catch(() => undefined);
    }
    return route.continue().catch(() => undefined);
  });
  return { release: () => open(), count: () => seen };
}

// Client-side navigations (RSC fetches) made slow; with `documents`, full
// page loads too (links that do a normal page load, QA session 14).
export async function delayNavigations(page: Page, delayMs: number, options: { documents?: boolean } = {}): Promise<void> {
  await page.route("**/*", async (route) => {
    const isDocument = options.documents && route.request().resourceType() === "document" && route.request().method() === "GET";
    if (!isRsc(route) && !isDocument) return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.continue().catch(() => undefined);
  });
}

export async function clearIntercepts(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

export async function count(sql: string, params: unknown[] = []): Promise<number> {
  const conn = await db();
  try {
    const [rows] = await conn.query<import("mysql2/promise").RowDataPacket[]>(sql, params);
    return Number(Object.values(rows[0] ?? { n: 0 })[0] ?? 0);
  } finally {
    await conn.end();
  }
}

export async function sql(statement: string, params: unknown[] = []): Promise<void> {
  const conn = await db();
  try {
    await conn.query(statement, params);
  } finally {
    await conn.end();
  }
}

// Has the page crashed into Next's generic error screen?
export async function crashed(page: Page): Promise<boolean> {
  const text = (await page.locator("body").innerText().catch(() => "")) ?? "";
  return /Application error|client-side exception|server-side exception|Internal Server Error/i.test(text);
}

// WCAG contrast ratio of two CSS rgb() colours.
export function contrast(fg: string, bg: string): number {
  const lum = (css: string) => {
    const [r, g, b] = (css.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number).map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

// Watches for busy feedback (a busy link or button, a spinner, a loading
// skeleton) and remembers it in sessionStorage, which survives a normal page
// load. Read it back with busySeen() after the click.
export async function watchBusy(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.removeItem("qaBusySeen");
    const seen = () => {
      if (document.querySelector('[aria-busy="true"], .animate-spin, [role="status"][aria-label^="Loading"]')) sessionStorage.setItem("qaBusySeen", "1");
    };
    new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}

export async function busySeen(page: Page): Promise<boolean> {
  return page.evaluate(() => sessionStorage.getItem("qaBusySeen") === "1");
}
