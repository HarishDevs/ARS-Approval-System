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
  await page.keyboard.press("j");
  const first = page.locator("a[data-queue-link]:visible").first();
  await expect(first).toBeFocused();
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
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: /Type a page/ });
  await expect(box).toBeFocused();
  await box.fill("EPR-");
  const option = page.getByRole("option", { name: /EPR-\d{4}-000001/ });
  await expect(option).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/users\/requests\/\d+$/);

  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: /Type a page/ }).fill("out of office");
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
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Back to unread")).toBeVisible();
  await expect(page.getByText("Unread").first()).toBeAttached();
});

test("FB-03 deleting a saved view can be undone", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/search?q=E2E");
  await page.getByLabel("Save this search as").fill("E2E undo view");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("link", { name: "E2E undo view" })).toBeVisible();
  await page.getByRole("button", { name: "Delete the view E2E undo view" }).click();
  await expect(page.getByText('Deleted "E2E undo view"')).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E undo view" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText('"E2E undo view" is back')).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E undo view" })).toBeVisible();
});
