import { expect, test } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, sessionCookie, userIdByLogin } from "./db";
import { TOUR_STEPS as ALL_STEPS } from "../../features/help/tour-steps";

// D-168: the test people have no AI module, so the AI step is left out for them.
const TOUR_STEPS = ALL_STEPS.filter((step) => step.id !== "ai");

// v1.14.0 (D-167, owner): the onboarding tour through the real screens.
test.describe.configure({ mode: "serial" });

async function tourDone(loginId: string): Promise<boolean> {
  const conn = await db();
  try {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT 1 FROM user_flags WHERE user_id = ? AND flag = 'TOUR_DONE'", [await userIdByLogin(loginId)]);
    return rows.length > 0;
  } finally {
    await conn.end();
  }
}

test("opens by itself once on Overview; Next walks every step on its page; Finish saves it", async ({ page, context }) => {
  test.setTimeout(120_000);
  // v1.49.5: an approver, so every step's page is offered (a requester's tour leaves out Waiting for me and the other approver pages).
  await context.addCookies([await sessionCookie("E2E_MGR", { tourDone: false })]);
  await page.goto("/users");
  const tour = page.getByRole("dialog", { name: TOUR_STEPS[0]!.title });
  await expect(tour).toBeVisible();
  await expect(page.getByTestId("tour")).toContainText(`1 of ${TOUR_STEPS.length}`);
  await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();

  for (const [index, step] of TOUR_STEPS.entries()) {
    const card = page.getByRole("dialog", { name: step.title });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`${index + 1} of ${TOUR_STEPS.length}`);
    if (step.path) await expect(page).toHaveURL(new RegExp(`${step.path.replace(/\//g, "\\/")}$`));
    // The card is always fully on screen.
    const box = (await card.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    // On a desktop every step with a target highlights it.
    if (step.target) await expect(page.getByTestId("tour-spotlight")).toBeVisible();
    if (step.id === "calendar") await page.screenshot({ path: "test-results/v1140-tour-calendar.png" });
    await card.getByRole("button", { name: index === TOUR_STEPS.length - 1 ? "Finish" : "Next" }).click();
  }
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await expect.poll(() => tourDone("E2E_MGR")).toBe(true);

  // Done: it doesn't open by itself again, even in a new tab.
  const fresh = await context.newPage();
  await fresh.goto("/users");
  await expect(fresh.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(fresh.getByTestId("tour")).toHaveCount(0);
  await fresh.close();
});

test("Take the tour from Help and the account menu; keys move it; Esc skips and saves", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ", { tourDone: false })]);
  await page.goto("/users/help");
  await expect(page.getByTestId("tour")).toHaveCount(0); // only Overview opens it by itself
  await page.getByTestId("help-tour").getByRole("link", { name: "Take the tour" }).click();
  await expect(page.getByRole("dialog", { name: TOUR_STEPS[0]!.title })).toBeVisible();
  await expect(page).toHaveURL(/\/users$/); // ?tour=1 is cleaned up
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: TOUR_STEPS[1]!.title })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: TOUR_STEPS[0]!.title })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await expect.poll(() => tourDone("E2E_REQ")).toBe(true);

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Take the tour" }).click();
  await expect(page.getByRole("dialog", { name: TOUR_STEPS[0]!.title })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("on a phone the card sits at the bottom and the page never scrolls sideways", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_MGR", { tourDone: false })]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/users");
  const welcome = page.getByRole("dialog", { name: TOUR_STEPS[0]!.title });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "Next" }).click();
  await welcome.page().getByRole("dialog", { name: TOUR_STEPS[1]!.title }).getByRole("button", { name: "Next" }).click();
  const card = page.getByRole("dialog", { name: TOUR_STEPS[2]!.title });
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  expect(box.y + box.height).toBeLessThanOrEqual(812 - 15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/v1140-tour-phone.png" });
});
