import { expect, test, type BrowserContext } from "@playwright/test";
import { db, sessionCookie, userIdByLogin, toReviewStep } from "./db";

// D-234 (UX laws): the workflow changes under real use. Default effect
// (reporting manager first), Goal gradient (stepper), Fitts and Von
// Restorff (Reject apart, asked first), Peak-end (next waiting), Tesler
// (raise a custom request again), Postel (a loosely typed number).
test.describe.configure({ mode: "serial" });
const stamp = Date.now().toString(36);
let requestPath = "";
let requestNo = "";

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("a custom request starts with the reporting manager as approver; the stepper shows where it is", async ({ page, context }) => {
  const conn = await db();
  try {
    await conn.query("DELETE FROM request_drafts WHERE user_id = ? AND draft_key = 'CUSTOM'", [await userIdByLogin("E2E_REQ")]);
  } finally {
    await conn.end();
  }
  await as(context, "E2E_REQ");
  await page.goto("/users/custom");
  await expect(page.locator("main form").getByText("Manoj Manager").first()).toBeVisible();
  await page.getByLabel("Title").fill(`UX laws chairs ${stamp}`);
  await page.getByLabel(/^Details/).fill("Four chairs for the meeting room.");
  await toReviewStep(page);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  requestPath = new URL(page.url()).pathname;
  requestNo =
    (
      await page
        .getByRole("status")
        .filter({ hasText: /Submitted as/ })
        .textContent()
    )?.match(/[A-Z]{2,6}-\d{4}-\d{6}/)?.[0] ?? "";
  expect(requestNo).not.toBe("");
  await expect(page.getByTestId("step-map").locator('[data-level-state="current"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "← Back to My pending requests" })).toBeVisible();
});

test("Postel: the number typed without dashes or leading zeros still finds it", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  const [prefix, year, serial] = requestNo.split("-");
  const loose = `${prefix!.toLowerCase()} ${year}${Number(serial)}`;
  const answer = await (await page.request.get(`/api/me/quick?q=${encodeURIComponent(loose)}`)).json();
  expect(answer.items.map((item: { requestNo: string }) => item.requestNo)).toContain(requestNo);
});

test("Reject is apart and asks first; Cancel keeps it waiting; after deciding, what's next", async ({ page, context }) => {
  await as(context, "E2E_MGR");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(requestPath);
  await page
    .getByLabel(/Comment/)
    .first()
    .fill("Not this quarter");
  await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  const ask = page.getByRole("alertdialog", { name: "Reject this request?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Needs your action" })).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await page.getByRole("alertdialog", { name: "Reject this request?" }).getByRole("button", { name: "Yes, reject" }).click();
  await expect(page.getByTestId("next-waiting").first()).toBeVisible();
  await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();
});

test("Tesler: the requester raises the custom request again, approvers and details copied", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto(requestPath);
  await page.getByRole("link", { name: "Raise again like this" }).click();
  await expect(page).toHaveURL(/\/users\/custom\?from=\d+/);
  await expect(page.getByTestId("raised-again")).toContainText(requestNo);
  await expect(page.getByLabel("Title")).toHaveValue(`UX laws chairs ${stamp}`);
  await expect(page.locator("main form").getByText("Manoj Manager").first()).toBeVisible();
  // The page autosaves a draft of what it was given; leave no draft behind for other tests.
  await page.goto("/users");
  const conn = await db();
  try {
    await conn.query("DELETE FROM request_drafts WHERE user_id = ? AND draft_key = 'CUSTOM'", [await userIdByLogin("E2E_REQ")]);
  } finally {
    await conn.end();
  }
});
