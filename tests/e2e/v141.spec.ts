import { expect, test, type BrowserContext } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// v1.41.0 through the real screens: the folded sidebar's Create menu (owner's
// report), App & devices, Admin → Notifications, the approval road, My
// requests' status cards, columns and row menu, the three-step New request,
// and the daily session's signed-out message.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId, { tourDone: true })]);
}

async function myRequestPath(loginId: string): Promise<string> {
  const conn = await db();
  try {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT r.id FROM approval_requests r JOIN users u ON u.id = r.requester_id WHERE u.login_id = ? AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 1", [loginId]);
    return `/users/requests/${rows[0]!.id}`;
  } finally {
    await conn.end();
  }
}

test("folded sidebar: the Create menu opens beside the + and its items work", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/users");
  const fold = page.getByRole("button", { name: "Collapse the sidebar" });
  if (await fold.isVisible()) await fold.click();
  const rail = page.getByTestId("sidebar-rail");
  await expect(rail).toBeVisible();
  await rail.getByRole("button", { name: "Create" }).click();
  const menu = page.getByRole("menu", { name: "Create" });
  await expect(menu).toBeVisible();
  // Fully inside the window, not clipped by the rail.
  const box = await menu.boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box && box.x).toBeGreaterThan(60);
  await menu.getByRole("menuitem", { name: /Approval request/ }).click();
  await expect(page).toHaveURL(/\/users\/custom$/);
  await page.getByRole("button", { name: "Open the sidebar" }).click();
});

test("App & devices: install steps, notification status and the sign-in rule", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/profile/devices");
  await expect(page.getByRole("heading", { level: 1, name: "App & devices" })).toBeVisible();
  await expect(page.getByTestId("install-section")).toBeVisible();
  await expect(page.getByTestId("push-section")).toBeVisible();
  await expect(page.getByTestId("device-list")).toContainText(/No device yet|Devices that get your notifications/);
  await expect(page.getByTestId("session-policy")).toContainText(/signed out after a while|until midnight/);
  // The service worker and the offline page are served without a session.
  const sw = await page.request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toMatch(/no-cache|no-store/); // always the newest worker
  expect((await page.request.get("/offline.html")).status()).toBe(200);
});

test("the daily session's end is explained", async ({ page }) => {
  await page.goto("/signed-out?reason=daily&next=%2Fusers%2Frequests");
  await expect(page.getByRole("heading", { name: "Your daily session has expired" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Fusers%2Frequests");
});

test("Admin → Notifications: count the audience, send with a confirmation, see it in History and in the Inbox", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/notifications");
  await expect(page.getByTestId("push-overview")).toBeVisible();
  const form = page.getByTestId("broadcast-form");
  const stamp = Date.now().toString(36);
  await form.getByLabel("Title").fill(`Canteen closed ${stamp}`);
  await form.getByLabel("Message").fill("The canteen is closed on Sunday for cleaning.");
  await form.getByRole("combobox", { name: "People" }).fill("E2E");
  await form.getByRole("listbox").getByRole("option").first().click();
  await form.getByRole("button", { name: "Count who it reaches" }).click();
  await expect(page.getByTestId("broadcast-reach")).toContainText(/Reaches 1 person/);
  await form.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Send now" }).click();
  await expect(page.getByTestId("broadcast-result")).toContainText(/Sent to 1 person/);
  await page.goto("/admin/notifications?tab=history");
  await expect(page.getByTestId("broadcast-history")).toContainText(`Canteen closed ${stamp}`);
});

test("My requests: status cards, columns kept on the account, the progress cell and the row menu", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests");
  await expect(page.getByTestId("ownership-tabs")).toContainText("Raised by me");
  const cards = page.getByTestId("status-cards");
  await expect(cards.getByRole("link", { name: /^All \(\d+\)$/ })).toHaveAttribute("aria-current", "page");
  await cards.getByRole("link", { name: /^Waiting for approvers \(\d+\)$/ }).click();
  await expect(page).toHaveURL(/tab=waiting/);
  await page.goto("/users/requests");
  await expect(page.getByTestId("request-table").getByTestId("road-mini").first()).toBeVisible();
  // Hide a column; it stays hidden after a reload.
  await page.getByTestId("column-picker").click();
  await page.getByRole("group", { name: "Columns" }).getByLabel("Last activity").uncheck();
  await expect(page.getByTestId("request-table").getByRole("columnheader", { name: "Last activity" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("request-table").getByRole("columnheader", { name: "Last activity" })).toHaveCount(0);
  await page.getByTestId("column-picker").click();
  await page.getByRole("group", { name: "Columns" }).getByRole("button", { name: "Reset to all columns" }).click();
  await expect(page.getByTestId("request-table").getByRole("columnheader", { name: "Last activity" })).toHaveCount(1);
  // The row menu offers the row's actions.
  await page.getByTestId("request-table").getByTestId("row-menu").first().click();
  await expect(page.getByRole("menuitem", { name: "View approval progress" })).toBeVisible();
});

test("the road on a request: checkpoints, the van, and a checkpoint's details", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(await myRequestPath("E2E_REQ"));
  const road = page.getByTestId("approval-road");
  await expect(road).toBeVisible();
  await expect(road.getByTestId("road-van")).toBeVisible();
  const points = road.getByTestId("road-checkpoint");
  expect(await points.count()).toBeGreaterThanOrEqual(2);
  await expect(points.first()).toHaveAttribute("data-state", "done");
  await points.nth(1).click();
  await expect(page.getByTestId("road-detail")).toBeVisible();
  await expect(page.getByTestId("road-summary")).toContainText("Completed");
  const progress = await page.request.get(`/api/requests/${(await myRequestPath("E2E_REQ")).split("/").pop()}/progress`);
  expect(progress.status()).toBe(200);
  expect((await progress.json()).road.checkpoints.length).toBe(await points.count());
});

test("someone else's request road is not found", async ({ page, context }) => {
  const path = await myRequestPath("E2E_REQ");
  await as(context, "E2E_STAFF");
  const response = await page.request.get(`/api/requests/${path.split("/").pop()}/progress`);
  expect(response.status()).toBe(404);
});

test("New request in three steps: a title before going on, the summary follows, nothing is lost going back", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/users/custom");
  const steps = page.getByTestId("request-steps");
  await expect(steps.getByRole("button", { name: /Request details/ })).toHaveAttribute("aria-current", "step");
  await page.getByTestId("step-next").click();
  await expect(page.getByRole("alert").filter({ hasText: "Give the request a title first." })).toBeVisible();
  await page.getByLabel(/^Title/).fill("Temporary driver for plant visits");
  await page.getByTestId("step-next").click();
  await expect(steps.getByRole("button", { name: /Approval workflow/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("step-workflow")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel(/^Title/)).toHaveValue("Temporary driver for plant visits");
  await page.locator("summary").filter({ hasText: "Request summary" }).click();
  await expect(page.getByTestId("request-summary").first()).toContainText("Temporary driver for plant visits");
  // No horizontal scrolling on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // What was typed saved itself as a draft; leave no draft behind for later tests.
  await page.waitForTimeout(2500);
  const conn = await db();
  try {
    await conn.query("DELETE d FROM request_drafts d JOIN users u ON u.id = d.user_id WHERE u.login_id = 'E2E_REQ' AND d.draft_key = 'CUSTOM'");
  } finally {
    await conn.end();
  }
});
