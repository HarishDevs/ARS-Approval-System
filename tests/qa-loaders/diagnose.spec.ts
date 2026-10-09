import { expect, test } from "@playwright/test";
import { as, record } from "./helpers";

// Follow-up diagnostics for two audit results (QA session 13).
test("DIAG-040 one preset click: do the filter fields and the data follow the address?", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/utilisation");
  const fromBefore = await page.getByLabel("From").inputValue();
  await page.getByRole("link", { name: "Last financial year" }).click();
  await expect(page).toHaveURL(/from=\d{4}-04-01&to=\d{4}-03-31/);
  await page.waitForTimeout(1500);
  const url = new URL(page.url());
  const fromAfter = await page.getByLabel("From").inputValue();
  const downloadHref = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  record("DIAG-040", { fromBefore, urlFrom: url.searchParams.get("from"), fromFieldAfter: fromAfter, csvLinkFrom: new URLSearchParams(downloadHref?.split("?")[1]).get("from") });
});

test("DIAG-074 sign-in with a malformed answer: what the page shows", async ({ page, context }) => {
  await context.clearCookies();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const calls: string[] = [];
  await page.route("**/api/auth/**", (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{not json" });
  });
  await page.getByLabel("User ID").fill("someone");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(3000);
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: "test-results/loader-audit/DIAG-074-sign-in.png", fullPage: true });
  record("DIAG-074", { apiCalls: calls, pageErrors: errors, visibleText: text.slice(0, 500) });
});

test("DIAG-040b rapid preset clicks: which period is actually on screen?", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/utilisation");
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] !== "1") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return route.continue().catch(() => undefined);
  });
  await page.getByRole("link", { name: "Last financial year" }).click({ noWaitAfter: true });
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "Last 90 days" }).click({ noWaitAfter: true });
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "This month" }).click({ noWaitAfter: true });
  await page.waitForTimeout(6000);
  const url = new URL(page.url());
  const csvHref = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  record("DIAG-040b", {
    urlFrom: url.searchParams.get("from"),
    fromField: await page.getByLabel("From").inputValue(),
    renderedFilterFrom: new URLSearchParams(csvHref?.split("?")[1]).get("from"),
  });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
