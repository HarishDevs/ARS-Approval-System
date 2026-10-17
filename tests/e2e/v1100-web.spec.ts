import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.10.0 website checks (SECURITY_WEBSITE_FIX_TRACKER.md, WEB-01 to WEB-20):
// no sideways scrolling at five screen sizes, every navigation link answers,
// a real 404, page titles, favicon, clickable logo, the phone menu's focus
// handling and the CORS / caching headers.
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

const PAGES: { who: string; paths: string[] }[] = [
  { who: "", paths: ["/", "/privacy", "/terms", "/login", "/forgot-password", "/signed-out?reason=idle"] },
  {
    who: "E2E_REQ",
    paths: [
      "/users",
      "/users/queue",
      "/users/requests",
      "/users/new",
      "/users/custom",
      "/users/tasks",
      "/users/tasks/new",
      "/users/information",
      "/users/information/new",
      "/users/search",
      "/users/calendar",
      "/users/calendar?view=week",
      "/users/calendar?view=day",
      "/users/profile/calendar",
      "/users/analytics",
      "/users/analytics?board=tasks",
      "/users/analytics?board=employees",
      "/users/notifications",
      "/users/profile",
      "/users/security",
      "/users/help",
    ],
  },
  { who: "E2E_ADMIN", paths: ["/admin", "/admin/users", "/admin/workflows", "/admin/task-types", "/admin/reports", "/admin/analytics", "/admin/dashboards", "/admin/import"] },
  { who: "E2E_SUPER", paths: ["/superadmin", "/superadmin/integrations/google-calendar", "/superadmin/settings", "/superadmin/audit", "/superadmin/pages"] },
];

// Some pages navigate once more right after loading (a redirect or a
// refresh); measure once the page has settled, and again if it moved on.
async function sidewaysOverflow(page: Page): Promise<number> {
  const measure = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.waitForLoadState("load").catch(() => undefined);
  try {
    return await measure();
  } catch {
    await page.waitForLoadState("load").catch(() => undefined);
    return measure();
  }
}

