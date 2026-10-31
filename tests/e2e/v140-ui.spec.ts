import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.4.0 through the real screens (D-097, D-099): the builder's step kinds,
// all/any conditions and nested choices; then a request whose last step is
// a work task for the requester, marked done on the request page.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

let requestPath = "";

test("the builder offers step kinds, all/any rules and choices inside choices", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Hand-off");
  await page.getByLabel("Code").fill("E2E_HANDOFF");
  await page.getByLabel("Number prefix").fill("EHO");

  // A new level after the DoA: a work task for the requester.
  await page.getByRole("button", { name: "Add a level" }).last().click();
  const kind = page.getByLabel("Kind of step").last();
  const who = page.getByLabel("Who approves").last();
  await expect(who.locator('option[value="REQUESTER"]')).toBeDisabled();
  await kind.selectOption("WORK");
  await expect(page.getByText("Who does it").last()).toBeVisible();
  await expect(who.locator('option[value="REQUESTER"]')).toBeEnabled();
  await who.selectOption("REQUESTER");
  await page.getByLabel("Step name").last().fill("Raise the purchase order");
  await expect(page.getByText("You have changes that aren't saved yet.")).toBeVisible();

  // A choice with two conditions, and a choice inside it; then removed again.
  await page.getByRole("button", { name: "Add a choice (if / otherwise)" }).last().click();
  await page.getByRole("button", { name: "+ Add another condition" }).last().click();
  await expect(page.getByLabel("Which conditions must hold").last()).toBeVisible();
  await page.getByLabel("Which conditions must hold").last().selectOption("ANY");
  await expect(page.getByText("or", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Kind of step").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/v140-builder.png", fullPage: true });
  const nestedChoice = page.getByRole("button", { name: "Add a choice (if / otherwise)" });
  expect(await nestedChoice.count()).toBeGreaterThan(1); // one inside each path of the choice
  // Top-level order: DoA, the work step, the choice (its inner step comes after).
  await page.getByRole("button", { name: "Remove level" }).nth(2).click();

  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("after approval the requester gets the work task and marks it done", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Hand-off/ }).click();
  await page.getByLabel("Title").fill("Printer cartridges for stores");
  await page.getByLabel(/Amount/).fill("50,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;
  await expect(page.getByText("Work", { exact: true })).toBeVisible(); // the level map marks the work step

  for (const [approver, name] of [["E2E_MGR", "Manoj Manager"], ["E2E_HOD", "Harini HOD"]] as const) {
    await as(context, approver);
    await page.goto(requestPath);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText(new RegExp(`Approved by ${name}`)).first()).toBeVisible();
  }

  await as(context, "E2E_REQ");
  await page.goto("/users/queue");
  const row = page.getByRole("row", { name: /Printer cartridges for stores/ });
  await expect(row.getByText("To do")).toBeVisible();
  await page.goto(requestPath);
  await expect(page.getByText("Your task: Raise the purchase order")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await page.getByLabel(/Comment/).fill("PO 2026-118 raised");
  await page.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByText("Fully approved", { exact: true })).toBeVisible();
  await expect(page.getByText('Marked done by Ravi Requester at "Raise the purchase order"')).toBeVisible();
});

test("IT moves stuck steps on: gives one to a person, skips another (D-098)", async ({ page, context }) => {
  // Sita has no manager and no department, so Manager and HOD can't resolve.
  await as(context, "E2E_STAFF");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Hand-off/ }).click();
  await page.getByLabel("Title").fill("Stuck request for the IT panel");
  await page.getByLabel(/Amount/).fill("20,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  const path = new URL(page.url()).pathname;

  await as(context, "E2E_ADMIN");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Stuck: needs IT" })).toBeVisible();
  await expect(page.getByText("Blocked: Manager")).toBeVisible();
  await page.screenshot({ path: "test-results/v140-stuck-panel.png" });
  await page.getByLabel("People (hold Ctrl to pick several)").selectOption({ label: "Manoj Manager (E2E_MGR)" });
  await page.getByLabel(/^Reason/).fill("Sita's manager isn't set yet");
  await page.getByRole("button", { name: "Move it on" }).click();
  await expect(page.getByText(/"Manager" given to Manoj Manager by Elena Admin/)).toBeVisible();

  // Manoj approves; then HOD is stuck (no department): IT skips it.
  await as(context, "E2E_MGR");
  await page.goto(path);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible();

  await as(context, "E2E_ADMIN");
  await page.goto(path);
  await expect(page.getByText("Blocked: HOD")).toBeVisible();
  await page.getByLabel(/Skip this step/).check();
  await page.getByLabel(/^Reason/).fill("No HOD for this request");
  await page.getByRole("button", { name: "Move it on" }).click();
  await expect(page.getByText(/"HOD" skipped by Elena Admin/)).toBeVisible();

  // The work task is Sita's now.
  await as(context, "E2E_STAFF");
  await page.goto(path);
  await expect(page.getByText("Your task: Raise the purchase order")).toBeVisible();
});

test("IT turns a custom approval into a reusable approval type (P5-04)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/custom");
  await page.getByLabel("Title").fill("Team offsite in Ooty");
  await page.getByLabel("Details").fill("Two days, 12 people.");
  // v1.8.0: search and pick, like Collaborators.
  // D-234: Manoj (the reporting manager) is usually the first approver already; pick him only if he isn't.
  await page.getByRole("combobox", { name: /^People \(search and pick/ }).fill("Manoj");
  const manoj = page.getByRole("option", { name: "Manoj Manager (E2E_MGR)" });
  if (await manoj.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) await manoj.click();
  await expect(page.locator("main form").getByText("Manoj Manager").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  const path = new URL(page.url()).pathname;

  await as(context, "E2E_ADMIN");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Reuse these levels" })).toBeVisible();
  await page.getByLabel("Code").fill("E2E_OFFSITE");
  await page.getByLabel("Number prefix").fill("OFF");
  await page.getByRole("button", { name: "Make it an approval type (draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await expect(page.getByRole("heading", { name: "Team offsite in Ooty" })).toBeVisible();
});
