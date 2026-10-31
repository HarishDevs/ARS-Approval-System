import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// D-235 (owner: "Fields can't be reordered, and removals don't ask first.
// Add reorder and confirmation"): the Form Designer.
test("add from the library, reorder, duplicate, remove only after asking, undo", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/admin/custom-approval");
  const designer = page.getByTestId("form-designer");
  const names = () =>
    designer
      .getByTestId("form-field")
      .locator("button[aria-label^='Edit ']")
      .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")!.replace(/^Edit /, "")));
  const before = await names();

  // Add two fields from the library (each opens its properties).
  await designer.getByRole("button", { name: "Add a Short text field" }).click();
  await designer.getByLabel("Field label").fill("Vendor");
  await designer.getByRole("button", { name: "Add a Number field" }).click();
  await designer.getByLabel("Field label").fill("Quantity");
  expect((await names()).slice(-2)).toEqual(["Vendor", "Quantity"]);

  // Reorder: Move up, and Alt+↓ on the card.
  await designer.getByRole("button", { name: "Move Quantity up" }).click();
  expect((await names()).slice(-2)).toEqual(["Quantity", "Vendor"]);
  await designer.getByRole("button", { name: "Edit Quantity" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  expect((await names()).slice(-2)).toEqual(["Vendor", "Quantity"]);

  // Duplicate: its own key.
  await designer.getByRole("button", { name: "Duplicate Vendor" }).click();
  await expect(designer.getByLabel("Field key")).toHaveValue("vendor_2");
  expect(await names()).toContain("Vendor (copy)");

  // Remove asks first; Cancel keeps it; confirm removes; Undo brings it back.
  await designer.getByRole("button", { name: "Remove field Vendor (copy)" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Remove “Vendor (copy)”?");
  await ask.getByRole("button", { name: "Cancel" }).click();
  expect(await names()).toContain("Vendor (copy)");
  await designer.getByRole("button", { name: "Remove field Vendor (copy)" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove field" }).click();
  expect(await names()).not.toContain("Vendor (copy)");
  await designer.getByRole("button", { name: "Undo" }).click();
  expect(await names()).toContain("Vendor (copy)");
  await designer.getByRole("button", { name: "Redo" }).click();
  expect(await names()).not.toContain("Vendor (copy)");

  // Changing a type that would drop settings asks first.
  await designer.getByRole("button", { name: "Add a Dropdown field" }).click();
  await designer.getByLabel("Field label").fill("Kind");
  for (const option of ["Capex", "Opex"]) {
    await designer.getByLabel("New option for Kind").fill(option);
    await designer.getByLabel("New option for Kind").press("Enter");
  }
  await designer.getByLabel("Field type").selectOption("TEXT");
  await expect(page.getByRole("alertdialog")).toContainText("loses its 2 options");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(designer.getByLabel("Field type")).toHaveValue("CHOICE");

  // Nothing is saved here (the page's own Save does that): the list is as it started plus the new fields.
  expect((await names()).slice(0, before.length)).toEqual(before);
  await page.screenshot({ path: "test-results/form-designer.png", fullPage: true });
});