test("WEB-01/16/20: no page scrolls sideways at 360, 390, 768, 1366 and 1920 px", async ({ page, context }) => {
  test.setTimeout(300_000);
  const problems: string[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${page.url()}: ${message.text()}`);
  });
  for (const group of PAGES) {
    await context.clearCookies();
    if (group.who) await as(context, group.who);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      for (const path of group.paths) {
        // A navigation can be cut off by the previous page's own late
        // navigation (seen once in CI); try that one again.
        const response = await page.goto(path).catch(() => page.goto(path));
        expect(response?.status(), path).toBeLessThan(400);
        const extra = await sidewaysOverflow(page);
        if (extra > 1) problems.push(`${path} at ${viewport.width}px: ${extra}px too wide`);
      }
    }
  }
  expect(problems).toEqual([]);
  // Prefetches cut off by the next page.goto are network noise, not app errors;
  // script errors, hydration errors and CSP violations still fail the test.
  expect(consoleErrors.filter((text) => !/Failed to fetch RSC payload|Failed to load resource: net::/.test(text))).toEqual([]);
});

test("WEB-02/15: every sidebar and profile link answers for each space", async ({ page, context }) => {
  for (const who of ["E2E_REQ", "E2E_ADMIN", "E2E_SUPER"]) {
    await as(context, who);
    const home = who === "E2E_SUPER" ? "/superadmin" : who === "E2E_ADMIN" ? "/admin" : "/users";
    await page.goto(home);
    const hrefs = await page.locator("aside nav a[href], header a[href]").evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href") ?? ""))]);
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs.filter((value) => value.startsWith("/"))) {
      const response = await page.request.get(href, { maxRedirects: 0 });
      expect(response.status(), `${who} ${href}`).toBeLessThan(400);
    }
  }
});

test("WEB-08: an unknown address shows the 404 page with a way back", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const response = await page.goto("/users/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Overview" })).toHaveAttribute("href", "/users");
  await expect(page.locator("body")).not.toContainText(/stack|Error:|at \w+ \(/);
});

test("WEB-04/05: favicon files answer; each page has its own title", async ({ page, context }) => {
  for (const path of ["/favicon.ico", "/brand/ars-mark.svg", "/icons/icon-192.png"]) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
  await as(context, "E2E_REQ");
  const titles: string[] = [];
  for (const path of ["/users", "/users/queue", "/users/tasks", "/users/information", "/users/search", "/users/profile"]) {
    await page.goto(path);
    titles.push(await page.title());
  }
  expect(titles.every((title) => title.endsWith("· ARS Approvals"))).toBe(true);
  expect(new Set(titles).size).toBe(titles.length);
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
});

test("WEB-17: the logo goes to the space's first page", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /ARS Green Steel: Admin home/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("WEB-03: the phone menu takes focus, keeps Tab inside, closes on Escape and after choosing a page", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/users");
  const opener = page.getByRole("button", { name: "Open menu" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeFocused();
  for (let index = 0; index < 30; index += 1) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/users\/search/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  // WEB-15: the phone bar belongs to My approvals only.
  await expect(page.getByRole("navigation", { name: "Quick" })).toBeVisible();
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Quick" })).toHaveCount(0);
});

test("SEC-07/18: no CORS grant to other sites; signed-in answers aren't cached", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const preflight = await page.request.fetch("/api/me/notifications", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
  expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();
  const api = await page.request.get("/api/me/notifications", { headers: { Origin: "https://evil.example" } });
  expect(api.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(api.headers()["cache-control"]).toContain("no-store");
  const response = await page.goto("/users");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("SEC-09: someone else's request, task, PDF and files answer a plain 404", async ({ page, context }) => {
  const { db, userIdByLogin } = await import("./db");
  const staff = await userIdByLogin("E2E_STAFF");
  const conn = await db();
  let requestId: number | undefined;
  let taskId: number | undefined;
  let attachmentId: number | undefined;
  try {
    const [requests] = await conn.query<import("mysql2/promise").RowDataPacket[]>(
      `SELECT r.id FROM approval_requests r WHERE r.requester_id <> ? AND r.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM approval_tasks t WHERE t.request_id = r.id AND t.approver_id = ?)
         AND NOT EXISTS (SELECT 1 FROM request_collaborators c WHERE c.request_id = r.id AND c.user_id = ?) ORDER BY r.id LIMIT 1`,
      [staff, staff, staff],
    );
    requestId = requests[0]?.id;
    const [tasks] = await conn.query<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM tasks WHERE created_by <> ? AND assignee_id <> ? AND assigned_by <> ? ORDER BY id LIMIT 1", [staff, staff, staff]);
    taskId = tasks[0]?.id;
    if (requestId) {
      const [files] = await conn.query<import("mysql2/promise").RowDataPacket[]>("SELECT id FROM request_attachments WHERE request_id = ? LIMIT 1", [requestId]);
      attachmentId = files[0]?.id;
    }
  } finally {
    await conn.end();
  }
  expect(requestId, "a request E2E_STAFF has no part in").toBeTruthy();
  await as(context, "E2E_STAFF");
  expect((await page.goto(`/users/requests/${requestId}`))?.status()).toBe(404);
  expect((await page.request.get(`/api/requests/${requestId}/summary.pdf`)).status()).toBe(404);
  if (taskId) expect((await page.goto(`/users/tasks/${taskId}`))?.status()).toBe(404);
  if (attachmentId) expect((await page.request.get(`/api/attachments/${attachmentId}`)).status()).toBe(404);
  expect((await page.request.get("/api/files/999999999")).status()).toBe(404);
  // Admin and Super Admin addresses are a plain 404 for a person without the role.
  expect((await page.goto("/admin/users"))?.status()).toBe(404);
  expect((await page.goto("/superadmin/settings"))?.status()).toBe(404);
  expect((await page.request.get("/api/superadmin/audit")).status()).toBe(404);
});
