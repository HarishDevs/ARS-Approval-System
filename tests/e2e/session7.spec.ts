import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Session 7 (D-075): IT creates an approval type with its own DoA matrix on
// screen; a request under the first limit skips the levels that band
// doesn't tick.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("IT sets a DoA matrix when creating an approval type, and publishes it", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Capex");
  await page.getByLabel("Code").fill("E2E_CAPEX");
  await page.getByLabel("Number prefix").fill("ECX");
  // Starts with a DoA matrix: limits ₹1L / ₹10L; Manager, HOD, Senior approval.
  await page.getByLabel("Limit 1", { exact: true }).fill("2,00,000");
  await page.getByLabel("HOD needed for Up to ₹2,00,000").uncheck();
  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  await page.goto("/admin/doa");
  const card = page.locator("section", { hasText: "E2E Capex" });
  await expect(card.getByText("Manager", { exact: true })).toBeVisible();
  await expect(card.getByText("Manager → HOD", { exact: true })).toBeVisible();
});

test("a ₹1,50,000 request needs only the manager; the map says why HOD is skipped", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Capex/ }).click();
  await page.getByLabel("Title").fill("Forklift battery");
  await page.getByLabel(/Amount/).fill("1,50,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1$/);
  await expect(page.getByText("Not needed at this amount (DoA)").first()).toBeVisible();
  // v1.48.1: the approver's name is in the level's hover details (its button name).
  await expect(page.getByRole("button", { name: /Manoj Manager/ }).first()).toBeVisible();
});

test("QA fixes on screen: a negative amount is refused; a repeat title asks first", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Capex/ }).click();
  await page.getByLabel("Title").fill("Forklift battery");
  await page.getByLabel(/Amount/).fill("-5,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Enter 0 or more.", { exact: true })).toBeVisible();

  await page.getByLabel(/Amount/).fill("1,50,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText(/You raised “Forklift battery” as ECX-\d{4}-000001 a few minutes ago/).first()).toBeVisible();
  await page.getByLabel(/This is a separate request/).check();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1$/);
  await expect(page.getByRole("status").filter({ hasText: /Submitted as ECX-\d{4}-000002/ })).toBeVisible();

  await page.goto("/users/requests?q=forklift");
  await expect(page.getByText("2 requests")).toBeVisible();
});
