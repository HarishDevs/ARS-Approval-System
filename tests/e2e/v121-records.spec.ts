import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-191: Admin → Records, for the IT team only.
test("IT sees every approval request, task and information item, filters them and downloads a CSV", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin/records");
  await expect(page).toHaveURL(/\/admin\/records\/requests$/);
  await expect(page.getByRole("heading", { level: 1, name: "Approval requests" })).toBeVisible();
  await expect(page.getByTestId("records-table").getByRole("columnheader", { name: /Waiting on/ })).toBeVisible();
  await page.getByTestId("list-toolbar").getByTestId("filter-menu").locator("summary").click();
  await page.getByLabel("Status").selectOption("APPROVED");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("filter-menu").locator("summary")).toContainText("Filters: 1");
  await expect(page).toHaveURL(/status=APPROVED/);
  await page.getByRole("link", { name: /Submitted/ }).click();
  await expect(page).toHaveURL(/sort=submitted/);
  const download = await page.request.get("/api/admin/records/requests?status=APPROVED");
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("text/csv");
  expect((await download.text()).split("\r\n")[0]).toContain("Request no.,Title,Approval type,Amount,Raised by");
  for (const [tab, heading] of [["tasks", "Tasks"], ["information", "Information"]]) {
    await page.goto(`/admin/records/${tab}`);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect((await page.request.get(`/api/admin/records/${tab}`)).status()).toBe(200);
  }
});

test("a plain user gets a 404 for the records pages and the download", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  expect((await page.goto("/admin/records/requests"))?.status()).toBe(404);
  expect((await page.request.get("/api/admin/records/requests")).status()).toBe(404);
});
