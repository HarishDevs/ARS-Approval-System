import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-193: Admin → AI Analytics, for the IT team only.
test("IT opens AI Analytics, sees the headline figures and changes the period", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin");
  await page.getByTestId("sidebar").getByRole("link", { name: "AI Analytics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AI Analytics" })).toBeVisible();
  for (const tile of ["Questions asked", "Active users", "Answered", "Average answer time", "Tokens used", "Estimated cost"]) await expect(page.getByTestId("ai-kpis")).toContainText(tile);
  // v1.51.1: the period is in the toolbar's Filter dropdown.
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByTestId("filter-menu").getByLabel("Period", { exact: true }).selectOption("7d");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=7d/);
  await expect(page.getByText(/^Last 7 days:/)).toBeVisible();
});

test("a plain user gets a 404 for AI Analytics", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  expect((await page.goto("/admin/ai-analytics"))?.status()).toBe(404);
});
