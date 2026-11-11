import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { purchaseTemplateId, raisePurchase, toReviewStep } from "../e2e/db";
import { as, busySeen, clearIntercepts, watchBusy, contrast, count, crashed, delayNavigations, interceptActions, record, sql } from "./helpers";

// Loader and loading-state audit (QA session 13), against a production build
// and the throw-away e2e database. Each test names the TC ids it executes and
// asserts the TARGET behaviour; a failing test is a finding. Observations
// (timings, counts) go to test-results/loader-audit/observations.jsonl.
// Tests are independent (a failure is a finding and must not stop the rest);
// the shared request made by "setup" is kept in a small state file, because
// Playwright starts a fresh worker after each failing test.
const STATE = "test-results/loader-audit/state.json";
const state = (): { requestPath: string; stamp: string } => JSON.parse(readFileSync(STATE, "utf8"));
let requestPath = "";
let stamp = Date.now().toString(36);
test.beforeEach(({}, testInfo) => {
  if (testInfo.title.startsWith("setup")) return;
  ({ requestPath, stamp } = state());
});

// v1.54.0 (D-309): raised from the requester's approval template.
const raise = (page: Page, title: string) => raisePurchase(page, title);

const commentBox = (page: Page) => page.getByLabel("Add a comment");
const postButton = (page: Page) => page.getByRole("button", { name: /Post comment|Working…/ });

test("setup: the requester raises one request from their approval template", async ({ page, context }) => {
  await purchaseTemplateId();
  await as(context, "E2E_REQ");
  requestPath = await raise(page, `QA base ${stamp}`);
  writeFileSync(STATE, JSON.stringify({ requestPath, stamp }));
});

// ---- A. Page and navigation -------------------------------------------------------------
test("TC-001 TC-002 initial load and refresh render complete content, no stuck loader", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const started = Date.now();
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  const firstMs = Date.now() - started;
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { ttfb: Math.round(entry.responseStart), domContentLoaded: Math.round(entry.domContentLoadedEventEnd), load: Math.round(entry.loadEventEnd) };
  });
  const t2 = Date.now();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  const reloadMs = Date.now() - t2;
  const leftovers = await page.locator('[aria-label^="Loading"], .animate-pulse, .animate-spin').count();
  record("TC-001/002", { firstVisibleMs: firstMs, reloadVisibleMs: reloadMs, nav, leftoverLoaders: leftovers, note: "Pages are server-rendered: HTML arrives complete; no client loader is needed on first load" });
  expect(leftovers).toBe(0);
  expect(await crashed(page)).toBe(false);
});

test("TC-003 a slow page change shows loading feedback (skeleton or indicator)", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await delayNavigations(page, 3000);
  // A route WITH loading.tsx.
  await page.getByRole("link", { name: "Dashboards", exact: true }).first().click();
  const skeleton = await page.getByRole("status", { name: "Loading the dashboard" }).waitFor({ state: "visible", timeout: 1500 }).then(() => true).catch(() => false);
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible({ timeout: 15_000 });
  // A route WITHOUT loading.tsx.
  const t0 = Date.now();
  await page.getByRole("link", { name: "Users & roles", exact: true }).first().click();
  await page.waitForTimeout(1200);
  const feedback = await page.evaluate(() => Boolean(document.querySelector('[role="status"][aria-label^="Loading"], [aria-busy="true"], .animate-pulse, .animate-spin, [role="progressbar"]')));
  const stillOldPage = await page.getByRole("heading", { name: "Approval utilisation" }).isVisible();
  await expect(page.getByRole("heading", { name: "Users & roles" })).toBeVisible({ timeout: 15_000 });
  record("TC-003", { dashboardsSkeletonShown: skeleton, usersPageFeedbackWithin1200ms: feedback, oldPageStillShownWhileWaiting: stillOldPage, usersPageMs: Date.now() - t0 });
  await clearIntercepts(page);
  expect(skeleton, "Dashboards (has loading.tsx) shows a skeleton").toBe(true);
  expect(feedback, "Users & roles (no loading.tsx) shows any loading feedback during a 3 s wait").toBe(true);
});

test("TC-004 fast actions: how long the loader shows, and layout shift of the button", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const before = await postButton(page).boundingBox();
  await commentBox(page).fill("Fast comment");
  const shown = page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-busy") === "true"), undefined, { timeout: 5000 }).then(() => Date.now()).catch(() => null);
  const t0 = Date.now();
  await postButton(page).click();
  const during = await page.getByRole("button", { name: "Working…" }).boundingBox().catch(() => null);
  const appeared = await shown;
  await expect(page.getByText("Fast comment").first()).toBeVisible();
  const done = Date.now();
  record("TC-004", { loaderAppearedAfterMs: appeared ? appeared - t0 : null, totalMs: done - t0, buttonWidthBefore: before?.width, buttonWidthDuring: during?.width ?? null });
  expect(appeared, "the loader appears").not.toBeNull();
  // DEF-08: the button keeps its width while busy (no jolt on fast actions).
  if (during) expect(Math.abs((during.width ?? 0) - (before?.width ?? 0))).toBeLessThan(2);
});

