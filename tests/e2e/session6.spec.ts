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

const QUOTE = { name: "quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nE2E quote\n%%EOF") };
let requestPath = "";
let downloadPath = "";

test("the Super Admin loads the demo staff and approval types", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/demo");
  await page.getByRole("button", { name: "Load demo data" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loaded 20 people" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Demo people (20 active)")).toBeVisible();
  await page.getByRole("button", { name: "Load demo data" }).click();
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
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page.getByText("CEOITBox API key is not configured.")).toBeVisible();
});

test("'Try as' a demo buyer; raise a purchase with a quote attached", async ({ page, context }) => {
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/demo");
  await page.getByRole("row", { name: /demo\.buyer/ }).getByRole("button", { name: "Try as" }).click();
  await page.getByRole("button", { name: "Yes, continue" }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText("You're trying the app as Arjun Das (demo)", { exact: false })).toBeVisible();

  await page.goto("/users/new");
  await page.getByRole("link", { name: /Purchase & SCM Approval/ }).click();
  await page.getByLabel("Title").fill("Spare motor for crane 3");
  await page.getByLabel("Item or service").fill("Crane motor");
  await page.getByLabel(/Amount/).fill("50,000");
  await page.getByLabel(/In the approved budget/).selectOption("Yes");
  await page.getByLabel("Details").fill("Breakdown spare");
  await page.getByLabel(/Attachments/).setInputFiles(QUOTE);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1$/);
  requestPath = new URL(page.url()).pathname;

  // ₹50,000 is under the first band: only the SCM head approves.
  await expect(page.getByText("Purchase & SCM head").first()).toBeVisible();
  await expect(page.getByText(/Arjun Das \(demo\) attached quote\.pdf/)).toBeVisible();
  const link = page.getByRole("link", { name: "quote.pdf" });
  downloadPath = (await link.getAttribute("href")) ?? "";
  const response = await page.request.get(downloadPath);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect((await response.body()).toString()).toContain("E2E quote");
});

test("a wrong file type is refused, and an outsider can't download", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  expect((await page.request.get(downloadPath)).status()).toBe(404);
  expect((await page.goto(requestPath))?.status()).toBe(404);

  await page.goto("/users/new");
  await page.getByRole("link", { name: /IT Internal/ }).click();
  await page.getByLabel("Title").fill("New mouse");
  await page.getByLabel("Request type").selectOption("New hardware");
  await page.getByLabel("Details").fill("Broken");
  await page.getByLabel(/Attachments/).setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ this is not a pdf") });
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("invoice.pdf doesn't look like a real PDF file.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/users\/new/);
});
