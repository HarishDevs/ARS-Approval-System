import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-214 (owner): "check all the navigation in the Classic page to and fro,
// in and out" and "custom loaders in Classic mode and from login to the main
// page". For each role: every Central Management System entry, every module
// page, every tab, the pages outside the modules, and the way back (the
// breadcrumb and Esc); the loaders; and the ways out (spaces, Quit).
test.describe.configure({ mode: "serial" });
test.setTimeout(6 * 60_000);

const ROLES = ["E2E_REQ", "E2E_ADMIN", "E2E_SUPER"] as const;

async function classicFor(loginId: string, on: boolean) {
  const conn = await db();
  try {
    const id = await userIdByLogin(loginId);
    if (on) await conn.query("INSERT INTO user_settings (user_id, setting_key, value) VALUES (?, 'ui.workspace_view', 'CLASSIC') ON DUPLICATE KEY UPDATE value = 'CLASSIC'", [id]);
    else await conn.query("DELETE FROM user_settings WHERE user_id = ? AND setting_key = 'ui.workspace_view'", [id]);
  } finally {
    await conn.end();
  }
}

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const gatewayLinks = (page: Page) => page.getByTestId("gateway-menu").getByRole("link");
const bar = (page: Page) => page.getByTestId("classic-bar");

// Esc (pressed up to three times) always gets back to the Central Management System.
async function escapeHome(page: Page) {
  for (let i = 0; i < 3 && !(await page.getByTestId("classic-gateway").isVisible()); i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByTestId("classic-gateway")).toBeVisible();
}

test.afterAll(async () => {
  for (const role of ROLES) await classicFor(role, false);
});

for (const role of ROLES) {
  test(`${role}: every entry, module page and tab has a way in and a way back`, async ({ page, context }) => {
    await classicFor(role, true);
    await as(context, role);
    await page.goto("/users");
    const labels = (await gatewayLinks(page).allTextContents()).map((text) => text.replace(/\s*\d+ (waiting|open|unread)$/, "").trim());
    expect(labels.at(-1)).toBe("Quit (sign out)");
    if (role === "E2E_REQ") expect(labels.some((label) => /space$/.test(label))).toBe(false);
    else expect(labels).toContain("Admin space");
    if (role === "E2E_SUPER") expect(labels).toContain("Super Admin space");

    for (const label of labels.filter((item) => item !== "Quit (sign out)")) {
      await page.goto("/users");
      await gatewayLinks(page).filter({ hasText: label }).first().click();
      await page.waitForLoadState("networkidle");
      if (/space$/.test(label)) {
        // Out to another space, and back through Switch space.
        await expect(page).toHaveURL(label === "Admin space" ? /\/admin$/ : /\/superadmin$/);
        await page.getByRole("button", { name: /Account menu/ }).click();
        await page.getByRole("menuitem", { name: /My approvals/ }).click();
        await expect(page.getByTestId("classic-gateway")).toBeVisible();
        continue;
      }
      await expect(bar(page)).toBeVisible();
      await expect(bar(page).getByRole("link", { name: "Central Management System" })).toBeVisible();
      if (/\/users\/menu\//.test(page.url())) {
        // A module page: heading, tabs; each tab opens and comes back with Esc.
        await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
        const tabs = await page.getByTestId("classic-tabs").getByRole("link").allTextContents();
        const moduleUrl = page.url();
        for (const tab of tabs) {
          await page.goto(moduleUrl);
          await page.getByTestId("classic-tabs").getByRole("link", { name: tab.trim(), exact: true }).click();
          await expect(page.getByTestId("classic-tabs").getByRole("link", { name: tab.trim(), exact: true })).toHaveAttribute("aria-current", "page");
          await expect(bar(page).getByRole("link", { name: label })).toBeVisible();
          await page.locator("body").click({ position: { x: 2, y: 2 } });
          await page.keyboard.press("Escape");
          await expect(page).toHaveURL(moduleUrl);
        }
      } else {
        await expect(bar(page)).toContainText(label.replace(/ \(AI Assistant\)$/, ""));
      }
      await escapeHome(page);
    }

    // Pages outside the modules name themselves and lead back too.
    for (const path of ["/users/profile", "/users/notifications", "/users/help", "/users/security", "/users/delegation"]) {
      await page.goto(path);
      await expect(bar(page).getByTestId("classic-page-title")).not.toBeEmpty();
      await escapeHome(page);
    }
  });
}

test("a request opened from a list: its module in the breadcrumb, Esc back to the module", async ({ page, context }) => {
  await classicFor("E2E_REQ", true);
  await as(context, "E2E_REQ");
  await page.goto("/users/requests");
  const first = page.getByTestId("request-table").getByRole("link").first();
  test.skip((await first.count()) === 0, "no request to open");
  await first.click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+/);
  await expect(bar(page).getByRole("link", { name: "Approval Management" })).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/users\/menu\/approvals$/);
});

test("the Classic loader shows while a page is on its way, then goes", async ({ page, context }) => {
  await classicFor("E2E_REQ", true);
  await as(context, "E2E_REQ");
  // Page data is slowed from the start (a production build fetches tab pages ahead).
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] === "1") await new Promise((resolve) => setTimeout(resolve, 2500));
    return route.fallback();
  });
  await page.goto("/users/menu/approvals");
  await page.getByTestId("classic-tabs").getByRole("link", { name: "My approved requests" }).click();
  await expect(page.getByTestId("classic-loader")).toContainText("Opening My approved requests…");
  await page.screenshot({ path: "test-results/classic-loader.png" });
  await expect(page).toHaveURL(/\/users\/approved$/);
  await expect(page.getByTestId("classic-loader")).toHaveCount(0);
  // Esc goes back (a page already in memory opens at once) and leaves no box behind.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/users\/menu\/approvals$/);
  await expect(page.getByTestId("classic-loader")).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Quit signs out from the Central Management System", async ({ page, context }) => {
  await classicFor("E2E_REQ", true);
  await as(context, "E2E_REQ");
  await page.goto("/users");
  await gatewayLinks(page).filter({ hasText: "Quit (sign out)" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("signing in shows the ARS loader until the main page is ready", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  // The sign-in calls answer as they would; the session is the test session.
  await page.route("**/api/auth/password/start", (route) => route.fulfill({ json: { success: true, data: { challengeToken: "t", maskedNumber: "91XXXXXXXX10", expiresInSeconds: 300, resendAfterSeconds: 30 } } }));
  await page.route("**/api/auth/password/verify", async (route) => {
    await context.addCookies([await sessionCookie("E2E_REQ")]);
    return route.fulfill({ json: { success: true, data: { redirectTo: "/users" } } });
  });
  await page.route("**/users**", async (route) => {
    if (route.request().headers()["rsc"] === "1") await new Promise((resolve) => setTimeout(resolve, 1500));
    return route.fallback();
  });
  await page.getByLabel("User ID", { exact: true }).fill("e2e_req");
  await page.getByLabel("Password", { exact: true }).fill("not-used");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("WhatsApp code").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("brand-loader")).toContainText("Signing you in…");
  await page.screenshot({ path: "test-results/signin-loader.png" });
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByTestId("brand-loader")).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