test("TC-005 TC-024 a slow action keeps its loader until the answer arrives", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const gate = await interceptActions(page, { delayMs: 4000, times: 1 });
  await commentBox(page).fill("Slow comment");
  const t0 = Date.now();
  await postButton(page).click();
  await expect(page.getByRole("button", { name: "Working…" })).toBeVisible();
  await page.waitForTimeout(3000);
  const stillWorking = await page.getByRole("button", { name: "Working…" }).isDisabled();
  await expect(page.getByText("Slow comment").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Post comment" })).toBeEnabled();
  record("TC-005/024", { actions: gate.count(), stillWorkingAt3s: stillWorking, totalMs: Date.now() - t0 });
  await clearIntercepts(page);
  expect(stillWorking).toBe(true);
});

test("TC-006 TC-028 an unknown page or record shows the not-found page", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const route = await page.goto("/users/nowhere-at-all");
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  const record404 = await page.goto("/users/requests/99999999");
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  record("TC-006/028", { unknownRouteStatus: route?.status(), unknownRecordStatus: record404?.status() });
  expect(route?.status()).toBe(404);
  expect(record404?.status()).toBe(404);
});

test("TC-007 Back and Forward never leave a loader behind", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await page.getByRole("link", { name: "Dashboards", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible();
  await page.getByRole("link", { name: "Import data", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Import data" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible();
  const leftovers = await page.locator('[aria-label^="Loading"]').count();
  record("TC-007", { leftoverLoaders: leftovers });
  expect(leftovers).toBe(0);
});

test("TC-008 a signed-out visit returns to the page asked for after signing in", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/admin/dashboards");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fdashboards/);
  await as(context, "E2E_ADMIN");
  await page.goto("/login?next=%2Fadmin%2Fdashboards");
  const landed = new URL(page.url()).pathname;
  record("TC-008", { signedInVisitToLoginLandsOn: landed, note: "Google/password sign-in itself needs Firebase/WhatsApp, not available in the test env" });
  expect(landed).not.toBe("/login");
});

test("TC-009 TC-026 a session that ended: the next action is clearly refused, not stuck", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await context.clearCookies();
  await commentBox(page).fill("After my session ended");
  await postButton(page).click();
  await page.waitForTimeout(3000);
  const text = await page.locator("body").innerText();
  const url = page.url();
  await page.screenshot({ path: "test-results/loader-audit/TC-009-session-ended.png", fullPage: true });
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible();
  const toLogin = /\/login/.test(url);
  const message = /sign in|signed out|session/i.test(text) ? "asks to sign in" : /Not found|went wrong|try again/i.test(text) ? "generic error" : "none";
  record("TC-009/026", { stuck, redirectedToLogin: toLogin, message, crashed: await crashed(page) });
  expect(stuck).toBe(false);
  expect(toLogin || message === "asks to sign in", "the person is told to sign in again").toBe(true);
});

test("TC-010 rapid navigation ends on the last page with no loader left", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await delayNavigations(page, 800);
  for (const name of ["Dashboards", "Users & roles", "Approver groups", "Working calendar"]) {
    await page.getByRole("link", { name, exact: true }).first().click({ noWaitAfter: true });
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole("heading", { name: "Working calendar" })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const leftovers = await page.locator('[aria-label^="Loading"]').count();
  record("TC-010", { finalHeading: heading, finalUrl: new URL(page.url()).pathname, leftoverLoaders: leftovers });
  await clearIntercepts(page);
  expect(new URL(page.url()).pathname).toBe("/admin/calendar");
  expect(leftovers).toBe(0);
});

// ---- B. Buttons and forms ---------------------------------------------------------------
test("TC-011 TC-016 TC-077 Save shows its own loader, then Saved; other Save buttons stay usable", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/organisation");
  const gate = await interceptActions(page, { hold: true, times: 1 });
  const saves = page.getByRole("button", { name: "Save", exact: true });
  const first = saves.first();
  await first.click();
  await expect(page.getByRole("button", { name: "Working…" })).toHaveCount(1);
  const othersEnabled = await saves.nth(1).isEnabled();
  gate.release();
  await expect(page.getByText("Saved.").first()).toBeVisible({ timeout: 15_000 });
  const working = await page.getByRole("button", { name: "Working…" }).count();
  record("TC-011/016/077", { workingButtonsWhileHeld: 1, otherSaveEnabled: othersEnabled, workingAfter: working });
  await clearIntercepts(page);
  expect(othersEnabled).toBe(true);
  expect(working).toBe(0);
});

