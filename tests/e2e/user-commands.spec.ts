import { expect, test } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// Audit B-01: "Sign out everywhere" and "Deactivate user" asked for a
// confirmation that was never shown, so they could never run.
test("IT can sign a person out everywhere and deactivate them, after confirming", async ({ page, context }) => {
  const connection = await db();
  const loginId = `E2E_LEAVER_${Date.now()}`;
  const [created] = await connection.query<ResultSetHeader>(
    "INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, 'Lee Leaver', ?, 'GOOGLE', TRUE)",
    [loginId, `${loginId.toLowerCase()}@example.test`],
  );
  const userId = created.insertId;
  await connection.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [userId]);
  try {
    const leaverCookie = await sessionCookie(loginId); // an open session to end
    expect(leaverCookie.value).toBeTruthy();
    await context.addCookies([await sessionCookie("E2E_ADMIN")]);
    await page.goto(`/admin/users/${userId}`);

    const signOut = page.locator("form").filter({ hasText: "Ends every open session" });
    await signOut.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(signOut.getByRole("alertdialog")).toContainText("Sign Lee Leaver out on every device?");
    await signOut.getByRole("button", { name: "Yes, continue" }).click();
    await expect(signOut.getByText("Ended 1 session.")).toBeVisible();
    await expect
      .poll(async () => {
        const [rows] = await connection.query<(RowDataPacket & { open: number })[]>("SELECT COUNT(*) AS open FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL", [userId]);
        return Number(rows[0]?.open);
      })
      .toBe(0);

    const deactivate = page.locator("form").filter({ hasText: "Blocks sign-in" });
    await deactivate.getByRole("button", { name: "Deactivate user" }).click();
    await deactivate.getByRole("button", { name: "Cancel" }).click();
    await expect(deactivate.getByRole("alertdialog")).toHaveCount(0);
    const [still] = await connection.query<(RowDataPacket & { active: number })[]>("SELECT active FROM users WHERE id = ?", [userId]);
    expect(Number(still[0]?.active)).toBe(1);

    await deactivate.getByRole("button", { name: "Deactivate user" }).click();
    await deactivate.getByRole("button", { name: "Yes, continue" }).click();
    await expect(page.getByRole("button", { name: "Reactivate user" })).toBeVisible();
    const [after] = await connection.query<(RowDataPacket & { active: number })[]>("SELECT active FROM users WHERE id = ?", [userId]);
    expect(Number(after[0]?.active)).toBe(0);
  } finally {
    await connection.end();
  }
});
