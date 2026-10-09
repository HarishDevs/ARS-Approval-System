import { expect, test } from "@playwright/test";
import { ORIGIN_SECRET } from "../../playwright.origin.config";

test("with ORIGIN_SECRET set, only requests carrying the Cloudflare header are served", async ({ request }) => {
  expect((await request.get("/login")).status()).toBe(403);
  expect((await request.get("/api/health", { headers: { "x-ars-origin": "wrong-value-of-the-same-length-0123456" } })).status()).toBe(403);
  const ok = await request.get("/api/health", { headers: { "x-ars-origin": ORIGIN_SECRET } });
  expect(ok.status()).toBe(200);
  expect((await request.get("/login", { headers: { "x-ars-origin": ORIGIN_SECRET } })).status()).toBe(200);
});
