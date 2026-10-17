import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.12.2 (D-161): the public pages Google's OAuth verification needs.
test("home, privacy policy and terms are public, link to each other, and describe the Google data use", async ({ page, context }) => {
  await context.clearCookies();
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "ARS Approvals" })).toBeVisible();
  await expect(page.getByText(/calendar\.events/)).toBeVisible();
  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Limited Use disclosure" })).toBeVisible();
  await expect(page.getByText("https://www.googleapis.com/auth/calendar.calendarlist.readonly")).toBeVisible();
  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms of use" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
  // The sign-in page links to both.
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
});

test("a signed-in person opening the home page goes to their space", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/users$/);
});
