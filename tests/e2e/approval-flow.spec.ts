import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// The north star through the real screens: IT builds and publishes a
// workflow → a requester raises → manager approves → HOD asks for changes →
// requester resubmits → HOD approves → Approved, with the history shown.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

let requestPath = "";

test("IT builds, tests and publishes a two-level workflow", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Purchase");
  await page.getByLabel("Code").fill("E2E_PURCHASE");
  await page.getByLabel("Number prefix").fill("EPR");
  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);

  // Test mode shows the real people.
  await page.getByLabel("Sample requester").selectOption({ label: "Ravi Requester (E2E_REQ)" });
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText("Manager (Must approve): Manoj Manager")).toBeVisible();
  await expect(page.getByText("HOD (Must approve): Harini HOD")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

async function decide(page: Page, button: string, comment?: string) {
  if (comment) await page.getByLabel(/Comment/).fill(comment);
  await page.getByRole("button", { name: button, exact: true }).click();
}

test("a requester raises it; the manager approves", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Purchase/ }).click();
  await page.getByLabel("Title").fill("Laptop for the new engineer");
  await page.getByLabel(/Amount/).fill("85,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  await expect(page.getByRole("status").filter({ hasText: /Submitted as EPR-\d{4}-000001/ })).toBeVisible();
  requestPath = new URL(page.url()).pathname;

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
  await page.getByLabel(/Amount/).fill("82,000");
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
