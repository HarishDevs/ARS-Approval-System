import { expect, test, type BrowserContext } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, sessionCookie, userIdByLogin } from "./db";

// v1.9.0 through the real screens: IT sets up a task type (form, publish);
// a task is created, started and completed; information is published, read
// and acknowledged; the bell dropdown and the notification views; the
// sidebar scrolls on its own only when its entries don't fit.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function sql<T extends RowDataPacket[] | ResultSetHeader>(text: string, params: unknown[] = []): Promise<T> {
  const conn = await db();
  try {
    return (await conn.query<T>(text, params))[0];
  } finally {
    await conn.end();
  }
}

const stamp = Date.now().toString(36).toUpperCase();
let taskTypeUrl = "";

test("IT sets up a task type: form field, options, preview, publish", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await page.locator("aside nav").getByRole("link", { name: "Task types" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Task types" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(`E2E repair ${stamp}`);
  await page.getByLabel("Code", { exact: true }).fill(`E2E_REPAIR_${stamp}`);
  await page.getByRole("button", { name: "Create type" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Draft version 1" })).toBeVisible();
  taskTypeUrl = page.url().split("?")[0]!;
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field label").last().fill("Machine");
  await page.getByLabel("Field type").last().selectOption("MULTI_CHOICE");
  for (const option of ["Pump", "Motor"]) {
    await page.getByLabel(/New option for Machine/).fill(option);
    await page.getByRole("button", { name: "Add option" }).click();
  }
  await page.getByText("Show in lists").last().click();
  await page.getByLabel("Completion evidence").selectOption("NOTE");
  await page.getByRole("button", { name: "Preview the form" }).click();
  await expect(page.getByRole("region", { name: "Preview of the form" }).getByText("Pump")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/Draft saved\. It passes every check/)).toBeVisible();
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByText(/Version 1 is live/)).toBeVisible();
  await expect(page.getByTestId("type-history")).toContainText("Published");
});

test("a task is created, started and completed with its note; the assignee hears through the bell", async ({ page, context }) => {
  const staff = await userIdByLogin("E2E_STAFF");
  await as(context, "E2E_REQ");
  await page.goto("/users");
  // D-221: the sidebar has one "Tasks & projects" entry; typed tasks start from its bar.
  await page.locator("aside nav").getByRole("link", { name: "Tasks & projects" }).click();
  await page.getByTestId("work-rail").getByRole("link", { name: "Task with a type (form)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /New task/ })).toBeVisible();
  await page.goto(`/users/tasks/new?type=${taskTypeUrl.split("/").pop()}`);
  await expect(page.getByRole("heading", { level: 1, name: `New task: E2E repair ${stamp}` })).toBeVisible();
  await page.getByLabel("Title").fill("Pump 3 leaks");
  await page.getByLabel("Assign to").selectOption(String(staff));
  await page.getByLabel("Priority").selectOption("HIGH");
  await page.getByLabel("Pump").check();
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pump 3 leaks" })).toBeVisible();
  await expect(page.getByText(/created and .* was told/)).toBeVisible();
  const taskUrl = page.url().split("?")[0]!;

  await as(context, "E2E_STAFF");
  await page.goto("/users");
  await page.getByTestId("notification-bell").click();
  const dropdown = page.getByTestId("notification-dropdown");
  await expect(dropdown).toBeVisible();
  await dropdown.getByRole("tab", { name: /Tasks/ }).click();
  await expect(dropdown.getByTestId("notification-items").getByRole("button").first()).toContainText("Pump 3 leaks");
  await expect(dropdown.getByTestId("notification-items").getByRole("button").first()).toContainText("Task");
  await dropdown.getByTestId("notification-items").getByRole("button").first().click();
  await expect(page).toHaveURL(taskUrl);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("record-history")).toContainText("Started");
  await page.getByRole("button", { name: "Complete" }).click();
  await page.getByLabel("Completion note").fill("Replaced the seal");
  await page.getByRole("form", { name: "Complete" }).getByRole("button", { name: "Complete" }).click();
  await expect(page.getByTestId("record-history")).toContainText("Completed");
  await expect(page.getByText("Replaced the seal").first()).toBeVisible();
  await expect(page.getByTestId("record-history")).toContainText("Completed");

  // A stranger can't open it.
  await as(context, "E2E_HOD");
  expect((await page.request.get(taskUrl)).status()).toBe(404);
});

test("information is published, read (not acknowledged) and acknowledged", async ({ page, context }) => {
  const sender = await userIdByLogin("E2E_MGR");
  const settings = { access: { mode: "EVERYONE", departmentIds: [], userIds: [] }, allowPeople: true, allowDepartments: true, allowGroups: true, allowEveryone: false, ack: "ALWAYS", ackReminderDays: null, defaultPriority: "NORMAL", expiryDays: null, editableAfterPublish: false };
  const type = await sql<ResultSetHeader>("INSERT INTO module_types (module, code, name, created_by) VALUES ('INFO', ?, ?, ?)", [`E2E_NOTICE_${stamp}`, `E2E notice ${stamp}`, sender]);
  await sql("INSERT INTO module_type_versions (type_id, version_no, status, form_json, settings_json, created_by, published_by, published_at) VALUES (?, 1, 'PUBLISHED', '[]', ?, ?, ?, CURRENT_TIMESTAMP)", [type.insertId, JSON.stringify(settings), sender, sender]);

  await as(context, "E2E_MGR");
  await page.goto(`/users/information/new?type=${type.insertId}`);
  await page.getByLabel("Subject").fill("Fire drill on Friday");
  await page.getByLabel("Message").fill("Assemble at gate 2 at 11:00.");
  const picker = page.getByRole("combobox", { name: /People/ });
  const requester = await userIdByLogin("E2E_REQ");
  const [found] = await sql<RowDataPacket[]>("SELECT name FROM users WHERE id = ?", [requester]);
  const name = String(found?.name ?? "");
  await picker.fill(String(name).slice(0, 6));
  await page.getByRole("option", { name: new RegExp(String(name)) }).first().click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published to 1 person/)).toBeVisible();
  const infoUrl = page.url().split("?")[0]!;
  await expect(page.getByTestId("recipient-table")).toContainText("Not yet");

  await as(context, "E2E_REQ");
  await page.goto("/users/information?tab=unread");
  await page.getByTestId("info-table").getByRole("link", { name: /Fire drill on Friday/ }).click();
  await expect(page.getByTestId("ack-status")).toContainText("Please read this and press Acknowledge");
  const [read] = await sql<RowDataPacket[]>("SELECT read_at, acknowledged_at FROM info_recipients WHERE user_id = ? AND info_id = ?", [requester, Number(infoUrl.split("/").pop())]);
  expect(read!.read_at).not.toBeNull();
  expect(read!.acknowledged_at).toBeNull();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByTestId("ack-status")).toContainText("You acknowledged this");

  await as(context, "E2E_MGR");
  await page.goto(infoUrl);
  await expect(page.getByTestId("recipient-table")).not.toContainText("Not yet");
});

