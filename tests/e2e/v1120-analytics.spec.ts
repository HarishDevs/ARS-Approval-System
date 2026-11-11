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

// D-258: a board comes in pages that fit the window; look through them.
async function seeOnSomePage(page: import("@playwright/test").Page, text: string | RegExp) {
  const target = page.getByText(text).first();
  const pager = page.getByTestId("fit-pages");
  if ((await pager.count()) === 0) return expect(target).toBeVisible();
  const pages = pager.getByRole("button").filter({ hasNotText: /^[←→]$/ });
  const total = await pages.count();
  for (let index = 0; index < total; index += 1) {
    await pages.nth(index).click();
    if (await target.isVisible()) return;
  }
  await expect(target).toBeVisible();
}

test("IT opens every dashboard from the one Analytics page; the period carries over", async ({ page, context }) => {
  // D-258: this test reads whole boards ("Show all" on the board's pager).
  await context.addInitScript(() => window.localStorage.setItem("ars.fitPages.all", "1"));
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics");
  // v1.12.1: dashboards and scopes are dropdowns.
  const boards = page.getByLabel("Dashboard", { exact: true });
  await expect(boards.locator("option")).toHaveCount(9);
  await expect(boards).toHaveValue("overview");
  await seeOnSomePage(page, "Tasks created");
  await seeOnSomePage(page, /Overdue acknowledgements: not available/);
  await expect(page.getByTestId("center-refreshed")).toContainText("As of");
  // v1.51.1: the filters are in the toolbar's Filter dropdown.
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByLabel("Period").selectOption("last_quarter");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=last_quarter/);
  await seeOnSomePage(page, /Previous quarter/);
  for (const [tab, check] of BOARD_CHECKS) {
    await page.getByLabel("Dashboard", { exact: true }).selectOption({ label: tab });
    await expect(page).toHaveURL(/period=last_quarter/);
    await expect(page.getByLabel("Dashboard", { exact: true }).locator("option:checked")).toHaveText(tab);
    await seeOnSomePage(page, check);
    // D-206: "Opening…" ends once the dashboard has arrived.
    await expect(page.getByText("Opening…")).toHaveCount(0);
  }
});

test("D-206: a plain user sees only the dashboards they need; others open the overview", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/analytics");
  const options = await page.getByLabel("Dashboard", { exact: true }).locator("option").allTextContents();
  expect(options).toContain("Executive overview");
  for (const hidden of ["Data quality", "Department analytics"]) expect(options).not.toContain(hidden);
  await page.goto("/users/analytics?board=quality");
  await expect(page.getByLabel("Dashboard", { exact: true })).toHaveValue("overview");
  await expect(page.getByText("Where to fix")).toHaveCount(0);
});

test("employees: search, sort and a CSV with the same scope and period", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?board=employees&scope=ORGANISATION&period=90d");
  await expect(page.getByTestId("employee-table")).toBeVisible();
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByLabel("Person").fill("E2E");
  await page.getByLabel("Sort by").selectOption("tasks_open");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
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

test("a requester gets no people or department dashboards, and other scopes are refused", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  // D-206: Employee and Department analytics are for managers, HODs and IT; a link opens the overview.
  await page.goto("/users/analytics?board=employees&scope=ORGANISATION");
  await expect(page.getByLabel("Whose numbers").locator("option", { hasText: "Whole organisation" })).toHaveCount(0);
  await expect(page.getByLabel("Dashboard", { exact: true })).toHaveValue("overview");
  await expect(page.getByTestId("employee-table")).toHaveCount(0);
  await page.goto("/users/analytics?board=departments");
  await expect(page.getByLabel("Dashboard", { exact: true })).toHaveValue("overview");
  // A hand-made export link can't widen the scope.
  const csv = await page.request.get("/api/analytics/export?kind=departments&scope=ORGANISATION");
  expect(csv.status()).toBe(404);
  const own = await page.request.get("/api/analytics/export?kind=employees&scope=ORGANISATION");
  expect(await own.text()).not.toContain("Scope: Whole organisation");
});

test("choosing whose numbers from the dropdown keeps the dashboard", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?board=tasks&scope=ORGANISATION");
  await page.getByLabel("Whose numbers").selectOption({ label: "My requests" });
  await expect(page).toHaveURL(/scope=MINE/);
  await expect(page).toHaveURL(/board=tasks/);
  await expect(page.getByText("Delivery against due dates").first()).toBeVisible();
});

test("older approval links still open Approval analytics", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?scope=ORGANISATION&status=OPEN");
  await expect(page.getByLabel("Dashboard", { exact: true })).toHaveValue("approvals");
});
