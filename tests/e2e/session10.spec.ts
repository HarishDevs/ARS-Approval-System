import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sessionCookie } from "./db";
import { buildWorkbook } from "../../server/import/xlsx";
import { readXlsxRows } from "../../server/import/xlsx-read";

// Session 10 (F-59): download a template, upload a file, check it (with a
// loader), fix nothing-saved problems, then import.
test("IT downloads the template, checks a file with a problem, then imports a fixed one", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto("/admin/import?kind=designations");
  await expect(page.getByRole("heading", { name: "Import data" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Designations" })).toHaveAttribute("aria-selected", "true");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download template" }).click()]);
  // v1.49.1 (owner): the template is an Excel workbook (the sheet, then "How to fill").
  expect(download.suggestedFilename()).toBe("ars-designations-template.xlsx");
  expect(readXlsxRows(new Uint8Array(await readFile((await download.path())!)))).toEqual([["code", "name", "approver", "active"]]);

  const code = `E2E${Date.now().toString(36).toUpperCase()}`;
  const upload = (text: string) => page.getByLabel("Designations file (Excel or CSV)").setInputFiles({ name: "designations.csv", mimeType: "text/csv", buffer: Buffer.from(text) });

  await upload(`code,name,approver,active\n${code},E2E Designation,No,Yes\nX,Too short code,No,maybe`);
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("1 of 2 rows have problems. Nothing has been saved.")).toBeVisible();
  await expect(page.getByText("Write Yes or No.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import / })).toHaveCount(0);

  // The fixed file comes back as Excel (.xlsx), the way the template is filled in.
  const book = buildWorkbook([{ name: "Designations", header: ["code", "name", "approver", "active"], rows: [[code, "E2E Designation", "No", "Yes"]] }]);
  await page.getByLabel("Designations file (Excel or CSV)").setInputFiles({ name: "designations.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(book) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("The file is fine. Review the changes, then import.")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 designation" }).click();
  await page.getByRole("button", { name: "Yes, import" }).click();
  await expect(page.getByText("Imported: 1 created, 0 updated.")).toBeVisible();

  await page.goto("/admin/organisation");
  // Saved designations are shown as editable rows.
  await expect(page.locator(`input[value="${code}"]`)).toBeVisible();
});

test("the Super Admin has the same import screen; a plain user can't download", async ({ page, context, request }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.goto("/superadmin/import?kind=holidays");
  await expect(page.getByRole("tab", { name: "Holidays" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "Import data" })).toBeVisible();

  const staff = await sessionCookie("E2E_STAFF");
  const response = await request.get("/api/admin/import/users?type=data", { headers: { cookie: `${staff.name}=${staff.value}` } });
  expect(response.status()).toBe(404);
});
