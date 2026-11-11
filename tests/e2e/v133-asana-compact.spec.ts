import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";
import { pickPerson } from "./people";

// D-220 (owner's Asana screenshots): the compact table with Filters, Sort,
// Groups, Options and saved tabs; Share for projects and tasks; the Draft
// task panel; New project step by step; Save as template from the menu.
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const projectName = `E2E compact ${stamp}`;
let projectUrl = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("New project step by step: details with a Board view and own sections", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/projects");
  await page.getByTestId("create-project").click();
  await expect(page.getByRole("heading", { name: "Create a new project" })).toBeVisible();
  await page.getByRole("button", { name: /Blank project/ }).click();
  await page.getByLabel("Project name", { exact: true }).fill(projectName);
  await page.getByText("Board", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Add sections to get started" })).toBeVisible();
  await page.getByLabel("Section 1", { exact: true }).fill("Backlog");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/users\/work\/projects\/\d+\?created=1/);
  projectUrl = page.url().split("?")[0]!;
  await expect(page.getByTestId("board")).toBeVisible(); // opens as a board
  await expect(page.getByRole("region", { name: "Backlog" })).toBeVisible();
  await page.screenshot({ path: "test-results/compact-new-project-board.png" });
});

test("the table: Filters with quick filters, Groups by assignee, a saved tab", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(`${projectUrl}?view=list`);
  const add = page.getByRole("rowgroup", { name: "Backlog" }).getByLabel("Add a task");
  for (const title of [`Draft budget ${stamp}`, `Call vendor ${stamp}`]) {
    await add.fill(title);
    await add.press("Enter");
    await expect(page.getByTestId("task-row").filter({ hasText: title })).toBeVisible();
  }
  const grid = page.getByTestId("project-grid");
  await expect(grid.getByRole("columnheader", { name: "#" })).toBeVisible();
  // Filters: quick filter "Due this week" hides undated tasks; the button counts it.
  await grid.getByTestId("filter-menu").locator("summary").click();
  await grid.getByRole("button", { name: "Due this week" }).click();
  await expect(grid.getByTestId("filter-menu").locator("summary")).toContainText("Filters: 1");
  await expect(grid.getByTestId("task-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(grid.getByTestId("task-row")).toHaveCount(2);
  // Groups: by assignee, with the person's group header.
  await grid.getByTestId("group-menu").locator("summary").click();
  await grid.getByTestId("group-menu").getByLabel("Assignee").check();
  await expect(grid.getByRole("rowgroup", { name: "Ravi Requester" })).toBeVisible();
  await page.screenshot({ path: "test-results/compact-grid.png" });
  // Options → Save as a new tab.
  page.once("dialog", (dialog) => void dialog.accept(`By person ${stamp}`));
  await grid.getByRole("group").first().press("Escape").catch(() => undefined);
  await grid.locator("summary", { hasText: "Options" }).click();
  await grid.getByRole("button", { name: /Save as a new tab/ }).click();
  await expect(page.getByTestId("view-tabs").getByRole("link", { name: `By person ${stamp}` })).toHaveAttribute("aria-current", "page");
  await expect(grid.getByRole("rowgroup", { name: "Ravi Requester" })).toBeVisible();
});

test("Share a project and a task", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(projectUrl);
  await page.getByTestId("share-project").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toContainText(`Share ${projectName}`);
  await dialog.getByLabel("Add people or a department").selectOption({ label: "Sita Staff - E2E_STAFF" });
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(dialog.getByRole("list", { name: "Who has access" })).toContainText("Sita Staff");
  await dialog.getByLabel("Who can see this project").selectOption("ORGANISATION");
  await expect(page.getByText("Saved.").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copy project link" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.goto(`${projectUrl}?view=list`);
  await page.getByTestId("task-row").filter({ hasText: `Draft budget ${stamp}` }).getByRole("link").first().click();
  const pane = page.getByTestId("task-pane");
  await pane.getByTestId("share-task").click();
  const taskDialog = page.getByTestId("share-dialog");
  await pickPerson(page, taskDialog.getByRole("button", { name: /^Add a collaborator/ }), "Sita Staff");
  await taskDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(taskDialog.getByRole("list", { name: "Collaborators" })).toContainText("Sita Staff");
  await expect(taskDialog.getByRole("button", { name: "Copy task link" })).toBeVisible();
});

test("Save as template from the project's menu; it appears under Use a template", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(projectUrl);
  await page.getByRole("button", { name: `Actions for ${projectName}` }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  const dialog = page.getByTestId("save-template-dialog");
  await dialog.getByLabel("Save as a template named").fill(`Compact template ${stamp}`);
  await dialog.getByRole("button", { name: "Save as template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Compact template ${stamp}` })).toBeVisible();
  await page.goto("/users/work/projects/new");
  await page.getByRole("button", { name: /Use a template/ }).click();
  await expect(page.getByText(`Compact template ${stamp}`)).toBeVisible();
});

test("D-222: an ad hoc task for two people; Project permissions", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(projectUrl);
  // + Create (sidebar) → Task → two people.
  const create = page.getByTestId("create-menu");
  await expect(async () => {
    if ((await create.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")) !== "true") await create.getByRole("button", { name: "Create" }).click();
    await expect(create.getByRole("menuitem", { name: /^Task/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await create.getByRole("menuitem", { name: /^Task/ }).click();
  const draft = page.getByTestId("create-dialog");
  await draft.getByLabel("Task name").fill(`Count stock ${stamp}`);
  // D-224: Myself is the default; Others searches people by name.
  await expect(draft.getByRole("radio", { name: "Myself" })).toHaveAttribute("aria-checked", "true");
  await draft.getByRole("radio", { name: "Others" }).click();
  const search = draft.getByRole("combobox", { name: "Search people" });
  await search.fill("sita");
  // The people found (the panel also has the Priority list).
  await expect(draft.getByRole("listbox", { name: "People" }).getByRole("option")).toHaveCount(1);
  await search.press("Enter");
  await search.fill("manoj man");
  await draft.getByRole("option", { name: "Manoj Manager" }).click();
  await expect(draft.getByTestId("assignee-chip")).toHaveCount(2);
  await draft.getByRole("button", { name: "Create task" }).click();
  // D-246 (audit UI-D04): a task only for others opens on its own page.
  await expect(page).toHaveURL(/\/users\/tasks\/\d+$/);
  await expect(page.getByTestId("assign-group")).toContainText(/Sita Staff|Manoj Manager/);

  // Project permissions: restrict Due date to project admins.
  await page.goto(`${projectUrl}/settings#permissions`);
  const panel = page.getByTestId("permissions");
  await panel.getByLabel("Add restriction").selectOption({ label: "Due date" });
  await panel.getByLabel("Who can share tasks from this project with other projects?").selectOption("OWNER");
  await panel.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.getByText("Permissions saved.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("permissions").getByRole("list", { name: "Field restrictions" })).toContainText("Due date");
});

