import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie } from "./db";
import { createProject } from "./work-helpers";

// D-215 / D-216 / D-217: Task & Project Management through the real screens:
// a project with sections, inline add, list, board, calendar with a holiday,
// the task page (subtasks, comments with a mention, likes), My Tasks, Home,
// search, and Admin → Task holidays.
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const projectName = `E2E plant upgrade ${stamp}`;
let projectUrl = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("a project: create it, add tasks inline, see them in list, board and timeline", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/projects");
  // D-223: the Tasks pages are the sidebar's "Tasks & projects" group (open on its pages).
  await expect(page.getByTestId("nav-group-Tasks & projects").getByRole("link", { name: "All projects" })).toHaveAttribute("aria-current", "page");
  projectUrl = await createProject(page, projectName);
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const add = page.getByRole("rowgroup", { name: "To do" }).getByLabel("Add a task");
  await add.fill(`Survey the site ${stamp}`);
  await add.press("Enter");
  await expect(page.getByTestId("task-row").filter({ hasText: `Survey the site ${stamp}` })).toBeVisible();
  await add.fill(`Collect quotes ${stamp}`);
  await add.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(2);

  await page.goto(`${projectUrl}?view=board`);
  await expect(page.getByTestId("board-card").filter({ hasText: `Collect quotes ${stamp}` })).toBeVisible();
  await page.getByRole("checkbox", { name: `Complete Collect quotes ${stamp}` }).click();
  await expect(page.getByTestId("board-card").filter({ hasText: `Collect quotes ${stamp}` })).toHaveCount(0);
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByTestId("show-completed").check();
  await expect(page.getByRole("checkbox", { name: `Reopen Collect quotes ${stamp}` })).toBeVisible();

  await page.goto(`${projectUrl}?view=overview`);
  await page.getByLabel("At risk").check();
  await page.getByLabel("Headline").fill("Vendor quotes are late");
  await page.getByRole("button", { name: "Post status update" }).click();
  await expect(page.getByTestId("status-update").first()).toContainText("Vendor quotes are late");
});

test("the task page: a subtask, a comment that mentions someone, a like", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(projectUrl);
  await page.getByTestId("task-row").filter({ hasText: `Survey the site ${stamp}` }).getByRole("link").first().click();
  // D-219: it opens in the pane beside the list, then on its own page.
  await expect(page).toHaveURL(/\?.*task=\d+/);
  await expect(page.getByTestId("task-pane")).toContainText(projectName);
  await page.getByTestId("task-pane").getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(/\/users\/tasks\/\d+$/);

  const subtask = page.getByLabel(/Add a subtask/);
  await subtask.fill(`East bay ${stamp}`);
  await subtask.press("Enter");
  await expect(page.getByTestId("subtasks")).toContainText(`East bay ${stamp}`);

  await page.getByRole("textbox", { name: "Add a comment" }).fill("Please check the drawings ");
  await page.getByRole("combobox", { name: "Mention someone" }).first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByTestId("comment").first()).toContainText("Please check the drawings");
  await expect(page.getByRole("textbox", { name: "Add a comment" })).toHaveValue("");
  await expect(page.getByTestId("comment").first().locator("span.rounded")).toHaveCount(1); // the mention chip

  await page.getByRole("button", { name: "Like", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Liked/ }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/work-task-page.png", fullPage: true });
});

test("My Tasks, Task home and Task search show the work", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/my-tasks");
  await expect(page.getByRole("heading", { level: 1, name: "My Tasks" })).toBeVisible();
  await expect(page.getByTestId("my-grid")).toContainText(`Survey the site ${stamp}`);
  await expect(page.getByRole("rowgroup", { name: "Recently assigned" })).toBeVisible();
  await page.goto("/users/work/my-tasks?view=board");
  await expect(page.getByTestId("my-board")).toBeVisible();

  // D-236: Task home is part of Home; its old address leads there.
  await page.goto("/users/work");
  await expect(page).toHaveURL(/\/users\?home=tasks$/);
  await expect(page.getByRole("heading", { level: 1, name: /My Work/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Projects" }).getByRole("link", { name: new RegExp(projectName) })).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest status updates" })).toContainText("Vendor quotes are late");

  await page.goto(`/users/work/search?q=${stamp}&status=all`);
  await expect(page.getByTestId("work-search-results")).toContainText(`Survey the site ${stamp}`);
  await page.getByLabel("Save this search as").fill(`E2E search ${stamp}`);
  await page.getByRole("button", { name: "Save" }).click();
  // v1.51.1: saved searches are offered in the search bar at the top (Ctrl K).
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.reload();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("saved-searches")).toContainText(`E2E search ${stamp}`);
});