test("TC-012 TC-013 TC-014 double and triple clicks on Submit create one request", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(`/users/custom?template=${await purchaseTemplateId()}`);
  const title = `QA double ${stamp}`;
  await page.getByLabel("Title").fill(title);
  await toReviewStep(page);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) posts += 1;
  });
  const button = page.getByRole("button", { name: "Submit request" });
  await button.dblclick();
  await button.click({ force: true, timeout: 2000 }).catch(() => undefined);
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const rows = await count("SELECT COUNT(*) AS n FROM approval_requests WHERE title = ?", [title]);
  record("TC-012/013/014", { uiClicks: 3, actionPosts: posts, requestsCreated: rows });
  expect(rows).toBe(1);
});

test("TC-015 an invalid form shows field errors and ends its loader", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(`/users/custom?template=${await purchaseTemplateId()}`);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) posts += 1;
  });
  // v1.54.0: the form checks the required fields before it moves on.
  await page.getByTestId("step-next").click();
  await expect(page.getByText(/Fill in the required fields first|Give the request a title/).first()).toBeVisible();
  await expect(page.getByTestId("step-next")).toBeEnabled();
  record("TC-015", { roundTrips: posts, note: "Required fields are checked in the page before Next; the server checks everything again on submit" });
});

test("TC-017 TC-029 a server error stops the loader and shows an error", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await interceptActions(page, { status: 500, times: 1 });
  await commentBox(page).fill("Hits a 500");
  await postButton(page).click();
  await page.waitForTimeout(3000);
  const isCrashed = await crashed(page);
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible().catch(() => false);
  const alert = await page.getByRole("alert").filter({ hasText: /wrong|try again|couldn't|error/i }).count();
  await page.screenshot({ path: "test-results/loader-audit/TC-017-server-error.png", fullPage: true });
  record("TC-017/029", { crashedToErrorPage: isCrashed, loaderStuck: stuck, errorMessages: alert });
  await clearIntercepts(page);
  expect(isCrashed, "the page doesn't crash").toBe(false);
  expect(stuck).toBe(false);
  expect(alert).toBeGreaterThan(0);
});

test("TC-018 TC-030 TC-070 a request that never answers does not spin forever", async ({ page, context }) => {
  test.setTimeout(90_000);
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await commentBox(page).fill("Never answered");
  await postButton(page).click();
  await page.waitForTimeout(35_000);
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible();
  const cancel = await page.getByRole("button", { name: /Cancel|Try again|Retry/ }).count();
  record("TC-018/030/070", { waitedMs: 35_000, stillSpinning: stuck, cancelOrRetryOffered: cancel > 0 });
  gate.release();
  await clearIntercepts(page);
  expect(stuck, "after 35 s the loader has given way to a timeout message").toBe(false);
});

test("TC-020 TC-079 double-clicking Approve records one approval", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const path = await raise(page, `QA approve ${stamp}`);
  const id = Number(path.split("/").pop());
  await as(context, "E2E_MGR");
  await page.goto(path);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) posts += 1;
  });
  await page.getByRole("button", { name: "Approve", exact: true }).dblclick();
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  const approvals = await count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED'", [id]);
  record("TC-020/079", { uiClicks: 2, actionPosts: posts, approvedTasks: approvals });
  expect(approvals).toBe(1);
});

test("TC-021 rejecting updates the right request only", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const keep = await raise(page, `QA keep ${stamp}`);
  const reject = await raise(page, `QA reject ${stamp}`);
  await as(context, "E2E_MGR");
  await page.goto(reject);
  await page.getByLabel(/Comment/).fill("Not this quarter");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const statuses = await Promise.all(
    [keep, reject].map((path) => count("SELECT status = 'REJECTED' AS n FROM approval_requests WHERE id = ?", [Number(path.split("/").pop())])),
  );
  record("TC-021", { keptRequestRejected: statuses[0], rejectedRequestRejected: statuses[1] });
  expect(statuses).toEqual([0, 1]);
});

test("TC-022 two tabs approving the same task at once: one wins, the other is told", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();
  await as(first, "E2E_REQ");
  const path = await raise(pageA, `QA concurrent ${stamp}`);
  const id = Number(path.split("/").pop());
  await as(first, "E2E_MGR");
  await as(second, "E2E_MGR");
  await Promise.all([pageA.goto(path), pageB.goto(path)]);
  await Promise.all([pageA.getByRole("button", { name: "Approve", exact: true }).click(), pageB.getByRole("button", { name: "Approve", exact: true }).click()]);
  await pageA.waitForTimeout(3000);
  const texts = await Promise.all([pageA.locator("main").innerText(), pageB.locator("main").innerText()]);
  const approvals = await count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED'", [id]);
  const told = texts.filter((text) => /already|someone else|no longer|changed|isn't waiting|not waiting/i.test(text)).length;
  record("TC-022", { approvedTasks: approvals, tabsToldItWasAlreadyDone: told });
  await first.close();
  await second.close();
  expect(approvals).toBe(1);
});

