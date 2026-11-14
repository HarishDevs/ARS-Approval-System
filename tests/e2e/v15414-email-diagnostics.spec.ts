import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.54.14 (owner's email delivery audit): the Super Admin's Email
// diagnostics panel, and Message deliveries showing the provider and that an
// email was accepted (not "delivered"). The diagnostic itself is not run here:
// it talks to outside mail servers.
test("Email diagnostics panel and the deliveries' Provider column", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/superadmin/settings");
  const panel = page.getByTestId("email-diagnostics");
  await expect(panel.getByRole("heading", { name: "Email diagnostics" })).toBeVisible();
  await expect(panel.getByLabel("Test recipient")).toHaveAttribute("type", "email");
  await expect(panel.getByLabel("Test recipient")).not.toHaveValue("");
  await expect(panel.getByLabel("Send one test message through").locator("option")).toHaveText([/localhost:25/, /relay-hosting\.secureserver\.net:25/, /Don.t send/]);
  await expect(panel.getByRole("button", { name: "Run diagnostics" })).toBeEnabled();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/v15414-email-diagnostics.png" });

  // A delivery to list: locally no email provider is set up, so the test send fails at once (nothing leaves the PC).
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByText(/EMAIL_NOT_CONFIGURED|Test email sent/).first()).toBeVisible();
  await page.goto("/superadmin/deliveries");
  await expect(page.getByRole("columnheader", { name: "Provider" })).toBeVisible();
});

test("a plain user can't reach the diagnostic", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  const response = await page.goto("/superadmin/settings");
  expect(response?.status()).toBe(404);
});
