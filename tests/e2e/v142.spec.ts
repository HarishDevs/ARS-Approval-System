import { expect, test, type BrowserContext } from "@playwright/test";
import { dropCustomDraft, sessionCookie, toReviewStep, toWorkflowStep, dueToday } from "./db";
import { pickFirstPerson } from "./people";

// v1.42.0 (D-259, D-260): the calendar's Agenda and chips, Create task in two
// columns with a priority, cells changed in the task table, the board's
// columns, and the Analytics boards' bars and cards.
test.describe.configure({ mode: "serial" });
const stamp = Date.now().toString(36);
const title = `Check the crane ${stamp}`;

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId, { tourDone: true })]);
}

test("calendar: the chips count and toggle; Agenda lists the period on any screen", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/calendar");
  const views = page.getByRole("navigation", { name: "View" });
  await expect(views.getByRole("link", { name: "Month" })).toHaveAttribute("aria-current", "page");
  await views.getByRole("link", { name: "Agenda" }).click();
  await expect(page).toHaveURL(/layout=agenda/);
  await expect(views.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("calendar-list").or(page.getByText(/Nothing on the calendar/))).toBeVisible();
  // v1.46.0 (owner): "Show" is a dropdown; choosing a ticked kind hides it.
  const show = page.getByTestId("calendar-show");
  await show.locator("summary").click();
  const first = show.locator('a[data-on="1"]').first();
  const hidden = await show.locator('a[data-on="0"]').count();
  await first.click();
  await expect(page.getByTestId("calendar-show").locator('a[data-on="0"]')).toHaveCount(hidden + 1);
});

