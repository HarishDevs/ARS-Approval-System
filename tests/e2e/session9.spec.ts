import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// Session 9 layout: one account menu at the top right holds the space
// switch and Sign out; phones get the sidebar as a drawer.
test("the account menu shows the space and switches to another", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/users");
  const menuButton = page.getByRole("button", { name: /Account menu for/ });
  await expect(menuButton).toContainText("Central Management System");
  await menuButton.click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByText("Switch space")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await menu.getByRole("menuitem", { name: /Admin/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("button", { name: /Account menu for/ })).toContainText("Admin");
  await expect(page.getByRole("link", { name: /Users & roles/ }).first()).toBeVisible();
});

test("on a phone the sidebar opens as a drawer", async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await context.addCookies([await sessionCookie("E2E_STAFF")]);
  await page.goto("/users");
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await drawer.getByRole("button", { name: "My Approvals" }).click();
  await drawer.getByRole("link", { name: "My pending requests" }).click();
  await expect(page).toHaveURL(/\/users\/requests$/);
  await expect(drawer).toBeHidden();
});
