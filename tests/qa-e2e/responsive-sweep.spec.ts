import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { db, sessionCookie } from "../e2e/db";

// D-254 (owner §20: "every page responsive"): every main route, for each
// role, at five widths (small phone to desktop). For each page it records
// whether the page is wider than the window (sideways scrolling) and whether
// any button, link or field sticks out past the right edge without a
// scrolling box to reach it. Results: test-results/responsive-sweep.json and
// a matrix in markdown (copied to docs/RESPONSIVE_ROUTE_MATRIX.md).
test.describe.configure({ mode: "serial" });
test.setTimeout(30 * 60_000);

// QA pass (v1.42.1): QA_VIEWPORTS=all runs the ten sizes of the QA brief
// (small phone to ultra-wide); CI keeps the five widths.
const SIZES: readonly { width: number; height: number }[] =
  process.env.QA_VIEWPORTS === "all"
    ? [
        { width: 320, height: 568 },
        { width: 360, height: 800 },
        { width: 375, height: 812 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1024, height: 768 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
        { width: 2560, height: 1440 },
      ]
    : [320, 375, 768, 1024, 1440].map((width) => ({ width, height: width < 768 ? 812 : 900 }));
const WIDTHS = SIZES.map((size) => size.width);
const USER_ROUTES = [
  "/users",
  "/users/inbox",
  "/users/queue",
  "/users/requests",
  "/users/collaborating",
  "/users/approved",
  "/users/approved-by-me",
  "/users/new",
  "/users/custom",
  "/users/search?q=E2E",
  "/users/work/my-tasks",
  "/users/work/my-tasks?view=board",
  "/users/work/my-tasks?view=calendar",
  "/users/work/projects",
  "/users/work/periodic",
  "/users/tasks",
  "/users/tasks/new",
  "/users/information",
  "/users/information/new",
  "/users/calendar",
  "/users/analytics",
  "/users/analytics?board=tasks",
  "/users/profile",
  "/users/profile/devices",
  "/users/notifications/settings",
  "/users/delegation",
  "/users/security",
  "/users/help",
];
const ADMIN_ROUTES = ["/admin", "/admin/attention", "/admin/analytics", "/admin/records/requests", "/admin/workflows", "/admin/users", "/admin/organisation", "/admin/notifications", "/admin/notifications?tab=history", "/admin/notifications?tab=devices", "/admin/reminders", "/admin/budgets"];
const SUPER_ROUTES = ["/superadmin", "/superadmin/settings", "/superadmin/automation", "/superadmin/deliveries", "/superadmin/audit", "/superadmin/logins"];

type Row = { role: string; route: string; width: number; overflow: number; clipped: string[]; status: number };
const rows: Row[] = [];

async function measure(page: Page): Promise<{ overflow: number; clipped: string[] }> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const overflow = Math.max(0, document.documentElement.scrollWidth - width);
    const clipped: string[] = [];
    const scrollsSideways = (element: Element | null): boolean => {
      for (let node = element?.parentElement ?? null; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
      }
      return false;
    };
    for (const element of document.querySelectorAll<HTMLElement>("main a[href], main button, main input:not([type=hidden]), main select, main textarea")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > width + 2 && !scrollsSideways(element)) clipped.push((element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40));
    }
    return { overflow, clipped: clipped.slice(0, 5) };
  });
}

async function sweep(page: Page, role: string, routes: readonly string[]) {
  for (const { width, height } of SIZES) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const result = await measure(page);
      rows.push({ role, route, width, status: response?.status() ?? 0, ...result });
    }
  }
}

test("every main route fits every screen width, for each role", async ({ browser }) => {
  const conn = await db();
  const [requests] = (await conn.query("SELECT id FROM approval_requests WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1")) as unknown as [{ id: number }[]];
  await conn.end();
  const requestRoute = requests[0] ? [`/users/requests/${requests[0].id}`] : [];
  const plan = [
    { login: "E2E_REQ", routes: [...USER_ROUTES, ...requestRoute] },
    { login: "E2E_ADMIN", routes: ADMIN_ROUTES },
    { login: "E2E_SUPER", routes: SUPER_ROUTES },
  ];
  for (const role of plan) {
    const context = await browser.newContext({ hasTouch: true });
    await context.addCookies([await sessionCookie(role.login, { tourDone: true })]);
    const page = await context.newPage();
    await sweep(page, role.login, role.routes);
    await context.close();
  }

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/responsive-sweep.json", JSON.stringify(rows, null, 2));
  const routes = [...new Set(rows.map((row) => `${row.role} ${row.route}`))];
  const cell = (row: Row | undefined) => (!row ? "–" : row.status >= 400 ? `HTTP ${row.status}` : row.overflow > 0 ? `✗ +${row.overflow}px` : row.clipped.length ? `✗ cut: ${row.clipped[0]}` : "✓");
  const lines = [
    "| Role | Route | " + WIDTHS.map((width) => `${width}px`).join(" | ") + " |",
    "|---|---|" + WIDTHS.map(() => "---").join("|") + "|",
    ...routes.map((key) => {
      const [role, route] = key.split(" ");
      return `| ${role} | \`${route}\` | ` + WIDTHS.map((width) => cell(rows.find((row) => row.role === role && row.route === route && row.width === width))).join(" | ") + " |";
    }),
  ];
  writeFileSync("test-results/responsive-sweep.md", lines.join("\n") + "\n");
  const problems = rows.filter((row) => row.status < 400 && (row.overflow > 0 || row.clipped.length > 0)).map((row) => `${row.role} ${row.route} @${row.width}: overflow ${row.overflow}px; cut ${row.clipped.join(", ")}`);
  expect(problems, problems.join("\n")).toEqual([]);
});
