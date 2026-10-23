import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie } from "./db";

// v1.11.0 through the real screens: the Super Admin's Google Calendar page
// (secret never shown back, not enabled until tested), the person's
// Calendar tab, and the calendar's month / week / day views with personal
// entries. Google itself is never called here.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const SECRET = "e2e-secret-value-not-real-12345";

test.afterAll(async () => {
  const conn = await db();
  try {
    await conn.query("UPDATE gcal_settings SET enabled = FALSE, client_id = NULL, client_secret_enc = NULL, last_test_ok = NULL, config_json = JSON_OBJECT() WHERE id = 1");
  } finally {
    await conn.end();
  }
});

test("Super Admin sets up Google Calendar; the secret is stored but never shown again", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin");
  await page.locator("aside nav").getByRole("link", { name: "Integrations" }).click();
  await page.getByRole("link", { name: "Google Calendar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Google Calendar" })).toBeVisible();
  await expect(page.getByTestId("gcal-redirect")).toContainText("/api/integrations/google-calendar/callback");
  await page.getByLabel("Client ID").fill("123456789012-e2etest.apps.googleusercontent.com");
  await page.getByLabel("Client secret").fill(SECRET);
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText(/new client secret is stored encrypted/)).toBeVisible();
  await page.reload();
  expect(await page.content()).not.toContain(SECRET);
  await expect(page.getByText("Saved (encrypted, hidden)")).toBeVisible();
  await expect(page.getByText("Not configured").first()).toBeVisible(); // not tested yet, so not enabled
  await expect(page.getByTestId("gcal-history")).toContainText("credentials rotated");
});

test("nobody else reaches the Super Admin integration page", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  expect((await page.goto("/superadmin/integrations/google-calendar"))?.status()).toBe(404);
});

test("a person's Calendar tab says when the integration is off", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/profile");
  await page.getByRole("navigation", { name: "Profile" }).getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByTestId("gcal-unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Google Account" })).toHaveCount(0);
});

// v1.12.6 (D-165): behind the host's proxy the server sees itself as
// localhost, so the redirects back to the Calendar tab must be relative.
test("connect and callback send people back with a relative address, never the server's own", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  for (const path of ["/api/integrations/google-calendar/connect", "/api/integrations/google-calendar/callback?state=x&code=y"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toMatch(/^\/users\/profile\/calendar\?error=[A-Z_]+$/);
  }
});

test("calendar: add a personal entry, see it by day, week and month, edit and delete it", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/calendar?view=day&date=2031-05-14");
  await expect(page.getByRole("heading", { level: 2, name: "Wednesday, 14 May 2031", exact: true })).toBeVisible();
  await page.getByText("Add a personal entry").click();
  await page.getByLabel("Title").fill("E2E site visit");
  await page.getByLabel("Starts").fill("10:30");
  await page.getByLabel("Ends").fill("11:00");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Added to your calendar.")).toBeVisible();
  const list = page.getByTestId("calendar-list");
  await expect(list).toContainText("E2E site visit");
  await expect(list).toContainText("10:30");
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "week" }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("region", { name: /14 May/ })).toContainText("E2E site visit");
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "month" }).click();
  await expect(page).not.toHaveURL(/view=week/);
  await expect(page.getByRole("heading", { level: 2, name: "May 2031", exact: true })).toBeVisible();
  // Filters: hiding Personal hides it.
  await page.getByRole("link", { name: /^Personal/ }).click();
  await expect(page.locator("main")).not.toContainText("E2E site visit");
  await page.getByRole("link", { name: /^Personal/ }).click();
  await page.goto("/users/calendar?view=day&date=2031-05-14");
  await page.getByTestId("calendar-list").getByRole("link", { name: "E2E site visit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E site visit" })).toBeVisible();
  const itemUrl = page.url();
  await page.getByLabel("Title").fill("E2E site visit (moved)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page.getByTestId("calendar-list")).toContainText("E2E site visit (moved)");
  // Someone else can't open it.
  await as(context, "E2E_STAFF");
  expect((await page.goto(itemUrl))?.status()).toBe(404);
  await as(context, "E2E_REQ");
  await page.goto(itemUrl);
  await page.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/users\/calendar$/);
  await page.goto("/users/calendar?view=day&date=2031-05-14");
  await expect(page.locator("main")).not.toContainText("E2E site visit");
});
