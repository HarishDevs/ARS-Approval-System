import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dropCustomDraft, sessionCookie, toWorkflowStep } from "./db";

// v1.48.1 (owner): (1) "when selecting Work task or FYI I am not able to
// select it": a dropdown in New request keeps the choice when picked with
// real input (the browser's input event used to re-render the form and put
// the old value back); (2) "if it is put on hold the approver should have the
// option to resume": Resume comes first while the request is on hold.

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function raiseForManager(page: Page, context: BrowserContext, title: string) {
  await as(context, "E2E_STAFF");
  await dropCustomDraft("E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(title);
  await toWorkflowStep(page);
  const level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Who approves").selectOption("PEOPLE");
  await level.getByRole("combobox", { name: /People \(search and pick/ }).fill("Manoj");
  await page.getByRole("option", { name: /Manoj Manager/ }).first().click();
  await page.getByTestId("step-next").click();
  await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  return new URL(page.url()).pathname;
}

test("New request: Kind of step keeps Work task and FYI when chosen with the keyboard", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await dropCustomDraft("E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill("Kind of step check");
  await toWorkflowStep(page);
  const kind = page.getByRole("combobox", { name: "Kind of step" }).filter({ visible: true }).first();
  await expect(kind).toHaveValue("APPROVE");
  await kind.focus();
  await page.keyboard.press("ArrowDown");
  await expect(kind).toHaveValue("WORK");
  await expect(page.getByTestId("step-kind-help").filter({ visible: true }).first()).toContainText("mark it done");
  await page.keyboard.press("ArrowDown");
  await expect(kind).toHaveValue("NOTIFY");
  await dropCustomDraft("E2E_STAFF");
});

test("an approver who put a request on hold sees Resume first, and can decide again after it", async ({ page, context }) => {
  const path = await raiseForManager(page, context, "Hold and resume check");

  await as(context, "E2E_MGR");
  await page.goto(path);
  await page.getByLabel(/Comment/).first().fill("Waiting for the quotation");
  await page.getByRole("button", { name: "Put on hold" }).click();
  const resume = page.getByTestId("resume-form");
  await expect(resume).toBeVisible();
  await expect(resume).toContainText("Waiting for the quotation");
  // Nothing can be decided while it is on hold, so the decision buttons are not offered.
  await expect(page.getByRole("button", { name: "Approve", exact: true }).filter({ visible: true })).toHaveCount(0);

  await resume.getByRole("button", { name: /Resume/ }).click();
  await expect(page.getByTestId("resume-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve", exact: true }).filter({ visible: true }).first()).toBeVisible();
});
