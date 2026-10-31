import { expect, test } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-227 (owner: "in Classic mode make everything Classic… like Tally"):
// entry forms read "Label : value", the field being entered is lit, Enter
// moves to the next field and Ctrl+A accepts the form. Compact is unchanged.
const stamp = Date.now().toString(36);

test("Classic entry forms: Label : value rows, Enter moves on, Ctrl+A accepts; Compact unchanged", async ({ page, context }) => {
  const id = await userIdByLogin("E2E_REQ");
  const conn = await db();
  await conn.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'ui.workspace_view', 'CLASSIC') ON DUPLICATE KEY UPDATE value = 'CLASSIC'", [id]);
  try {
    await page.setViewportSize({ width: 1366, height: 900 });
    await context.addCookies([await sessionCookie("E2E_REQ")]);
    await page.goto("/users/tasks/new");
    await expect(page.locator("[data-view=classic]")).toHaveCount(1);
    await expect(page.getByTestId("classic-keys")).toContainText("Ctrl+A: accept");
    const title = page.locator("main form").getByLabel("Title", { exact: true });
    // The label sits beside its field (a two-column row), followed by " :".
    expect(await title.evaluate((element) => getComputedStyle(element.parentElement!).display)).toBe("grid");
    expect(await page.locator("main form .field-label").first().evaluate((element) => getComputedStyle(element, "::after").content)).toContain(":");
    await title.fill(`Classic entry ${stamp}`);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/users\/tasks\/new/); // Enter didn't submit
    await expect(page.locator("main form").getByLabel(/Description/)).toBeFocused();
    await page.locator("main form").getByLabel("Assign to").selectOption({ index: 1 });
    await page.locator("main form").getByLabel("Assign to").press("Control+a");
    await expect(page).toHaveURL(/\/users\/tasks\/\d+/);
    await expect(page.getByText(`Classic entry ${stamp}`).first()).toBeVisible();
    await page.screenshot({ path: "test-results/v134-classic-task.png" });

    // Compact: no Classic look, Enter keeps the browser's own behaviour.
    await conn.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
    await page.goto("/users/tasks/new");
    await expect(page.locator("[data-view=classic]")).toHaveCount(0);
    expect(await page.locator("main form").getByLabel("Title", { exact: true }).evaluate((element) => getComputedStyle(element.parentElement!).display)).not.toBe("grid");
  } finally {
    await conn.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
    await conn.end();
  }
});
