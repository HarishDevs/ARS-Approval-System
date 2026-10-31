import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-229 collapsible sidebar, D-230 profile and photo, D-231 notification
// control centre, D-232 universal search (owner's Asana screenshots).
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}
// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("the sidebar folds into a rail and opens again; the choice is kept", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/users");
  const sidebar = page.getByTestId("sidebar");
  await page.getByTestId("sidebar-toggle").click();
  await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  await expect(page.getByTestId("sidebar-rail").getByRole("link", { name: "Calendar" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
  // A group's icon opens the sidebar with that group open.
  await page
    .getByTestId("sidebar-rail")
    .getByRole("button", { name: /My Approvals/ })
    .click();
  await expect(page.getByTestId("sidebar")).not.toHaveAttribute("data-collapsed", "true");
  await expect(page.locator("aside nav").getByRole("link", { name: "New request" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("sidebar")).not.toHaveAttribute("data-collapsed", "true");
});

test("profile: photo upload and removal, About me, every master detail; a colleague's card", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/profile");
  const details = page.getByTestId("profile-details");
  for (const label of ["User ID", "Designation", "Department", "Head of department", "Reporting manager", "Modules", "How you sign in", "Member since"])
    await expect(details.getByText(label, { exact: true })).toBeVisible();
  await page.getByLabel("Your photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Photo saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("menu-photo")).toBeVisible();
  const src = await page.getByTestId("menu-photo").getAttribute("src");
  expect((await page.request.get(src!)).headers()["content-type"]).toBe("image/png");
  // Not an image: refused.
  await page.getByLabel("Your photo").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await expect(page.getByText("Use a JPEG, PNG or WebP photo.")).toBeVisible();
  await page.getByLabel("About me").fill("I raise purchase requests for the plant.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  // Others see the card (not the sign-in details).
  const me = await userIdByLogin("E2E_REQ");
  await as(context, "E2E_STAFF");
  await page.goto(`/users/people/${me}`);
  await expect(page.getByTestId("person-card")).toContainText("I raise purchase requests for the plant.");
  await expect(page.getByTestId("person-card")).not.toContainText("User ID");
  // Remove the photo again.
  await as(context, "E2E_REQ");
  await page.goto("/users/profile");
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByTestId("menu-photo")).toHaveCount(0);
});

test("notification control centre: one kind off, Do not disturb, kept after reload", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/notifications/settings");
  const center = page.getByTestId("notification-center");
  await expect(center.getByTestId("channel-INAPP")).toBeVisible();
  await expect(center.getByLabel("Work waiting for you in the app")).toBeDisabled();
  await center.getByLabel("Your request is approved by WhatsApp").uncheck();
  await center.getByLabel("Pause notifications").selectOption("1h");
  await center.getByLabel("Do not notify me from").check();
  await center.getByLabel("Quiet from").fill("20:00");
  await center.getByLabel("Quiet to").fill("08:00");
  await center.getByText("Sun", { exact: true }).click();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your request is approved by WhatsApp")).not.toBeChecked();
  await expect(page.getByLabel("Your request is rejected by WhatsApp")).toBeChecked();
  await expect(page.getByTestId("dnd-paused")).toBeVisible();
  await expect(page.getByLabel("Quiet from")).toHaveValue("20:00");
  // Resume and undo, so other tests get every message.
  await page.getByLabel("Pause notifications").selectOption("resume");
  await page.getByLabel("Do not notify me from").uncheck();
  await page.getByText("Sun", { exact: true }).click();
  await page.getByLabel("Your request is approved by WhatsApp").check();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  const conn = await db();
  try {
    const [rows] = await conn.query("SELECT value FROM user_settings WHERE user_id = ? AND setting_key = 'notify.dnd'", [await userIdByLogin("E2E_REQ")]);
    expect(JSON.parse((rows as { value: string }[])[0]!.value)).toEqual({ pausedUntil: null, quiet: null, daysOff: [] });
  } finally {
    await conn.end();
  }
});

test("universal search: chips, people, saved searches and Filters", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  await page.getByTestId("search-bar").click();
  const panel = page.getByTestId("search-panel");
  await expect(panel.getByTestId("saved-searches")).toContainText("Tasks I've created");
  await panel.getByRole("button", { name: "People" }).click();
  await panel.getByRole("combobox").fill("Sita");
  await panel.getByRole("option", { name: /Sita Staff/ }).click();
  await expect(page).toHaveURL(/\/users\/people\/\d+$/);
  await expect(page.getByTestId("person-card")).toContainText("Sita Staff");
  // Filters: tasks assigned to me, due in the next 7 days → the task search.
  await page.keyboard.press("Control+k");
  await panel.getByTestId("search-filters").click();
  await panel.getByLabel("Type", { exact: true }).selectOption("task");
  await panel.getByLabel("Assigned to").selectOption("me");
  await panel.getByLabel("Due date").selectOption("week");
  await panel.getByLabel("Add filter").selectOption("priority");
  await panel.getByLabel("Priority").selectOption("HIGH");
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/users\/work\/search\?.*assignee=me/);
  await expect(page).toHaveURL(/priority=HIGH/);
  await expect(page).toHaveURL(/due_from=\d{4}-\d{2}-\d{2}/);
});
