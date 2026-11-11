import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { purchaseTemplateId, raisePurchase, sessionCookie, toReviewStep, toWorkflowStep } from "./db";

// The north star through the real screens: a requester raises a two-level
// request from their approval template → manager approves → HOD asks for
// changes → requester resubmits → HOD approves → Approved, with the history.
// v1.54.0 (D-309): IT approval types are gone; the levels come from the
// requester's own approval template, and the review names every approver.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

let requestPath = "";

async function decide(page: Page, button: string, comment?: string) {
  if (comment) await page.getByLabel(/Comment/).fill(comment);
  await page.getByRole("button", { name: button, exact: true }).click();
}

test("the requester's approval template sets the levels; the review names each approver", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await purchaseTemplateId();
  await page.goto("/users/new");
  const card = page.getByTestId("approval-template").filter({ hasText: "E2E Purchase" });
  await expect(card).toContainText("Manoj Manager");
  await expect(card).toContainText("Harini HOD");
  await card.getByRole("link", { name: "Use this template" }).click();
  await expect(page.getByTestId("from-template")).toContainText("E2E Purchase");
  await page.locator("#c-title").fill("Template check");
  await toReviewStep(page);
  const route = page.getByTestId("review-route");
  await expect(route).toContainText("Manager");
  await expect(route).toContainText("Manoj Manager");
  await expect(route).toContainText("Harini HOD");
});

test("a requester raises it; the manager approves", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  requestPath = await raisePurchase(page, "Laptop for the new engineer", "85000");
  // Every level names its approver, the one not reached yet too.
  await expect(page.getByTestId("approval-levels")).toContainText("Harini HOD");

  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  await expect(page.getByRole("link", { name: "Laptop for the new engineer" })).toBeVisible();
  await page.goto(requestPath);
  await decide(page, "Approve");
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible();
});

test("the HOD asks for changes; the requester resubmits; the HOD approves", async ({ page, context }) => {
  await as(context, "E2E_HOD");
  await page.goto(requestPath);
  await decide(page, "Reject"); // no reason → refused
  await expect(page.getByText("A reason is required.")).toBeVisible();
  await decide(page, "Ask for changes", "Attach two quotes");
  await expect(page.getByText("Changes required", { exact: true }).first()).toBeVisible();

  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await expect(page.getByText("Changes asked: Attach two quotes")).toBeVisible();
  await page.getByLabel(/Amount/).fill("82000");
  await page.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText("Resubmitted (round 2)", { exact: true })).toBeVisible();

  await as(context, "E2E_HOD");
  await page.goto(requestPath);
  await decide(page, "Approve");
  await expect(page.getByText("Fully approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
});

test("someone not involved can't open the request", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  expect((await page.goto(requestPath))?.status()).toBe(404);
});

test("screens: the new request steps and the approval journey", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/users/custom?template=${await purchaseTemplateId()}`);
  await page.locator("#c-title").fill("Screens check");
  await page.screenshot({ path: "test-results/v154-step1.png" });
  await toWorkflowStep(page);
  await page.screenshot({ path: "test-results/v154-step2.png" });
  await page.getByTestId("step-next").click();
  await expect(page.getByTestId("review-route")).toContainText("Harini HOD");
  await page.screenshot({ path: "test-results/v154-step3.png" });
  await page.goto(requestPath);
  await page.screenshot({ path: "test-results/v154-request.png" });
});
