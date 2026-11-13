import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dropCustomDraft, raisePurchase, sessionCookie, toReviewStep } from "./db";

// v1.5.0 (owner's development spec) through the real screens. v1.54.0
// (D-309): requests are raised from the requester's "E2E Purchase" approval
// template (manager → HOD); drafts belong to New request.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function openPurchaseForm(page: Page) {
  await dropCustomDraft("E2E_REQ");
  await page.goto("/users/custom");
  await expect(page.getByLabel("Title")).toBeVisible();
}

const raise = raisePurchase;

// v1.54.0: the third (from the two-level template) stays waiting for the HOD for later files (v160-workspace, the workload).
const bulkTitles = ["E2E bulk chairs", "E2E bulk desks", "E2E bulk lamps"];
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
  await page.getByRole("button", { name: "Yes, reset" }).click();
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
  await toReviewStep(page);
  await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  bulkPaths = [new URL(page.url()).pathname];
  await page.goto("/users?home=approvals");
  // D-265: the Your drafts card is always there; the submitted one isn't in it.
  await expect(page.getByRole("region", { name: "Your drafts" }).getByRole("link", { name: new RegExp(bulkTitles[0]!) })).toHaveCount(0);
  bulkPaths.push(await raise(page, bulkTitles[1]!));
  bulkPaths.push(await raise(page, bulkTitles[2]!));
});

test("#4 search finds what you can see, not what you can't", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/search?q=E2E+bulk");
  await expect(page.getByText("3 requests")).toBeVisible();
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

test("#7 Waiting for me has no bulk panel; the manager approves each one on its page", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  // v1.54.7 (owner: "drop this in the waiting for me").
  await expect(page.getByRole("region", { name: "Approve several at once" })).toHaveCount(0);
  for (const path of bulkPaths) {
    await page.goto(path);
    await page.getByTestId("decision-buttons").getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByTestId("decision-buttons")).toHaveCount(0);
  }
});

test("#5 on a phone the HOD finds it as a card and approves it", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as(context, "E2E_HOD");
  await page.goto("/users/queue");
  // v1.54.0: the second one came from the two-level template (the first, from plain New request, ended with the manager).
  await page.getByRole("link", { name: bulkTitles[1]! }).first().click();
  await expect(page).toHaveURL(new RegExp(`${bulkPaths[1]}$`));
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
