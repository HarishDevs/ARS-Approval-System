import type { Locator, Page } from "@playwright/test";

// v1.52.1: people are chosen in a searchable list (PersonSelect: "Name - code"
// with the department below), not a native select. Opens the picker, types
// the search and clicks the first matching person.
export async function pickPerson(page: Page, picker: Locator, search: string): Promise<void> {
  await picker.click();
  await page.getByRole("combobox", { name: "Search people" }).fill(search);
  await page.getByRole("listbox", { name: "People" }).getByRole("option", { name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
}

// The first person in the list (what selectOption({ index: 1 }) chose after
// the empty choice of a native select).
export async function pickFirstPerson(page: Page, picker: Locator): Promise<void> {
  await picker.click();
  await page.getByRole("listbox", { name: "People" }).getByRole("option").filter({ hasText: " - " }).first().click();
}
