import { expect, test, type BrowserContext } from "@playwright/test";
import { dropCustomDraft, sessionCookie, toWorkflowStep } from "./db";

// v1.52.3 (owner): table columns can be dragged into a new order, saved for
// the person; a request's files can be deleted until the first approval.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("a file attached to a new request can be deleted before anyone approves it", async ({ page, context }) => {
  test.setTimeout(120_000);
  await dropCustomDraft("E2E_REQ");
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/custom");
  await page.locator("#c-title").fill(`Files check ${Date.now().toString(36)}`);
  await page.locator("#c-attachments").setInputFiles({ name: "draft-quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\ndraft\n%%EOF") });
  await toWorkflowStep(page);
  await page.getByTestId("step-next").click();
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);
  await page.getByRole("button", { name: "Delete draft-quote.pdf" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete file" }).click();
  await expect(page.getByRole("button", { name: "Delete draft-quote.pdf" })).toHaveCount(0);
  await expect(page.getByText("No files attached.")).toBeVisible();
});

test("dragging a column title moves the column, and the order is kept for the person", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/users/requests");
  const header = page.getByTestId("reorder-my_requests");
  const titles = async () => (await header.locator("th[data-column]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-column"))));
  const before = await titles();
  expect(before.indexOf("raised")).toBeGreaterThan(before.indexOf("status"));
  await header.locator('th[data-column="raised"]').dragTo(header.locator('th[data-column="status"]'));
  await expect.poll(async () => (await titles()).indexOf("raised") < (await titles()).indexOf("status")).toBe(true);
  await expect(header).not.toHaveAttribute("aria-busy", "true");
  // The cells moved with their titles: the Raised cell is where the Raised title is.
  const raisedAt = (await titles()).indexOf("raised") + 1; // + the Request column
  await expect(page.getByTestId("request-table").locator("tbody tr").first().locator("td").nth(raisedAt)).toHaveAttribute("title", /\d{4}/);
  await page.screenshot({ path: "test-results/v1523-columns.png", fullPage: false });
  // Saved: a new visit shows the same order, and the cells follow their titles.
  await page.reload();
  await expect.poll(async () => (await titles()).indexOf("raised") < (await titles()).indexOf("status")).toBe(true);
  // Put it back for the other tests (keyboard: Alt+→ moves a focused title).
  for (let step = 0; step < 5 && (await titles()).indexOf("raised") < (await titles()).indexOf("status"); step += 1) {
    await header.locator('th[data-column="raised"]').focus();
    await page.keyboard.press("Alt+ArrowRight");
    await page.waitForTimeout(400);
  }
  expect((await titles()).indexOf("raised")).toBeGreaterThan((await titles()).indexOf("status"));
});
