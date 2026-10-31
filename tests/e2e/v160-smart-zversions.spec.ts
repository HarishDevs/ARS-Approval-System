import { expect, test, type BrowserContext } from "@playwright/test";
import { sessionCookie } from "./db";

// Version history and FN7 through the real screens, on "E2E Smart" (built by
// v160-smart-forms; open requests left by the earlier smart specs): IT
// publishes version 2, compares it with version 1, moves the open requests,
// and restores version 1 as a draft.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

test("IT publishes version 2, compares, moves open requests, and restores version 1 as a draft", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows");
  await page.getByRole("link", { name: "E2E Smart" }).first().click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+$/);
  const workflowUrl = page.url();
  await page.getByLabel("Level 1 name").fill("Line manager");
  // D-241: saving goes into the working draft (version 2 here).
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Publish version 2" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText(/version 2 is live/)).toBeVisible();

  await page.getByRole("link", { name: "Compare with live" }).first().click();
  await expect(page.getByRole("heading", { name: "Compare versions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Steps" }).getByText(/renamed from ".*" to "Line manager"/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Form fields" }).getByText("No changes.")).toBeVisible();

  await page.goto(workflowUrl);
  await page.getByRole("link", { name: /Move \d+ open requests? to the live version/ }).click();
  await expect(page.getByRole("heading", { name: "Move open requests to version 2" })).toBeVisible();
  const table = page.getByRole("table", { name: "Open requests on version 1" });
  await expect(table.getByText("Compatible", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Move selected \(\d+\)/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move them" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Run #\d+: moved [1-9]\d*, skipped \d+/ })).toBeVisible();
  const earlier = page.getByRole("region", { name: "Earlier moves" });
  await earlier.getByText(/Run #\d+: version 1 → 2/).click();
  const moved = earlier.getByRole("link", { name: /ESM-\d{4}-\d{6}/ }).first();
  const requestNo = await moved.textContent();
  await moved.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Moved from workflow version 1 to version 2 by/)).toBeVisible();
  expect(requestNo).toMatch(/ESM-/);

  await page.goto(workflowUrl);
  await page.getByRole("button", { name: "Restore as draft" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Copy as draft" }).click();
  // The page refreshes: version 3 appears as a draft (and Restore hides while a draft exists).
  await expect(page.getByText("Version 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore as draft" })).toHaveCount(0);
});