// ---- C. API and data loading ------------------------------------------------------------
test("TC-023 TC-033 data and empty periods: dashboards show data or an empty state, never a loader", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/raisers");
  await expect(page.getByRole("cell", { name: "Ravi Requester" })).toBeVisible();
  await page.goto("/admin/dashboards/raisers?from=2001-01-01&to=2001-12-31");
  await expect(page.getByText("No requests in this period.")).toBeVisible();
  record("TC-023/033", { dataShown: true, emptyStateShown: true });
});

test("TC-025 TC-034 TC-050 downloads: a failed download says so; a good one arrives; buttons lock while busy", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/import?kind=departments");
  await page.route("**/api/admin/import/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return route.fulfill({ status: 400, body: "{}" });
  });
  await page.getByRole("button", { name: "Download template" }).click();
  const otherLocked = await page.getByRole("button", { name: /Download current/ }).isDisabled();
  await expect(page.getByText("The download didn't work. Please try again.")).toBeVisible();
  await page.unroute("**/api/admin/import/**");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download template" }).click()]);
  record("TC-025/034/050", { errorShownOn400: true, otherButtonLockedWhileBusy: otherLocked, downloadedFile: download.suggestedFilename() });
  expect(otherLocked).toBe(true);
});

test("TC-027 TC-067 TC-084 no access: plain user gets 404 pages and 404 APIs; a replayed admin action is refused", async ({ page, context, browser }) => {
  await as(context, "E2E_SUPER");
  const victim = await raise(page, `QA victim ${stamp}`).catch(async () => {
    await as(context, "E2E_REQ");
    return raise(page, `QA victim ${stamp}`);
  });
  const victimId = Number(victim.split("/").pop());
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/requests");
  // Capture the real Delete action (blocked before it reaches the server).
  let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      captured = { url: route.request().url(), headers: route.request().headers(), body: route.request().postData() ?? "" };
      return route.abort();
    }
    return route.fallback();
  });
  const row = page.getByRole("row", { name: new RegExp(`QA victim ${stamp}`) });
  await row.getByRole("button", { name: "Delete" }).click();
  await row.getByLabel(/Why\?/).fill("Replay test only");
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect.poll(() => captured).not.toBeNull();
  await clearIntercepts(page);

  const staff = await browser.newContext();
  await as(staff, "E2E_STAFF");
  const staffPage = await staff.newPage();
  const adminPage = await staffPage.goto("/admin");
  const api = await staffPage.request.get("/api/admin/dashboards/utilisation");
  const c = captured as unknown as { url: string; headers: Record<string, string>; body: string };
  const replay = await staffPage.request.post(c.url, {
    headers: { "next-action": c.headers["next-action"]!, "content-type": c.headers["content-type"]!, accept: "text/x-component" },
    data: c.body,
  });
  const replayText = await replay.text();
  const stillThere = await count("SELECT deleted_at IS NULL AS n FROM approval_requests WHERE id = ?", [victimId]);
  record("TC-027/067/084", { adminPageStatus: adminPage?.status(), adminApiStatus: api.status(), replayStatus: replay.status(), replaySaysNotFound: /Not found/.test(replayText), requestStillPresent: stillThere });
  await staff.close();
  expect(adminPage?.status()).toBe(404);
  expect(api.status()).toBe(404);
  expect(stillThere).toBe(1);
});

test("TC-031 TC-032 offline: the action says so and works again once back online", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await context.setOffline(true);
  await commentBox(page).fill("Sent while offline");
  await postButton(page).click();
  await page.waitForTimeout(3000);
  const isCrashed = await crashed(page);
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible().catch(() => false);
  const message = await page.getByRole("alert").filter({ hasText: /connection|offline|network|try again|wrong/i }).count();
  await page.screenshot({ path: "test-results/loader-audit/TC-031-offline.png", fullPage: true });
  await context.setOffline(false);
  let recovered = false;
  if (!isCrashed) {
    await page.getByRole("button", { name: "Post comment" }).click().catch(() => undefined);
    recovered = await page.getByText("Sent while offline").first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
  }
  record("TC-031/032", { crashedToErrorPage: isCrashed, loaderStuck: stuck, connectionMessage: message, recoveredAfterRetry: recovered });
  expect(isCrashed, "going offline doesn't crash the page").toBe(false);
  expect(message).toBeGreaterThan(0);
  expect(recovered).toBe(true);
});

// ---- D. Skeletons and dashboards --------------------------------------------------------
test("TC-035 TC-036 TC-024 dashboard skeleton vs final layout, and layout shift", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin");
  await delayNavigations(page, 2500);
  await page.getByRole("link", { name: "Dashboards", exact: true }).first().click();
  const skeleton = page.getByRole("status", { name: "Loading the dashboard" });
  await expect(skeleton).toBeVisible();
  const skeletonTiles = await skeleton.locator(".grid > div").count();
  await page.screenshot({ path: "test-results/loader-audit/TC-035-skeleton.png" });
  await expect(page.getByRole("heading", { name: "Approval utilisation" })).toBeVisible({ timeout: 15_000 });
  const finalTiles = await page.locator("main .grid").first().locator("> div").count();
  await page.screenshot({ path: "test-results/loader-audit/TC-035-final.png" });
  await clearIntercepts(page);
  // Layout shift on a full load of the same page.
  await page.goto("/admin/dashboards/utilisation");
  const cls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) total += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(Math.round(total * 1000) / 1000), 1500);
      }),
  );
  record("TC-035/036", { skeletonTiles, finalTiles, cumulativeLayoutShift: cls, note: "The table is a single grey block in the skeleton, not rows" });
  expect(skeletonTiles).toBe(finalTiles);
  expect(cls).toBeLessThan(0.1);
});