test("the bell shows at most 10, newest first; Read more opens the matching view without marking read", async ({ page, context }) => {
  const staff = await userIdByLogin("E2E_STAFF");
  for (let i = 1; i <= 12; i += 1) await sql("INSERT INTO notifications (event_type, category, user_id, title, message) VALUES ('INFO_PUBLISHED', 'INFORMATION', ?, ?, 'Bell test')", [staff, `Bell item ${String(i).padStart(2, "0")}`]);
  await as(context, "E2E_STAFF");
  await page.goto("/users");
  await page.getByTestId("notification-bell").click();
  const items = page.getByTestId("notification-items").getByRole("button");
  await expect(items).toHaveCount(10);
  await expect(items.first()).toContainText("Bell item 12");
  await page.getByTestId("notification-dropdown").getByRole("tab", { name: /Information/ }).click();
  await expect(items.first()).toContainText("Information");
  const [before] = await sql<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [staff]);
  await page.getByRole("link", { name: "Read more" }).click();
  await expect(page).toHaveURL(/\/users\/notifications\?type=information/);
  await expect(page.getByRole("heading", { level: 1, name: "Information notifications" })).toBeVisible();
  const [after] = await sql<RowDataPacket[]>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", [staff]);
  expect(Number(after!.n)).toBe(Number(before!.n));
  await page.getByTestId("notification-views").getByRole("link", { name: /Tasks/ }).click();
  await expect(page).toHaveURL(/type=tasks/);
});

