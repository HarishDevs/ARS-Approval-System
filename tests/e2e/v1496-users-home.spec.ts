import { expect, test } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, sessionCookie } from "./db";

// v1.49.6 (owner): Users & roles has tick boxes and actions for the ticked
// users; Home has no Recently viewed or Finished in the last 30 days, and My
// recent requests shows 8 at a time with pages; Waiting for me says "Due date".
test("Users & roles: tick two users, deactivate them together, then activate them", async ({ page, context }) => {
  const connection = await db();
  const tag = Date.now().toString(36).toUpperCase();
  const ids: number[] = [];
  try {
    for (const suffix of ["A", "B"]) {
      const [created] = await connection.query<ResultSetHeader>("INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, ?, ?, 'GOOGLE', TRUE)", [
        `E2E_BULK_${tag}_${suffix}`,
        `Bulk ${tag} ${suffix}`,
        `bulk.${tag.toLowerCase()}.${suffix.toLowerCase()}@example.test`,
      ]);
      ids.push(created.insertId);
      await connection.query("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [created.insertId]);
    }
    await context.addCookies([await sessionCookie("E2E_ADMIN")]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/users?q=E2E_BULK_${tag}`);
    // You can't tick yourself; these two can be ticked.
    await page.getByRole("checkbox", { name: "Select all users on this page" }).check();
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByTestId("users-bulk").getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Deactivate 2 users?");
    await page.getByRole("button", { name: "Yes, deactivate 2" }).click();
    await expect(page.getByText("Deactivated 2 of 2 users.")).toBeVisible();
    const active = async () => {
      const [rows] = await connection.query<(RowDataPacket & { n: number })[]>("SELECT SUM(active) AS n FROM users WHERE id IN (?, ?)", ids);
      return Number(rows[0]?.n ?? 0);
    };
    await expect.poll(active).toBe(0);

    await page.goto(`/admin/users?status=all&q=E2E_BULK_${tag}`);
    for (const id of ids) await page.locator(`input[name="ids"][value="${id}"]`).check();
    await page.getByTestId("users-bulk").getByRole("button", { name: "Activate", exact: true }).click();
    await page.getByRole("button", { name: "Yes, activate 2" }).click();
    await expect(page.getByText("Activated 2 of 2 users.")).toBeVisible();
    await expect.poll(active).toBe(2);
  } finally {
    if (ids.length) await connection.query("UPDATE users SET active = FALSE WHERE id IN (?)", [ids]);
    await connection.end();
  }
});

test("Add user: the welcome email always goes (no tick box)", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin/users/new");
  await expect(page.getByText("A welcome email goes to this address when you create the user.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Email an invitation now/ })).toHaveCount(0);
});

test("Home: no Recently viewed or Finished sections; My recent requests pages by 8", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users?home=approvals");
  await expect(page.getByRole("heading", { name: "My recent requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recently viewed" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Finished in the last/ })).toHaveCount(0);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "My recent requests" }) });
  const rows = section.locator("tbody tr");
  expect(await rows.count()).toBeLessThanOrEqual(8);
  const pager = page.getByTestId("recent-pages");
  if ((await pager.count()) > 0) {
    await expect(rows).toHaveCount(8);
    await pager.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/recent=2/);
    await expect(pager.locator('[aria-current="page"]')).toHaveText("2");
  }
});

test("Waiting for me: the last column is Due date", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_MGR")]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/queue");
  const table = page.locator("table").first();
  if ((await table.count()) > 0) await expect(table.getByRole("columnheader", { name: "Due date" })).toBeVisible();
});
