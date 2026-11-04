import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.6.1 through the real screens: IT adds an Attachments field to a new
// approval type; the requester must attach a file there and adds a
// collaborator; the collaborator finds it under "Shared with me", opens it
// and sees the file under its field.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function addField(page: Page, label: string, type: string) {
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field label").last().fill(label);
  await page.getByLabel("Field type").last().selectOption(type);
}

const pdf = { name: "vendor-quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%quote\n%%EOF") };
let requestPath = "";

test("IT adds an Attachments field with a file limit", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Files");
  await page.getByLabel("Code").fill("E2E_FILES");
  await page.getByLabel("Number prefix").fill("EFL");
  await addField(page, "Vendor quotes", "ATTACHMENT");
  await page.getByLabel("Required: Vendor quotes").check();
  await expect(page.locator('[data-tip*="Files, 10 MB each"]')).toHaveCount(1); // D-189: now a hover hint
  await page.getByRole("tab", { name: "Validation" }).click(); // D-235
  await page.getByLabel("Most files for Vendor quotes").selectOption("2");
  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("the requester must attach a file to the field, and adds a collaborator", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Files/ }).click();
  await page.getByLabel("Title").fill("New gearbox quotes");
  await page.getByLabel(/Amount/).fill("5,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.locator("#quotes-error, [id$='-error']").filter({ hasText: "Attach at least one file to Vendor quotes." }).first()).toBeVisible();

  await page.getByLabel("Vendor quotes").setInputFiles(pdf);
  await page.getByLabel("Collaborators (optional)").fill("Sita");
  await page.getByRole("option", { name: /Sita Staff/ }).click();
  await expect(page.getByRole("button", { name: /Remove Sita Staff/ })).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  if (await page.getByLabel("I've read the warnings and want to submit.").isVisible().catch(() => false)) {
    await page.getByLabel("I've read the warnings and want to submit.").check();
    await page.getByLabel("Vendor quotes").setInputFiles(pdf);
    await page.getByRole("button", { name: "Submit request" }).click();
  }
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;
  const details = page.locator("section", { hasText: "Details" }).first();
  await expect(details.getByText("vendor-quote.pdf")).toBeVisible();
  const collaborators = page.getByRole("region", { name: "Collaborators" });
  await expect(collaborators.getByText("Sita Staff")).toBeVisible();
  await expect(page.getByText(/added Sita Staff as collaborator/)).toBeVisible();
});

test("the collaborator finds it under Shared with me, opens it, and can stop following", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await page.goto("/users/requests?tab=shared");
  await expect(page.getByRole("link", { name: "Shared with me" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /New gearbox quotes/ }).first().click();
  await expect(page.getByRole("heading", { name: "New gearbox quotes" })).toBeVisible();
  await expect(page.getByText("vendor-quote.pdf").first()).toBeVisible();
  // Not an approver: no decision to make.
  await expect(page.getByRole("heading", { name: "Needs your action" })).toHaveCount(0);
  const card = page.getByRole("region", { name: "Collaborators" });
  await card.getByRole("button", { name: "Stop following this request" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop following" }).click();
  // The page refreshes after the change: no longer theirs to see.
  await expect(page.getByRole("heading", { name: "New gearbox quotes" })).toHaveCount(0, { timeout: 15000 });
  await page.goto(requestPath);
  await expect(page.getByRole("heading", { name: "New gearbox quotes" })).toHaveCount(0);
});
