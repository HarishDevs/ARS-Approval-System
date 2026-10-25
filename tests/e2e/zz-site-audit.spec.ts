import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { sessionCookie } from "./db";

// Site audit (v1.21.1, owner: "run complete end-to-end, touch, navigation,
// broken links and pages tests"). Runs last (zz-), after the other specs have
// created requests, tasks and information. For each role it follows every
// link it can reach (GET only: nothing is submitted) and records:
//   - pages and links that answer 4xx/5xx (broken links),
//   - uncaught page errors and console errors,
//   - failed same-site requests (5xx),
//   - broken images,
//   - pages wider than the window (sideways scrolling),
// then repeats the role's menu pages on a touch phone (375 px) and opens the
// phone menu. Findings go to test-results/site-audit.json.
test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

const ROLES = [
  { login: "E2E_SUPER", start: ["/superadmin", "/admin", "/users"] },
  { login: "E2E_ADMIN", start: ["/admin", "/users"] },
  { login: "E2E_REQ", start: ["/users"] },
] as const;
const MAX_PAGES = 260; // per role
const VARIANTS_PER_PATH = 2; // the same page with different filters

// Never followed: sign-out, one-time links, and downloads (checked as requests).
const SKIP = [/^\/api\/auth\//, /^\/try/, /^\/signed-out/, /\/logout/];
const DOWNLOAD = /^\/api\/|\.(pdf|csv|xlsx|zip)$|\/download/;
// Console noise that isn't a defect of the app (dev-only or browser chatter).
const IGNORED_CONSOLE = [/Download the React DevTools/, /favicon/i, /net::ERR_ABORTED/, /\[Fast Refresh\]/];

type Finding = { role: string; url: string; kind: string; detail: string };
const findings: Finding[] = [];
const report = (role: string, url: string, kind: string, detail: string) => findings.push({ role, url, kind, detail: detail.slice(0, 300) });

function sameSitePath(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

async function pageChecks(page: Page, role: string, url: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) report(role, url, "sideways-scroll", `${overflow}px wider than the window`);
  const broken = await page.evaluate(() => [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")).map((img) => img.src));
  for (const src of broken) report(role, url, "broken-image", src);
}

function watch(page: Page, role: string, current: () => string) {
  page.on("pageerror", (error) => report(role, current(), "page-error", error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    report(role, current(), "console-error", text);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.port === "3100" && response.status() >= 500) report(role, current(), "server-error", `${response.status()} ${url.pathname}`);
  });
}

async function crawl(browser: Browser, role: string, start: readonly string[]): Promise<string[]> {
  const context = await browser.newContext();
  await context.addCookies([await sessionCookie(role)]);
  const page = await context.newPage();
  let current = "";
  watch(page, role, () => current);
  const base = test.info().project.use.baseURL ?? "http://localhost:3100";
  const queue = [...start];
  const seen = new Set<string>();
  const variants = new Map<string, number>();
  const downloads = new Set<string>();
  const visited: string[] = [];
  const menuPages = new Set<string>();

  while (queue.length && visited.length < MAX_PAGES) {
    const target = queue.shift()!;
    if (seen.has(target)) continue;
    seen.add(target);
    const pathname = target.split("?")[0]!;
    const count = variants.get(pathname) ?? 0;
    if (count >= VARIANTS_PER_PATH) continue;
    variants.set(pathname, count + 1);
    current = target;
    const response = await page.goto(target, { waitUntil: "networkidle" }).catch((error: Error) => {
      report(role, target, "navigation-failed", error.message);
      return null;
    });
    if (!response) continue;
    visited.push(target);
    const status = response.status();
    const landed = sameSitePath(page.url(), base) ?? target;
    if (status >= 400) {
      report(role, target, status === 404 ? "broken-link" : "page-status", `${status}${landed !== target ? ` (landed on ${landed})` : ""}`);
      continue;
    }
    await pageChecks(page, role, target);
    if (start.some((home) => target === home)) for (const href of await page.locator('[data-testid="sidebar"] a[href]').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) menuPages.add(href);
    const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
      const next = sameSitePath(href, base);
      if (!next || SKIP.some((pattern) => pattern.test(next))) continue;
      if (DOWNLOAD.test(next.split("?")[0]!)) downloads.add(next);
      else if (!seen.has(next)) queue.push(next);
    }
  }

  // Downloads and API links: each address once (filters aside); they must
  // answer, not fail. 429 is the download rate limit doing its job.
  const checked = new Set<string>();
  for (const link of downloads) {
    const pathname = link.split("?")[0]!;
    if (checked.has(pathname)) continue;
    checked.add(pathname);
    const response = await context.request.get(link).catch(() => null);
    if (!response || (response.status() >= 400 && response.status() !== 429)) report(role, link, "broken-download", String(response?.status() ?? "no answer"));
  }
  await context.close();
  return [...menuPages].filter((href) => href.startsWith("/"));
}

async function touch(browser: Browser, role: string, pages: string[]) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.addCookies([await sessionCookie(role)]);
  const page = await context.newPage();
  let current = "";
  watch(page, `${role} (phone)`, () => current);
  for (const target of pages.slice(0, 45)) {
    current = target;
    const response = await page.goto(target, { waitUntil: "networkidle" }).catch(() => null);
    if (!response || response.status() >= 400) {
      report(`${role} (phone)`, target, "page-status", String(response?.status() ?? "no answer"));
      continue;
    }
    await pageChecks(page, `${role} (phone)`, target);
  }
  // The phone menu opens with a tap and lists the role's pages.
  current = pages[0] ?? "/users";
  await page.goto(current);
  const opener = page.getByRole("button", { name: "Open menu" });
  if (await opener.count()) {
    await opener.tap();
    const menu = page.getByRole("dialog", { name: "Menu" });
    if (!(await menu.isVisible())) report(`${role} (phone)`, current, "touch", "the menu did not open on tap");
    else if ((await menu.locator("a[href]").count()) < 2) report(`${role} (phone)`, current, "touch", "the menu has no links");
  }
  await context.close();
}

test("site audit: every reachable page, link and download for each role, on desktop and a touch phone", async ({ browser }) => {
  const summary: Record<string, { menu: number }> = {};
  for (const role of ROLES) {
    const menu = await crawl(browser, role.login, role.start);
    summary[role.login] = { menu: menu.length };
    await touch(browser, role.login, menu);
  }
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(path.join("test-results", "site-audit.json"), JSON.stringify({ summary, findings }, null, 2));
  expect(findings, JSON.stringify(findings.slice(0, 40), null, 2)).toEqual([]);
});
