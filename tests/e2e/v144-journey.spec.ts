import { expect, test, type BrowserContext } from "@playwright/test";
import { dropCustomDraft, sessionCookie, toWorkflowStep } from "./db";

// D-273 (owner's journey brief): the approval journey from submission to the
// flag, driven by the request's real records. A request with background work
// (the request doesn't wait), an FYI and one approval.
test.describe.configure({ mode: "serial" });
const stamp = Date.now().toString(36);
const subject = `Journey check ${stamp}`;
let requestPath = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId, { tourDone: true })]);
}

test("submitted: the van carries it to the first approval; the background task and the FYI are activities, not checkpoints", async ({ page, context }) => {
  const pickPerson = async (name: RegExp) => {
    const level = page.getByTestId("workflow-level").filter({ visible: true }).last();
    await level.getByLabel("Who approves").selectOption("PEOPLE");
    await level.getByRole("combobox", { name: /People \(search and pick/ }).fill(String(name).replace(/[/^$]/g, "").split(" ")[0]!);
    await page.getByRole("option", { name }).first().click();
  };
  await as(context, "E2E_STAFF");
  await dropCustomDraft("E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(subject);
  await toWorkflowStep(page);
  let level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Collect papers");
  await level.getByLabel("Kind of step").selectOption("WORK");
  // The work doesn't hold the request up.
  await level.getByTestId("step-holds-up").uncheck();
  await pickPerson(/Ravi Requester/);
  await page.getByRole("button", { name: "Add a level" }).click();
  level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Tell the HOD");
  await level.getByLabel("Kind of step").selectOption("NOTIFY");
  await pickPerson(/Harini HOD/);
  await page.getByRole("button", { name: "Add a level" }).click();
  level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Step name").fill("Manager sign-off");
  await pickPerson(/Manoj Manager/);
  await page.getByTestId("step-next").click();
  await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;

  const journey = page.getByTestId("approval-road");
  await expect(journey).toBeVisible();
  // Only the approval is a checkpoint (submitted + Manager sign-off); the van waits there.
  await expect(journey.getByTestId("road-checkpoint")).toHaveCount(2);
  await expect(journey).toHaveAttribute("data-van-at", "1");
  await expect(journey.getByTestId("road-checkpoint").nth(1)).toHaveAttribute("data-state", "current");
  await expect(journey.getByTestId("road-percent")).toHaveText("0% Completed");
  // The sealing played once (just submitted), and the document is out for review.
  await expect(journey).toHaveAttribute("data-scene", "idle", { timeout: 15_000 });
  await expect(journey.getByTestId("journey-document")).toBeVisible();
  // Activities beside the road.
  const task = journey.getByTestId("journey-task");
  await expect(task).toHaveCount(1);
  await expect(task).toContainText("Collect papers");
  await expect(task).toContainText("Ravi Requester");
  await expect(task).toContainText("Doesn't hold the request up");
  await expect(journey.getByTestId("journey-fyi")).toContainText("Tell the HOD");
  await expect(journey.getByTestId("journey-fyi")).toContainText("Harini HOD");
  // A refresh draws the same state, without replaying.
  await page.reload();
  await expect(page.getByTestId("approval-road")).toHaveAttribute("data-scene", "idle");
  await expect(page.getByTestId("approval-road")).toHaveAttribute("data-van-at", "1");

  // The journey's API answers the same, with an event cursor.
  const body = await (await page.request.get(`/api/requests/${requestPath.split("/").pop()}/progress`)).json();
  expect(body.journey.road.checkpoints).toHaveLength(2);
  expect(body.journey.tasks[0].blocking).toBe(false);
  expect(body.journey.cursor).toBeGreaterThan(0);
});

test("the background task: highlighted in My Tasks, its holder may read the request, and ticking it decides nothing", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/work/my-tasks");
  const row = page.getByRole("row").filter({ hasText: `Collect papers: ${subject}` }).first();
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/approval-task/);
  await expect(row.getByTestId("approval-badge")).toHaveAttribute("href", requestPath);
  // Context access: read-only.
  expect((await page.goto(requestPath))?.status()).toBe(200);
  await expect(page.getByTestId("approval-road")).toBeVisible();
  await page.goto("/users/work/my-tasks");
  await page.getByRole("row").filter({ hasText: `Collect papers: ${subject}` }).first().getByRole("checkbox", { name: /Complete Collect papers/ }).click();
  await expect(page.getByText(new RegExp(`Completed: Collect papers: ${subject}`)).first()).toBeVisible();
  // Still waiting for the manager.
  await as(context, "E2E_STAFF");
  await page.goto(requestPath);
  const journey = page.getByTestId("approval-road");
  await expect(journey).toHaveAttribute("data-outcome", "OPEN");
  await expect(journey.getByTestId("journey-task")).toHaveAttribute("data-status", "COMPLETED");
  await expect(journey.getByTestId("journey-task")).toContainText("Completed");
});

test("the manager approves: the van reaches the flag and the road completes; the parent journey shows on the task", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(requestPath);
  await page.getByTestId("decision-buttons").getByRole("button", { name: "Approve", exact: true }).click();
  const journey = page.getByTestId("approval-road");
  await expect(journey).toHaveAttribute("data-outcome", "APPROVED");
  await expect(journey).toHaveAttribute("data-scene", "idle", { timeout: 15_000 });
  await expect(journey.getByTestId("road-percent")).toHaveText("100% Completed");
  await expect(journey.getByTestId("road-approved-tick")).toBeVisible();
  await expect(journey.getByTestId("road-checkpoint").nth(1)).toHaveAttribute("data-state", "done");
  // The van stands at the flag, right of the last checkpoint.
  const van = (await journey.getByTestId("road-van").boundingBox())!;
  const last = (await journey.getByTestId("road-checkpoint").last().boundingBox())!;
  expect(van.x + van.width).toBeGreaterThan(last.x + last.width);

  // The task page shows its parent request's journey (small), for the task's holder.
  const body = await (await page.request.get(`/api/requests/${requestPath.split("/").pop()}/progress`)).json();
  const taskId = body.journey.tasks[0].id as number;
  await as(context, "E2E_REQ");
  await page.goto(`/users/tasks/${taskId}`);
  await expect(page.getByTestId("task-parent-journey").getByTestId("approval-road")).toHaveAttribute("data-outcome", "APPROVED");
});
