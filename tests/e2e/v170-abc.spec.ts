import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.7.0 through the real screens: the builder's form preview, the needed-by
// calendar, bulk reassignment, analytics drill-down and the new KPIs and
// charts, alert options, and a background export.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("A4 the form builder previews the form, rules working, nothing sent", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field label").last().fill("Vendor name");
  await page.getByRole("button", { name: "Preview the form" }).click();
  const preview = page.getByRole("region", { name: /Form preview/ });
  await expect(preview).toBeVisible();
  await expect(preview.getByLabel(/Vendor name/)).toBeVisible();
  await preview.getByRole("button", { name: "Submit request" }).click();
  await expect(preview.getByText(/Preview only: nothing was submitted/)).toBeVisible();
  await page.getByRole("button", { name: "Hide form preview" }).click();
  await expect(preview).toBeHidden();
});

test("A2 the needed-by calendar opens and moves between months", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/calendar?month=2031-03");
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible(); // v1.11.0: one calendar for everything
  await expect(page.getByRole("heading", { name: "March 2031", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { name: "April 2031", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All I can see" }).click();
  await expect(page).toHaveURL(/show=all/);
});

test("A3 IT opens bulk reassignment from Workload", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workload");
  await page.getByRole("link", { name: "Move pending tasks" }).click();
  await expect(page.getByRole("heading", { name: "Move pending tasks" })).toBeVisible();
  await expect(page.getByLabel("Move them to")).toBeVisible();
  await expect(page.getByLabel(/Reason/)).toBeVisible();
});

test("B analytics: new KPIs, comparison, more filters, charts and drill-down", async ({ page, context }) => {
  // D-258: this test reads the whole board at once ("Show all" on the board's pager).
  await context.addInitScript(() => window.localStorage.setItem("ars.fitPages.all", "1"));
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?board=approvals&scope=ORGANISATION&period=90d");
  await expect(page.getByText("Due today", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Approved first time", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Where tasks wait, by department and step" })).toBeVisible();
  await expect(page.getByText("Backlog and overdue", { exact: true }).first()).toBeVisible();
  // v1.51.1: the filters are in the toolbar's Filter dropdown (no "More filters" fold).
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByLabel("Compare with").selectOption("LAST_YEAR");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/compare=LAST_YEAR/);
  await expect(page.getByText(/vs same period last year|No earlier figure to compare/).first()).toBeVisible();
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByLabel("Status now").selectOption("IN_PROGRESS");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=IN_PROGRESS/);
  // A card opens the list behind it, with the filters carried.
  await page.getByRole("link", { name: /Open requests/ }).first().click();
  await expect(page).toHaveURL(/\/users\/analytics\/list\?.*status=IN_PROGRESS.*kind=open/);
  await expect(page.getByRole("heading", { name: "Open now" })).toBeVisible();
  await expect(page.locator("main").getByText(/request(s)? ?|No requests match/).first()).toBeVisible();
  await page.getByRole("link", { name: "← Back to Analytics" }).click();
  await expect(page).toHaveURL(/\/users\/analytics\?.*status=IN_PROGRESS/);
});

test("B08 alerts offer severity, channels and quiet hours", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/reports");
  await expect(page.getByLabel("Severity")).toBeVisible();
  await expect(page.getByLabel("Tell me by")).toBeVisible();
  await expect(page.getByLabel("Quiet from")).toBeVisible();
});

test("C02 a large export is made in the background and listed for download", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/reports/request_register?scope=ORGANISATION&period=90d");
  await page.getByText("Large export in the background").click();
  await page.getByRole("button", { name: "Make the export" }).click();
  await expect(page.getByText(/Being made/)).toBeVisible();
  await expect(async () => {
    await page.goto("/admin/reports");
    await expect(page.getByTestId("exports").getByRole("link", { name: "Download" }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  const download = await page.request.get((await page.getByTestId("exports").getByRole("link", { name: "Download" }).first().getAttribute("href"))!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toMatch(/attachment; filename="ars-request-register-/);
});
