import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-240 (Configuration Studio): the settings console: categories, a search
// across them, unsaved changes marked, one Save per category; the AI
// settings are one form with one Save (they were nine).
test("search across categories, unsaved marks, and the AI page's single Save", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/superadmin/settings");
  const categories = page.getByRole("navigation", { name: "Setting categories" });
  for (const name of ["Email", "WhatsApp", "Sign-in security", "General", "Retention", "Feature switches"]) await expect(categories.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();

  // The search hides what doesn't match (across every category).
  await page.getByLabel("Find a setting").fill("lockout");
  await expect(page.locator("#settings-AUTHENTICATION")).toBeVisible();
  await expect(page.locator("#settings-EMAIL")).toBeHidden();
  await page.getByLabel("Find a setting").fill("zzzz nothing");
  await expect(page.getByText("No setting matches “zzzz nothing”.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(page.locator("#settings-EMAIL")).toBeVisible();

  // A change is marked on its category until it is saved (or the page is left, which asks).
  const general = page.locator("#settings-GENERAL");
  const box = general.locator("input[type=text], textarea").first();
  await box.fill(`${await box.inputValue()} `);
  await expect(general.getByText("Unsaved changes")).toBeVisible();
  await expect(categories.getByRole("link", { name: /General/ })).toContainText("Unsaved");

  // AI: General, the providers and the common settings in one form, one Save.
  await page.goto("/superadmin/ai");
  const ai = page.getByTestId("settings-console");
  await expect(ai.getByRole("button", { name: /^Save/ })).toHaveCount(1);
  await expect(ai.getByRole("button", { name: "Save AI settings" })).toBeVisible();
  await page.getByLabel("Find a setting").fill("Gemini");
  await expect(page.getByTestId("ai-provider-GEMINI")).toBeVisible();
  await expect(page.getByTestId("ai-provider-CLAUDE")).toBeHidden();
  await expect(page.getByTestId("ai-common")).toBeHidden();
  await page.screenshot({ path: "test-results/settings-console.png", fullPage: true });
});
