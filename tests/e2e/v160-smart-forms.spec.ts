import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// Smart forms end to end (EN-01..03): IT builds a type with a show/require
// rule, line items and a calculated DoA amount; a requester sees fields
// appear, totals worked out, and the server's own figures on the request.
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

test("IT builds a smart form: a rule, line items and a calculated amount", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Smart");
  await page.getByLabel("Code").fill("E2E_SMART");
  await page.getByLabel("Number prefix").fill("ESM");

  await addField(page, "Kind", "CHOICE");
  for (const value of ["Capex", "Opex"]) {
    await page.getByLabel("New option for Kind").fill(value);
    await page.getByLabel("New option for Kind").press("Enter");
  }
  await page.getByLabel("Required: Kind").check();

  await addField(page, "GSTIN", "TEXT");
  await page.getByRole("button", { name: "+ Show only when" }).last().click();
  await page.getByLabel("Show only when: field").last().selectOption({ label: "Kind" });
  await page.getByLabel("Show only when: test").last().selectOption("EQ");
  await page.getByLabel("Show only when: value").last().selectOption("Capex");
  await page.getByRole("button", { name: "+ Required when" }).last().click();
  await page.getByLabel("Required when: field").last().selectOption({ label: "Kind" });
  await page.getByLabel("Required when: test").last().selectOption("EQ");
  await page.getByLabel("Required when: value").last().selectOption("Capex");

  await addField(page, "Items", "LINE_ITEMS");
  await page.getByLabel("Required: Items").check();
  await addField(page, "Freight", "NUMBER");
  await page.getByLabel("Required: Freight").check();

  // The DoA amount becomes a calculated field.
  await page.getByLabel("Field type").first().selectOption("CALC");
  const formula = page.getByLabel("Formula");
  await formula.fill("items + freigt");
  await expect(page.getByText('"freigt" isn\'t a field on this form.')).toBeVisible();
  await formula.fill("items + freight");
  await expect(page.getByText(/Number fields you can use: .*items/)).toBeVisible();

  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("the requester sees the rule, the line totals and the worked-out amount; the server keeps its own figures", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Smart/ }).click();
  await page.getByLabel("Title").fill("Crane motor and cable");

  await expect(page.getByLabel("GSTIN")).toBeHidden();
  await page.getByLabel("Kind").selectOption("Capex");
  await expect(page.getByLabel("GSTIN")).toBeVisible();
  await expect(page.getByText("Required when Kind is Capex.")).toBeVisible();

  await page.getByLabel("Line 1 description").fill("Motor");
  await page.getByLabel("Line 1 quantity").fill("2");
  await page.getByLabel("Line 1 rate in rupees").fill("10000");
  await page.getByLabel("Line 1 GST percent").fill("18");
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Line 2 description").fill("Cable");
  await page.getByLabel("Line 2 quantity").fill("10.5");
  await page.getByLabel("Line 2 rate in rupees").fill("120.40");
  await expect(page.getByText("₹23,600.00")).toBeVisible();
  await expect(page.getByText("₹1,264.20")).toBeVisible();
  await expect(page.getByText("Total ₹24,864.20")).toBeVisible();
  await page.getByLabel("Freight").fill("500");
  await expect(page.locator("output#f-amount")).toHaveText("25,364.2");

  // GSTIN is now required by the rule; the server says so.
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("GSTIN is required.", { exact: true })).toBeVisible();
  await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);

  const details = page.getByRole("region", { name: "Details" }).or(page.locator("section", { hasText: "Details" }).first());
  await expect(details.getByRole("cell", { name: "Motor" })).toBeVisible();
  await expect(details.getByText("Total ₹24,864.20")).toBeVisible();
  await expect(details.getByText("25,364.2", { exact: true })).toBeVisible();
});
