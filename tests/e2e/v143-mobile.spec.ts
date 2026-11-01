import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dropCustomDraft, phoneLayoutCookie, sessionCookie, toWorkflowStep } from "./db";

// v1.43.0 (owner's mobile brief): phones (below 768 px) get the mobile
// layout in the users area; computers keep the desktop layout unchanged.
async function phone(context: BrowserContext, page: Page, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId), phoneLayoutCookie()]);
  await page.setViewportSize({ width: 390, height: 844 });
}

test("a phone opens Home with the attention line, the counts and the bottom tabs; a computer keeps the sidebar", async ({ page, context }) => {
  await phone(context, page, "E2E_MGR");
  await page.goto("/users");
  await expect(page.getByTestId("mobile-home")).toBeVisible();
  await expect(page.getByTestId("m-attention")).toBeVisible();
  await expect(page.getByTestId("m-kpis").getByRole("link")).toHaveCount(4);
  const tabs = page.getByTestId("mobile-tabbar");
  for (const name of ["Home", "Approvals", "Tasks", "Inbox", "More"]) await expect(tabs.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  await expect(tabs.getByRole("link", { name: /^Home/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("mobile-topbar")).toBeVisible();
  // Nothing sideways: the page fits the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Widening the window switches to the desktop layout (no reload needed).
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId("mobile-tabbar")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("mobile-home")).toHaveCount(0);
  // The mobile-only addresses lead to their desktop pages.
  await page.goto("/users/approvals");
  await expect(page).toHaveURL(/\/users\/queue/);
  await page.goto("/users/more");
  await expect(page).toHaveURL(/\/users$/);
});

// A custom request from Sam (E2E_STAFF) to Manoj, raised on a computer.
async function raiseForManager(page: Page, context: BrowserContext, title: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie("E2E_STAFF")]);
  await dropCustomDraft("E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(title);
  await toWorkflowStep(page);
  const level = page.getByTestId("workflow-level").filter({ visible: true }).last();
  await level.getByLabel("Who approves").selectOption("PEOPLE");
  await level.getByRole("combobox", { name: /People \(search and pick/ }).fill("Manoj");
  await page.getByRole("option", { name: /Manoj Manager/ }).first().click();
  await page.getByTestId("step-next").click();
  await page.getByTestId("action-bar").getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
}

test("Approvals: four tabs as cards; a card opens the request with the decision bar; Return opens its drawer", async ({ page, context }) => {
  await raiseForManager(page, context, "Mobile card check");
  await phone(context, page, "E2E_MGR");
  await page.goto("/users/approvals");
  const lists = page.getByRole("navigation", { name: "Approval lists" });
  for (const name of ["Waiting for me", "My requests", "Approved", "Drafts"]) await expect(lists.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  const card = page.getByTestId("m-approval-card").filter({ hasText: "Mobile card check" }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Requested by");
  await expect(card).toContainText("Waiting");
  await card.click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+/);
  const bar = page.getByRole("region", { name: "Your decision" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Reject" })).toBeVisible();
  // The bar sits on the tab bar, not under it.
  const [barBox, tabBox] = await Promise.all([bar.boundingBox(), page.getByTestId("mobile-tabbar").boundingBox()]);
  expect(Math.round(barBox!.y + barBox!.height)).toBeLessThanOrEqual(Math.round(tabBox!.y) + 1);
  await bar.getByRole("button", { name: "Return" }).click();
  const drawer = page.getByRole("dialog", { name: "Ask for changes" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Comment")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.goto("/users/approvals?tab=drafts");
  await expect(lists.getByRole("link", { name: /Drafts/ })).toHaveAttribute("aria-current", "page");
});

test("Tasks: tabs, cards and the + that opens the one Create task window", async ({ page, context }) => {
  await phone(context, page, "E2E_STAFF");
  await page.goto("/users/work/my-tasks");
  await expect(page.getByTestId("mobile-tasks")).toBeVisible();
  const lists = page.getByRole("navigation", { name: "Task lists" });
  for (const name of ["Today", "Upcoming", "Overdue", "Completed", "Assigned by me"]) await expect(lists.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await lists.getByRole("link", { name: /Upcoming/ }).click();
  await expect(page).toHaveURL(/tab=upcoming/);
  await page.getByTestId("m-task-fab").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Inbox has All, Approvals, Tasks, Information and Mentions; More lists the rest and asks before signing out", async ({ page, context }) => {
  await phone(context, page, "E2E_REQ");
  await page.goto("/users/inbox");
  const views = page.getByRole("navigation", { name: "Inbox views" });
  for (const name of ["All", "Approvals", "Tasks", "Information", "Mentions"]) await expect(views.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  await views.getByRole("link", { name: /^Mentions/ }).click();
  await expect(page).toHaveURL(/mentions=1/);
  await expect(views.getByRole("link", { name: /^Mentions/ })).toHaveAttribute("aria-current", "page");

  await page.getByTestId("mobile-tabbar").getByRole("link", { name: "More" }).click();
  await expect(page.getByTestId("mobile-more")).toBeVisible();
  await expect(page.getByTestId("more-profile")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Sign out?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(/\/users\/more/);
});
