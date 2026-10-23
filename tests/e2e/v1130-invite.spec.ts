import { expect, test, type Page } from "@playwright/test";
import { db, sessionCookie } from "./db";

// v1.13.0 (D-166, owner): invite a user and reset a password by email, from
// Add user, the user's page and the users list. Email isn't set up in the
// test environment, so each send reports that plainly (and nothing breaks).
const unique = (prefix: string) => `${prefix}_${Date.now().toString(36).toUpperCase()}`;

async function addUser(page: Page, loginId: string, options: { password?: boolean; invite: boolean }) {
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name", { exact: true }).fill(`Invitee ${loginId}`);
  await page.getByLabel("User ID", { exact: true }).fill(loginId);
  await page.getByLabel("Email", { exact: true }).fill(`${loginId.toLowerCase()}@example.com`);
  if (options.password) {
    await page.getByRole("radio", { name: /User ID \+ password/ }).check();
    await page.getByLabel("WhatsApp number", { exact: true }).fill(`98${String(Date.now()).slice(-8)}`);
  }
  const invite = page.getByRole("checkbox", { name: /Email an invitation now/ });
  await expect(invite).toBeChecked();
  if (!options.invite) await invite.uncheck();
  await page.getByRole("button", { name: "Create user" }).click();
}

test("Add user emails an invitation; Re-invite is on the users list and the user page", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_INV");
  await addUser(page, loginId, { invite: true });
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1&invite=failed$/);
  await expect(page.getByTestId("invite-failed")).toContainText("The invitation email couldn't be sent");

  // The user page: Re-invite (a Google user has no password to reset).
  await expect(page.getByRole("button", { name: "Re-invite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);

  // The users list: the same, on the person's row.
  await page.goto(`/admin/users?q=${loginId}`);
  const row = page.getByRole("row").filter({ hasText: loginId });
  await row.getByRole("button", { name: "Re-invite" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, send" }).click();
  await expect(page.getByText(/couldn't be sent \(EMAIL_NOT_CONFIGURED\)/)).toBeVisible();
  await expect(row.getByRole("button", { name: "Reset password" })).toHaveCount(0);
});

test("a password user with a password gets Reset password on the list and the page; nobody acts on their own row", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_RST");
  await addUser(page, loginId, { password: true, invite: false });
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1$/);
  // Before a first password there is nothing to reset.
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send set-password link" })).toBeVisible();

  const conn = await db();
  try {
    await conn.query("UPDATE users SET password_hash = 'scrypt$16384$8$1$e2e$e2e', password_set_at = CURRENT_TIMESTAMP WHERE login_id = ?", [loginId]);
  } finally {
    await conn.end();
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Reset password" })).toBeVisible();

  await page.goto(`/admin/users?q=${loginId}`);
  const row = page.getByRole("row").filter({ hasText: loginId });
  await row.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("current password keeps working");
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, send" }).click();
  await expect(page.getByText(/couldn't be sent \(EMAIL_NOT_CONFIGURED\)/)).toBeVisible();
  await page.screenshot({ path: "test-results/v1130-users-list.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/admin/users?q=${loginId}`);
  await page.screenshot({ path: "test-results/v1130-users-list-phone.png", fullPage: true });
  // The table scrolls inside its card; the page itself never does.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/users?q=E2E_ADMIN");
  await expect(page.getByRole("row").filter({ hasText: "E2E_ADMIN" }).getByRole("button", { name: "Re-invite" })).toHaveCount(0);
});
