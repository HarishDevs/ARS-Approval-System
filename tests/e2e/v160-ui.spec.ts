import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { db, sessionCookie } from "./db";

// v1.6.0 Phases 1–3 through the real screens: theme choice saved and
// painted on the first byte, accessibility scans (axe) in light and dark,
// the in-shell not-found page, the skip link and the phone bottom bar.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function anyRequestPath(loginId: string): Promise<string> {
  const conn = await db();
  try {
    const [rows] = await conn.query<import("mysql2/promise").RowDataPacket[]>(
      "SELECT r.id FROM approval_requests r JOIN users u ON u.id = r.requester_id WHERE u.login_id = ? AND r.deleted_at IS NULL ORDER BY r.id LIMIT 1",
      [loginId],
    );
    return `/users/requests/${rows[0]!.id}`;
  } finally {
    await conn.end();
  }
}

// Serious and critical problems fail the test; the list is printed so it
// can be fixed. Colour contrast is checked in both themes.
async function scan(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return result.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${url} · ${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`);
}

test("UI-02 the theme is chosen in Profile, saved, and painted before the page shows", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/profile");
  await page.getByRole("radio", { name: "Dark" }).check();
  await expect(page.getByText("Theme saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // A fresh load is dark from the server's first byte (no flash).
  const response = await page.request.get("/users");
  expect(await response.text()).toMatch(/<html[^>]*data-theme="dark"/);
  await page.goto("/users");
  await page.screenshot({ path: "test-results/v160-dark-my-work.png", fullPage: true });
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(14, 19, 27)");
});

test("RA-03 axe finds no serious problems on the main pages, light and dark", async ({ page, context }) => {
  test.setTimeout(240_000);
  const requestPath = await anyRequestPath("E2E_REQ");
  // The scan sets the theme by cookie; an account setting would override it.
  const conn = await db();
  await conn.query("DELETE FROM user_settings WHERE setting_key = 'ui.theme'");
  await conn.end();
  const userPages = ["/users", "/users/queue", "/users/requests", "/users/new", "/users/search?q=E2E", "/users/help", "/users/profile", "/users/notifications", "/users/notifications/settings", "/users/delegation", "/users/tasks", "/users/tasks/new", "/users/information", "/users/information/new", requestPath];
  const problems: string[] = [];
  for (const theme of ["dark", "light"] as const) {
    await as(context, "E2E_REQ");
    await context.addCookies([{ name: "ars_theme", value: theme, domain: "localhost", path: "/" }]);
    for (const url of userPages) problems.push(...(await scan(page, url)));
    await as(context, "E2E_SUPER");
    await context.addCookies([{ name: "ars_theme", value: theme, domain: "localhost", path: "/" }]);
    for (const url of ["/admin", "/admin/users", "/admin/workload", "/admin/workflows", "/admin/attention", "/admin/budgets", "/users/analytics", "/users/analytics/metrics", "/admin/analytics", "/admin/reports", "/admin/reports/pending_approvals", "/superadmin", "/superadmin/deliveries", "/superadmin/automation", "/superadmin/retention", "/admin/workflows/import", "/admin/task-types", "/admin/information-types"]) problems.push(...(await scan(page, url)));
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("FB-07 a missing request shows the in-space page, with search and the menu", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  const response = await page.goto("/users/requests/99999999");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search your requests" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("RA-03 the first Tab reaches 'Skip to content', which moves focus to the page", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("RA-01 phones get the bottom bar with the real waiting count", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(context, "E2E_MGR");
  await page.goto("/users");
  const bar = page.getByRole("navigation", { name: "Quick" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
  await bar.getByRole("link", { name: /Waiting/ }).click();
  await expect(page).toHaveURL(/\/users\/queue$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await page.screenshot({ path: "test-results/v160-phone-queue.png", fullPage: false });
});

test("UI-02 back to System: no data-theme, the device decides", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/profile");
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.getByText("Theme saved")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("radio", { name: "System" }).check();
  await expect(page.getByText("It follows your device setting.")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});
