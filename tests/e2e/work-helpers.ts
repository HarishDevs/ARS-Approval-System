import { expect, type Page } from "@playwright/test";

// D-220: creating a project goes through the steps (Blank project → details → sections → Create).
export async function createProject(page: Page, name: string): Promise<string> {
  await page.goto("/users/work/projects/new");
  await page.getByRole("button", { name: /Blank project/ }).click();
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/users\/work\/projects\/\d+\?created=1/);
  return page.url().split("?")[0]!;
}
