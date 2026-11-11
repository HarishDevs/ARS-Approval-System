import { expect, test, type BrowserContext } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, dropCustomDraft, sessionCookie, toWorkflowStep } from "./db";

// v1.50.3 (owner): "Raise a follow-up" on an approved custom request opens New
// request with the details copied, and the new request is linked to it; a page
// someone may not open shows "You don't have access" instead of "isn't available".
test.describe.configure({ mode: "serial" });

let sourcePath = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("a follow-up of an approved custom request is raised from New request and linked", async ({ page, context }) => {
  test.setTimeout(120_000);
  const title = `Follow source ${Date.now().toString(36)}`;
  await dropCustomDraft("E2E_REQ");
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(title);
  await toWorkflowStep(page);
  await page.getByTestId("step-next").click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  sourcePath = new URL(page.url()).pathname;
  const sourceId = Number(sourcePath.split("/").at(-1));

  // The reporting manager approves it.
  await as(context, "E2E_MGR");
  await page.goto(sourcePath);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button", { name: /^Yes/ }).click();
  await expect(page.getByText(/Approved/).first()).toBeVisible();
  // The page refreshes itself after the decision; let it finish before leaving.
  await page.waitForLoadState("networkidle");

  // The requester raises the follow-up.
  await dropCustomDraft("E2E_REQ");
  await as(context, "E2E_REQ");
  await page.goto(sourcePath);
  await expect(page.getByTestId("raise-follow-up")).toHaveAttribute("href", `/users/custom?followUp=${sourceId}`);
  await page.getByTestId("raise-follow-up").click();
  await expect(page).toHaveURL(new RegExp(`/users/custom\\?followUp=${sourceId}$`));
  await expect(page.getByTestId("follow-up-of")).toContainText("Raising a follow-up to");
  await expect(page.locator("#c-title")).toHaveValue(`Follow-up: ${title}`);
  await toWorkflowStep(page);
  await page.getByTestId("step-next").click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  const followUpId = Number(new URL(page.url()).pathname.split("/").at(-1));

  const connection = await db();
  try {
    const [links] = await connection.query<RowDataPacket[]>("SELECT kind FROM request_links WHERE from_request_id = ? AND to_request_id = ?", [sourceId, followUpId]);
    expect(links.map((row) => row.kind)).toEqual(["FOLLOW_UP"]);
  } finally {
    await connection.end();
  }
  // The source's Follow-ups panel lists it.
  await page.goto(sourcePath);
  const panel = page.getByTestId("follow-ups");
  await expect(panel).toContainText("Follow-ups (1)");
  await expect(panel).toContainText(`Follow-up: ${title}`);
  await dropCustomDraft("E2E_REQ");
});

test("a follow-up task added from the request page is linked and listed", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sourcePath);
  const card = page.getByTestId("request-tasks");
  await card.getByTestId("add-request-task").click();
  const form = card.getByTestId("request-task-form");
  const name = `Send the PO ${Date.now().toString(36)}`;
  await form.getByLabel("Task", { exact: true }).fill(name);
  await form.getByLabel("Priority").selectOption("IMPORTANT");
  await form.getByRole("button", { name: "Add task" }).click();
  await expect(form.getByText("Follow-up task added.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("request-tasks")).toContainText(name);
  const connection = await db();
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT related_request_id, priority FROM tasks WHERE title = ?", [name]);
    expect(rows[0]).toMatchObject({ related_request_id: Number(sourcePath.split("/").at(-1)), priority: "IMPORTANT" });
  } finally {
    await connection.end();
  }
});

test("a page outside your modules shows the no-access screen, not 'isn't available'", async ({ page, context }) => {
  await as(context, "E2E_REQ"); // default modules: no AI
  await page.goto("/users/ai/assistant");
  await expect(page).toHaveURL(/\/users\/no-access\?page=users\.ai_assistant&why=MODULE/);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(page.getByTestId("no-access")).toContainText("AI module");
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page).toHaveURL(/\/users$/);
});
