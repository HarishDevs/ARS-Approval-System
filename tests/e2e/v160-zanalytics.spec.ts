import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Addendum A through the real screens: role scopes, KPI cards with the
// comparison, charts with table views, filters, and the glossary.
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("IT sees the organisation; filters and periods apply; every chart has a table", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/users/analytics?board=approvals"); // v1.12.0: Approval analytics is one of the boards
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByLabel("Whose numbers")).toHaveValue("ORGANISATION");
  await expect(page.getByText("Open requests", { exact: true })).toBeVisible();
  await expect(page.getByText(/vs previous period|No earlier figure to compare/).first()).toBeVisible();
  await page.getByText("Show as a table").first().click();
  await expect(page.getByRole("table", { name: "Raised and decided over time" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Response-time status" })).toBeVisible();
  await page.getByLabel("Period").selectOption("90d");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=90d/);
  await expect(page.getByText(/Last 90 days/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/v160-analytics-org.png", fullPage: true });
  await page.getByRole("link", { name: "How these are worked out" }).click();
  await expect(page.getByRole("heading", { name: "How the numbers are worked out" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Overdue tasks" })).toBeVisible();
});

test("a requester sees only their own numbers; the organisation scope is refused", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/analytics?scope=ORGANISATION");
  const scopes = page.getByLabel("Whose numbers");
  await expect(scopes.locator("option", { hasText: "Whole organisation" })).toHaveCount(0);
  // Falls back to one of their own scopes.
  await expect(scopes).toHaveValue(/^(MINE|APPROVALS)$/);
  await expect(page.getByLabel("Raiser's department")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await page.screenshot({ path: "test-results/v160-analytics-phone.png", fullPage: true });
});
