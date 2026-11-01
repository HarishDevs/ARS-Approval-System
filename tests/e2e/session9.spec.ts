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

test("on a phone the users area has the bottom tabs; Approvals holds My requests", async ({ page, context }) => {
  // v1.43.0: the mobile layout (bottom tabs, More) replaced the phone drawer in the users area.
  await page.setViewportSize({ width: 375, height: 800 });
  await context.addCookies([await sessionCookie("E2E_STAFF")]);
  await page.goto("/users");
  const tabs = page.getByTestId("mobile-tabbar");
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await tabs.getByRole("link", { name: /Approvals/ }).click();
  await expect(page).toHaveURL(/\/users\/approvals/);
  await page.getByRole("navigation", { name: "Approval lists" }).getByRole("link", { name: /My requests/ }).click();
  await expect(page).toHaveURL(/tab=mine/);
  await expect(page.getByRole("navigation", { name: "Approval lists" }).getByRole("link", { name: /My requests/ })).toHaveAttribute("aria-current", "page");
});
