import { expect, test } from "@playwright/test";
import { raisePurchase, sessionCookie } from "./db";

// v1.54.16 (owner): a Message deliveries dashboard; Group by the requester's
// department and by any form field on the request lists.
test("Message deliveries: totals, charts, filters that also filter the list", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.setViewportSize({ width: 1440, height: 900 });
  // A delivery to count: locally no email provider is set, so the test send fails at once (nothing leaves the PC).
  await page.goto("/superadmin/settings");
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByText(/EMAIL_NOT_CONFIGURED|Test email sent/).first()).toBeVisible();

  await page.goto("/superadmin/deliveries");
  const dashboard = page.getByTestId("delivery-dashboard");
  await expect(dashboard.getByRole("list", { name: "Totals" }).getByRole("link")).toHaveCount(5);
  await expect(dashboard.getByRole("figure", { name: "Messages per day" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Channel and provider by status" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Why messages failed or were skipped" })).toBeVisible();
  await page.screenshot({ path: "test-results/v15416-deliveries-dashboard.png", fullPage: true });

  await dashboard.getByLabel("Period", { exact: true }).selectOption("30");
  await dashboard.getByLabel("Channel", { exact: true }).selectOption("EMAIL");
  await dashboard.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/days=30/);
  await expect(page).toHaveURL(/channel=EMAIL/);
  // The list below follows the filters: email only.
  await expect(page.locator("table.data-table tbody tr").filter({ hasText: "WhatsApp" })).toHaveCount(0);
  await expect(dashboard.getByRole("link", { name: "Clear" })).toBeVisible();
});

test("Group by: form fields on My requests; Department on a list with people", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  // A request of its own, whose form has an Amount field.
  await raisePurchase(page, `Group check ${Date.now().toString(36)}`, "1500");
  await page.goto("/users/requests?tab=all");
  const group = page.getByTestId("group-menu");
  await group.locator("summary").click();
  const fieldChoice = group.getByRole("link", { name: /^Form: Amount/ }).first();
  await expect(fieldChoice).toBeVisible();
  await expect(group.getByRole("link", { name: "Department" })).toHaveCount(0); // all yours
  await fieldChoice.click();
  await expect(page).toHaveURL(/group=f%3Aamount|group=f:amount/);
  await expect(page.getByTestId("group-menu").locator("summary")).toContainText("Amount");
  await page.screenshot({ path: "test-results/v15416-group-field.png", fullPage: false });

  await context.clearCookies();
  await context.addCookies([await sessionCookie("E2E_MGR")]);
  await page.goto("/users/approved-by-me");
  await page.getByTestId("group-menu").locator("summary").click();
  await page.getByTestId("group-menu").getByRole("link", { name: "Department" }).click();
  await expect(page).toHaveURL(/group=dept/);
  await expect(page.getByTestId("group-menu").locator("summary")).toContainText("Department");
});
