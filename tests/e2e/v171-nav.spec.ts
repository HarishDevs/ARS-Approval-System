import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.7.1 (owner): Analytics opened from the Admin space stays in the Admin
// space; Help and Profile live in the account menu, not the sidebar; "My
// work" is "Overview"; Reports are for IT only (Admin space).
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const sidebar = (page: import("@playwright/test").Page) => page.locator("aside nav");

test("Analytics from the Admin space keeps the Admin space; Reports are there too", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await sidebar(page).getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/analytics/);
  await expect(page.getByRole("button", { name: /Account menu/ })).toContainText("Admin");
  await expect(page.getByLabel("Whose numbers")).toHaveValue("ORGANISATION");
  // v1.12.0: the Executive overview opens first; the drill-down lists are on Approval analytics.
  await page.getByLabel("Dashboard", { exact: true }).selectOption({ label: "Approval analytics" });
  await expect(page).toHaveURL(/\/admin\/analytics\?.*board=approvals/);
  await page.getByRole("link", { name: /Open requests/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/analytics\/list\?/);
  await expect(page.getByRole("button", { name: /Account menu/ })).toContainText("Admin");
  await sidebar(page).getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  // Old links still work for IT.
  await page.goto("/users/reports/request_register?period=30d");
  await expect(page).toHaveURL(/\/admin\/reports\/request_register\?period=30d/);
});

test("the sidebar has Overview, and no Help, Profile or Reports; the account menu has them", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  const nav = sidebar(page);
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  for (const name of ["Help", "Profile", "Reports", "My work"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Account menu/ }).click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/users\/help/);
});

test("Reports are refused to a requester everywhere", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  for (const path of ["/users/reports", "/users/reports/request_register", "/admin/reports"]) expect((await page.request.get(path)).status(), path).toBe(404);
  expect((await page.request.get("/api/reports/request_register?format=csv")).status()).toBe(404);
  await page.goto("/users/analytics");
  await expect(page.getByRole("link", { name: "Reports and alerts" })).toHaveCount(0);
});
