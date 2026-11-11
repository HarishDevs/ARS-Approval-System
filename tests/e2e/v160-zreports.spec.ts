import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Addendum A §10/§15 through the real screens: catalogue, a report preview,
// downloads in three formats, a schedule, a saved view and an alert.
async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("IT opens a report, downloads Excel, CSV and PDF, saves the view, schedules it and adds an alert", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Request register/ }).click();
  await expect(page.getByRole("heading", { name: "Request register" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Request register" })).toBeVisible();
  // v1.51.1: the filters are in the toolbar's Filter dropdown.
  await page.getByTestId("filter-menu").locator("summary").click();
  await page.getByTestId("filter-menu").getByLabel("Period", { exact: true }).selectOption("90d");
  await page.getByTestId("filter-menu").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/period=90d/);

  for (const [format, type, magic] of [
    ["xlsx", "spreadsheetml", "PK"],
    ["csv", "text/csv", "﻿"],
    ["pdf", "application/pdf", "%PDF"],
  ] as const) {
    const response = await page.request.get(`/api/reports/request_register?period=90d&format=${format}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
    expect(response.headers()["content-disposition"]).toMatch(new RegExp(`attachment; filename="ars-request-register-\\d{4}-\\d{2}-\\d{2}\\.${format}"`));
    const body = await response.body();
    expect(body.subarray(0, magic.length === 1 ? 3 : magic.length).toString("utf8").startsWith(magic)).toBe(true);
  }

  await page.getByText("Save these filters").click();
  await page.getByLabel("View name").fill("Last quarter register");
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("link", { name: "Last quarter register" })).toBeVisible();

  await page.getByText("Email this to me regularly").click();
  await page.getByLabel("How often").selectOption("WEEKLY");
  await page.getByLabel("Day", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText(/Scheduled\. It is emailed to you/)).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByText(/Every Monday at 08:00/)).toBeVisible();
  const alerts = page.getByRole("region", { name: "My alerts" });
  await alerts.getByLabel("Tell me when").selectOption("OVERDUE_TASKS");
  await alerts.getByLabel("For").selectOption("ORGANISATION");
  await alerts.getByLabel("reaches").fill("3");
  await alerts.getByRole("button", { name: "Save alert" }).click();
  await expect(alerts.getByText(/Alert saved\. Right now the value is \d+/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "My alerts" }).getByRole("button", { name: /Switch off alert #\d+/ })).toBeVisible();
});

test("a requester can't download reports at all (v1.7.1: IT only)", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const register = await page.request.get("/api/reports/request_register?scope=ORGANISATION&format=csv");
  expect(register.status()).toBe(404);
  expect((await page.request.get("/api/reports/department_summary?format=csv")).status()).toBe(404);
  expect((await page.request.get("/api/reports/nonsense?format=csv")).status()).toBe(404);
  await context.clearCookies();
  expect((await page.request.get("/api/reports/request_register?format=csv")).status()).toBe(404);
});
