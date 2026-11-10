import { expect, test, type Page } from "@playwright/test";
import { db, sessionCookie } from "./db";

// v1.13.0 (D-166, owner): invite a user and reset a password by email, from
// Add user and the user's page (v1.14.0); v1.49.3 (owner): also in the users list row menu.
// Email isn't set up in the test environment, so each send reports that
// plainly (and nothing breaks).
const unique = (prefix: string) => `${prefix}_${Date.now().toString(36).toUpperCase()}`;
const NOT_SENT = /couldn't be sent \(EMAIL_NOT_CONFIGURED\)/;

async function addUser(page: Page, loginId: string, options: { password?: boolean } = {}) {
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name", { exact: true }).fill(`Invitee ${loginId}`);
  await page.getByLabel("User ID", { exact: true }).fill(loginId);
  await page.getByLabel("Email", { exact: true }).fill(`${loginId.toLowerCase()}@example.com`);
  if (options.password) {
    await page.getByRole("radio", { name: /User ID \+ password/ }).check();
    await page.getByLabel("WhatsApp number", { exact: true }).fill(`98${String(Date.now()).slice(-8)}`);
  }
  // v1.49.6 (owner): the welcome email always goes; no tick box.
  await expect(page.getByText("A welcome email goes to this address when you create the user.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Email an invitation now/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create user" }).click();
}

test("Add user emails an invitation; Re-invite is on the user page and in the users list menu", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_INV");
  await addUser(page, loginId);
  // v1.50.2: the welcome email goes out just after the page answers, so the page never waits for it.
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1&invite=queued$/);
  await expect(page.getByRole("status").filter({ hasText: "A welcome email is on its way" })).toBeVisible();
  await expect(page.getByTestId("invite-failed")).toHaveCount(0);

  // The user page: Re-invite (a Google user has no password to reset).
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  await page.getByRole("button", { name: "Re-invite" }).click();
  await expect(page.getByText(NOT_SENT)).toBeVisible();

  // v1.49.3 (owner): the users list has the account actions in a row menu.
  await page.goto(`/admin/users?q=${loginId}`);
  const row = page.getByRole("row").filter({ hasText: loginId });
  await expect(row).toHaveCount(1);
  await row.getByTestId("user-row-menu").click();
  await page.getByRole("menuitem", { name: "Re-invite" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, send" }).click();
  await expect(page.getByText(NOT_SENT).first()).toBeVisible();
});

test("a password user with a password gets Reset password on their page", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_RST");
  await addUser(page, loginId, { password: true });
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1&invite=queued$/);
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
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Email Invitee ${loginId} a link to reset their password?`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, send" }).click();
  await expect(page.getByText(NOT_SENT)).toBeVisible();
});

test("D-208: a person can be set to sign in with Google or password (Both)", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_BOTH");
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name", { exact: true }).fill(`Invitee ${loginId}`);
  await page.getByLabel("User ID", { exact: true }).fill(loginId);
  await page.getByLabel("Email", { exact: true }).fill(`${loginId.toLowerCase()}@example.com`);
  await page.getByRole("radio", { name: /^Both/ }).check();
  // Both includes password sign-in, so the WhatsApp number is required.
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("Password sign-in needs a WhatsApp number for the sign-in code.")).toBeVisible();
  await page.getByLabel("WhatsApp number", { exact: true }).fill(`98${String(Date.now()).slice(-8)}`);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1/);
  await expect(page.getByText("Google (links on first sign-in) · No password yet")).toBeVisible();
  // Like a password user, they get a set-password link (Google needs no set-up).
  await expect(page.getByRole("button", { name: "Re-invite" })).toBeVisible();
  await page.goto(`/admin/users?q=${loginId}`);
  await expect(page.getByRole("row").filter({ hasText: loginId })).toContainText("Google or password + WhatsApp");
});
