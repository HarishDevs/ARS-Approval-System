import { expect, test, type BrowserContext } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, sessionCookie, userIdByLogin } from "./db";

// v1.7.2 through the real screens: Collaborating (its own screen, with the
// full filter set), and the same filters on My requests and Waiting for me.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

let sharedTitle = "";

test.beforeAll(async () => {
  // Sita (staff) follows two of Ravi's requests; earlier specs raised them.
  const staff = await userIdByLogin("E2E_STAFF");
  const requester = await userIdByLogin("E2E_REQ");
  const conn = await db();
  try {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id, title FROM approval_requests WHERE requester_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 2", [requester]);
    for (const row of rows) {
      await conn.query<ResultSetHeader>(
        "INSERT INTO request_collaborators (request_id, user_id, added_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE removed_at = NULL, removed_by = NULL",
        [row.id, staff, requester],
      );
    }
    sharedTitle = String(rows[0]!.title);
  } finally {
    await conn.end();
  }
});

test("Collaborating is its own screen in the sidebar, with quick tabs and the full filter set", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await page.goto("/users");
  await page.locator("aside nav").getByRole("button", { name: "My Approvals" }).click();
  await page.locator("aside nav").getByRole("link", { name: "Collaborating" }).click();
  await expect(page).toHaveURL(/\/users\/collaborating$/);
  await expect(page.getByRole("heading", { level: 1, name: "Collaborating" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shared with me" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: sharedTitle }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: /^All \(\d+\)$/ })).toHaveAttribute("aria-current", "page");

  await page.getByText("More filters").click();
  for (const label of ["Approval type", "Raised by", "Their department", "Added me", "Waiting at step", "Waiting with", "Due within", "Files", "Approval validity", "Raised from", "Added me from", "Closed from", "Last activity from"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.getByLabel("Raised by", { exact: true }).selectOption({ label: "Ravi Requester" });
  await page.getByLabel("Withdrawn").check();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/raisedBy=\d+/);
  await expect(page).toHaveURL(/status=CANCELLED/);
  // Each filter shows as a chip that removes it.
  await page.getByRole("link", { name: "Remove filter: Status: Withdrawn" }).click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.getByRole("link", { name: /Remove filter: Raised by: Ravi Requester/ })).toBeVisible();
  await expect(page.getByRole("link", { name: sharedTitle }).first()).toBeVisible();

  // Save it, and it comes back as a chip.
  await page.getByText("Save these filters").click();
  await page.getByLabel("View name").fill("Ravi's requests");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByTestId("saved-views").getByRole("link", { name: "Ravi's requests" })).toBeVisible();

  // The old tab address lands here.
  await page.goto("/users/requests?tab=shared");
  await expect(page).toHaveURL(/\/users\/collaborating/);
});

test("My requests has the same filters", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/requests");
  await page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: /^Open \(/ }).click();
  await expect(page).toHaveURL(/tab=open/);
  await page.getByText("More filters").click();
  await expect(page.getByLabel("Waiting at step")).toBeVisible();
  await expect(page.getByLabel("Raised by", { exact: true })).toHaveCount(0); // they're all yours
  await page.getByLabel("Order").selectOption("number");
  await page.getByLabel("Per page").selectOption("50");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/sort=number/);
  await expect(page).toHaveURL(/size=50/);
  await expect(page.getByRole("status").filter({ hasText: /request|No requests match/ }).first()).toBeVisible();
});

test("Waiting for me has more filters, and every one becomes a removable chip", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  await page.getByText("More filters").click();
  for (const label of ["Search", "Raised by", "Their department", "Step", "Due within", "Files", "Per page", "Raised from", "Waiting since from"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.getByLabel("Files", { exact: true }).selectOption("no");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/files=no/);
  await page.getByRole("link", { name: "Remove filter: Without files" }).click();
  await expect(page).not.toHaveURL(/files=/);
});
