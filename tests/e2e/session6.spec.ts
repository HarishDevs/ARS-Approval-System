import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Session 6 through the real screens: the Super Admin loads the demo data,
// switches on a WhatsApp template, tries the app as a demo buyer, raises a
// ₹50,000 purchase with a quote attached, and an outsider can't download it.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}


test("the Super Admin loads the demo staff and approval types", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/demo");
  // V181-A8: the typed word, then the confirmation.
  await page.getByLabel(/Type LOAD DEMO to confirm/).fill("LOAD DEMO");
  await page.getByRole("button", { name: "Load demo data" }).click();
  await page.getByRole("button", { name: "Yes, load demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loaded 20 people" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Demo people (20 active)")).toBeVisible();
  await page.getByLabel(/Type LOAD DEMO to confirm/).fill("LOAD DEMO");
  await page.getByRole("button", { name: "Load demo data" }).click();
  await page.getByRole("button", { name: "Yes, load demo data" }).click();
  await expect(page.getByText("Everything was already loaded; nothing changed.")).toBeVisible();

  await page.goto("/admin/doa");
  await expect(page.getByText("Purchase & SCM Approval").first()).toBeVisible();
});

test("the template creator drafts a message; submitting needs the CEOITBox key", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/templates");
  await expect(page.getByRole("progressbar", { name: "Templates live" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByText("of 26 messages")).toBeVisible(); // 20 + 6 from v1.4.0 (D-097, D-098)
  await page.getByRole("row", { name: /waiting for this person's approval/ }).getByRole("link", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/superadmin\/templates\/WA_APPROVAL_NEEDED_V1$/);
  await expect(page.getByText("Ravi Kumar needs your approval for PUR-2026-000123", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft version 1 saved", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Submit to Meta for approval" }).click();
  await page.getByRole("button", { name: "Yes, submit" }).click();
  await expect(page.getByText("CEOITBox API key is not configured.")).toBeVisible();
});

