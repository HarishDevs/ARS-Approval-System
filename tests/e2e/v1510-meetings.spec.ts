import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// v1.51.0 (D-300, D-301): Meeting Management in the browser. The Coordinator
// (Ravi) schedules with Manoj as Meeting Owner, sends the points, Manoj
// approves, Ravi runs the meeting and sends the MOM, Manoj approves it and
// the action item becomes a task linked to the meeting.
test.describe.configure({ mode: "serial" });

let meetingPath = "";
const title = `Production IDM ${Date.now().toString(36)}`;

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function pick(page: Page, label: string, search: string, option: RegExp) {
  const box = page.getByRole("combobox", { name: label, exact: true });
  await box.fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

test("the Coordinator schedules a meeting; people are chosen by search", async ({ page, context }) => {
  test.setTimeout(120_000);
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/meetings");
  await expect(page.getByRole("heading", { name: "Meetings", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Schedule a meeting" }).click();
  await expect(page).toHaveURL(/\/users\/meetings\/new$/);
  await page.locator("#mtg-title").fill(title);
  await page.locator("#mtg-type").selectOption({ label: "IDM (Inter Department Meeting)" });
  await pick(page, "Meeting Owner", "Manoj", /Manoj Manager/);
  await pick(page, "Participants", "Sita", /Sita Staff/);
  await page.locator("#mtg-points").fill("Production review\nDespatch plan");
  await page.screenshot({ path: "test-results/v1510-schedule.png", fullPage: true });
  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page).toHaveURL(/\/users\/meetings\/\d+\?scheduled=1/);
  meetingPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByTestId("meeting-participants")).toContainText("Manoj Manager");
  await expect(page.getByTestId("meeting-participants")).toContainText("Sita Staff");
  await page.getByRole("button", { name: "Send to Meeting Owner" }).click();
  await expect(page.getByText(/for approval/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/v1510-points-sent.png", fullPage: true });
});

test("only the Meeting Owner approves the points", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/meetings?tab=approve");
  await expect(page.getByTestId("meeting-list")).toContainText(title);
  await page.goto(meetingPath);
  await page.getByRole("button", { name: "Approve points" }).click();
  await expect(page.getByText(/approved and shared/).first()).toBeVisible();
  await expect(page.getByTestId("meeting-points")).toContainText("Despatch plan");
});

test("the Coordinator runs the meeting and sends the MOM with an action item", async ({ page, context }) => {
  test.setTimeout(120_000);
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(meetingPath);
  await page.getByRole("button", { name: "Start meeting" }).click();
  await expect(page.getByRole("heading", { name: "Minutes of meeting (MOM)" })).toBeVisible();
  await page.getByLabel("Attendance of Sita Staff").selectOption("PRESENT");
  await page.getByLabel("1. Production review").fill("Output up 4% this week.");
  await page.getByRole("button", { name: "Add a decision" }).click();
  await page.getByLabel("Decision 1", { exact: true }).fill("Second shift from Monday");
  await page.getByRole("button", { name: "Add an action item" }).click();
  await page.getByLabel("Action 1", { exact: true }).fill("Hire two operators");
  await pick(page, "Responsible", "Sita", /Sita Staff/);
  await page.screenshot({ path: "test-results/v1510-mom.png", fullPage: true });
  await page.getByRole("button", { name: "Send MOM to Meeting Owner" }).click();
  await expect(page.getByText(/MOM sent to/).first()).toBeVisible();
});

test("the Owner approves the MOM; the action item becomes a task linked to the meeting", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(meetingPath);
  await page.getByRole("button", { name: "Approve MOM" }).click();
  await page.getByRole("form", { name: "Approve MOM" }).getByRole("button", { name: "Approve MOM" }).click();
  await expect(page.getByText(/are now tasks/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("meeting-actions")).toContainText("Hire two operators");
  await page.screenshot({ path: "test-results/v1510-approved.png", fullPage: true });
  const connection = await db();
  let taskId = 0;
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT t.id FROM tasks t JOIN meetings m ON m.id = t.meeting_id WHERE m.title = ? AND t.title = 'Hire two operators'", [title]);
    taskId = Number(rows[0]?.id ?? 0);
  } finally {
    await connection.end();
  }
  expect(taskId).toBeGreaterThan(0);
  // The task page links back to its meeting.
  await as(context, "E2E_STAFF");
  await page.goto(`/users/tasks/${taskId}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.goto("/users/meetings/follow-ups?view=mine");
  await expect(page.getByTestId("follow-up-table")).toContainText("Hire two operators");
});

test("someone not on the meeting gets not found; the dashboard and phone view render", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.setViewportSize({ width: 1440, height: 900 });
  // v1.51.1 (owner): the dashboard is Home → Meetings; the old address opens it.
  await page.goto("/users/meetings/dashboard");
  await expect(page).toHaveURL(/\/users\?home=meetings/);
  await expect(page.getByRole("heading", { name: "Meeting Overview" })).toBeVisible();
  await expect(page.getByTestId("home-focus").getByRole("link", { name: "Meetings" })).toHaveAttribute("aria-current", "page");
  for (const part of ["meeting-tiles", "meeting-attention", "meeting-insights", "meeting-figures", "meeting-kpis"]) await expect(page.getByTestId(part)).toBeVisible();
  await expect(page.getByTestId("sidebar").getByRole("link", { name: "Meeting dashboard" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/v1510-dashboard.png", fullPage: true });
  await page.goto("/admin/meetings");
  await expect(page.getByRole("heading", { name: "Meeting settings" })).toBeVisible();
  await page.screenshot({ path: "test-results/v1510-admin.png", fullPage: true });
  await as(context, "E2E_HOD");
  const response = await page.goto(meetingPath);
  expect(response?.status()).toBe(404);
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(meetingPath);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/v1510-phone.png", fullPage: true });
});

test("Users & roles: tick several people and give them a module at once", async ({ page, context }) => {
  const connection = await db();
  const ids: number[] = [];
  try {
    const tag = Date.now().toString(36);
    for (const n of [1, 2]) {
      const [row] = await connection.query<RowDataPacket[] & { insertId: number }>(
        "INSERT INTO users (login_id, name, email, sign_in_method, active, module_access) VALUES (?, ?, ?, 'GOOGLE', TRUE, 'APPROVAL')",
        [`BULKMOD${n}${tag}`, `Bulk Module ${n} ${tag}`, `bulkmod${n}${tag}@example.test`],
      );
      ids.push(Number((row as unknown as { insertId: number }).insertId));
    }
    await connection.query("INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'USER' WHERE u.id IN (?)", [ids]);
    await as(context, "E2E_ADMIN");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/users?q=Bulk+Module&status=all`);
    for (const id of ids) await page.locator(`input[name="ids"][value="${id}"]`).check();
    await page.getByTestId("bulk-modules").click();
    await page.getByRole("group", { name: "Modules for the selected users" }).getByLabel("Meeting").check();
    await page.getByRole("group", { name: "Modules for the selected users" }).getByLabel("Task").check();
    await page.screenshot({ path: "test-results/v1511-bulk-modules.png", fullPage: true });
    await page.getByRole("button", { name: "Apply to 2" }).click();
    await expect(page.getByText(/Modules changed for 2 of 2 users/)).toBeVisible();
    const [rows] = await connection.query<RowDataPacket[]>("SELECT module_access FROM users WHERE id IN (?) ORDER BY id", [ids]);
    expect(rows.map((row) => row.module_access)).toEqual(["APPROVAL,TASK,MEETING", "APPROVAL,TASK,MEETING"]);
  } finally {
    if (ids.length) {
      await connection.query("DELETE FROM user_roles WHERE user_id IN (?)", [ids]);
      await connection.query("DELETE FROM audit_logs WHERE entity_type = 'USER' AND entity_id IN (?)", [ids.map(String)]).catch(() => undefined);
      await connection.query("UPDATE users SET active = FALSE WHERE id IN (?)", [ids]);
    }
    await connection.end();
  }
});
