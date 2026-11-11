import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { db, sessionCookie } from "../e2e/db";

// QA-API (v1.42.1 QA pass): every API route found in the code, every method
// it exports, called (1) signed out, (2) as a plain employee for IT / Super
// Admin APIs, (3) from another site for state-changing methods. None may
// hand out data or change anything; the answer must be a refusal.
const root = path.resolve(__dirname, "../..");
const app = path.join(root, "app");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(path.join(dir, name)).isDirectory() ? walk(path.join(dir, name)) : [path.join(dir, name)]));
const routes = walk(app)
  .filter((file) => file.endsWith(`${path.sep}route.ts`))
  .map((file) => {
    const url = "/" + path.relative(app, path.dirname(file)).split(path.sep).filter((part) => !/^\(.*\)$/.test(part)).join("/");
    const methods = [...readFileSync(file, "utf8").matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]!);
    // A dynamic segment gets a real-looking id (1) or token.
    return { url: url.replace(/\[\.\.\.\w+\]/g, "x").replace(/\[(\w*id\w*)\]/gi, "1").replace(/\[\w+\]/g, "x"), methods };
  });

// Public by design: sign-in, its steps, health, the job runner and webhooks
// (which check their own secret), the push re-subscribe from the service worker,
// and both health checks (D-246: the deep one is for the uptime monitor).
const PUBLIC = [/^\/api\/auth\//, /^\/api\/health(\/deep)?$/, /^\/api\/push\/resubscribe$/, /^\/api\/webhooks\//, /^\/api\/jobs\//, /^\/api\/cron/, /^\/api\/ingest/];
const isPublic = (url: string) => PUBLIC.some((re) => re.test(url));
// A signed-in person's cookies, as a request context's storage state.
const asState = async (loginId: string) => ({ cookies: [{ ...(await sessionCookie(loginId)), expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const }], origins: [] });
const refused = (status: number) => [301, 302, 303, 307, 308, 400, 401, 403, 404, 405, 409, 410, 415, 422, 429].includes(status);

test("QA-API-01 every non-public API refuses a signed-out caller", async ({ request }) => {
  const leaks: string[] = [];
  let calls = 0;
  for (const route of routes.filter((r) => !isPublic(r.url))) {
    for (const method of route.methods) {
      calls += 1;
      const response = await request.fetch(route.url, { method, data: method === "GET" ? undefined : {}, maxRedirects: 0, failOnStatusCode: false });
      if (!refused(response.status())) leaks.push(`${method} ${route.url} → ${response.status()}`);
    }
  }
  test.info().annotations.push({ type: "calls", description: String(calls) });
  expect(leaks, `signed-out calls answered:\n${leaks.join("\n")}`).toEqual([]);
});

test("QA-API-02 IT and Super Admin APIs refuse a plain employee", async ({ playwright }) => {
  const staff = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: await asState("E2E_STAFF") });
  const leaks: string[] = [];
  for (const route of routes.filter((r) => /^\/api\/(admin|superadmin)\//.test(r.url))) {
    for (const method of route.methods) {
      const response = await staff.fetch(route.url, { method, data: method === "GET" ? undefined : {}, maxRedirects: 0, failOnStatusCode: false });
      if (!refused(response.status())) leaks.push(`${method} ${route.url} → ${response.status()}`);
    }
  }
  await staff.dispose();
  expect(leaks, `a plain employee got through:\n${leaks.join("\n")}`).toEqual([]);
});

test("QA-API-03 a state-changing API call from another site is refused (CSRF)", async ({ playwright }) => {
  const admin = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: await asState("E2E_ADMIN") });
  const leaks: string[] = [];
  for (const route of routes.filter((r) => !/^\/api\/(webhooks|jobs|cron|ingest)/.test(r.url))) {
    for (const method of route.methods.filter((m) => m !== "GET")) {
      const response = await admin.fetch(route.url, { method, data: {}, headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" }, maxRedirects: 0, failOnStatusCode: false });
      if (response.status() !== 403) leaks.push(`${method} ${route.url} → ${response.status()}`);
    }
  }
  await admin.dispose();
  expect(leaks, `cross-site calls not refused:\n${leaks.join("\n")}`).toEqual([]);
});

test("QA-API-04 an employee who is on nothing can't open requests, files, exports or AI chats by id (IDOR)", async ({ playwright }) => {
  // A fresh account with the USER role, on no request, task or conversation:
  // any record it can read by changing the id is a leak.
  const conn = await db();
  try {
    await conn.query("INSERT IGNORE INTO users (login_id, name, email, sign_in_method, active, last_login_at) VALUES ('E2E_QA_NOBODY', 'Nobody Tester', 'e2e_qa_nobody@example.test', 'GOOGLE', TRUE, CURRENT_TIMESTAMP)");
    await conn.query("INSERT IGNORE INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'USER' WHERE u.login_id = 'E2E_QA_NOBODY'");
  } finally {
    await conn.end();
  }
  const nobody = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: await asState("E2E_QA_NOBODY") });
  const leaks: string[] = [];
  for (let id = 1; id <= 60; id += 1) {
    for (const url of [`/api/requests/${id}/progress`, `/api/requests/${id}/summary.pdf`, `/api/attachments/${id}`, `/api/files/${id}`, `/api/exports/${id}`, `/api/ai/conversations/${id}`, `/api/push/subscriptions/${id}`]) {
      const response = await nobody.fetch(url, { maxRedirects: 0, failOnStatusCode: false });
      if (response.status() >= 200 && response.status() < 300) leaks.push(`GET ${url} → ${response.status()}`);
    }
    const page = await nobody.fetch(`/users/requests/${id}`, { maxRedirects: 0, failOnStatusCode: false });
    if (page.status() === 200 && !/not found|couldn.t find/i.test(await page.text())) leaks.push(`page /users/requests/${id} → 200`);
  }
  await nobody.dispose();
  expect(leaks, `records opened by id:\n${leaks.join("\n")}`).toEqual([]);
});
