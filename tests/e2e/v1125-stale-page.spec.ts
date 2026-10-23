import { expect, test } from "@playwright/test";
import { sessionCookie } from "./db";

// v1.12.5 (D-164): every publish makes new Server Action ids, so a page
// opened before it can't submit or delete anything until it's reloaded. It
// used to say "Couldn't reach the server"; now it says ARS was updated and
// offers Reload page, and the session check spots a new build before a
// button is pressed.
test("a page opened before a publish says to reload, not 'couldn't reach the server'", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users/notifications/settings");
  // What the new server answers to an action id from the old build.
  await page.route("**/users/notifications/settings", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await route.fulfill({ status: 404, headers: { "content-type": "text/plain", "x-nextjs-action-not-found": "1" }, body: "Server action not found." });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByText(/ARS was updated since this page opened/)).toBeVisible();
  await expect(page.getByText(/Couldn't reach the server/)).toHaveCount(0);
  const banner = page.getByTestId("app-updated");
  await expect(banner).toBeVisible();
  await page.unroute("**/users/notifications/settings");
  await banner.getByRole("button", { name: "Reload page" }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Save choices" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
});

test("the session check notices a new build and shows the banner", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  const real = await (await page.request.get("/api/auth/status")).json();
  expect(typeof real.build).toBe("string");
  await page.goto("/users");
  await expect(page.getByTestId("app-updated")).toHaveCount(0);
  await page.route("**/api/auth/status", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), build: "a-newer-build" } });
  });
  // The check runs every minute and when the tab becomes visible again.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByTestId("app-updated")).toBeVisible();
});
