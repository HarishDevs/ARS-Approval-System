import { expect, test, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.51.2 (owner: "every form submission or record creation like user
// creation is either asking leave this page but submitting, or shows an
// error and then submitting"): submitting a form that opens its new record
// must never ask "Leave?" and never flash an error on the way.
const unique = (prefix: string) => `${prefix}_${Date.now().toString(36).toUpperCase()}`;

// Records every dialog and every alert or status text shown while the page works.
async function watch(page: Page) {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __alerts: string[] }).__alerts = seen;
    const note = () => {
      for (const element of document.querySelectorAll('[role="alert"], [role="alertdialog"]')) {
        const text = (element.textContent ?? "").trim();
        if (text && !seen.includes(text)) seen.push(text);
      }
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  return {
    dialogs,
    alerts: () => page.evaluate(() => (window as unknown as { __alerts?: string[] }).__alerts ?? []).catch(() => [] as string[]),
  };
}

test("Add user: no Leave dialog, no error on the way to the new user", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  const loginId = unique("E2E_FORM");
  await page.goto("/admin/users/new");
  const seen = await watch(page);
  await page.getByLabel("Full name", { exact: true }).fill(`Form Check ${loginId}`);
  await page.getByLabel("User ID", { exact: true }).fill(loginId);
  await page.getByLabel("Email", { exact: true }).fill(`${loginId.toLowerCase()}@example.com`);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+\?created=1/);
  await page.waitForTimeout(1500);
  expect(seen.dialogs).toEqual([]);
  expect(await seen.alerts()).toEqual([]);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Schedule a meeting: no Leave dialog, no error on the way to the meeting", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users/meetings/new");
  const seen = await watch(page);
  await page.locator("#mtg-title").fill(unique("Form check meeting"));
  await page.locator("#mtg-type").selectOption({ index: 1 });
  await page.getByRole("combobox", { name: "Meeting Owner", exact: true }).fill("Manoj");
  await page.getByRole("option", { name: /Manoj Manager/ }).first().click();
  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page).toHaveURL(/\/users\/meetings\/\d+\?scheduled=1/);
  await page.waitForTimeout(1500);
  expect(seen.dialogs).toEqual([]);
  expect(await seen.alerts()).toEqual([]);
});

test("a refused save shows only its own message and stays unsaved", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users/meetings/new");
  const seen = await watch(page);
  await page.locator("#mtg-title").fill(unique("No owner"));
  await page.locator("#mtg-type").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page.getByText("Choose the Meeting Owner.")).toBeVisible();
  await expect(page).toHaveURL(/\/users\/meetings\/new$/);
  expect((await seen.alerts()).filter((text) => /unexpected|Couldn't reach/.test(text))).toEqual([]);
  // Still unsaved: leaving through a link asks first.
  await page.getByTestId("sidebar").getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByRole("alertdialog").filter({ hasText: "Leave without saving?" })).toBeVisible();
});

// v1.52.2 (owner): attachments are listed one by one; a second pick adds to the
// first instead of replacing it; any file can be removed.
test("attachments: each pick adds to the list, files show by name and can be removed", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users/custom");
  const picker = page.locator("#c-attachments");
  await picker.setInputFiles({ name: "quote-one.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 one") });
  await picker.setInputFiles({ name: "quote-two.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 two two") });
  const list = page.getByTestId("chosen-files");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("quote-one.pdf");
  await expect(list).toContainText("quote-two.pdf");
  // What the form sends: both files.
  expect(await page.locator('input[name="attachments"]').evaluate((input) => (input as HTMLInputElement).files?.length)).toBe(2);
  await list.getByRole("button", { name: "Remove quote-one.pdf" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("quote-two.pdf");
  expect(await page.locator('input[name="attachments"]').evaluate((input) => (input as HTMLInputElement).files?.length)).toBe(1);
  await page.screenshot({ path: "test-results/v1522-attachments.png", fullPage: false });
});
