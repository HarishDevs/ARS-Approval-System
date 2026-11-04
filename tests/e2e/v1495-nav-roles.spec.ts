import { expect, test, type BrowserContext } from "@playwright/test";
import type { RowDataPacket } from "mysql2/promise";
import { db, dropCustomDraft, sessionCookie, toWorkflowStep } from "./db";

// v1.49.5 (owner): a requester (designation not ticked Approver) sees only New
// request, My pending requests, My approved requests and Collaborating; an
// approver sees every My Approvals page. A request opened from Waiting for me
// highlights Waiting for me, not My pending requests. No Open card; no cards
// on My approved requests. Super Admin → Requests: tick and Delete selected.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

const APPROVER_PAGES = ["Waiting for me", "Approved by me", "Request templates"];
const REQUESTER_PAGES = ["New request", "My pending requests", "My approved requests", "Collaborating"];
let requestPath = "";

test("a requester sees only the four requester pages; no Open card, no cards on My approved requests", async ({ page, context }) => {
  await as(context, "E2E_STAFF");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/requests");
  const sidebar = page.getByTestId("sidebar-scroll");
  for (const name of REQUESTER_PAGES) await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of APPROVER_PAGES) await expect(sidebar.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveCount(0);

  const cards = page.getByTestId("status-cards");
  await expect(cards.getByRole("link", { name: /^All \(/ })).toBeVisible();
  await expect(cards.getByRole("link", { name: /^Open \(/ })).toHaveCount(0);
  // The filter still answers an older link.
  await page.goto("/users/requests?tab=open");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/users/approved");
  await expect(page.getByTestId("status-cards")).toHaveCount(0);
});

test("an approver sees every page; a request opened from Waiting for me highlights Waiting for me", async ({ page, context }) => {
  await dropCustomDraft("E2E_REQ");
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(`Nav owner ${Date.now().toString(36)}`);
  // The custom request starts with the reporting manager (Manoj Manager) as approver.
  await toWorkflowStep(page);
  await page.getByTestId("step-next").click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;
  // The requester's own request in progress: My pending requests.
  await expect(page.getByTestId("sidebar-scroll").getByRole("link", { name: "My pending requests", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "← Back to My pending requests" })).toBeVisible();

  await as(context, "E2E_MGR");
  await page.goto("/users/queue");
  const sidebar = page.getByTestId("sidebar-scroll");
  for (const name of [...REQUESTER_PAGES, "Approved by me", "Request templates"]) await expect(sidebar.getByRole("link", { name, exact: true })).toBeVisible();
  await page.goto(requestPath);
  await expect(page.getByRole("link", { name: "← Back to Waiting for me" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /^Waiting for me/ })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "My pending requests", exact: true })).not.toHaveAttribute("aria-current", "page");
});

test("Classic view: the request's tab is Waiting for me for the approver", async ({ page, context }) => {
  const connection = await db();
  try {
    await connection.query(
      "INSERT INTO user_settings (user_id, setting_key, value) SELECT id, 'ui.workspace_view', 'CLASSIC' FROM users WHERE login_id = 'E2E_MGR' ON DUPLICATE KEY UPDATE value = VALUES(value)",
    );
    await as(context, "E2E_MGR");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(requestPath);
    await expect(page.locator('[aria-current="page"]').filter({ hasText: /^Waiting for me/ }).first()).toBeVisible();
    await expect(page.locator('[aria-current="page"]').filter({ hasText: /^My pending requests$/ })).toHaveCount(0);
  } finally {
    await connection.query("DELETE s FROM user_settings s JOIN users u ON u.id = s.user_id WHERE u.login_id = 'E2E_MGR' AND s.setting_key = 'ui.workspace_view'");
    await connection.end();
  }
});

test("Super Admin → Requests: tick a request and Delete selected", async ({ page, context }) => {
  const requestId = Number(requestPath.split("/").at(-1));
  const connection = await db();
  try {
    const [rows] = await connection.query<(RowDataPacket & { request_no: string })[]>("SELECT request_no FROM approval_requests WHERE id = ?", [requestId]);
    const requestNo = rows[0]!.request_no;
    await as(context, "E2E_SUPER");
    await page.goto(`/superadmin/requests?q=${encodeURIComponent(requestNo)}`);
    await page.getByRole("checkbox", { name: `Select ${requestNo}` }).check();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Delete selected" }).click();
    await page.getByLabel("Delete 1 request? Why?").fill("Navigation test request");
    await page.getByRole("button", { name: "Yes, delete 1" }).click();
    await expect(page.getByText("1 request deleted.")).toBeVisible();
    await expect
      .poll(async () => {
        const [left] = await connection.query<(RowDataPacket & { deleted_at: Date | null })[]>("SELECT deleted_at FROM approval_requests WHERE id = ?", [requestId]);
        return left[0]?.deleted_at !== null;
      })
      .toBe(true);
  } finally {
    await connection.end();
  }
});
