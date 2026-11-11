import { expect, test } from "@playwright/test";
import type { ResultSetHeader } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// v1.53.0 (owner, D-307): Projects is its own module; a module not given yet
// shows as a blurred, locked "Coming soon" card on Home and Analytics, never
// its content, and its pages refuse; a page set to Hidden isn't shown at all.
test.describe.configure({ mode: "serial" });
const tag = Date.now().toString(36).toUpperCase();
const loginId = `MOD_TASKS_${tag}`;

test.beforeAll(async () => {
  const conn = await db();
  try {
    const [result] = await conn.query<ResultSetHeader>(
      "INSERT INTO users (login_id, name, email, sign_in_method, active, last_login_at, module_access) VALUES (?, ?, ?, 'GOOGLE', TRUE, CURRENT_TIMESTAMP, 'APPROVAL,TASK')",
      [loginId, `Tasks Only ${tag}`, `${loginId.toLowerCase()}@example.test`],
    );
    await conn.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [result.insertId]);
    await conn.query("INSERT INTO user_flags (user_id, flag) VALUES (?, 'ONBOARDING_DONE'), (?, 'TOUR_DONE')", [result.insertId, result.insertId]).catch(() => undefined);
  } finally {
    await conn.end();
  }
});

test("Tasks without Projects: projects are locked 'coming soon' on Home, absent from the sidebar and refused by address", async ({ page, context }) => {
  await context.addCookies([await sessionCookie(loginId, { tourDone: true })]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users?home=tasks");
  // The Projects card is a locked placeholder, not the person's projects.
  const soon = page.getByTestId("mw-projects-soon");
  await expect(soon).toBeVisible();
  await expect(soon).toContainText("Projects: coming soon");
  await expect(soon.getByRole("link")).toHaveCount(0);
  await soon.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/v1530-home.png" });
  await expect(page.getByTestId("work-quick-actions").getByRole("link", { name: "Projects" })).toHaveCount(0);
  await expect(page.getByTestId("work-quick-actions").locator('[data-coming-soon="Projects"]')).toBeVisible();
  // Meetings isn't given: the Home switch shows it locked.
  await expect(page.getByTestId("home-focus").locator('[data-coming-soon="Meetings"]')).toBeVisible();
  await expect(page.getByTestId("home-focus").getByRole("link", { name: "Meetings" })).toHaveCount(0);

  // Sidebar: the Tasks group, no Projects group; + Create offers no Project.
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar.getByTestId("nav-group-Tasks")).toBeVisible();
  await expect(sidebar.getByTestId("nav-group-Projects")).toHaveCount(0);
  await page.getByTestId("create-menu").getByRole("button", { name: "Create" }).first().click();
  await expect(page.getByRole("menuitem", { name: /^Task/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Project/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // A typed address is refused, and says it is coming soon.
  await page.goto("/users/work/projects");
  await expect(page.getByTestId("no-access")).toContainText("Projects module: coming soon");
  await page.goto("/users/work/projects/new");
  await expect(page.getByTestId("no-access")).toBeVisible();
  await page.screenshot({ path: "test-results/v1530-no-access.png" });
});

test("Analytics lists the dashboards of modules not given as 'coming soon', and the overview shows them locked", async ({ page, context }) => {
  await context.addCookies([await sessionCookie(loginId, { tourDone: true })]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/analytics?board=overview");
  const picker = page.getByTestId("board-picker");
  await expect(picker.locator("option", { hasText: "Information analytics (coming soon)" })).toBeDisabled();
  await expect(picker.locator("option", { hasText: "Meeting analytics (coming soon)" })).toBeDisabled();
  await expect(picker.locator("option", { hasText: /^Task analytics$/ })).toBeEnabled();
  const cards = page.getByTestId("analytics-coming-soon");
  await expect(cards).toContainText("Information: coming soon");
  await expect(cards).toContainText("Meeting Management: coming soon");
  await expect(cards).not.toContainText("Tasks: coming soon");
  await page.screenshot({ path: "test-results/v1530-analytics.png" });
});

test("the Super Admin is never locked out of a module", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER", { tourDone: true })]);
  await page.goto("/users?home=tasks");
  await expect(page.getByTestId("mw-projects-soon")).toHaveCount(0);
  await expect(page.locator("[data-coming-soon]")).toHaveCount(0);
});
