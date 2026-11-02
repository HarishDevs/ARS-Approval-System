import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dropCustomDraft, sessionCookie } from "./db";

// v1.5.0 (owner's development spec) through the real screens. Uses the
// "E2E Purchase" type (manager → HOD) published by approval-flow.spec.ts.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function openPurchaseForm(page: Page) {
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Purchase/ }).click();
  await expect(page.getByLabel("Title")).toBeVisible();
}

async function raise(page: Page, title: string): Promise<string> {
  await openPurchaseForm(page);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel(/Amount/).fill("12,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  return new URL(page.url()).pathname;
}

const bulkTitles = ["E2E bulk chairs", "E2E bulk desks"];
let bulkPaths: string[] = [];

test("#3 a draft is saved as you type, restored, and discarded", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await openPurchaseForm(page);
  await page.getByLabel("Title").fill("E2E draft: office chairs");
  await expect(page.getByText(/Draft saved/)).toBeVisible();

  await page.goto("/users?home=approvals");
  await expect(page.getByRole("heading", { name: "Your drafts" })).toBeVisible();
  await page.getByRole("link", { name: /E2E draft: office chairs/ }).click();
  await expect(page.getByText(/Restored your draft/)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("E2E draft: office chairs");

  await page.getByRole("button", { name: "Discard draft" }).click();
  await page.getByRole("button", { name: "Yes, discard" }).click();
  // The form reloads empty once the draft is gone.
  await expect(page.getByText(/Restored your draft/)).toHaveCount(0);
  await expect(page.getByLabel("Title")).toHaveValue("");
  await page.goto("/users?home=approvals");
  await expect(page.getByRole("link", { name: /E2E draft: office chairs/ })).toHaveCount(0);
});

test("#3 submitting removes the draft", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await openPurchaseForm(page);
  await page.getByLabel("Title").fill(bulkTitles[0]!);
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.getByLabel(/Amount/).fill("12,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  bulkPaths = [new URL(page.url()).pathname];
  await dropCustomDraft("E2E_REQ"); // another file's New request draft isn't this one
  await page.goto("/users?home=approvals");
  // D-265: the Your drafts card is always there; the submitted one isn't in it.
  await expect(page.getByRole("region", { name: "Your drafts" }).getByRole("link", { name: new RegExp(bulkTitles[0]!) })).toHaveCount(0);
  bulkPaths.push(await raise(page, bulkTitles[1]!));
});

test("#4 search finds what you can see, not what you can't", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/search?q=E2E+bulk");
  await expect(page.getByText("2 requests")).toBeVisible();
  await as(context, "E2E_STAFF");
  await page.goto("/users/search?q=E2E+bulk");
  await expect(page.getByText("No requests match.")).toBeVisible();
});

test("#6 notification choices are saved; the mandatory ones are locked on", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/notifications/settings");
  await expect(page.getByLabel("Work waiting for you by email")).toBeDisabled();
  const fyi = page.getByLabel("For your information by WhatsApp");
  await fyi.uncheck();
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("For your information by WhatsApp")).not.toBeChecked();
  await expect(page.getByLabel("For your information by email")).toBeChecked();
});

test("#7 the manager approves two at once after reviewing them", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  const bulk = page.getByRole("region", { name: "Approve several at once" });
  for (const title of bulkTitles) await bulk.getByRole("checkbox", { name: new RegExp(title) }).check();
  await bulk.getByRole("button", { name: /Review 2 approvals/ }).click();
  await expect(page.getByRole("alertdialog", { name: "Confirm approvals" })).toContainText(bulkTitles[0]!);
  await page.getByRole("button", { name: "Yes, approve 2" }).click();
  await expect(page.getByText("Approved 2.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Results" }).getByText(/approved/)).toHaveCount(2);
});

test("#5 on a phone the HOD finds it as a card and approves it", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(context, "E2E_HOD");
  await page.goto("/users/queue");
  await page.getByRole("link", { name: bulkTitles[0]! }).first().click();
  await expect(page).toHaveURL(new RegExp(`${bulkPaths[0]}$`));
  // RA-02: the phone decision bar opens a drawer with the comment and that one action.
  await page.getByRole("region", { name: "Your decision" }).getByRole("button", { name: "Approve" }).click();
  const drawer = page.getByRole("dialog", { name: "Approve" });
  await expect(drawer.getByLabel(/Comment/)).toBeFocused();
  await drawer.getByRole("button", { name: "Approve", exact: true }).click();
  // v1.48.0: on a phone the journey's detailed-levels card is hidden; the level list shows the decision.
  await expect(page.getByRole("listitem").filter({ hasText: /Harini HOD/ }).filter({ hasText: /Approved/ }).filter({ visible: true }).first()).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await page.screenshot({ path: "test-results/v150-phone-decision.png", fullPage: true });
});

test("#9 #10 a mention and the PDF summary, both limited to who can see it", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(bulkPaths[1]!);
  await page.getByLabel("Add a comment").fill("@E2E_MGR thanks. @E2E_STAFF fyi");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(/Not notified .*@E2E_STAFF/)).toBeVisible();

  const pdf = await page.request.get(`/api/requests/${bulkPaths[1]!.split("/").pop()}/summary.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["x-request-id"]).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await as(context, "E2E_STAFF");
  const denied = await page.request.get(`/api/requests/${bulkPaths[1]!.split("/").pop()}/summary.pdf`);
  expect(denied.status()).toBe(404);
});

test("#13 help is searchable and copies details for IT", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await page.goto("/users/help");
  await page.getByLabel("Search help").fill("on hold");
  await expect(page.getByText("An approver paused it.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy details for IT" })).toBeVisible();
});

test("#12 IT sees the workload", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workload");
  await expect(page.getByRole("heading", { name: "Workload" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Harini HOD" })).toBeVisible();
});