test("the sidebar stays put and scrolls only when its entries don't fit", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto("/users/tasks");
  const scroller = page.getByTestId("sidebar-scroll");
  const tall = await scroller.evaluate((element) => ({ overflow: getComputedStyle(element).overflowY, fits: element.scrollHeight <= element.clientHeight }));
  expect(tall).toEqual({ overflow: "auto", fits: true });
  await page.setViewportSize({ width: 1280, height: 520 });
  // With every group open the entries no longer fit: the sidebar scrolls.
  for (const group of ["My Approvals", "Information"]) await page.locator("aside nav").getByRole("button", { name: group }).click();
  const short = await scroller.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(short).toBe(true);
  // The page scrolls; the sidebar stays in view (Help is a long page).
  await page.goto("/users/help");
  await page.evaluate(() => window.scrollTo(0, 400));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const top = await page.getByTestId("sidebar").evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBe(0);
  // Every entry can still be reached.
  await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.locator("aside nav").getByRole("link", { name: "New information" })).toBeInViewport();
});

test("the user sidebar: Overview, collapsible My Approvals, Tasks & projects, Information, then Search, Calendar, Analytics", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users");
  const nav = page.locator("aside nav");
  // Top-level order.
  const top = await nav.evaluate((element) =>
    Array.from(element.children).map((child) => (child.querySelector(":scope > button") ?? child).textContent?.trim().replace(/\s+/g, " ") ?? ""),
  );
  expect(top.map((text) => text.replace(/\s*\d+( waiting)?$/, ""))).toEqual(["Overview", "My Approvals", "Tasks & projects", "Information", "Search", "Calendar", "Analytics"]);
  // A group opens like a dropdown, with its pages in the owner's order.
  const approvals = nav.getByRole("button", { name: "My Approvals" });
  await expect(approvals).toHaveAttribute("aria-expanded", "false");
  await expect(nav.getByRole("link", { name: "New request" })).toBeHidden();
  await approvals.click();
  await expect(approvals).toHaveAttribute("aria-expanded", "true");
  const links = await page.getByTestId("nav-group-My Approvals").getByRole("link").allTextContents();
  expect(links.map((text) => text.replace(/\d+ waiting$/, "").trim())).toEqual(["New request", "My pending requests", "My approved requests", "Waiting for me", "Approved by me", "Collaborating", "Request templates"]);
  // The choice is remembered on the next page.
  await nav.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/users\/search/);
  await expect(page.locator("aside nav").getByRole("button", { name: "My Approvals" })).toHaveAttribute("aria-expanded", "true");
  // The group holding the current page opens by itself and marks it.
  await page.goto("/users/information/sent");
  await expect(page.locator("aside nav").getByRole("button", { name: "Information" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("aside nav").getByRole("link", { name: "Sent by me" })).toHaveAttribute("aria-current", "page");
  // Closing a group hides its pages; keyboard works (Enter on the header).
  await page.locator("aside nav").getByRole("button", { name: "Information" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("aside nav").getByRole("link", { name: "Sent by me" })).toBeHidden();
});

test.afterAll(async () => {
  if (taskTypeUrl) await sql("UPDATE module_types SET active = FALSE WHERE id = ?", [Number(taskTypeUrl.split("/").pop())]);
});