test("a due date on a holiday: the warning offers to keep it or move it", async ({ page, context }) => {
  // A Wednesday about two months ahead becomes a holiday for this test.
  const base = new Date(Date.now() + 60 * 86_400_000);
  while (base.getUTCDay() !== 3) base.setUTCDate(base.getUTCDate() + 1);
  const day = base.toISOString().slice(0, 10);
  const next = new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
  const conn = await db();
  try {
    await conn.query("INSERT IGNORE INTO holidays (holiday_on, name) VALUES (?, ?)", [day, `E2E holiday ${stamp}`]);
    await as(context, "E2E_REQ");
    await page.goto(projectUrl);
    const due = page.getByLabel(`Due date of Survey the site ${stamp}`);
    await due.fill(day);
    await due.blur();
    const prompt = page.getByTestId("holiday-prompt");
    await expect(prompt).toContainText(`E2E holiday ${stamp}`);
    await page.screenshot({ path: "test-results/work-holiday-prompt.png" });
    await prompt.getByRole("button", { name: `Move to ${next}` }).click();
    await expect(prompt).not.toBeVisible();
    // The new date is saved once the list shows it.
    await expect(page.getByLabel(`Due date of Survey the site ${stamp}`)).toHaveValue(next);
    await expect.poll(async () => {
      const [rows] = await conn.query("SELECT DATE_FORMAT(DATE_ADD(due_at, INTERVAL 330 MINUTE), '%Y-%m-%d') AS d FROM tasks WHERE title = ?", [`Survey the site ${stamp}`]);
      return (rows as { d: string }[])[0]?.d;
    }).toBe(next);
    await page.goto(`${projectUrl}?view=calendar&month=${day.slice(0, 7)}`);
    await expect(page.getByTestId("calendar-holiday").filter({ hasText: `E2E holiday ${stamp}` })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: next })).toContainText(`Survey the site ${stamp}`);
  } finally {
    await conn.query("DELETE FROM holidays WHERE holiday_on = ? AND name = ?", [day, `E2E holiday ${stamp}`]);
    await conn.end();
  }
});

test("Admin → Task holidays: rules are saved; the sidebar lists the new task pages", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/task-holidays");
  await expect(page.getByRole("heading", { level: 1, name: "Task settings" })).toBeVisible();
  await page.getByLabel("Don't allow: people must choose a working day").check();
  await page.getByRole("form", { name: "Task holiday settings" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved. Task dates are checked/)).toBeVisible();
  await page.getByLabel("Warn, and let people keep the date or move it").check();
  await page.getByRole("form", { name: "Task holiday settings" }).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved. Task dates are checked/)).toBeVisible();

  await page.waitForLoadState("networkidle");
  await page.goto("about:blank");
  await as(context, "E2E_REQ");
  await page.goto("/users/work");
  // D-221 / D-223: one "Tasks & projects" group in the sidebar, and + Create at its top.
  await expect(page.locator("aside nav").getByRole("button", { name: "Tasks & projects" })).toBeVisible();
  await expect(page.locator("aside nav").getByRole("link", { name: "Task home" })).toHaveCount(0);
  const create = page.getByTestId("create-menu");
  await expect(async () => {
    if ((await create.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")) !== "true") await create.getByRole("button", { name: "Create" }).click();
    await expect(create.getByRole("menuitem", { name: /Approval request/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(create.getByRole("menuitem", { name: /Project/ })).toBeVisible();
  await create.getByRole("menuitem", { name: /^Task/ }).click();
  await expect(page.getByTestId("create-dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/sidebar-create.png" });
});