test("TC-039 TC-040 dashboard filters: feedback while applying; rapid preset clicks end on the last one", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/utilisation");
  await delayNavigations(page, 1500, { documents: true });
  await watchBusy(page);
  // The last click is a period different from the default, so the result is unambiguous.
  await page.getByRole("link", { name: "Last financial year" }).click({ noWaitAfter: true });
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "Last 90 days" }).click({ noWaitAfter: true });
  await page.waitForTimeout(100);
  await page.getByRole("link", { name: "This month" }).click({ noWaitAfter: true });
  await page.waitForTimeout(5000);
  // Feedback = a busy spinner on the clicked link (or a skeleton) before the new period showed.
  const skeletonSeen = await busySeen(page);
  const url = new URL(page.url());
  const fromInput = await page.getByLabel("From").inputValue();
  record("TC-039/040", { feedbackWhileApplying: skeletonSeen, finalFrom: url.searchParams.get("from"), fromFieldShows: fromInput });
  await clearIntercepts(page);
  expect(skeletonSeen, "feedback while the new period loads").toBe(true);
  expect(url.searchParams.get("from")).toMatch(/-01$/);
  expect(url.searchParams.get("from")).not.toMatch(/-04-01$/);
  expect(fromInput).toBe(url.searchParams.get("from"));
});

test("TC-041 pagination shows the right page", async ({ page, context }) => {
  // Enough rows for two pages: copies of one request, numbered QA-P1…
  await sql(
    `INSERT INTO approval_requests (request_no, workflow_version_id, requester_id, title, form_data_json, status, round, state_json, submitted_at)
     SELECT CONCAT('QAP-', LPAD(seq.n, 3, '0'), '-', ?), r.workflow_version_id, r.requester_id, CONCAT('QA page row ', seq.n), r.form_data_json, 'CANCELLED', 1, r.state_json, r.submitted_at
     FROM approval_requests r
     JOIN (SELECT a.n + b.n * 10 + 1 AS n FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
                (SELECT 0 n UNION SELECT 1 UNION SELECT 2) b) seq
     WHERE r.title = ? LIMIT 30`,
    [stamp, `QA base ${stamp}`],
  );
  await as(context, "E2E_SUPER");
  await page.goto("/superadmin/requests");
  await delayNavigations(page, 2000, { documents: true });
  const firstPage = await page.getByRole("row").nth(1).innerText();
  await watchBusy(page);
  await page.getByRole("link", { name: "Older →" }).click();
  await page.waitForTimeout(800);
  const feedback = await busySeen(page);
  await expect(page.getByText(/page 2 of/)).toBeVisible({ timeout: 15_000 });
  const secondPage = await page.getByRole("row").nth(1).innerText();
  record("TC-041", { feedbackWhileLoadingPage2: feedback, firstRowChanged: firstPage !== secondPage });
  await clearIntercepts(page);
  expect(firstPage).not.toBe(secondPage);
  expect(feedback, "some feedback while page 2 loads (2 s delay)").toBe(true);
});

// ---- E. Files ----------------------------------------------------------------------------
test("TC-045 TC-047 TC-048 attachments: upload shows a loader; wrong type and too big are refused cleanly", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const input = page.getByLabel("Choose files to attach");
  await input.setInputFiles({ name: "quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%QA\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
  const gate = await interceptActions(page, { delayMs: 2000, times: 1 });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  const loader = await page.getByRole("button", { name: "Working…" }).isVisible();
  await expect(page.getByText("quote.pdf").first()).toBeVisible({ timeout: 15_000 });
  await clearIntercepts(page);
  await input.setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  const typeError = await page.getByText(/can't be attached|isn't allowed|not allowed|type/i).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
  await input.setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(10 * 1024 * 1024 + 10, 1) });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  const sizeError = await page.getByText(/larger than 10 MB/).first().waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible();
  record("TC-045/047/048", { loaderDuringUpload: loader, actions: gate.count(), wrongTypeRefused: typeError, tooBigRefused: sizeError, loaderStuck: stuck, progressShown: "indeterminate only (button text)" });
  expect(loader && typeError && sizeError && !stuck).toBe(true);
});

