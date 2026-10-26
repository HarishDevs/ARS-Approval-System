import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.12.2 (D-161): the public pages Google's OAuth verification needs.
test("home, privacy policy and terms are public, link to each other, and describe the Google data use", async ({ page, context }) => {
  await context.clearCookies();
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  // D-200: the split screen, Google-safe: the name, purpose, features and Google data use on the page itself.
  await expect(page).toHaveTitle("ARS-CMS | ARS Steels");
  await expect(page.getByRole("heading", { level: 1, name: "ARS-CMS" })).toBeVisible();
  await expect(page.getByTestId("landing-purpose")).toContainText("raise and approve requests");
  await expect(page.getByRole("main").getByText(/Multi-level approvals/)).toBeVisible();
  await expect(page.getByRole("main").getByText(/Google data is never sold/)).toBeVisible();
  await expect(page.getByRole("region", { name: "About ARS-CMS" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
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
