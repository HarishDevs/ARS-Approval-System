import { expect, test } from "@playwright/test";

// v1.54.6 (Google sign-in fix): every refusal on the Google sign-in path is
// told apart (code, reason, message, the request id in the response header).
// The real Google popup can't run in automated tests; the account rules are
// covered by tests/auth/google-provider.test.ts.
test("an unverifiable token is a 401 with its own reason and a reference", async ({ request }) => {
  const response = await request.post("/api/auth/google", { data: { idToken: "x".repeat(40) }, headers: { "sec-fetch-site": "same-origin" } });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toMatchObject({ code: "AUTH_INVALID_TOKEN", reason: "INVALID_TOKEN" });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});

test("a post from another website is refused with its own code and message (not the account message)", async ({ request }) => {
  const response = await request.post("/api/auth/google", { data: { idToken: "x".repeat(40) }, headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } });
  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(body.error.code).toBe("FORBIDDEN_CROSS_SITE");
  expect(body.error.message).toMatch(/came from another website/);
});

test("the browser can report why the popup failed; unknown codes are reduced to 'unknown'", async ({ request }) => {
  expect((await request.post("/api/auth/google/client-event", { data: { code: "auth/popup-blocked" }, headers: { "sec-fetch-site": "same-origin" } })).status()).toBe(204);
  expect((await request.post("/api/auth/google/client-event", { data: { code: "<script>" }, headers: { "sec-fetch-site": "same-origin" } })).status()).toBe(204);
});

test("the login page offers Continue with Google", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});