test("TC-046 TC-082 a 9 MB upload on a slow network: loader stays, page stays usable", async ({ page, context }) => {
  test.setTimeout(120_000);
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 750_000, uploadThroughput: 750_000 });
  await page.getByLabel("Choose files to attach").setInputFiles({ name: "large-scan.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(9 * 1024 * 1024, 32)]) });
  const t0 = Date.now();
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByRole("button", { name: "Working…" })).toBeVisible();
  await commentBox(page).fill("typing while uploading");
  const typed = await commentBox(page).inputValue();
  await expect(page.getByText("large-scan.pdf").first()).toBeVisible({ timeout: 90_000 });
  const ms = Date.now() - t0;
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  record("TC-046/082", { uploadMs: ms, pageResponsiveDuringUpload: typed === "typing while uploading", progress: "indeterminate (no % shown)" });
  expect(typed).toBe("typing while uploading");
});

test("TC-049 an upload cut off midway fails safely", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await page.getByLabel("Choose files to attach").setInputFiles({ name: "cut.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await interceptActions(page, { abort: true, times: 1 });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await page.waitForTimeout(3000);
  const isCrashed = await crashed(page);
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible().catch(() => false);
  const message = await page.getByRole("alert").count();
  await page.screenshot({ path: "test-results/loader-audit/TC-049-interrupted.png", fullPage: true });
  const saved = await count("SELECT COUNT(*) AS n FROM request_attachments WHERE original_name = 'cut.pdf'").catch(() => -1);
  record("TC-049", { crashedToErrorPage: isCrashed, loaderStuck: stuck, errorMessages: message, partialFileSaved: saved });
  await clearIntercepts(page);
  expect(isCrashed).toBe(false);
  expect(stuck).toBe(false);
});

test("TC-051 TC-052 TC-075 TC-078 CSV export and import: status, problems, all-or-nothing, the shared status bar clears", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/dashboards/approvers");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  await page.goto("/admin/import?kind=holidays");
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from("date,name\n2099-05-01,May Day\nnot-a-date,Bad") });
  const gate = await interceptActions(page, { delayMs: 1500, times: 1 });
  await page.getByRole("button", { name: "Check file" }).click();
  const statusBar = await page.getByRole("status").filter({ hasText: /Checking/ }).isVisible();
  await expect(page.getByText(/1 of 2 rows have problems/)).toBeVisible({ timeout: 15_000 });
  const statusAfter = await page.getByRole("status").filter({ hasText: /Checking|Importing/ }).count();
  const importOffered = await page.getByRole("button", { name: /^Import / }).count();
  const saved = await count("SELECT COUNT(*) AS n FROM holidays WHERE holiday_on = '2099-05-01'");
  record("TC-051/052/075/078", { csvFile: csv.suggestedFilename(), actions: gate.count(), statusBarWhileChecking: statusBar, statusBarAfter: statusAfter, importOfferedWithProblems: importOffered, goodRowSaved: saved });
  await clearIntercepts(page);
  expect(statusBar).toBe(true);
  expect(statusAfter).toBe(0);
  expect(importOffered).toBe(0);
  expect(saved).toBe(0);
});

// ---- F/G. Visual, accessibility, performance ------------------------------------------------
test("TC-060 TC-061 TC-080 loaders stay visible on resize, on a phone and at 200% zoom", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/import?kind=holidays");
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from("date,name\n2099-06-01,Test") });
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await page.getByRole("button", { name: "Check file" }).click();
  const results: Record<string, unknown> = {};
  for (const [label, size] of [
    ["desktop", { width: 1280, height: 800 }],
    ["mobile", { width: 375, height: 740 }],
    ["zoom200", { width: 640, height: 400 }],
  ] as const) {
    await page.setViewportSize(size);
    const bar = page.getByRole("status").filter({ hasText: /Checking/ });
    await bar.scrollIntoViewIfNeeded();
    const box = await bar.boundingBox();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    results[label] = { visible: await bar.isVisible(), insideWidth: box ? box.x >= 0 && box.x + box.width <= size.width + 1 : false, horizontalScroll: overflow };
  }
  await page.screenshot({ path: "test-results/loader-audit/TC-080-zoom200.png" });
  gate.release();
  await clearIntercepts(page);
  record("TC-060/061/080", results);
  for (const value of Object.values(results) as { visible: boolean; insideWidth: boolean; horizontalScroll: boolean }[]) {
    expect(value.visible && value.insideWidth && !value.horizontalScroll).toBe(true);
  }
});

test("TC-062 TC-068 slow CPU: the import check still completes; main-thread long tasks measured", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/import?kind=holidays");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.evaluate(() => {
    (window as unknown as { __long: number }).__long = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) (window as unknown as { __long: number }).__long += entry.duration;
    }).observe({ type: "longtask", buffered: true });
  });
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from(`date,name\n${Array.from({ length: 300 }, (_, i) => `2098-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")},Day ${i}`).join("\n")}`) });
  const t0 = Date.now();
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText(/rows have problems|The file is fine|Every row already matches/)).toBeVisible({ timeout: 60_000 });
  const ms = Date.now() - t0;
  const longTaskMs = await page.evaluate(() => Math.round((window as unknown as { __long: number }).__long));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  record("TC-062/068", { cpuThrottle: "6x", rows: 300, checkMs: ms, longTaskTotalMs: longTaskMs });
  expect(ms).toBeLessThan(30_000);
});

