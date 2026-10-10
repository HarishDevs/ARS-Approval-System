import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Unified prompt FN2 / FN11 through the real screens: Needs attention for
// IT, Automation (inventory, run now, history) for the Super Admin.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("IT sees Needs attention with reasons and filters; requesters get a 404", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/attention");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  const filters = page.getByRole("navigation", { name: "Filter by reason" });
  await expect(filters.getByRole("link", { name: /^All \(\d+\)$/ })).toHaveAttribute("aria-current", "page");
  await filters.getByRole("link", { name: /A step nobody can act on/ }).click();
  await expect(page).toHaveURL(/reason=BLOCKED_STEP/);
  await expect(filters.getByRole("link", { name: /A step nobody can act on/ })).toHaveAttribute("aria-current", "page");
  // v140-ui leaves a request with a step given to someone and one skipped;
  // either the list or the empty state shows, never an error.
  await expect(page.getByRole("table", { name: "Requests that need attention" }).or(page.getByText("Nothing needs attention"))).toBeVisible();

  await as(context, "E2E_REQ");
  const response = await page.goto("/admin/attention");
  expect(response?.status()).toBe(404);
});

test("the Super Admin runs one automation now and sees it in the history", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/automation");
  await expect(page.getByRole("heading", { name: "Automation", exact: true })).toBeVisible();
  const inventory = page.getByRole("region", { name: "Inventory" });
  const row = inventory.getByRole("row", { name: /Stuck-request scan/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Run now" }).click();
  await expect(row.getByText("Done.")).toBeVisible();
  await expect(row.getByText("Running", { exact: true })).toBeVisible();
  await row.getByRole("link", { name: "History" }).click();
  const runs = page.getByRole("region", { name: /Recent runs: Stuck-request scan/ });
  await expect(runs.getByRole("row").filter({ hasText: "Run now" }).first()).toContainText("OK");
  await expect(page.getByRole("region", { name: /Messages not sent/ })).toBeVisible();

  await as(context, "E2E_ADMIN");
  const response = await page.goto("/superadmin/automation");
  expect(response?.status()).toBe(404);
});
