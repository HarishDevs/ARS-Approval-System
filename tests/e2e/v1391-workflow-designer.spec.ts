import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-239 (Configuration Studio): the Workflow Designer: a map of the flow,
// problems shown on the level they are in, duplicate, remove with a question
// and Undo, folding, and the map opening a level in the list.
test("map, problems by level, duplicate, remove with Undo, fold and open from the map", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/admin/workflows/new");
  const designer = page.getByTestId("workflow-designer");
  const map = page.getByTestId("workflow-map");
  await expect(map.getByRole("button", { name: /^Level 1: Approval authority \(DoA\)/ })).toBeVisible();
  await expect(designer.getByTestId("flow-problems")).toHaveText("Ready to save");

  // A new level starts valid; choosing "Specific people" without anyone is a problem on that level.
  await page.getByRole("button", { name: "Add a level" }).click();
  await expect(page.getByTestId("workflow-level")).toHaveCount(2);
  const second = page.getByTestId("workflow-level").nth(1);
  await second.getByLabel("Step name").fill("Finance check");
  await second.getByLabel("Who approves").selectOption("PEOPLE");
  await expect(second.getByTestId("level-problems")).toHaveText("1 to fix");
  await expect(second.getByRole("list", { name: "What to fix in level 2" })).toContainText("choose at least one person");
  await expect(designer.getByTestId("flow-problems")).toHaveText("1 to fix");
  await expect(map.getByRole("button", { name: /^Level 2: Finance check.*1 to fix/ })).toBeVisible();
  await second.getByLabel("Who approves").selectOption("REQUESTER_MANAGER");
  await expect(designer.getByTestId("flow-problems")).toHaveText("Ready to save");

  // Duplicate, then remove the copy: it asks, and Undo brings it back.
  await second.getByRole("button", { name: "Duplicate level 2" }).click();
  await expect(page.getByTestId("workflow-level")).toHaveCount(3);
  await expect(map.getByRole("button", { name: /^Level 3: Finance check \(copy\)/ })).toBeVisible();
  await page.getByTestId("workflow-level").nth(2).getByRole("button", { name: "Remove level" }).click();
  const ask = page.getByRole("alertdialog", { name: "Remove level 3?" });
  await expect(ask).toContainText("Finance check (copy)");
  await ask.getByRole("button", { name: "Remove level" }).click();
  await expect(page.getByTestId("workflow-level")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(page.getByTestId("workflow-level")).toHaveCount(3);

  // Fold everything; the map opens one level again.
  await designer.getByRole("button", { name: "Collapse all levels" }).click();
  await expect(page.getByLabel("Step name")).toHaveCount(0);
  await expect(page.getByTestId("workflow-level").nth(1)).toContainText("Finance check");
  await map.getByRole("button", { name: /^Level 2: Finance check/ }).click();
  await expect(page.getByTestId("workflow-level").nth(1).getByLabel("Step name")).toHaveValue("Finance check");
  await page.screenshot({ path: "test-results/workflow-designer.png", fullPage: true });

  // Alt+↓ on a level's header moves it.
  await page.getByRole("button", { name: /^Fold level 2: Finance check$/ }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(map.getByRole("button", { name: /^Level 3: Finance check\./ })).toBeVisible();
});