test("TC-063 TC-064 keyboard use, and what screen readers are told", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await commentBox(page).fill("Keyboard comment");
  await commentBox(page).press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Working…" })).toBeVisible();
  const a11y = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-busy") === "true");
    const form = button?.closest("form");
    return {
      formAriaBusy: form?.getAttribute("aria-busy") ?? null,
      buttonAriaDisabled: button?.getAttribute("aria-disabled") ?? null,
      liveRegionNearButton: Boolean(form?.querySelector('[role="status"], [aria-live]')),
    };
  });
  gate.release();
  await expect(page.getByText("Keyboard comment").first()).toBeVisible({ timeout: 15_000 });
  await clearIntercepts(page);
  // The import screen, for comparison.
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/import?kind=holidays");
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from("date,name\n2099-07-01,Test") });
  const gate2 = await interceptActions(page, { hold: true, times: 1 });
  await page.getByRole("button", { name: "Check file" }).click();
  const importStatus = await page.getByRole("status").filter({ hasText: /Checking/ }).count();
  const importBusy = await page.locator('[aria-busy="true"]').count();
  gate2.release();
  await clearIntercepts(page);
  record("TC-063/064", { tabReachesPostButton: focused, enterSubmits: true, genericForm: a11y, importStatusRegion: importStatus, importAriaBusy: importBusy });
  expect(focused).toBe("Post comment");
  expect(a11y.liveRegionNearButton || a11y.formAriaBusy === "true", "generic forms announce their busy state").toBe(true);
});

test("TC-065 TC-066 TC-081 reduced motion, contrast of loaders, dark preference", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/admin/import?kind=holidays");
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from("date,name\n2099-08-01,Test") });
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await page.getByRole("button", { name: "Check file" }).click();
  const spinner = page.locator(".animate-spin").first();
  await expect(spinner).toBeVisible();
  const animation = await spinner.evaluate((el) => getComputedStyle(el).animationDuration);
  const statusBar = page.getByRole("status").filter({ hasText: /Checking/ });
  const statusColors = await statusBar.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  const button = page.getByRole("button", { name: "Checking…" });
  const buttonColors = await button.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  gate.release();
  await clearIntercepts(page);
  const statusRatio = contrast(statusColors.fg, statusColors.bg);
  const buttonRatio = contrast(buttonColors.fg, buttonColors.bg);
  record("TC-065/066/081", { reducedMotionAnimationDuration: animation, statusContrast: statusRatio, busyButtonContrast: buttonRatio, busyButtonColors: buttonColors, darkPreferenceBodyBg: bodyBg, note: "The app has no dark theme; it stays light" });
  expect(parseFloat(animation)).toBeLessThan(0.1);
  expect(statusRatio).toBeGreaterThanOrEqual(4.5);
  expect(buttonRatio, "busy (disabled) primary button text meets 4.5:1").toBeGreaterThanOrEqual(4.5);
});

test("TC-069 ten check/fail cycles leave no extra overlays or listeners", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/import?kind=holidays");
  await page.getByLabel("Holidays CSV file").setInputFiles({ name: "h.csv", mimeType: "text/csv", buffer: Buffer.from("date,name\nbad,Bad") });
  const heapBefore = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  const nodesBefore = await page.evaluate(() => document.querySelectorAll("*").length);
  for (let i = 0; i < 10; i += 1) {
    await page.getByRole("button", { name: "Check file" }).click();
    await expect(page.getByText(/rows have problems/)).toBeVisible();
  }
  const nodesAfter = await page.evaluate(() => document.querySelectorAll("*").length);
  const heapAfter = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  const statusBars = await page.getByRole("status").filter({ hasText: /Checking/ }).count();
  record("TC-069", { cycles: 10, domNodesBefore: nodesBefore, domNodesAfter: nodesAfter, heapBeforeMB: Math.round(heapBefore / 1e5) / 10, heapAfterMB: Math.round(heapAfter / 1e5) / 10, leftoverStatusBars: statusBars });
  expect(statusBars).toBe(0);
  expect(nodesAfter - nodesBefore).toBeLessThan(50);
});

// ---- H. Edge cases ---------------------------------------------------------------------------
test("TC-071 work finished in a background tab shows when the tab comes back", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await commentBox(page).fill("Finished in the background");
  await postButton(page).click();
  const other = await context.newPage();
  await other.goto("/users");
  await other.bringToFront();
  gate.release();
  await other.waitForTimeout(2000);
  await page.bringToFront();
  const shown = await page.getByText("Finished in the background").first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
  record("TC-071", { resultShownOnReturn: shown });
  await clearIntercepts(page);
  expect(shown).toBe(true);
});

