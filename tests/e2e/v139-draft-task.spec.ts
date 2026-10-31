import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { db, sessionCookie, userIdByLogin } from "./db";

// D-238 (owner's Asana screenshots): the Draft task's toolbar: + (more),
// Formatting, Emoji, @mention, Attach a file or paste an image, the due date
// and repeat, collaborators beside Create task, and "/" for the menu. The
// panel is taller than wide and grows a step at a time with the screen.
const stamp = Date.now().toString(36);

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}
async function openDraft(page: Page) {
  const create = page.getByTestId("create-menu");
  await expect(async () => {
    if ((await create.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")) !== "true") await create.getByRole("button", { name: "Create" }).click();
    await expect(create.getByRole("menuitem", { name: /^Task/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await create.getByRole("menuitem", { name: /^Task/ }).click();
  const dialog = page.getByTestId("create-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}
async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const conn = await db();
  try {
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  } finally {
    await conn.end();
  }
}

test("the panel is taller than wide and steps up with the screen", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const sizes: { width: number; height: number }[] = [];
  for (const viewport of [
    { width: 900, height: 800 },
    { width: 1366, height: 900 },
    { width: 1700, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/users/work/my-tasks");
    const box = (await (await openDraft(page)).boundingBox())!;
    expect(box.height).toBeGreaterThan(box.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height - 32 + 1);
    sizes.push({ width: Math.round(box.width), height: Math.round(box.height) });
    await page.getByTestId("create-dialog").getByRole("button", { name: "Close" }).click();
  }
  expect(sizes[0]!.width).toBeLessThan(sizes[1]!.width);
  expect(sizes[1]!.width).toBeLessThan(sizes[2]!.width);
  expect(sizes[0]!.height).toBeLessThan(sizes[2]!.height);
  expect(sizes[2]!.width).toBeLessThanOrEqual(600);
});

test("formatting, / menu, emoji, @mention, a file and a collaborator reach the task", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/users/work/my-tasks");
  const dialog = await openDraft(page);
  const title = `Draft tools ${stamp}`;
  await dialog.getByLabel("Task name").fill(title);
  const description = dialog.getByLabel("Description");

  // "/" opens the menu; typing filters it; Enter runs the command.
  await description.click();
  await description.pressSequentially("Steps /bul");
  await expect(dialog.getByTestId("slash-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog.getByTestId("slash-menu")).toHaveCount(0);
  await expect(description).toHaveValue("- Steps ");
  await description.pressSequentially("count the coils");

  // The Formatting bar wraps a placeholder in bold.
  await dialog.getByRole("button", { name: "Formatting" }).click();
  await page.keyboard.press("End");
  await description.press("End");
  await description.pressSequentially("\n");
  await dialog.getByTestId("format-bar").getByRole("button", { name: "Bold" }).click();
  await expect(description).toHaveValue(/\*\*bold text\*\*/);

  // Emoji.
  await description.press("End");
  await dialog.getByRole("button", { name: "Emoji", exact: true }).click();
  await dialog.getByTestId("emoji-picker").getByRole("button", { name: "Insert 👍" }).click();
  await expect(description).toHaveValue(/👍/);

  // Typing @ opens the people search; the pick goes in as @Name.
  await description.press("End");
  await description.pressSequentially(" ask @");
  const mention = dialog.getByRole("combobox", { name: "Search people to mention" });
  await expect(mention).toBeFocused();
  await mention.fill("Manoj");
  await dialog.getByRole("option", { name: /Manoj Manager/ }).click();
  await expect(description).toHaveValue(/ask @Manoj Manager/);

  // Attach a file (an image pasted is staged the same way).
  await dialog.getByLabel("Choose files to attach").setInputFiles({ name: `note-${stamp}.txt`, mimeType: "text/plain", buffer: Buffer.from("Coil count sheet") });
  await expect(dialog.getByTestId("draft-files")).toContainText(`note-${stamp}.txt`);

  // A collaborator.
  await dialog.getByRole("button", { name: "Add collaborators" }).click();
  await dialog.getByRole("combobox", { name: "Search people to add as collaborators" }).fill("Sam");
  await dialog.getByRole("option", { name: /Sam Super/ }).click();
  await expect(dialog.getByTestId("collaborator-chip")).toContainText("Sam Super");
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("button", { name: "Edit collaborators (1)" })).toBeVisible();
  await page.screenshot({ path: "test-results/draft-task-toolbar.png" });

  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page).toHaveURL(/\/users\/work\/my-tasks\?task=\d+/);
  const id = Number(new URL(page.url()).searchParams.get("task"));

  // The description keeps its formatting and the mention, shown as data.
  const pane = page.getByTestId("task-pane");
  await expect(pane.getByTestId("rich-text").locator("li")).toContainText("Steps count the coils");
  await expect(pane.getByTestId("rich-text").locator("strong")).toHaveText("bold text");
  await expect(pane.getByTestId("rich-text")).toContainText("@Manoj Manager");
  await expect(pane.getByTestId("rich-text")).not.toContainText("user:");

  // Mentioned and chosen people follow the task; the file is on it.
  const [manoj, sam] = await Promise.all([userIdByLogin("E2E_MGR"), userIdByLogin("E2E_SUPER")]);
  await expect.poll(async () => (await query<{ user_id: number }>("SELECT user_id FROM task_followers WHERE task_id = ?", [id])).map((row) => row.user_id).sort()).toEqual(expect.arrayContaining([manoj, sam]));
  await expect.poll(async () => (await query<{ n: number }>("SELECT COUNT(*) AS n FROM record_files WHERE entity_type = 'TASK' AND entity_id = ?", [id]))[0]?.n).toBe(1);
  await page.goto(`/users/tasks/${id}`);
  await expect(page.getByText(`note-${stamp}.txt`).first()).toBeVisible();
});

test("the + menu and the file limits", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/users/work/my-tasks");
  const dialog = await openDraft(page);
  await dialog.getByRole("button", { name: "More" }).click();
  const more = dialog.getByRole("menu", { name: "More" });
  await expect(more.getByRole("menuitem", { name: "Task with a form" })).toBeVisible();
  await more.getByRole("menuitem", { name: "Set a due date" }).click();
  await expect(dialog.getByRole("textbox", { name: "Due date", exact: true })).toBeVisible();
  const six = Array.from({ length: 6 }, (_, index) => ({ name: `f${index}-${stamp}.txt`, mimeType: "text/plain", buffer: Buffer.from(`file ${index}`) }));
  await dialog.getByLabel("Choose files to attach").setInputFiles(six);
  await expect(dialog.getByRole("alert")).toContainText("Attach at most 5 files.");
  await expect(dialog.getByTestId("draft-files").getByRole("listitem")).toHaveCount(5);
});
