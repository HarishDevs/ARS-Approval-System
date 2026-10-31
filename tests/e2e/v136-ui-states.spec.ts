import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-233 (UI states): each state under its real trigger.
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("offline: the banner shows, and 'Back online' once the server answers again", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests");
  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toContainText("You're offline");
  await context.setOffline(false);
  await expect(page.getByTestId("back-online")).toBeVisible();
  await expect(page.getByTestId("back-online")).toHaveCount(0, { timeout: 10_000 });
});

test("slow network: a save still running after 8 seconds says so, then finishes", async ({ page, context }) => {
  test.setTimeout(90_000);
  await as(context, "E2E_REQ");
  await page.goto("/users/notifications/settings");
  await page.route("**/users/notifications/settings", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, 9_500));
      await route.continue();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByTestId("slow-network")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^Saved\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("slow-network")).toHaveCount(0);
  await page.unroute("**/users/notifications/settings");
});

test("rate limited: quick search says to wait (not a generic error)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.route("**/api/me/quick*", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "RATE_LIMITED", message: "Too many" } }) }));
  await page.goto("/users");
  await page.getByTestId("search-bar").click();
  await page.getByTestId("search-panel").getByRole("combobox").fill("purchase");
  await expect(page.getByTestId("search-panel")).toContainText("Too many searches in a short time");
});

test("no results: the words searched, Clear search and Reset filters; an empty list says something else", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests?q=zz-nothing-like-this");
  const none = page.getByTestId("no-results");
  await expect(none).toContainText("No requests for “zz-nothing-like-this”");
  await none.getByRole("link", { name: "Clear search" }).click();
  await expect(page).not.toHaveURL(/q=/);
  await page.goto("/users/work/projects?q=zz-nothing-like-this");
  await expect(page.getByTestId("no-results")).toContainText("No projects for");
  await page.goto("/users/tasks?q=zz-nothing-like-this");
  await page.getByTestId("no-results").getByRole("link", { name: "Reset filters" }).click();
  await expect(page).not.toHaveURL(/q=/);
});

test("unsaved changes: leaving a changed form asks first; Stay keeps it, Leave goes", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/users/notifications/settings");
  await page.getByLabel("Your request is approved by email").uncheck();
  await page.locator("aside nav").getByRole("link", { name: "Calendar" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/users\/notifications\/settings$/);
  await expect(page.getByLabel("Your request is approved by email")).not.toBeChecked();
  await page.locator("aside nav").getByRole("link", { name: "Calendar" }).click();
  await page.getByRole("alertdialog", { name: "Leave without saving?" }).getByRole("button", { name: "Leave without saving" }).click();
  await expect(page).toHaveURL(/\/users\/calendar/);
});

test("maintenance: IT's notice shows on every page while it is set", async ({ page, context }) => {
  const conn = await db();
  const admin = await userIdByLogin("E2E_SUPER");
  try {
    await conn.query(
      "INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value, updated_by) VALUES ('general.maintenance_notice', 'GENERAL', 'STRING', FALSE, 'ARS will be unavailable on Sunday 10:00–12:00.', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [admin],
    );
    await as(context, "E2E_REQ");
    await page.goto("/users");
    await expect(page.getByTestId("maintenance-notice")).toContainText("ARS will be unavailable on Sunday 10:00–12:00.");
  } finally {
    await conn.query("DELETE FROM system_settings WHERE setting_key = 'general.maintenance_notice'");
    await conn.end();
  }
  await page.reload();
  await expect(page.getByTestId("maintenance-notice")).toHaveCount(0);
});
