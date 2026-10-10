import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sessionCookie } from "./db";

// Session 12 (F-75, D-088): the workflow builder's form field creator end to
// end, typed key by key like a person, through every field type:
//   build → conditions on a date and a department → test mode → publish →
//   raise (with validation) → the stored values and the skipped steps.
test.describe.configure({ mode: "serial" });

async function as(context: BrowserContext, loginId: string) {
  await context.clearCookies();
  await context.addCookies([await sessionCookie(loginId)]);
}

async function addField(page: Page, label: string, type: string) {
  await page.getByRole("button", { name: "Add field" }).click();
  // Typed one key at a time: the key must follow the whole label.
  await page.getByLabel("Field label").last().pressSequentially(label);
  await page.getByLabel("Field type").last().selectOption(type);
}

let workflowPath = "";

test("IT builds a form with every field type; the dropdown creator and keys work key by key", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto("/admin/workflows/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E All Fields");
  await page.getByLabel("Code").fill("E2E_ALL_FIELDS");
  await page.getByLabel("Number prefix").fill("EAF");

  // Dropdown with your own options.
  await addField(page, "Purchase type", "CHOICE");
  await expect(page.getByLabel("Field key").last()).toHaveValue("purchase_type");
  const option = page.getByLabel("New option for Purchase type");
  for (const value of ["Capex", "Opex", "capex"]) {
    await option.pressSequentially(value);
    await option.press("Enter"); // adds the option; never submits the form
  }
  await expect(page.getByText("Already in the list: capex")).toBeVisible();
  await page.getByLabel("New option for Purchase type").pressSequentially("Services");
  await page.getByRole("button", { name: "Add option" }).click();
  const options = page.getByRole("list", { name: "Options for Purchase type" }).getByRole("listitem");
  await expect(options).toHaveText(["Capex✕", "Opex✕", "Services✕"]);
  await page.getByRole("button", { name: "Remove option Services" }).click();
  await expect(options).toHaveCount(2);
  await page.getByLabel("Required: Purchase type").check();

  // Date, department from the database, long text with help, a person.
  await addField(page, "Needed by", "DATE");
  await expect(page.getByLabel("Field key").last()).toHaveValue("needed_by");
  await page.getByLabel("Required: Needed by").check();
  await addField(page, "Department", "LOOKUP:DEPARTMENT");
  await page.getByLabel("Required: Department").check();
  await expect(page.getByText("The requester picks from the active departments")).toBeVisible();
  await addField(page, "Notes", "LONG_TEXT");
  await page.getByLabel("Help text for Notes").fill("Anything the approvers should know");
  await addField(page, "Designation", "LOOKUP:DESIGNATION");

  // The smallest amount keeps what is typed, decimals included.
  const smallest = page.getByLabel("Smallest value for Amount (₹)");
  await smallest.fill("");
  await smallest.pressSequentially("0.5");
  await expect(smallest).toHaveValue("0.5");
  await smallest.fill("0");

  // Two levels after the DoA matrix, each skipped on a field.
  await page.getByRole("button", { name: "Add a level" }).click();
  await page.getByRole("button", { name: "Add a level" }).click();
  // The two new levels come after the DoA matrix's own (folded) steps.
  const names = page.getByPlaceholder("e.g. HOD approval");
  await names.nth(-2).fill("Plant head");
  await names.last().fill("Urgent check");
  const skips = page.getByLabel(/Skip this step when/);
  await skips.nth(-2).check();
  await skips.last().check();
  const fieldOf = (n: number) => page.getByLabel("Field", { exact: true }).nth(n);
  const conditionOf = (n: number) => page.getByLabel("Condition", { exact: true }).nth(n);
  const valueOf = (n: number) => page.getByLabel("Value", { exact: true }).nth(n);

  // Plant head: skipped when the department is E2E Department (a list, not typing).
  await fieldOf(-2).selectOption("department");
  await expect(conditionOf(-2).locator("option")).toHaveText(["is", "is not", "is empty", "is filled in"]);
  await valueOf(-2).selectOption({ label: "E2E Department (E2E)" });

  // Urgent check: skipped when Needed by is on or after 1 Jan 2027 (a date picker).
  await fieldOf(-1).selectOption("needed_by");
  await conditionOf(-1).selectOption({ label: "is on or after" });
  const dateValue = valueOf(-1);
  await expect(dateValue).toHaveAttribute("type", "date");
  await dateValue.fill("2027-01-01");

  await page.getByRole("button", { name: "Create workflow (as draft)" }).click();
  await expect(page).toHaveURL(/\/admin\/workflows\/\d+\?created=1/);
  workflowPath = new URL(page.url()).pathname;

  // Saved keys are locked from now on.
  await expect(page.getByLabel("Field key").first()).toHaveAttribute("readonly", "");
});

