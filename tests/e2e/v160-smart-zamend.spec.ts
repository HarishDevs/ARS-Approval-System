import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// Unified prompt FN5 through the real screens: IT allows amendments of
// Freight on "E2E Smart" (built by v160-smart-forms, checks switched on by
// v160-smart-readiness); the requester amends an approved request; the
// approver approves the amendment; the original shows the values in force.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function pendingApprover(requestPath: string): Promise<string> {
  const conn = await db();
  try {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT u.login_id FROM approval_tasks t JOIN users u ON u.id = t.approver_id WHERE t.request_id = ? AND t.status = 'PENDING' LIMIT 1", [Number(requestPath.split("/").pop())]);
    if (!rows[0]) throw new Error("no pending task");
    return rows[0].login_id as string;
  } finally {
    await conn.end();
  }
}

async function approveAll(page: Page, context: BrowserContext, requestPath: string) {
  for (let step = 0; step < 4; step += 1) {
    const conn = await db();
    const [[row]] = await conn.query<RowDataPacket[]>("SELECT status FROM approval_requests WHERE id = ?", [Number(requestPath.split("/").pop())]);
    await conn.end();
    if (row!.status === "APPROVED") return;
    await as(context, await pendingApprover(requestPath));
    await page.goto(requestPath);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    // Done when the decision form has gone (earlier levels already say "Approved by").
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  }
}

let originalPath = "";

test("IT allows amending Freight; the requester raises a request that gets approved", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows");
  await page.getByRole("link", { name: "E2E Smart" }).first().click();
  const checks = page.locator("form", { hasText: "Submission checks" });
  await checks.getByLabel(/Allow the requester to propose changes/).check();
  await checks.getByRole("group", { name: "Amendments after approval" }).getByLabel("Freight").check();
  await checks.getByRole("button", { name: "Save checks" }).click();
  await expect(checks.getByText(/Saved\. New submissions use these checks/)).toBeVisible();

  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E Smart/ }).click();
  await page.getByLabel("Title").fill("Hoist rope");
  await page.getByLabel("Kind").selectOption("Opex");
  await page.getByLabel("Line 1 description").fill("Rope");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 rate in rupees").fill("2000");
  await page.getByLabel("Freight").fill("100");
  await page.getByRole("button", { name: "Submit request" }).click();
  if (await page.getByLabel("I've read the warnings and want to submit.").isVisible().catch(() => false)) {
    await page.getByLabel("I've read the warnings and want to submit.").check();
    await page.getByRole("button", { name: "Submit request" }).click();
  }
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  originalPath = new URL(page.url()).pathname;
  await approveAll(page, context, originalPath);
});

test("the requester amends Freight with a reason; locked fields can't change; approval runs again", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(originalPath);
  const card = page.getByRole("region", { name: "Amendments" });
  await card.getByRole("link", { name: "Amend" }).click();
  await expect(page).toHaveURL(new RegExp(`${originalPath}/amend$`));
  await expect(page.getByLabel("Kind")).toBeDisabled();
  await expect(page.getByText("Can't be changed by an amendment.").first()).toBeVisible();
  await page.getByLabel("Freight").fill("350");
  await page.getByRole("button", { name: "Submit amendment" }).click();
  await expect(page.locator("#amendReason-error")).toContainText("at least 10 characters");
  await page.getByLabel("Why does it need amending?").fill("Transporter revised the freight charge");
  await page.getByRole("button", { name: "Submit amendment" }).click();
  if (await page.getByLabel("I've read the warnings and want to submit.").isVisible().catch(() => false)) {
    await page.getByLabel("I've read the warnings and want to submit.").check();
    await page.getByRole("button", { name: "Submit amendment" }).click();
  }
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  const amendmentPath = new URL(page.url()).pathname;
  const about = page.getByRole("region", { name: "Amendment" });
  await expect(about.getByText("Transporter revised the freight charge")).toBeVisible();
  await expect(about.getByRole("listitem").filter({ hasText: "Freight:" })).toContainText("100");
  await expect(about.getByRole("listitem").filter({ hasText: "Freight:" })).toContainText("350");

  await approveAll(page, context, amendmentPath);
  await as(context, "E2E_REQ");
  await page.goto(originalPath);
  await expect(page.getByRole("region", { name: "Amendments" }).getByText(/Amended: the values in force are from ESM-/)).toBeVisible();
});
