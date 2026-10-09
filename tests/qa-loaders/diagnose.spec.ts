import { expect, test } from "@playwright/test";
import { as, interceptActions, record } from "./helpers";

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

test("DIAG-011 Admin → Departments: does the first Save work with no interception?", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  const posts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().method() === "POST" && response.request().headers()["next-action"]) posts.push(`${response.status()} ${(await response.text().catch(() => "")).slice(0, 160)}`);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  await page.goto("/admin/organisation");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.waitForTimeout(5000);
  const text = await page.locator("main").innerText();
  record("DIAG-011", { posts, errors: errors.slice(0, 5), savedShown: text.includes("Saved."), stillWorking: await page.getByRole("button", { name: "Working…" }).count() });
});

test("DIAG-011b Admin → Departments: Save held, then released", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  const log: string[] = [];
  page.on("request", (request) => request.method() === "POST" && log.push(`req ${request.headers()["next-action"] ? "action" : "post"} ${new URL(request.url()).pathname}`));
  page.on("response", (response) => response.request().method() === "POST" && log.push(`res ${response.status()}`));
  page.on("requestfailed", (request) => log.push(`failed ${request.failure()?.errorText}`));
  page.on("pageerror", (error) => log.push(`pageerror ${error.message}`));
  await page.goto("/admin/organisation");
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.waitForTimeout(1000);
  log.push(`seen=${gate.count()}`);
  gate.release();
  await page.waitForTimeout(6000);
  const text = await page.locator("main").innerText();
  record("DIAG-011b", { log, savedShown: text.includes("Saved."), stillWorking: await page.getByRole("button", { name: "Working…" }).count() });
});

test("DIAG-039 period link: is the busy spinner shown while the page loads?", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/utilisation");
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return route.continue().catch(() => undefined);
  });
  const link = page.getByRole("link", { name: "This month" });
  const hydrated = await link.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__react")));
  await link.click({ noWaitAfter: true });
  const samples: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(150);
    samples.push(await page.evaluate(() => `${document.querySelectorAll('a[aria-busy="true"]').length}/${document.querySelectorAll(".animate-spin").length}/${location.search}`).catch((e) => `err ${String(e).slice(0, 40)}`));
  }
  record("DIAG-039", { hydrated, samples });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