test("TC-072 TC-073 closing or refreshing during a submit never makes two requests", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const results: Record<string, number> = {};
  for (const how of ["refresh", "close"] as const) {
    const work = how === "close" ? await context.newPage() : page;
    await work.goto(`/users/custom?template=${await purchaseTemplateId()}`);
    const title = `QA ${how} ${stamp}`;
    await work.getByLabel("Title").fill(title);
    await toReviewStep(work);
    await interceptActions(work, { delayMs: 1500, times: 1 });
    await work.getByRole("button", { name: "Submit request" }).click();
    await work.waitForTimeout(300);
    if (how === "refresh") await work.reload().catch(() => undefined);
    else await work.close();
    await page.waitForTimeout(4000);
    results[how] = await count("SELECT COUNT(*) AS n FROM approval_requests WHERE title = ?", [title]);
    if (how === "refresh") await clearIntercepts(work);
  }
  record("TC-072/073", { requestsAfterRefreshDuringSubmit: results.refresh, requestsAfterCloseDuringSubmit: results.close, note: "0 = the browser cut the request before it reached the server; 1 = completed once" });
  expect(results.refresh!).toBeLessThanOrEqual(1);
  expect(results.close!).toBeLessThanOrEqual(1);
});

test("TC-074 malformed answers: sign-in and a form both recover", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.route("**/api/auth/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{not json" }));
  await page.getByLabel("User ID").fill("someone");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  // Next adds an empty role=alert route announcer; look for the message itself.
  const signInMessage = await page.getByRole("alert").filter({ hasText: /went wrong|try again/i }).waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  const signInStuck = await page.getByRole("button", { name: "Checking…" }).isVisible();
  await page.unroute("**/api/auth/**");
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await interceptActions(page, { body: "this is not a server component payload", contentType: "text/x-component", times: 1 });
  await commentBox(page).fill("Malformed answer");
  await postButton(page).click();
  await page.waitForTimeout(3000);
  const formCrashed = await crashed(page);
  const formStuck = await page.getByRole("button", { name: "Working…" }).isVisible().catch(() => false);
  await page.screenshot({ path: "test-results/loader-audit/TC-074-malformed.png", fullPage: true });
  record("TC-074", { signInShowsMessage: signInMessage, signInStuck, formCrashedToErrorPage: formCrashed, formLoaderStuck: formStuck });
  await clearIntercepts(page);
  expect(signInMessage && !signInStuck).toBe(true);
  expect(formCrashed).toBe(false);
  expect(formStuck).toBe(false);
});

test("TC-076 the session ends while a request is in flight", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  const gate = await interceptActions(page, { hold: true, times: 1 });
  await commentBox(page).fill("Session ended mid-flight");
  await postButton(page).click();
  await sql("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'QA' WHERE user_id = (SELECT id FROM users WHERE login_id = 'E2E_REQ') AND revoked_at IS NULL");
  gate.release();
  await page.waitForTimeout(3000);
  const saved = await count("SELECT COUNT(*) AS n FROM request_comments WHERE body = 'Session ended mid-flight'").catch(() => -1);
  const text = await page.locator("body").innerText();
  const stuck = await page.getByRole("button", { name: "Working…" }).isVisible().catch(() => false);
  await page.screenshot({ path: "test-results/loader-audit/TC-076-session-mid-flight.png", fullPage: true });
  record("TC-076", { shownText: text.slice(0, 300), commentSaved: saved, loaderStuck: stuck, toldToSignIn: /sign in/i.test(text), url: new URL(page.url()).pathname });
  await clearIntercepts(page);
  expect(saved).toBe(0);
  expect(stuck).toBe(false);
  expect(/sign in/i.test(text) || /\/login/.test(page.url()), "asked to sign in again").toBe(true);
});

test("TC-085 a replayed approval (duplicate request) changes nothing", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const path = await raise(page, `QA replay ${stamp}`);
  const id = Number(path.split("/").pop());
  await as(context, "E2E_MGR");
  await page.goto(path);
  let captured: { url: string; headers: Record<string, string>; body: string } | null = null;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"] && !captured) captured = { url: request.url(), headers: request.headers(), body: request.postData() ?? "" };
  });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Approved by Manoj Manager/).first()).toBeVisible({ timeout: 15_000 });
  const c = captured as unknown as { url: string; headers: Record<string, string>; body: string };
  const replay = await page.request.post(c.url, { headers: { "next-action": c.headers["next-action"]!, "content-type": c.headers["content-type"]!, accept: "text/x-component" }, data: c.body });
  const events = await count("SELECT COUNT(*) AS n FROM approval_events WHERE request_id = ? AND event_type = 'TASK_DECIDED'", [id]).catch(async () =>
    count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED'", [id]),
  );
  const approvals = await count("SELECT COUNT(*) AS n FROM approval_tasks WHERE request_id = ? AND status = 'APPROVED'", [id]);
  record("TC-085", { replayStatus: replay.status(), approvedTasks: approvals, approvalEvents: events });
  expect(approvals).toBe(1);
});
