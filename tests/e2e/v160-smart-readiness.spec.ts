import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// Unified prompt FN1/FN3/EN-09/FN4 through the real screens. Uses the
// "E2E Smart" type and the request raised by v160-smart-forms.spec.ts
// (GSTIN 29ABCDE1234F1Z5).
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function openSmartType(page: Page) {
  await page.goto("/admin/workflows");
  await page.getByRole("link", { name: "E2E Smart" }).first().click();
}

async function fillSmartForm(page: Page, title: string) {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Kind").selectOption("Capex");
  await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await page.getByLabel("Line 1 description").fill("Gearbox");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 rate in rupees").fill("80000");
  await page.getByLabel("Freight").fill("0");
}

test("IT switches on duplicate and budget checks, and sets the department budget", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await openSmartType(page);
  const checks = page.locator("form", { hasText: "Submission checks" });
  await checks.getByRole("group", { name: "Possible duplicates: match on" }).getByLabel("GSTIN").check();
  await checks.getByLabel("Check against the department budget").check();
  await checks.getByLabel("Amount field").selectOption({ label: "Amount (₹)" });
  await checks.getByRole("button", { name: "Save checks" }).click();
  await expect(checks.getByText(/Saved\. New submissions use these checks/)).toBeVisible();

  await page.goto("/admin/budgets");
  await page.getByLabel("Budget for E2E Department (₹)").fill("85,000");
  await page.getByLabel("Warn at percent used for E2E Department").fill("90");
  const row = page.getByRole("row", { name: /E2E Department/ });
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();
});

test("the requester checks first, sees a possible duplicate and the budget, and gives a reason to submit", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Smart/ }).click();
  await fillSmartForm(page, "Gearbox for crane 2");

  await page.getByRole("button", { name: "Check before submitting" }).click();
  const panel = page.getByRole("region", { name: "Ready to submit?" });
  await expect(panel.getByText("Ready, with warnings to review.")).toBeVisible();
  await expect(panel.getByText(/Possible duplicate: a request with the same GSTIN/)).toBeVisible();
  await expect(panel.getByRole("link", { name: /ESM-\d{4}-000001/ })).toBeVisible();
  await expect(panel.getByText(/budget to \d+(\.\d)?% used|Over budget/)).toBeVisible();
  // Changing a value makes the result stale.
  await page.getByLabel("Freight").fill("10");
  await expect(panel.getByText(/You changed something since this check/)).toBeVisible();

  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByLabel("I've read the warnings and want to submit.")).toBeVisible();
  await page.getByLabel("I've read the warnings and want to submit.").check();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.locator("#overrideReason-error")).toHaveText("Say why this isn't a duplicate (at least 5 characters).");
  await page.getByLabel("Why is this not a duplicate?").fill("Second crane, separate order");
  await page.getByLabel("I've read the warnings and want to submit.").check();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);

  const checked = page.getByRole("region", { name: "Checked at submission" });
  await expect(checked.getByText("Why it isn't a duplicate:")).toBeVisible();
  await expect(checked.getByText("Second crane, separate order")).toBeVisible();
  await expect(checked.getByText(/Budget \(E2E Department/)).toBeVisible();

  // FN4: save it as a template, and start the next one from it.
  await page.getByText("Save as a template").click();
  await page.getByLabel("Template name").fill("Crane spares");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved as "Crane spares"/)).toBeVisible();
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Smart/ }).click();
  await page.getByRole("link", { name: "Crane spares" }).click();
  await expect(page.getByText(/Started from your template "Crane spares"/)).toBeVisible();
  await expect(page.getByLabel("GSTIN")).toHaveValue("29ABCDE1234F1Z5");
  await expect(page.getByText("From your template. You can change it.").first()).toBeVisible();
  await expect(page.getByLabel("Line 1 description")).toHaveValue("Gearbox");
});
