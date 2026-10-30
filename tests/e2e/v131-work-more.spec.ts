import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie } from "./db";
import { createProject } from "./work-helpers";

// D-218 through the real screens: project fields in the List, bulk changes,
// a repeating task, save as template and a project from it, the task inbox,
// the morning summary switch, and Admin → Task settings.
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const projectName = `E2E close ${stamp}`;
let projectUrl = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("a project field shows as a List column and takes a value; two tasks change at once", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/projects");
  projectUrl = await createProject(page, projectName);
  const add = page.getByRole("rowgroup", { name: "To do" }).getByLabel("Add a task");
  for (const title of [`Reconcile bank ${stamp}`, `Close ledgers ${stamp}`]) {
    await add.fill(title);
    await add.press("Enter");
    await expect(page.getByTestId("task-row").filter({ hasText: title })).toBeVisible();
  }

  await page.goto(`${projectUrl}/settings`);
  await page.getByLabel("Field name").fill("Plant");
  await page.getByLabel("Kind", { exact: true }).selectOption("SELECT");
  await page.getByLabel("Choices (one per line)").fill("Raipur\nBilaspur");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByRole("list", { name: "Fields" })).toContainText("Plant");

  await page.goto(projectUrl);
  await expect(page.getByRole("columnheader", { name: "Plant" })).toBeVisible();
  await page.getByLabel(`Plant of Reconcile bank ${stamp}`).selectOption("Raipur");
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByLabel(`Plant of Reconcile bank ${stamp}`)).toHaveValue("Raipur");

  await page.getByLabel(`Select Reconcile bank ${stamp}`).check();
  await page.getByLabel(`Select Close ledgers ${stamp}`).check();
  const bar = page.getByTestId("bulk-bar");
  await expect(bar).toContainText("2 selected");
  await bar.getByLabel("Do").selectOption("PRIORITY");
  await bar.getByLabel("Priority").selectOption("HIGH");
  await bar.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByLabel(`Priority of Close ledgers ${stamp}`)).toHaveValue("HIGH");
  await expect(page.getByLabel(`Priority of Reconcile bank ${stamp}`)).toHaveValue("HIGH");
  await page.screenshot({ path: "test-results/work-fields-bulk.png" });
});

test("a repeating task makes its next one when completed", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(projectUrl);
  await page.getByTestId("task-row").filter({ hasText: `Close ledgers ${stamp}` }).getByRole("link").first().click();
  // D-219: the task pane has the Repeats box too.
  const repeat = page.getByTestId("task-pane").getByTestId("repeat");
  await repeat.getByRole("button", { name: "Make it repeat" }).click();
  await repeat.getByLabel("Repeat unit").selectOption("MONTHLY");
  await repeat.getByRole("button", { name: "Save" }).click();
  await expect(repeat).toContainText("Every month");
  await page.goto(projectUrl);
  await page.getByRole("checkbox", { name: `Complete Close ledgers ${stamp}` }).click();
  await expect.poll(async () => {
    const conn = await db();
    try {
      const [rows] = await conn.query("SELECT COUNT(*) AS n FROM tasks WHERE title = ? AND status = 'OPEN' AND deleted_at IS NULL", [`Close ledgers ${stamp}`]);
      return Number((rows as { n: number }[])[0]!.n);
    } finally {
      await conn.end();
    }
  }).toBe(1);
  await page.goto(projectUrl);
  await expect(page.getByTestId("task-row").filter({ hasText: `Close ledgers ${stamp}` })).toHaveCount(1);
});

test("save as template, then a new project from it", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(`${projectUrl}/settings`);
  await page.getByLabel("Save as a template named").fill(`E2E close template ${stamp}`);
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `E2E close template ${stamp}` })).toBeVisible();
  await expect(page.getByTestId("template-tasks")).toContainText(`Reconcile bank ${stamp}`);

  await page.goto("/users/work/projects?show=templates");
  await expect(page.getByTestId("template-list")).toContainText(`E2E close template ${stamp}`);
  // D-220: New project → Use a template (step by step).
  await page.goto("/users/work/projects/new");
  await page.getByRole("button", { name: /Use a template/ }).click();
  await page.getByText(`E2E close template ${stamp}`).click();
  await page.getByLabel("Project name", { exact: true }).fill(`E2E December close ${stamp}`);
  await page.getByRole("button", { name: "Create from template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `E2E December close ${stamp}` })).toBeVisible();
  await expect(page.getByTestId("task-row").filter({ hasText: `Reconcile bank ${stamp}` })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Plant" })).toBeVisible();
});

test("the task inbox: archive a notice; the morning summary switch", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/inbox");
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  const inbox = page.getByTestId("inbox");
  if ((await inbox.count()) > 0) {
    const first = inbox.getByRole("listitem").first();
    const title = (await first.locator("p").first().innerText()).trim();
    await first.getByRole("button", { name: "Archive" }).click();
    await page.goto("/users/work/inbox?tab=archive");
    await expect(page.getByTestId("inbox")).toContainText(title);
  }
  await page.goto("/users/work/my-tasks");
  const toggle = page.getByLabel("Morning summary email");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByText("Morning summary switched off.")).toBeVisible();
  await page.getByLabel("Morning summary email").check();
  await expect(page.getByText("You'll get the morning summary.")).toBeVisible();
});

test("Admin → Task settings: a department holiday, the summary and repeating tasks", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/task-holidays");
  await expect(page.getByRole("heading", { level: 1, name: "Task settings" })).toBeVisible();
  const day = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  const form = page.getByRole("form", { name: "Add a department holiday" });
  await form.getByLabel("Department").selectOption({ index: 1 });
  await form.getByLabel("Date").fill(day);
  await form.getByLabel("Name").fill(`E2E shutdown ${stamp}`);
  await form.getByRole("button", { name: "Add department holiday" }).click();
  const row = page.getByTestId("department-holiday").filter({ hasText: `E2E shutdown ${stamp}` });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);

  const extras = page.getByRole("form", { name: "Morning summary and repeating tasks" });
  await extras.getByLabel("Summary hour").selectOption("8");
  await extras.getByRole("button", { name: "Save" }).click();
  await expect(extras.getByText("Saved.")).toBeVisible();
  await extras.getByLabel("Summary hour").selectOption("9");
  await extras.getByRole("button", { name: "Save" }).click();
  await expect(extras.getByText("Saved.")).toBeVisible();
});
