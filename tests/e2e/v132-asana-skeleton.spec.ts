import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie } from "./db";
import { createProject } from "./work-helpers";

// D-219 (owner: "tick mark wherever possible… periodical tasks and ad hoc
// tasks… all the projects… the skeleton that matches Asana"): the left bar
// with every project, Create task (ad hoc or periodic), the task pane with
// Mark complete, ticks in the older task tables and the Periodic list.
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const projectName = `E2E skeleton ${stamp}`;

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("the sidebar's Tasks & projects group; + Create → Task makes a periodic task that opens in the pane", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await createProject(page, projectName);
  // D-223 (owner): the Tasks bar's pages sit in the sidebar; no second bar.
  await expect(page.getByTestId("work-rail")).toHaveCount(0);
  // D-307: Tasks and Projects are separate groups.
  for (const [name, labels] of [["Tasks", ["Task Summary", "Assigned to me", "Assigned by me", "Periodic tasks"]], ["Projects", ["All projects", "New project", "Templates"]]] as const) {
    const group = page.getByTestId(`nav-group-${name}`);
    // A group folds when you are on another group's page: open it first.
    const toggle = group.getByRole("button", { name, exact: true });
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    for (const label of labels) await expect(group.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  const create = page.getByTestId("create-menu");
  await expect(async () => {
    if ((await create.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")) !== "true") await create.getByRole("button", { name: "Create" }).click();
    await expect(create.getByRole("menuitem", { name: /^Task/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await create.getByRole("menuitem", { name: /^Task/ }).click();
  const dialog = page.getByTestId("create-dialog");
  await dialog.getByLabel("Task name").fill(`Weekly stock count ${stamp}`);
  // D-220: the Draft task panel: "For <assignee> in <project>", then Repeat.
  await dialog.getByRole("button", { name: /^Project:/ }).click();
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByRole("button", { name: "Repeat (periodic)" }).click();
  await dialog.getByLabel(/Periodic \(repeats/).check();
  await dialog.getByLabel("Mon").check();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page).toHaveURL(/\/users\/work\/projects\/\d+\?task=\d+/);
  const pane = page.getByTestId("task-pane");
  await expect(pane).toContainText(`Weekly stock count ${stamp}`);
  await expect(pane).toContainText("Periodic: Every week on Mon");
  await expect(page.getByTestId("task-row").filter({ hasText: `Weekly stock count ${stamp}` }).getByLabel("Periodic")).toBeVisible();
  await page.screenshot({ path: "test-results/asana-skeleton.png" });

  // Esc closes the pane; Q opens Create task.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Escape");
  await expect(pane).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(page.getByTestId("create-dialog")).toBeVisible();
  await page.getByTestId("create-dialog").getByLabel("Task name").fill(`One-off audit ${stamp}`);
  await page.getByTestId("create-dialog").getByRole("button", { name: "Create task" }).click();
  await expect(page.getByTestId("task-pane")).toContainText("Ad hoc");
});

test("Mark complete in the pane; periodic tasks list; search by periodic or ad hoc", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/periodic");
  const row = page.getByTestId("periodic-table").getByRole("row").filter({ hasText: `Weekly stock count ${stamp}` });
  await expect(row).toContainText("Every week on Mon");
  await row.getByRole("link", { name: `Weekly stock count ${stamp}` }).click();
  const pane = page.getByTestId("task-pane");
  await pane.getByTestId("mark-complete").click();
  await expect(pane.getByTestId("mark-complete")).toContainText("Completed");
  // The next one of the series is made.
  await expect.poll(async () => {
    const conn = await db();
    try {
      const [rows] = await conn.query("SELECT COUNT(*) AS n FROM tasks WHERE title = ? AND deleted_at IS NULL", [`Weekly stock count ${stamp}`]);
      return Number((rows as { n: number }[])[0]!.n);
    } finally {
      await conn.end();
    }
  }).toBe(2);

  await page.goto(`/users/work/search?q=${stamp}&status=all&kind=periodic`);
  await expect(page.getByTestId("work-search-results")).toContainText(`Weekly stock count ${stamp}`);
  await expect(page.getByTestId("work-search-results")).not.toContainText(`One-off audit ${stamp}`);
  await page.goto(`/users/work/search?q=${stamp}&status=all&kind=adhoc`);
  await expect(page.getByTestId("work-search-results")).toContainText(`One-off audit ${stamp}`);
  await expect(page.getByTestId("work-search-results")).not.toContainText(`Weekly stock count ${stamp}`);
});

test("ticks in the older task table and on the task page", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/tasks");
  const table = page.getByTestId("task-table");
  const tick = table.getByRole("checkbox", { name: `Complete One-off audit ${stamp}` });
  await expect(tick).toBeVisible();
  await tick.click();
  await expect(table.getByRole("checkbox", { name: `Complete One-off audit ${stamp}` })).toHaveCount(0);
  await expect.poll(async () => {
    const conn = await db();
    try {
      const [rows] = await conn.query("SELECT status FROM tasks WHERE title = ?", [`One-off audit ${stamp}`]);
      return (rows as { status: string }[])[0]?.status;
    } finally {
      await conn.end();
    }
  }).toBe("COMPLETED");
  await page.goto(`/users/tasks?tab=completed&q=${encodeURIComponent(`One-off audit ${stamp}`)}`);
  const reopen = page.getByTestId("task-table").getByRole("checkbox", { name: `Reopen One-off audit ${stamp}` });
  await expect(reopen).toBeVisible();
  await page.getByTestId("task-table").getByRole("link", { name: `One-off audit ${stamp}` }).click();
  await expect(page.getByTestId("mark-complete")).toContainText("Completed");
  await page.getByTestId("mark-complete").click();
  await expect(page.getByTestId("mark-complete")).toContainText("Mark complete");
});