test("test mode follows the date and department conditions", async ({ page, context }) => {
  await as(context, "E2E_ADMIN");
  await page.goto(workflowPath);
  await page.getByLabel("Sample requester").selectOption({ label: "Ravi Requester (E2E_REQ)" });
  await page.locator("#sim-amount").fill("50,000");
  await page.locator("#sim-purchase_type").selectOption("Capex");
  await page.locator("#sim-department").selectOption({ label: "E2E Department" });
  await page.locator("#sim-needed_by").fill("2027-03-01");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Skipped: .*Plant head/)).toBeVisible();
  await expect(page.getByText(/Skipped: .*Urgent check/)).toBeVisible();

  await page.locator("#sim-needed_by").fill("2026-12-01");
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(page.getByText(/Urgent check \(Must approve\): Manoj Manager/)).toBeVisible();
  await expect(page.getByText(/Skipped: .*Urgent check/)).toHaveCount(0);

  await page.getByRole("button", { name: "Publish version 1" }).click();
  await page.getByRole("button", { name: "Yes, publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("a requester fills every field type; values are checked, stored and shown back", async ({ page, context }) => {
  await as(context, "E2E_REQ");
  await page.goto("/users/new");
  await page.getByRole("link", { name: /E2E All Fields/ }).click();
  await expect(page.getByLabel("Needed by")).toHaveAttribute("type", "date");
  await expect(page.getByLabel("Purchase type").locator("option")).toHaveText(["Choose…", "Capex", "Opex"]);
  await expect(page.getByLabel("Department").locator("option", { hasText: "E2E Department" })).toHaveCount(1);
  await expect(page.getByText("Anything the approvers should know")).toBeVisible();

  await page.getByLabel("Title").fill("Spare motors for line 2");
  await page.getByLabel(/Amount/).fill("75,000");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Purchase type is required.", { exact: true })).toBeVisible();
  await expect(page.getByText("Needed by is required.", { exact: true })).toBeVisible();
  // FN4: Department comes from the requester's profile, so it isn't missing.
  await expect(page.getByText("Department is required.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group").filter({ hasText: "Department" }).getByText("Filled from your profile. You can change it.")).toBeVisible();
  // FB-06: a summary at the top takes focus and links to each field.
  const summary = page.getByRole("alert").filter({ hasText: "Please fix 2 things" });
  await expect(summary).toBeFocused();
  await summary.getByRole("link", { name: /Needed by/ }).click();
  await expect(page.getByLabel("Needed by")).toBeFocused();
  await expect(page.getByLabel("Needed by")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Purchase type").selectOption("Opex");
  await page.getByLabel("Needed by").fill("2026-12-01");
  await page.getByLabel("Department").selectOption({ label: "E2E Department" });
  await page.getByLabel(/Notes/).fill("Two spares, same model");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page).toHaveURL(/\/users\/requests\/\d+\?submitted=1/);

  // Stored values shown readably; the department step skipped, the date step kept.
  await expect(page.getByText("01 Dec 2026")).toBeVisible();
  await expect(page.getByText("E2E Department", { exact: true })).toBeVisible();
  await expect(page.getByText("Opex", { exact: true })).toBeVisible();
  await expect(page.getByText("75,000", { exact: true })).toBeVisible();
  await expect(page.getByText("Skipped: Department is E2E")).toBeVisible();
});
