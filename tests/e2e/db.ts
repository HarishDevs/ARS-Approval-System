import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { E2E_ENV } from "../../playwright.config";

// Test-only helpers for the e2e suite: direct SQL against ars_approvals_test
// and session cookies signed the same way the app signs them.
export async function db() {
  return mysql.createConnection({
    host: E2E_ENV.DB_HOST,
    port: Number(E2E_ENV.DB_PORT),
    user: E2E_ENV.DB_USER,
    password: E2E_ENV.DB_PASSWORD,
    database: E2E_ENV.DB_NAME,
  });
}

export async function userIdByLogin(loginId: string): Promise<number> {
  const conn = await db();
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT id FROM users WHERE login_id = ?", [loginId]);
    if (!rows[0]) throw new Error(`no e2e user ${loginId}`);
    return rows[0].id as number;
  } finally {
    await conn.end();
  }
}

// A real session row + the signed cookie value (as lib/session/token.ts).
// v1.14.0 (D-167): the onboarding tour opens by itself for anyone who hasn't
// done it, which would cover every screen under test; people signed in here
// have done it unless a test asks otherwise ({ tourDone: false }).
export async function sessionCookie(loginId: string, options: { tourDone?: boolean } = {}): Promise<{ name: string; value: string; domain: string; path: string }> {
  const userId = await userIdByLogin(loginId);
  const sid = crypto.randomUUID();
  const conn = await db();
  try {
    await conn.query(
      "INSERT INTO user_sessions (id, user_id, auth_method, user_agent, expires_at) VALUES (?, ?, 'GOOGLE', 'e2e', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR))",
      [sid, userId],
    );
    if (options.tourDone === false) await conn.query("DELETE FROM user_flags WHERE user_id = ? AND flag = 'TOUR_DONE'", [userId]);
    else await conn.query("INSERT IGNORE INTO user_flags (user_id, flag) VALUES (?, 'TOUR_DONE')", [userId]);
    // D-251: likewise the install invitation (it would cover the corner of every screen).
    await conn.query("INSERT IGNORE INTO user_flags (user_id, flag) VALUES (?, 'INSTALL_INVITE_DISMISSED')", [userId]);
  } finally {
    await conn.end();
  }
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ sid, uid: userId, iat: now, exp: now + 7200 })).toString("base64url");
  const signature = crypto.createHmac("sha256", E2E_ENV.SESSION_SECRET).update(`session:${encoded}`).digest("base64url");
  return { name: "ars_session", value: `${encoded}.${signature}`, domain: "localhost", path: "/" };
}

// D-263: New request's workflow opens with Next, once the required details are
// filled in. Fills a title and any required field Next points out (text "x",
// the first choice, a date), then moves to the workflow step.
export async function toWorkflowStep(page: import("@playwright/test").Page): Promise<void> {
  const title = page.locator("#c-title");
  if (!(await title.inputValue())) await title.fill("Workflow check");
  for (let round = 0; round < 3; round += 1) {
    await page.getByTestId("step-next").click();
    // Moved on (the note about the locked workflow shows on wide screens only, so ask the steps).
    if ((await page.getByTestId("request-steps").getByRole("button", { name: /Approval workflow/ }).getAttribute("aria-current")) === "step") return;
    for (const field of await page.locator('[data-testid="step-details"] [aria-invalid="true"], [data-testid="step-details"] [data-invalid="true"]').all()) {
      const tag = await field.evaluate((element) => element.tagName);
      const type = (await field.getAttribute("type")) ?? "";
      if (tag === "SELECT") await field.selectOption({ index: 1 });
      else if (tag === "BUTTON" && (await field.getAttribute("aria-haspopup")) === "listbox") {
        // v1.52.1: a person field is a searchable list; take the first person.
        await field.click();
        await page.getByRole("listbox", { name: "People" }).getByRole("option").filter({ hasText: " - " }).first().click();
      }
      else if (type === "date") await field.fill("2031-01-15");
      else if (type === "datetime-local") await field.fill("2031-01-15T10:00");
      else await field.fill(type === "url" ? "https://example.com" : "1");
    }
  }
}

// Then on to Review & submit, where Submit is.
export async function toReviewStep(page: import("@playwright/test").Page): Promise<void> {
  await toWorkflowStep(page);
  await page.getByTestId("step-next").click();
}

// The custom request's own draft, which toWorkflowStep's title leaves behind
// (the form saves itself as you type): cleared so the next test starts empty.
export async function dropCustomDraft(loginId: string): Promise<void> {
  const conn = await db();
  try {
    await conn.query("DELETE d FROM request_drafts d JOIN users u ON u.id = d.user_id WHERE u.login_id = ? AND d.draft_key = 'CUSTOM'", [loginId]);
  } finally {
    await conn.end();
  }
}

// v1.43.0: the layout cookie a phone's first page sets (LayoutSync). Real
// phones are known by their browser; the test browser is desktop Chrome at
// phone size, so a test that opens a mobile-only address sets it first.
export function phoneLayoutCookie(): { name: string; value: string; domain: string; path: string } {
  return { name: "ars_layout", value: "mobile", domain: "localhost", path: "/" };
}
