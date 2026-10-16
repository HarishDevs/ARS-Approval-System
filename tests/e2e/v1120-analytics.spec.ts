import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.12.0 Analytics Center through the real screens: the boards as tabs of
// one page, shared filters that carry over, unavailable metrics stated as
// such, per-person and per-department tables, exports with the same scope,
// and role limits.
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const BOARD_CHECKS: [string, RegExp | string][] = [
  ["Approval analytics", "Open requests"],
  ["Task analytics", "Delivery against due dates"],
  ["Information analytics", "Volume and lifecycle"],
  ["Employee analytics", /People \(\d+\)/],
  ["Department analytics", /Departments \(\d+\)/],
  ["SLA & performance", "Approval response times"],
  ["Trends & forecasts", "Last 12 months"],
  ["Data quality", "Where to fix"],
  ["Executive overview", "Activity by month"],
];

test("IT opens every dashboard from the one Analytics page; the period carries over", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics");
  const tabs = page.getByRole("navigation", { name: "Dashboards" });
  await expect(tabs.getByRole("link")).toHaveCount(9);
  await expect(tabs.getByRole("link", { name: "Executive overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Tasks created", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Overdue acknowledgements: not available/)).toBeVisible();
  await expect(page.getByTestId("center-refreshed")).toContainText("As of");
  await page.getByLabel("Period").selectOption("last_quarter");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=last_quarter/);
  await expect(page.getByText(/Previous quarter/).first()).toBeVisible();
  for (const [tab, check] of BOARD_CHECKS) {
    await page.getByRole("navigation", { name: "Dashboards" }).getByRole("link", { name: tab, exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Dashboards" }).getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(/period=last_quarter/);
    await expect(page.getByText(check).first()).toBeVisible();
  }
});

test("employees: search, sort and a CSV with the same scope and period", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?board=employees&scope=ORGANISATION&period=90d");
  await expect(page.getByTestId("employee-table")).toBeVisible();
  await page.getByLabel("Person").fill("E2E");
  await page.getByLabel("Sort by").selectOption("tasks_open");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=E2E/);
  await expect(page).toHaveURL(/sort=tasks_open/);
  const href = await page.getByRole("link", { name: "Download as CSV" }).getAttribute("href");
  expect(href).toContain("kind=employees");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Scope: Whole organisation");
  expect(text).toContain("Person,Department,Requests raised");
  expect(csv.headers()["cache-control"]).toContain("no-store");
});

test("a requester sees only their own row; department analytics and other scopes are refused", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/analytics?board=employees&scope=ORGANISATION");
  await expect(page.getByRole("navigation", { name: "Whose numbers" }).getByRole("link", { name: "Whole organisation" })).toHaveCount(0);
  await expect(page.getByTestId("employee-table").locator("tbody tr")).toHaveCount(1);
  await page.goto("/users/analytics?board=departments");
  await expect(page.getByText(/Department analytics are for heads of department/)).toBeVisible();
  // A hand-made export link can't widen the scope.
  const csv = await page.request.get("/api/analytics/export?kind=departments&scope=ORGANISATION");
  expect(csv.status()).toBe(404);
  const own = await page.request.get("/api/analytics/export?kind=employees&scope=ORGANISATION");
  expect(await own.text()).not.toContain("Scope: Whole organisation");
});

test("older approval links still open Approval analytics", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?scope=ORGANISATION&status=OPEN");
  await expect(page.getByRole("navigation", { name: "Dashboards" }).getByRole("link", { name: "Approval analytics" })).toHaveAttribute("aria-current", "page");
});