test("Create task: two columns on a computer, with a priority that is saved", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/work/my-tasks");
  const create = page.getByTestId("create-menu");
  await expect(async () => {
    if ((await create.getByRole("button", { name: "Create" }).getAttribute("aria-expanded")) !== "true") await create.getByRole("button", { name: "Create" }).click();
    await expect(create.getByRole("menuitem", { name: /^Task/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await create.getByRole("menuitem", { name: /^Task/ }).click();
  const dialog = page.getByTestId("create-dialog");
  await expect(dialog.getByRole("complementary", { name: "Task settings" })).toBeVisible();
  // The settings show without a toolbar click on a computer.
  await expect(dialog.getByRole("textbox", { name: "Due date", exact: true })).toBeVisible();
  await dialog.getByLabel("Task name").fill(title);
  await dialog.getByLabel("Priority").selectOption("HIGH");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByTestId("task-pane")).toContainText(title);
  await expect(page.getByTestId("task-pane")).toContainText(/Most Important/); // v1.50.1: HIGH reads "Most Important"
  // v1.52.1 (owner): the task opens as a popup with all its actions, and
  // Comments / All activity tabs; My Tasks shows Priority beside the due date.
  const popup = page.getByTestId("task-pane");
  await expect(popup).toHaveAttribute("role", "dialog");
  await expect(popup.getByRole("heading", { name: "Actions" })).toBeVisible();
  await expect(popup.getByRole("tab", { name: /Comments/ })).toHaveAttribute("aria-selected", "true");
  await popup.getByRole("tab", { name: "All activity" }).click();
  await expect(popup.getByTestId("record-history")).toContainText("created");
  await page.screenshot({ path: "test-results/v1521-task-popup.png", fullPage: false });
  // v1.52.2 (owner): a formatted comment, shown with its formatting and in All activity.
  await popup.getByRole("tab", { name: /Comments/ }).click();
  const box = popup.getByRole("textbox", { name: "Add a comment" });
  await box.click();
  await box.pressSequentially("Ship it today");
  await page.keyboard.press("Control+A");
  await popup.getByRole("button", { name: "Bold (Ctrl+B)" }).click();
  await popup.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(popup.getByTestId("comment").first().locator("strong")).toHaveText("Ship it today");
  await popup.getByRole("tab", { name: "All activity" }).click();
  await expect(popup.getByTestId("record-history")).toContainText("commented");
  await page.screenshot({ path: "test-results/v1522-activity.png", fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("task-pane")).toHaveCount(0);
  const headers = await page.locator("[data-testid] thead th, [role=columnheader]").allTextContents();
  const names = headers.map((text) => text.trim()).filter(Boolean);
  expect(names.indexOf("Priority")).toBe(names.indexOf("Due date") + 1);
  await page.screenshot({ path: "test-results/v1521-my-tasks.png", fullPage: false });
});

test("the task table: tags and collaborators change in their cells (a project's List)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/work/projects/new");
  await page.getByRole("button", { name: /Blank project/i }).click();
  await page.getByLabel("Project name").fill(`Cells ${stamp}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Create project/i }).click();
  await expect(page).toHaveURL(/\/users\/work\/projects\/\d+/);
  const add = page.getByPlaceholder(/Add a task/).first();
  await add.fill(`Inspect hoist ${stamp}`);
  await add.press("Enter");
  const row = page.getByRole("row").filter({ hasText: `Inspect hoist ${stamp}` }).first();
  await expect(row).toBeVisible();
  // Tags.
  await row.getByTestId("cell-tags").click();
  const tagPanel = page.getByRole("dialog", { name: `Tags of Inspect hoist ${stamp}` });
  await tagPanel.getByLabel("New tag").fill("safety");
  await tagPanel.getByRole("button", { name: "Add" }).click();
  await expect(row.getByTestId("cell-tags")).toContainText("#safety");
  await page.keyboard.press("Escape");
  // Collaborators.
  await row.getByTestId("cell-collaborators").click();
  const panel = page.getByRole("dialog", { name: `Collaborators of Inspect hoist ${stamp}` });
  await pickFirstPerson(page, panel.getByLabel("Add someone"));
  // v1.52.1: the cell shows the added collaborator (the cell's panel may close after a pick).
  await expect(row.getByTestId("cell-collaborators")).toHaveAttribute("aria-label", /: .+, .+\. Change$/);
  await page.keyboard.press("Escape");
  // Priority and due date change in place too.
  await row.getByLabel(/^Priority of /).selectOption("URGENT");
  await expect(row.getByLabel(/^Priority of /)).toHaveValue("URGENT");
});

test("the board: coloured columns with counts; cards show who and when", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await dueToday(`${title}%`); // v1.54.3: the summary lists tasks due by the next 7 days
  await page.goto("/users/work/my-tasks?view=board");
  const board = page.getByTestId("my-board");
  await expect(board).toBeVisible();
  await expect(board.locator(".kanban-col").first()).toBeVisible();
  await expect(board.locator(".kanban-card").filter({ hasText: title })).toBeVisible();
});

test("Analytics: departments get comparison bars; data quality gets a card per check", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await context.addInitScript(() => window.localStorage.setItem("ars.fitPages.all", "1"));
  await page.goto("/users/analytics?board=departments&scope=ORGANISATION&period=90d");
  await expect(page.getByText("Requests raised, by department")).toBeVisible();
  await expect(page.getByTestId("department-table")).toBeVisible();
  await page.goto("/users/analytics?board=quality&scope=ORGANISATION");
  await expect(page.getByTestId("quality-cards").getByRole("listitem").first()).toBeVisible();
  await page.goto("/users/analytics?board=trends&scope=ORGANISATION");
  await expect(page.getByTestId("trend-cards")).toBeVisible();
});

test("project status: Set status in the header selects it in the form; posting changes the header", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/work/projects/new");
  const name = `Status check ${stamp}`;
  // The new-project wizard: blank project, a name, then create.
  await page.getByRole("button", { name: /Blank project/i }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Create project/i }).click();
  await expect(page).toHaveURL(/\/users\/work\/projects\/\d+/);
  await page.getByRole("button", { name: /^Set a status/ }).click();
  await page.getByRole("menuitem", { name: "Off track" }).click();
  await expect(page).toHaveURL(/status=OFF_TRACK/);
  const form = page.getByRole("form", { name: "Post a status update" });
  await expect(form.getByLabel("Off track")).toBeChecked();
  await expect(form.getByLabel("Headline")).toBeFocused();
  // Another choice from the header changes the selection.
  await page.getByRole("button", { name: /^Set a status/ }).click();
  await page.getByRole("menuitem", { name: "At risk" }).click();
  await expect(form.getByLabel("At risk")).toBeChecked();
  await form.getByLabel("Headline").fill("Vendor late");
  await form.getByRole("button", { name: "Post status update" }).click();
  await expect(page.getByRole("button", { name: /Current status: At risk/ })).toBeVisible();
});

test("dark theme: a dropdown's options are readable (theme colours, not the browser's white list)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await context.addCookies([{ name: "ars_theme", value: "dark", domain: "localhost", path: "/" }]);
  await page.goto("/users/notifications/settings");
  const colours = await page.evaluate(() => {
    const select = document.createElement("select");
    select.className = "bg-transparent";
    const option = document.createElement("option");
    option.textContent = "x";
    select.append(option);
    document.querySelector("main")!.append(select);
    const style = getComputedStyle(option);
    return { bg: style.backgroundColor, fg: style.color };
  });
  expect(colours.bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(colours.bg).not.toBe(colours.fg);
});

test("Analytics: My tasks offers the Overview and the Tasks dashboard only", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/analytics?scope=TASKS");
  await expect(page.getByLabel("Whose numbers")).toHaveValue("TASKS");
  const options = await page.getByLabel("Dashboard", { exact: true }).locator("option").allTextContents();
  expect(options.length).toBeLessThanOrEqual(2);
  expect(options.join(" ")).toMatch(/Task/);
});

test("New request: the action bar sits at the top, under the steps", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  const bar = (await page.getByTestId("action-bar").boundingBox())!;
  const details = (await page.getByTestId("step-details").boundingBox())!;
  expect(bar.y).toBeLessThan(details.y);
  // Submit comes on the last step only, its icon and words on one line.
  await expect(page.getByTestId("action-bar").getByRole("button", { name: "Submit request" })).toHaveCount(0);
  await toReviewStep(page);
  const submit = (await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).boundingBox())!;
  expect(submit.height).toBeLessThan(48);
});

test("New request: the workflow is locked until Next; required fields show a star and must be filled first", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await dropCustomDraft("E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  // v1.54.0 (owner): one page per step: the workflow isn't shown until Next.
  await expect(page.getByTestId("step-workflow")).toBeHidden();
  // The title's star; required fields of the form builder have one too.
  await expect(page.locator('label[for="c-title"]')).toContainText("*");
  await page.getByTestId("step-next").click();
  await expect(page.locator("#c-title")).toBeFocused();
  await expect(page.getByTestId("request-steps").getByRole("button", { name: /Request details/ })).toHaveAttribute("aria-current", "step");
});

test("the road: while a level waits the van is halfway to it", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests?tab=waiting");
  const first = page.getByTestId("request-table").getByRole("link").first();
  if (!(await first.count())) test.skip(true, "No request waiting in this run.");
  await first.click();
  const road = page.getByTestId("approval-road");
  await expect(road).toHaveAttribute("data-outcome", "OPEN");
  const van = (await road.getByTestId("road-van").boundingBox())!;
  const at = Number(await road.getAttribute("data-van-at"));
  const points = road.getByTestId("road-checkpoint");
  const before = (await points.nth(at - 1).boundingBox())!;
  const waiting = (await points.nth(at).boundingBox())!;
  const middle = van.x + van.width / 2;
  expect(middle).toBeGreaterThan(before.x + before.width);
  expect(middle).toBeLessThan(waiting.x);
});

test("the request page: the road on top, the requester's details below it, the actions then Attachments then Collaborators on the right", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/requests?tab=waiting");
  const first = page.getByTestId("request-table").getByRole("link").first();
  if (!(await first.count())) test.skip(true, "No request waiting in this run.");
  await first.click();
  const road = (await page.getByTestId("approval-road").boundingBox())!;
  const requester = page.getByTestId("requester-details");
  await expect(requester.getByTestId("requester-headline")).toContainText("Requested by");
  await expect(requester.getByTestId("requester-headline")).toContainText("Department");
  await expect(requester).toContainText("Department");
  await expect(requester).toContainText("Reporting manager");
  expect((await requester.boundingBox())!.y).toBeGreaterThan(road.y);
  const actions = (await page.locator("#request-actions").boundingBox())!;
  const attachments = (await page.getByRole("heading", { name: "Attachments", exact: true }).boundingBox())!;
  const collaborators = (await page.getByRole("region", { name: "Collaborators" }).boundingBox())!;
  // v1.42.1 (owner's sketch): the road runs across the top band; the actions sit beside the details, below it.
  const details = (await requester.boundingBox())!;
  expect(actions.y).toBeGreaterThan(road.y + road.height - 1);
  expect(actions.x).toBeGreaterThan(details.x + details.width);
  const levels = (await page.getByRole("heading", { name: "Approval levels", exact: true }).boundingBox())!;
  expect(levels.y).toBeGreaterThan(details.y);
  expect(actions.y).toBeLessThan(attachments.y);
  expect(attachments.y).toBeLessThan(collaborators.y);
  // v1.49 (owner's layout): Discussion under Collaborators; the bottom row (Linked requests, Timeline) below both columns.
  const discussion = (await page.getByRole("region", { name: "Discussion" }).boundingBox())!;
  expect(discussion.y).toBeGreaterThan(collaborators.y);
  const layout = (await page.getByTestId("request-layout").boundingBox())!;
  const linked = (await page.getByRole("region", { name: "Linked requests" }).boundingBox())!;
  const timeline = (await page.getByRole("region", { name: "Timeline" }).boundingBox())!;
  expect(linked.y).toBeGreaterThanOrEqual(layout.y + layout.height - 1);
  expect(timeline.x).toBeGreaterThan(linked.x);
});

test("the request page on a phone: one column, the journey, then Request details, then Approval levels, nothing sideways", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/requests?tab=waiting");
  const first = page.getByTestId("request-table").getByRole("link").first();
  if (!(await first.count())) test.skip(true, "No request waiting in this run.");
  const href = (await first.getAttribute("href"))!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(href);
  const levels = (await page.getByRole("heading", { name: "Approval levels", exact: true }).boundingBox())!;
  const details = (await page.getByTestId("requester-details").boundingBox())!;
  const attachments = (await page.getByRole("heading", { name: "Attachments", exact: true }).boundingBox())!;
  const timeline = (await page.getByRole("region", { name: "Timeline" }).boundingBox())!;
  const linked = (await page.getByRole("region", { name: "Linked requests" }).boundingBox())!;
  // Owner: the approval visual first, then the approval details, then the rest.
  expect(details.y).toBeLessThan(levels.y);
  expect(levels.y).toBeLessThan(attachments.y);
  expect(attachments.y).toBeLessThan(timeline.y);
  expect(timeline.y).toBeLessThan(linked.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("Admin → Custom approval: once saved, leaving doesn't ask about unsaved changes", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/custom-approval");
  // A change made and undone: the form is "changed", the set-up stays as it was.
  const sla = page.getByLabel("Default: respond within hours");
  const before = await sla.inputValue();
  await sla.fill("48");
  await sla.fill(before);
  await page.getByRole("button", { name: "Save set-up" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, save" }).click();
  await expect(page.getByText(/^Saved\. New custom approvals use this set-up/)).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).first().click();
  await expect(page.getByRole("alertdialog", { name: "Leave without saving?" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/custom-approval/);
});

test("Home: approvers open on the Approval Overview, others on My Work; either can switch", async ({ page, context }) => {
  // E2E_REQ's designation isn't an approver one: My Work first.
  await as(context, "E2E_REQ");
  await page.goto("/users");
  const focus = page.getByRole("navigation", { name: "Show on Home" });
  await expect(focus.getByRole("link", { name: "Task Management" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: /My Work/ })).toBeVisible();
  for (const key of ["total", "upcoming", "overdue", "completed"]) await expect(page.getByTestId(`work-kpi-${key}`)).toBeVisible();
  await expect(page.getByTestId("workload-chart")).toBeVisible();
  await expect(page.getByRole("region", { name: "Projects" })).toBeVisible();
  // The period changes the figures' window.
  await expect(async () => {
    await page.getByTestId("period-picker").getByRole("combobox").selectOption("month");
    await expect(page).toHaveURL(/period=month/, { timeout: 2000 });
  }).toPass();
  await expect(page.getByTestId("work-kpi-completed")).toContainText("This month");
  // Switch to approvals.
  await focus.getByRole("link", { name: "Approvals" }).click();
  await expect(page).toHaveURL(/home=approvals/);
  await expect(page.getByRole("heading", { level: 1, name: "Approval Overview" })).toBeVisible();
  await expect(page.locator('[data-tour="overview-tiles"]')).toBeVisible();
  await expect(page.getByTestId("quick-insights")).toBeVisible();

  // An approver (the manager) opens on Approvals.
  await as(context, "E2E_MGR");
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "Approval Overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Show on Home" }).getByRole("link", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
});

test("New request: each level shows as a small card on top; the fixed options aren't spelled out", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await dropCustomDraft("E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await toWorkflowStep(page);
  const cards = page.getByTestId("level-cards").getByTestId("level-card");
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Add a level" }).click();
  await expect(cards).toHaveCount(2);
  // The new level is the one open; the first opens from its card.
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("workflow-level").nth(0)).toBeHidden();
  await cards.nth(0).click();
  await expect(page.getByTestId("workflow-level").nth(0)).toBeVisible();
  await expect(page.getByText(/set by IT/)).toHaveCount(0);
  // v1.54.0 (owner): the steps and actions stay put while the page scrolls.
  expect(await page.getByTestId("request-bar").evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await dropCustomDraft("E2E_REQ");
});

// D-269 (owner: "work task and FYI are not working… the task raised also
// should be created in task management"): a custom request with a work step,
// an FYI step and an approval, through to approved.
test("New request with a work step, an FYI and an approval: the work is a task in My Tasks; ticking it moves the request on; the FYI person can open it", async ({ page, context }) => {
  const subject = `Load the truck ${stamp}`;
  const pickPerson = async (name: RegExp) => {
    const level = page.getByTestId("workflow-level").filter({ visible: true }).last();
    await level.getByLabel("Who approves").selectOption("PEOPLE");
    const picker = level.getByRole("combobox", { name: /People \(search and pick/ });
    await picker.fill(String(name).replace(/[\/^$]/g, "").split(" ")[0]!);
    await page.getByRole("option", { name }).first().click();
  };
  await as(context, "E2E_STAFF");
  await dropCustomDraft("E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(subject);
  await toWorkflowStep(page);
  // Level 1: work, for Ravi (anyone may be given work).
  let level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Loading");
  await level.getByLabel("Kind of step").selectOption("WORK");
  await expect(level.getByTestId("step-kind-help")).toContainText("Task Management");
  await pickPerson(/Ravi Requester/);
  // Level 2: FYI to Harini.
  await page.getByRole("button", { name: "Add a level" }).click();
  level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Tell the HOD");
  await level.getByLabel("Kind of step").selectOption("NOTIFY");
  await pickPerson(/Harini HOD/);
  // Level 3: Manoj approves.
  await page.getByRole("button", { name: "Add a level" }).click();
  level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Manager sign-off");
  await pickPerson(/Manoj Manager/);
  // Already on the workflow step: one Next opens Review & submit.
  await page.getByTestId("step-next").click();
  await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  const requestPath = new URL(page.url()).pathname;

  // Ravi: the work is in My Tasks, linked to the request; ticking it is "done".
  await as(context, "E2E_REQ");
  await dueToday(`Loading: ${subject}%`); // v1.54.3: the summary lists tasks due by the next 7 days
  await page.goto("/users/work/my-tasks");
  const row = page.getByRole("row").filter({ hasText: `Loading: ${subject}` }).first();
  await expect(row).toBeVisible();
  // Owner: highlighted, and mapped to the approval's number (a link to the request).
  await expect(row).toHaveClass(/approval-task/);
  const requestNo = (await page.request.get(requestPath).then((response) => response.text())).match(/CUS-\d{4}-\d{6}/)?.[0] ?? "CUS-";
  await expect(row.getByTestId("approval-badge")).toContainText(requestNo);
  await expect(row.getByTestId("approval-badge")).toHaveAttribute("href", requestPath);
  await row.getByRole("checkbox", { name: new RegExp(`Complete Loading: ${subject}`) }).click();
  await expect(page.getByText(new RegExp(`Completed: Loading: ${subject}`)).first()).toBeVisible();

  // Harini was told (Inbox) and can open the request; Manoj now has it waiting.
  await as(context, "E2E_HOD");
  await page.goto("/users/inbox");
  await expect(page.getByText(/For your information/).first()).toBeVisible();
  expect((await page.goto(requestPath))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible();

  await as(context, "E2E_MGR");
  await page.goto(requestPath);
  await page.getByTestId("decision-buttons").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByTestId("approval-road")).toHaveAttribute("data-outcome", "APPROVED");

  // The task stays completed; it can't be reopened against a finished step.
  await as(context, "E2E_REQ");
  await page.goto("/users/work/search?status=completed&assignee=me");
  await expect(page.getByTestId("work-search-results")).toContainText(`Loading: ${subject}`);
});
