import { expect, test } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";
import { pickFirstPerson } from "./people";

// D-227 (owner: "in Classic mode make everything Classic… like Tally"):
// entry forms read "Label : value", the field being entered is lit, Enter
// moves to the next field and Ctrl+A accepts the form. Compact is unchanged.
const stamp = Date.now().toString(36);

test("Classic entry forms: Label : value rows, Enter moves on, Ctrl+A accepts; Compact unchanged", async ({ page, context }) => {
  const id = await userIdByLogin("E2E_REQ");
  const conn = await db();
  await conn.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'ui.workspace_view', 'CLASSIC') ON DUPLICATE KEY UPDATE value = 'CLASSIC'", [id]);
  const [types] = (await conn.query("SELECT t.id FROM module_types t JOIN module_type_versions v ON v.type_id = t.id AND v.status = 'PUBLISHED' WHERE t.module = 'TASK' AND t.active = TRUE ORDER BY t.name LIMIT 1")) as unknown as [{ id: number }[]];
  const typeId = types[0]!.id;
  try {
    await page.setViewportSize({ width: 1366, height: 900 });
    await context.addCookies([await sessionCookie("E2E_REQ")]);
    // v1.48.2: New task without a type opens the Create task window; the Classic entry form is a type's form.
    await page.goto(`/users/tasks/new?type=${typeId}`);
    await expect(page.locator("[data-view=classic]")).toHaveCount(1);
    await expect(page.getByTestId("classic-keys")).toContainText("Ctrl+A: accept");
    const title = page.locator("main form").getByLabel("Title", { exact: true });
    // The label sits beside its field (a two-column row), followed by " :".
    // D-267: a wrapping row (it stacks only when there's no room); here they sit side by side.
    const beside = await title.evaluate((element) => {
      const label = element.parentElement!.firstElementChild!.getBoundingClientRect();
      const field = element.getBoundingClientRect();
      return label.right <= field.left && Math.abs(label.top + label.height / 2 - (field.top + field.height / 2)) < field.height;
    });
    expect(beside).toBe(true);
    expect(await page.locator("main form .field-label").first().evaluate((element) => getComputedStyle(element, "::after").content)).toContain(":");
    await title.fill(`Classic entry ${stamp}`);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/users\/tasks\/new/); // Enter didn't submit
    await expect(page.locator("main form").getByLabel(/Description/)).toBeFocused();
    await pickFirstPerson(page, page.locator("main form").getByLabel("Assign to"));
    await page.locator("main form").getByLabel("Assign to").press("Control+a");
    await expect(page).toHaveURL(/\/users\/tasks\/\d+/);
    await expect(page.getByText(`Classic entry ${stamp}`).first()).toBeVisible();
    await page.screenshot({ path: "test-results/v134-classic-task.png" });

    // Compact: no Classic look, Enter keeps the browser's own behaviour.
    await conn.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
    // v1.48.2: New task without a type opens the Create task window; the Classic entry form is a type's form.
    await page.goto(`/users/tasks/new?type=${typeId}`);
    await expect(page.locator("[data-view=classic]")).toHaveCount(0);
    // Compact: the label sits above its field.
    expect(await page.locator("main form").getByLabel("Title", { exact: true }).evaluate((element) => element.parentElement!.firstElementChild!.getBoundingClientRect().bottom <= element.getBoundingClientRect().top)).toBe(true);
  } finally {
    await conn.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
    await conn.end();
  }
});
