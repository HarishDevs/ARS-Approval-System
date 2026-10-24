import { expect, test } from "@playwright/test";
import type { ResultSetHeader } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// D-185, D-187: AI Rules and Try as through the real screens.
test.describe.configure({ mode: "serial" });
const tag = Date.now().toString(36).toUpperCase();

test("AI Rules: a formatted rule for one chat is saved as Markdown", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.goto("/admin/ai-rules");
  await page.getByLabel("Rules for", { exact: true }).selectOption("COMBINED");
  const editor = page.getByRole("textbox", { name: "AI rules for Combined" });
  await editor.click();
  await page.keyboard.type(`Dealers ${tag}`);
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Saved. Pic bot follows these rules from the next question.")).toBeVisible();
  const conn = await db();
  try {
    const [rows] = await conn.query<(ResultSetHeader & { content: string })[]>("SELECT content FROM ai_rules WHERE chat_mode = 'COMBINED'");
    expect(String((rows as unknown as { content: string }[])[0]?.content)).toContain(`Dealers ${tag}`);
    await conn.query("DELETE FROM ai_rules WHERE chat_mode = 'COMBINED'");
  } finally {
    await conn.end();
  }
});

test("Try as: a one-time link that never replaces a signed-in session", async ({ page, context }) => {
  const conn = await db();
  let id: number;
  try {
    const [result] = await conn.query<ResultSetHeader>("INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, ?, ?, 'GOOGLE', TRUE)", [`TRY_${tag}`, `Person TRY_${tag}`, `try_${tag.toLowerCase()}@example.test`]);
    id = result.insertId;
    await conn.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [id]);
  } finally {
    await conn.end();
  }
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.goto(`/admin/users/${id}`);
  await page.getByRole("button", { name: "Try as" }).click();
  const link = await page.getByRole("textbox", { name: "Try as link" }).inputValue();
  expect(link).toContain("/api/auth/try/");
  await page.goto(link);
  await expect(page).toHaveURL(/\/try\?reason=SIGNED_IN$/);
  await page.goto("/superadmin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // still the Super Admin
});
