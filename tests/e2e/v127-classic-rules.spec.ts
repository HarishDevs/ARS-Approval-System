import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-210 (owner): the Classic (Tally-style) view, switched and saved per
// person. D-209: reminder and escalation rules in Admin.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test.afterAll(async () => {
  const conn = await db();
  try {
    await conn.query("DELETE FROM user_settings WHERE setting_key IN ('ui.workspace_view', 'ui.text_size') AND user_id = ?", [await userIdByLogin("E2E_REQ")]);
  } finally {
    await conn.end();
  }
});

test("D-210: switch to Classic; Gateway, module menu, page tabs, letters and Esc; switch back", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await page.getByRole("button", { name: /open your menu|profile menu|account/i }).first().click();
  await page.getByTestId("view-switch").getByRole("radio", { name: "Classic" }).click();
  await expect(page.getByTestId("classic-gateway")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toHaveCount(0);
  // Page 2 of the sketch: one box, the Central Management System.
  await expect(page.getByRole("navigation", { name: "Central Management System" })).toBeVisible();
  await expect(page.getByLabel("At a glance")).toHaveCount(0);
  const gateway = page.getByTestId("gateway-menu");
  await expect(gateway.getByRole("link", { name: /Approval Management/ })).toBeFocused();
  await expect(gateway.getByRole("link").first()).toContainText("Approval Management");
  await expect(gateway.getByRole("link", { name: "Overview dashboard" })).toBeVisible();
  await page.screenshot({ path: "test-results/classic-gateway.png", fullPage: true });

  // Arrow keys move; Enter opens the module menu.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(gateway.getByRole("link", { name: /Approval Management/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/users\/menu\/approvals$/);
  // Page 3 of the sketch: the module name, its pages as tabs, its boxes.
  await expect(page.getByRole("heading", { level: 1, name: "Approval Management" })).toBeVisible();
  await expect(page.getByTestId("classic-tabs").getByRole("link")).toHaveText([/New request/, /My pending requests/, /My approved requests/, /Waiting for me/, /Approved by me/, /Collaborating/, /Request templates/]);
  await expect(page.getByTestId("module-menu")).toHaveCount(0);
  await expect(page.getByTestId("classic-boxes")).toContainText("Waiting for me");
  await page.screenshot({ path: "test-results/classic-module.png", fullPage: true });

  // The highlighted letter opens a page; the module's pages are tabs; Esc goes up a level.
  await page.keyboard.press("w");
  await expect(page).toHaveURL(/\/users\/queue$/);
  const tabs = page.getByTestId("classic-tabs");
  await expect(tabs.getByRole("link", { name: /Waiting for me/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("classic-bar")).toContainText("Approval Management");
  await page.screenshot({ path: "test-results/classic-page.png", fullPage: true });
  await tabs.getByRole("link", { name: "My approved requests" }).click();
  await expect(page).toHaveURL(/\/users\/approved$/);
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/users\/menu\/approvals$/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("classic-gateway")).toBeVisible();

  // The choice is saved: a new visit opens the Gateway; Overview is one entry away.
  await page.goto("/users");
  await expect(page.getByTestId("classic-gateway")).toBeVisible();
  await page.goto("/users?view=overview");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");

  // D-211: in Classic, all text can be resized; it applies at once and is saved.
  await page.goto("/users");
  const bodyText = () => page.getByTestId("gateway-menu").getByRole("link", { name: /Approval Management/ }).evaluate((element) => getComputedStyle(element).fontSize);
  expect(await bodyText()).toBe("14px");
  await page.getByRole("button", { name: /open your menu|profile menu|account/i }).first().click();
  await page.getByTestId("text-size").getByRole("radio", { name: "Largest" }).click();
  await expect.poll(bodyText).toBe("21px");
  await page.screenshot({ path: "test-results/classic-largest.png", fullPage: true });
  await page.reload();
  await expect.poll(bodyText).toBe("21px");

  // Back to Compact: normal text, no Classic text size.
  await page.getByRole("button", { name: /open your menu|profile menu|account/i }).first().click();
  await page.getByTestId("view-switch").getByRole("radio", { name: "Compact" }).click();
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await page.goto("/users");
  await expect(page.getByTestId("classic-gateway")).toHaveCount(0);
  expect(await page.getByRole("heading", { level: 1 }).evaluate((element) => getComputedStyle(element.ownerDocument.documentElement).getPropertyValue("--text-scale"))).toBe("");
  expect(await page.getByTestId("sidebar").getByRole("link").first().evaluate((element) => getComputedStyle(element).fontSize)).toBe("14px");
});

test("D-212: the keyboard works for a Super Admin too (closed confirmations on the page don't block it)", async ({ page, context }) => {
  const conn = await db();
  const id = await userIdByLogin("E2E_SUPER");
  try {
    await conn.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'ui.workspace_view', 'CLASSIC') ON DUPLICATE KEY UPDATE value = 'CLASSIC'", [id]);
  } finally {
    await conn.end();
  }
  try {
    await as(context, "E2E_SUPER");
    await page.goto("/users");
    const gateway = page.getByTestId("gateway-menu");
    await expect(gateway.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(gateway.getByRole("link").nth(1)).toBeFocused();
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/users\/menu\/tasks$/);
    await page.keyboard.press("m");
    // D-215: My tasks opens My Tasks.
    await expect(page).toHaveURL(/\/users\/work\/my-tasks$/);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/users\/menu\/tasks$/);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("classic-gateway")).toBeVisible();
  } finally {
    const again = await db();
    try {
      await again.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
    } finally {
      await again.end();
    }
  }
});

test("D-209: IT builds, tests, saves, turns off and deletes an escalation rule", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await page.locator("aside nav").getByRole("link", { name: "Reminders & escalations" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reminders & escalations" })).toBeVisible();
  await page.getByRole("link", { name: "New rule" }).click();
  await expect(page).toHaveURL(/\/admin\/reminders\/new$/);
  const name = `E2E late purchases ${Date.now().toString(36)}`;
  await page.getByLabel("Name").fill(name);
  await page.getByRole("radio", { name: /Escalation/ }).check();
  await page.getByRole("button", { name: "Add a condition" }).click();
  await page.getByLabel("Condition 1: field").selectOption({ label: "Hours waiting at this step" });
  await page.getByLabel("Condition 1: test").selectOption({ label: "is more than" });
  await page.getByLabel("Condition 1: value").fill("100000");
  await page.getByRole("button", { name: "Add a level" }).click();
  await expect(page.getByTestId("rule-stage")).toHaveCount(2);
  await page.getByRole("button", { name: "Test (nothing is sent)" }).click();
  await expect(page.getByTestId("rule-test")).toContainText(/0 pending approval steps match the conditions now/);
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page).toHaveURL(/\/admin\/reminders\/\d+\?saved=1$/);
  await expect(page.getByText(/Saved\. The rule runs from the next job run/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/rule-editor.png", fullPage: true });

  await page.getByRole("link", { name: "All rules" }).click();
  const card = page.getByTestId("rules-list").getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("Escalation · Approvals (pending steps) · inbox and email · On");
  await expect(card).toContainText("Hours waiting at this step is more than \"100000\"");
  await card.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText(`"${name}" is off.`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("rules-list").getByRole("listitem").filter({ hasText: name })).toContainText("· Off");
  await page.getByTestId("rules-list").getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, delete" }).click();
  // The rule's card (which held the button and its message) goes away.
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
});
