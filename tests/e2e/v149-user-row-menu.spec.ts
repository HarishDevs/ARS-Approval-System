import { expect, test } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// v1.49.3 (owner): the users list has a Department filter and, in its last
// column, a three-dot menu with Re-invite, Send set-password link and
// Deactivate / Activate user (confirmed first, answered with a toast).
test("users list: filter by department, then deactivate and activate someone from the row menu", async ({ page, context }) => {
  const connection = await db();
  const tag = Date.now().toString(36).toUpperCase();
  const [dept] = await connection.query<ResultSetHeader>("INSERT INTO departments (code, name, active) VALUES (?, ?, TRUE)", [`RM${tag}`, `Row Menu Dept ${tag}`]);
  const loginId = `E2E_ROWMENU_${tag}`;
  const [created] = await connection.query<ResultSetHeader>(
    "INSERT INTO users (login_id, name, email, whatsapp_number, sign_in_method, department_id, active) VALUES (?, 'Rowan Menu', ?, ?, 'BOTH', ?, TRUE)",
    [loginId, `${loginId.toLowerCase()}@example.test`, `91${String(Date.now()).slice(-10)}`, dept.insertId],
  );
  const userId = created.insertId;
  await connection.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [userId]);
  try {
    await context.addCookies([await sessionCookie("E2E_ADMIN")]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/users");
    await page.getByTestId("filter-menu").locator("summary").click();
    await page.getByLabel("Department").selectOption({ label: `Row Menu Dept ${tag}` });
    await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(new RegExp(`dept=${dept.insertId}`));
    const table = page.getByRole("table", { name: "Users" });
    await expect(table.getByRole("link", { name: "Rowan Menu" })).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(1);

    // The menu offers the account actions for an active password user.
    await page.getByRole("button", { name: "Actions for Rowan Menu" }).click();
    const menu = page.getByRole("menu", { name: "Actions for Rowan Menu" });
    await expect(menu.getByRole("menuitem")).toHaveText(["Re-invite", "Send set-password link", "Deactivate user", "Open user"]);

    await menu.getByRole("menuitem", { name: "Deactivate user" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Deactivate Rowan Menu?");
    await dialog.getByRole("button", { name: "Yes, deactivate" }).click();
    await expect(page.getByText("User deactivated and signed out everywhere.")).toBeVisible();
    await expect.poll(async () => {
      const [rows] = await connection.query<(RowDataPacket & { active: number })[]>("SELECT active FROM users WHERE id = ?", [userId]);
      return Number(rows[0]?.active);
    }).toBe(0);

    // Inactive people: only Activate (and Open user).
    await page.goto(`/admin/users?status=all&dept=${dept.insertId}`);
    await page.getByRole("button", { name: "Actions for Rowan Menu" }).click();
    await expect(page.getByRole("menu", { name: "Actions for Rowan Menu" }).getByRole("menuitem")).toHaveText(["Activate user", "Open user"]);
    await page.getByRole("menuitem", { name: "Activate user" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, activate" }).click();
    await expect(page.getByText("User reactivated.")).toBeVisible();
    await expect.poll(async () => {
      const [rows] = await connection.query<(RowDataPacket & { active: number })[]>("SELECT active FROM users WHERE id = ?", [userId]);
      return Number(rows[0]?.active);
    }).toBe(1);

    // Your own row can't be changed from the menu.
    await page.goto("/admin/users?q=E2E_ADMIN");
    const own = page.getByRole("table", { name: "Users" }).locator("tbody tr").first();
    await own.getByTestId("user-row-menu").click();
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["Open user"]);
  } finally {
    await connection.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
    await connection.end();
  }
});
