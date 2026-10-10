import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.6.0 Phase 4 through the real screens: keyboard in Waiting for me,
// the command palette, queue filters, instant read state with Undo, saved
// view removal with Undo, and breadcrumbs. Uses the requests left waiting
// for Harini HOD by v150.spec.ts ("E2E bulk desks").
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("WS-02 J moves to a request; A opens it and asks first, nothing is decided", async ({ page, context }) => {
  await as(context, "E2E_HOD");
  await page.goto("/users/queue");
  await expect(page.getByRole("heading", { name: "Waiting for me" })).toBeVisible();
  const first = page.locator("a[data-queue-link]:visible").first();
  await expect(first).toBeVisible();
  // As with Ctrl+K: retry until the page's shortcuts are attached.
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(first).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.keyboard.press("a");
  await expect(page).toHaveURL(/\/users\/requests\/\d+$/);
  const ask = page.getByRole("dialog", { name: "Approve this request?" });
  await expect(ask).toBeVisible();
  await expect(ask.getByLabel(/Comment/)).toBeFocused();
  // Typing in the comment never triggers shortcuts.
  await ask.getByLabel(/Comment/).fill("a c j k");
  await expect(ask).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  await expect(page.getByRole("heading", { name: "Needs your action" })).toBeVisible();
  // WS-05: breadcrumbs show where it was opened from.
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Waiting for me" })).toBeVisible();
});

test("WS-03 Ctrl+K finds a request by number and pages by name", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  const box = page.getByRole("combobox", { name: /Type a page/ });
  // The shortcut works once the page is interactive: retry until it opens
  // (a slow CI machine can be a moment behind the page load).
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(box).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await box.fill("EPR-");
  const option = page.getByRole("option", { name: /EPR-\d{4}-000001/ });
  await expect(option).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/users\/requests\/\d+$/);

  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(box).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await box.fill("out of office");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/users\/delegation$/);

  // A stranger finds nothing for the same number.
  await as(context, "E2E_STAFF");
  const response = await page.request.get("/api/me/quick?q=EPR-");
  expect((await response.json()).items).toEqual([]);
});

test("WS-01 queue filters show as chips that can be removed", async ({ page, context }) => {
  await as(context, "E2E_HOD");
  await page.goto("/users/queue?show=overdue");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await page.getByRole("link", { name: "Remove filter: Overdue" }).click();
  await expect(page).toHaveURL(/\/users\/queue$/);
  await expect(page.getByRole("link", { name: /E2E bulk desks/ }).first()).toBeVisible();
});

test("FB-03 mark all as read is instant and can be undone", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.goto("/users/notifications");
  await expect(page.getByText("Unread").first()).toBeAttached();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText(/marked as read/)).toBeVisible();
  await expect(page.getByText("Unread")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Back to unread")).toBeVisible();
  await expect(page.getByText("Unread").first()).toBeAttached();
});

test("FB-03 deleting a saved view can be undone", async ({ page, context }) => {
  const name = `E2E undo ${Date.now().toString(36)}`;
  await as(context, "E2E_REQ");
  await page.goto("/users/search?q=E2E");
  await page.getByLabel("Save this search as").fill(name);
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.getByRole("button", { name: `Delete the view ${name}` }).click();
  await expect(page.getByText(`Deleted "${name}"`)).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText(`"${name}" is back`)).toBeVisible();
  await expect(page.getByRole("link", { name })).toBeVisible();
});

// A 1×1 PNG, built in the test (nothing downloaded).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("RD-01/RD-03 the history is grouped by day, and a resubmit shows what changed", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests?q=Laptop");
  await page.getByRole("link", { name: "Laptop for the new engineer" }).first().click();
  const changes = page.getByRole("region", { name: "What changed in round 2" });
  await expect(changes).toBeVisible();
  await expect(changes).toContainText("Amount");
  await expect(changes).toContainText("82,000");
  const history = page.getByRole("region", { name: "Timeline" });
  await expect(history.getByText("Resubmitted (round 2)", { exact: true })).toBeVisible();
  await expect(history.locator("time").first()).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
});

test("RD-02 an image previews inside the page; other files only download", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests?q=desks");
  await page.getByRole("link", { name: "E2E bulk desks" }).first().click();
  await page.getByLabel("Choose files to attach").setInputFiles([
    { name: "site-photo.png", mimeType: "image/png", buffer: PNG },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("plain notes") },
  ]);
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await page.getByRole("button", { name: "Preview site-photo.png" }).click();
  const preview = page.getByRole("dialog", { name: "site-photo.png" });
  const image = preview.getByRole("img", { name: "site-photo.png" });
  await expect(image).toBeVisible();
  expect(await image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1);
  await page.keyboard.press("Escape");

  const href = await page.getByRole("link", { name: "Download notes.txt" }).getAttribute("href");
  const text = await page.request.get(`${href}?inline=1`);
  expect(text.headers()["content-disposition"]).toMatch(/^attachment;/);
  // Downloads keep their own sandbox policy too (the page policy doesn't replace it).
  expect(text.headers()["content-security-policy"]).toContain("sandbox");
  const imageHref = await page.getByRole("link", { name: "Download site-photo.png" }).getAttribute("href");
  const inline = await page.request.get(`${imageHref}?inline=1`);
  expect(inline.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(inline.headers()["content-security-policy"]).toContain("sandbox");
  // An outsider gets the same 404 for the preview as for the download.
  await as(context, "E2E_STAFF");
  expect((await page.request.get(`${imageHref}?inline=1`)).status()).toBe(404);
});
