import { expect, test, type BrowserContext } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, sessionCookie, userIdByLogin } from "./db";

// v1.8.0 through the real screens: My approved requests and Approved by me;
// the custom approval set-up (fields and a fixed step option) used on the
// custom approval page; picking people with search; work tasks naming
// anyone; page access set by the Super Admin; the inactivity sign-out.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function sql(text: string, params: unknown[] = []) {
  const conn = await db();
  try {
    return (await conn.query<RowDataPacket[]>(text, params))[0];
  } finally {
    await conn.end();
  }
}

test.afterAll(async () => {
  await sql("DELETE FROM custom_approval_settings WHERE id = 1");
  await sql("DELETE FROM page_access_rules");
  await sql("DELETE FROM system_settings WHERE setting_key = 'auth.idle_timeout_minutes'");
});

test("My approved requests and Approved by me are in the sidebar, with their filters", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  await page.locator("aside nav").getByRole("button", { name: "My Approvals" }).click();
  await page.locator("aside nav").getByRole("link", { name: "My approved requests" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My approved requests" })).toBeVisible();
  for (const tab of ["Still valid", "Expired", "No expiry", "Amended"]) await expect(page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: new RegExp(`^${tab} \\(`) })).toBeVisible();
  await page.getByText("More filters").click();
  await expect(page.getByLabel("Approved by")).toBeVisible();
  await expect(page.getByLabel("Approved on from")).toBeVisible();

  await as(context, "E2E_MGR");
  await page.goto("/users/approved-by-me");
  await expect(page.getByRole("heading", { level: 1, name: "Approved by me" })).toBeVisible();
  await expect(page.getByTestId("request-table").getByRole("row").nth(1)).toBeVisible();
  await page.getByText("More filters").click();
  for (const label of ["Step I approved", "Approved for", "I approved from", "Raised by"]) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
});

test("IT sets up custom approvals; the custom approval page follows it", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await page.locator("aside nav").getByRole("link", { name: "Custom approval" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Custom approval" })).toBeVisible();
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field label").last().fill("Vendor name");
  await page.getByLabel("Default: respond within hours").fill("24");
  const sla = page.locator("fieldset").filter({ hasText: "Respond within" });
  await sla.getByLabel("People may change it").uncheck();
  await page.getByRole("button", { name: "Preview the fields" }).click();
  await expect(page.getByRole("region", { name: /Preview of the custom approval fields/ }).getByLabel(/Vendor name/)).toBeVisible();
  await page.getByRole("button", { name: "Save set-up" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, save" }).click();
  await expect(page.getByText(/Saved\. New custom approvals use this set-up/)).toBeVisible();

  await as(context, "E2E_REQ");
  await page.goto("/users/custom");
  await expect(page.getByLabel(/Vendor name/)).toBeVisible();
  await expect(page.getByTestId("fixed-sla").first()).toHaveText("Respond within 24 hours (set by IT)");
  // Specific people: search and pick. A work task can name anyone.
  await page.getByLabel("Kind of step").first().selectOption("WORK");
  const picker = page.getByRole("combobox", { name: /People \(search and pick anyone\)/ });
  await picker.fill("Sita");
  await page.getByRole("option", { name: /Sita Staff/ }).click();
  await expect(page.getByRole("button", { name: /Remove Sita Staff/ })).toBeVisible();
  await page.getByLabel("Kind of step").first().selectOption("APPROVE");
  await page.getByRole("combobox", { name: /People \(search and pick; only people who can approve\)/ }).fill("Sita");
  await expect(page.getByRole("option", { name: /Sita Staff/ })).toHaveCount(0);
});

test("the Super Admin hides a page and makes another view-only", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/pages");
  await page.getByLabel("Calendar: for everyone", { exact: true }).selectOption("HIDDEN");
  await page.getByLabel("Calendar: for everyone", { exact: true }).locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved\. It applies from the person's next page/).first()).toBeVisible();
  const requester = await userIdByLogin("E2E_REQ");
  await sql("INSERT INTO page_access_rules (page_key, scope, scope_id, level) VALUES ('users.collaborating', 'USER', ?, 'VIEW')", [requester]);
  await page.goto(`/superadmin/pages?person=${requester}`);
  const effective = page.getByTestId("effective-access");
  await expect(effective.getByRole("listitem").filter({ hasText: /^Calendar/ })).toContainText("Hidden");
  await expect(effective.getByRole("listitem").filter({ hasText: /^Collaborating/ })).toContainText("View only");

  await as(context, "E2E_REQ");
  await page.goto("/users");
  await expect(page.locator("aside nav").getByRole("link", { name: "Calendar" })).toHaveCount(0);
  expect((await page.request.get("/users/calendar")).status()).toBe(404);
  await page.goto("/users/collaborating");
  await expect(page.getByTestId("view-only")).toBeVisible();
  // A change on a view-only page is refused by the server.
  await page.getByText("Save these filters").click();
  await page.getByLabel("View name").fill("Should not save");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByText("Not found.").first()).toBeVisible();
  // Others aren't affected by a person's rule; the Super Admin never is.
  await as(context, "E2E_STAFF");
  await page.goto("/users/collaborating");
  await expect(page.getByTestId("view-only")).toHaveCount(0);
  await as(context, "E2E_SUPER");
  expect((await page.request.get("/users/calendar")).status()).toBe(200);
  await sql("DELETE FROM page_access_rules");
});

test("inactivity signs everyone out (the Super Admin too, v1.12.1) and the signed-out page says why", async ({ page, context }) => {
  await sql("INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value) VALUES ('auth.idle_timeout_minutes', 'AUTHENTICATION', 'NUMBER', FALSE, '5') ON DUPLICATE KEY UPDATE value = '5'");
  await as(context, "E2E_REQ");
  const status = await (await page.request.get("/api/auth/status")).json();
  expect(status).toMatchObject({ signedIn: true });
  expect(status.idleSecondsLeft).toBeGreaterThan(200);
  expect(status.idleSecondsLeft).toBeLessThanOrEqual(300);
  // Looking at the status doesn't count as activity.
  const requester = await userIdByLogin("E2E_REQ");
  await sql("UPDATE user_sessions SET last_seen_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 MINUTE) WHERE user_id = ? AND revoked_at IS NULL", [requester]);
  expect(await (await page.request.get("/api/auth/status")).json()).toMatchObject({ signedIn: false, reason: "idle" });
  await page.goto("/users/queue");
  await expect(page).toHaveURL(/\/signed-out\?reason=idle/);
  await expect(page.getByRole("heading", { name: "Signed out after inactivity" })).toBeVisible();
  await expect(page.getByText(/no activity for 5 minutes/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fusers");
  // The ended session stays ended even if activity starts again.
  await sql("UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE user_id = ?", [requester]);
  expect(await (await page.request.get("/api/auth/status")).json()).toMatchObject({ signedIn: false, reason: "idle" });

  await as(context, "E2E_SUPER");
  const superAdmin = await userIdByLogin("E2E_SUPER");
  expect((await (await page.request.get("/api/auth/status")).json()).idleSecondsLeft).toBeGreaterThan(200);
  await sql("UPDATE user_sessions SET last_seen_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 MINUTE) WHERE user_id = ? AND revoked_at IS NULL", [superAdmin]);
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/signed-out\?reason=idle/);
});
