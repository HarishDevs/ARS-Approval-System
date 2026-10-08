import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Session 11: approver designations (D-085), Super Admin deletes a request
// (D-086), and the admin dashboards (D-087), through the real screens.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("only approver designations can be picked: the manager picker offers the manager, not the requester", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/organisation");
  await expect(page.getByText(/Tick Approver for Manager and above/)).toBeVisible();
  // The new designation starts unticked.
  const addRow = page.getByRole("button", { name: "Add" }).last().locator("xpath=ancestor::form");
  await addRow.getByLabel("Code").fill("E2E_TRAINEE");
  await addRow.getByLabel("Designation name").fill("Trainee");
  await expect(addRow.getByLabel("Approver")).not.toBeChecked();

  // The reporting-manager picker on a new user lists approvers only.
  await page.goto("/admin/users/new");
  const manager = page.getByLabel("Reports to");
  await expect(manager.locator("option", { hasText: "Manoj Manager (E2E_MGR)" })).toHaveCount(1);
  await expect(manager.locator("option", { hasText: "Ravi Requester (E2E_REQ)" })).toHaveCount(0);
});

let requestPath = "";
let requestNo = "";

test("the Super Admin deletes a request with a reason; it leaves the approver's queue", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Deletable");
  await page.getByLabel("Code").fill("E2E_DELETABLE");
  await page.getByLabel("Number prefix").fill("EDL");
  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Deletable/ }).click();
  await page.getByLabel("Title").fill("Raised by mistake");
  await page.getByLabel(/Amount/).fill("1,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;
  requestNo = (await page.getByRole("status").filter({ hasText: /Submitted as/ }).textContent())?.match(/EDL-\d{4}-\d{6}/)?.[0] ?? "";
  expect(requestNo).not.toBe("");

  // Nobody but the Super Admin sees a Delete button.
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

  await as(context, "E2E_SUPER");
  await page.goto(requestPath);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByLabel(/Why\?/).fill("Raised by mistake in testing");
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/superadmin\/requests\?tab=deleted/);
  await expect(page.getByText(requestNo)).toBeVisible();
  await expect(page.getByText("Raised by mistake in testing")).toBeVisible();

  expect((await page.goto(requestPath))?.status()).toBe(404);
  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  await expect(page.getByRole("link", { name: "Raised by mistake" })).toHaveCount(0);
});

test("the four dashboards open with filters and download as CSV", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards");
  await expect(page).toHaveURL(/\/admin\/dashboards\/utilisation/);
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /E2E Deletable/ })).toBeVisible();

  for (const [tab, heading] of [
    ["Department-wise raised", "Requests raised by department"],
    ["Approver-wise", "Approvers"],
    ["Raiser-wise by department", "Raisers by department"],
  ] as const) {
    await page.getByRole("link", { name: tab }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "This financial year" }).click();
  await expect(page).toHaveURL(/from=\d{4}-04-01/);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ars-raisers-\d{4}-04-01-to-\d{4}-\d{2}-\d{2}\.csv$/);
});
