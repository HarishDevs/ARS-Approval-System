import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// The user sidebar has one "Profile" entry; Notifications, Out of office and
// Sign-in & devices are tabs on it, at their old addresses (links in emails
// and WhatsApp keep working).
test("Profile groups the personal pages as tabs, and the sidebar keeps Profile highlighted", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users/profile");

  const sidebar = page.getByRole("navigation", { name: "Main" }).first();
  for (const gone of ["Out of office", "Notifications", "Sign-in & devices"]) {
    await expect(sidebar.getByRole("link", { name: gone, exact: true })).toHaveCount(0);
  }
  await expect(sidebar.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText("User ID", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E_REQ", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/profile-desktop.png", fullPage: true });

  const tabs = page.getByRole("navigation", { name: "Profile" });
  for (const [label, path, heading] of [
    ["Notifications", "/users/notifications", "Notifications"],
    ["Out of office", "/users/delegation", "Out of office"],
    ["Sign-in & devices", "/users/security", "Sign-in & devices"],
  ] as const) {
    await tabs.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(tabs.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page).toHaveURL("/users/profile");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "test-results/profile-phone.png", fullPage: true });
});
