import { expect, request as playwrightRequest, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ResultSetHeader } from "mysql2/promise";
import { db, sessionCookie } from "./db";
import { E2E_ENV } from "../../playwright.config";
import { MOCK_PROVIDER_PORT } from "./mock-provider";

// D-172 Pic bot - ai through the real screens and HTTP API, with the local
// mock provider (tests/e2e/mock-provider.ts) standing in for Claude.
test.describe.configure({ mode: "serial" });
const tag = Date.now().toString(36).toUpperCase();
const BASE = E2E_ENV.APP_BASE_URL;

// Same format as lib/security/encryption.ts, with the test key.
function encrypt(plain: string): string {
  const key = Buffer.from(E2E_ENV.ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

async function sql(text: string, params: unknown[] = []) {
  const conn = await db();
  try {
    return (await conn.query(text, params))[0];
  } finally {
    await conn.end();
  }
}

async function setting(key: string, value: string | null, encrypted = false) {
  if (value === null) return sql("DELETE FROM system_settings WHERE setting_key = ?", [key]);
  return sql(
    "INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value) VALUES (?, ?, 'STRING', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), encrypted = VALUES(encrypted)",
    [key, key.startsWith("ai.salesforce") ? "AI_DATA" : "AI", encrypted, encrypted ? encrypt(value) : value],
  );
}

async function person(loginId: string, modules: string, chatModes: string): Promise<number> {
  const result = (await sql(
    "INSERT INTO users (login_id, name, email, sign_in_method, active, last_login_at, module_access, chat_modes) VALUES (?, ?, ?, 'GOOGLE', TRUE, CURRENT_TIMESTAMP, ?, ?)",
    [loginId, `Person ${loginId}`, `${loginId.toLowerCase()}@example.test`, modules, chatModes],
  )) as ResultSetHeader;
  await sql("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'USER'", [result.insertId]);
  return result.insertId;
}

test.beforeAll(async () => {
  await setting("ai.active_provider", "CLAUDE");
  await setting("ai.claude.api_key", "sk-ant-e2e-mock-key-0000", true);
  await setting("ai.claude.model", "mock-claude");
  await setting("ai.claude.business_data", "ALLOWED");
  await setting("ai.requests_per_minute", "60");
});

test.afterAll(async () => {
  for (const key of ["ai.active_provider", "ai.claude.api_key", "ai.claude.model", "ai.claude.business_data", "ai.requests_per_minute"]) await setting(key, null);
});

test("no AI module: no launcher, and every Pico Bot API is a 404", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_REQ")]);
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("picbot-launcher")).toHaveCount(0);
  expect((await page.request.get("/api/ai/conversations")).status()).toBe(404);
  expect((await page.request.post("/api/ai/chat", { data: { conversationId: null, mode: "APPROVAL", question: "hi", requestKey: crypto.randomUUID() } })).status()).toBe(404);
});

test("the launcher shows the Pico Bot logo; the panel answers with evidence, minimises, closes with Escape and keeps history", async ({ page, context }) => {
  await person(`PB_A_${tag}`, "APPROVAL,AI", "APPROVAL");
  await context.addCookies([await sessionCookie(`PB_A_${tag}`)]);
  await page.goto("/users");
  const launcher = page.getByTestId("picbot-launcher");
  await expect(launcher).toHaveAccessibleName("Open Pico Bot");
  await expect(launcher.locator("img")).toHaveAttribute("src", "/brand/pic-bot.jpg");
  await launcher.click();
  const panel = page.getByRole("dialog", { name: "Pico Bot" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Pico Bot" })).toBeVisible();
  await expect(page.getByTestId("picbot-scope")).toHaveText("Using: Approvals");
  await expect(panel.getByLabel("Message Pico Bot")).toBeFocused();
  await panel.getByLabel("Message Pico Bot").fill("What is waiting for me?");
  await panel.getByLabel("Message Pico Bot").press("Enter");
  const answer = page.getByTestId("picbot-answer");
  await expect(answer).toContainText(`Answer for Person PB_A_${tag}: 0 waiting.`);
  await expect(answer.locator('[data-tip^="From ARS-CMS"]')).toHaveCount(1); // D-178: the source is in the hover hint
  await expect(answer.getByRole("button", { name: "Copy this answer" })).toBeVisible();
  await page.screenshot({ path: "test-results/picbot-panel.png" });

  await panel.getByRole("button", { name: "Minimise Pico Bot" }).click();
  await expect(panel).toHaveCount(0);
  await page.getByTestId("picbot-launcher").click();
  await expect(page.getByTestId("picbot-answer")).toBeVisible(); // the same chat
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Pico Bot" })).toHaveCount(0);
  await expect(page.getByTestId("picbot-launcher")).toBeFocused();

  await page.getByTestId("picbot-launcher").click();
  await page.getByRole("button", { name: "Your chats" }).click();
  await expect(page.getByTestId("picbot-history")).toContainText("What is waiting for me?");
  await page.getByRole("button", { name: /Delete chat: What is waiting for me\?/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByTestId("picbot-history")).toHaveCount(0);
});

test("on a phone the panel fits the screen and the page never scrolls sideways", async ({ page, context }) => {
  await context.addCookies([await sessionCookie(`PB_A_${tag}`)]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/users");
  await page.getByTestId("picbot-launcher").click();
  const box = (await page.getByTestId("picbot-panel").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/picbot-phone.png" });
});

test("one person can't open or delete another's conversation over the API", async ({ context }) => {
  const owner = await person(`PB_B_${tag}`, "APPROVAL,AI", "APPROVAL");
  await person(`PB_C_${tag}`, "APPROVAL,AI", "APPROVAL");
  const conversation = (await sql("INSERT INTO ai_conversations (owner_user_id, title, mode) VALUES (?, 'Private', 'APPROVAL')", [owner])) as ResultSetHeader;
  const other = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `ars_session=${(await sessionCookie(`PB_C_${tag}`)).value}` } });
  expect((await other.get(`/api/ai/conversations/${conversation.insertId}`)).status()).toBe(404);
  expect((await other.delete(`/api/ai/conversations/${conversation.insertId}`)).status()).toBe(404);
  const mine = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `ars_session=${(await sessionCookie(`PB_B_${tag}`)).value}` } });
  expect((await mine.get(`/api/ai/conversations/${conversation.insertId}`)).status()).toBe(200);
  await other.dispose();
  await mine.dispose();
  void context;
});

test("10 signed-in clients ask at the same time over HTTP: every answer reaches its own asker", async () => {
  test.setTimeout(120_000);
  const clients = await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const loginId = `PB_LOAD_${index}_${tag}`;
      await person(loginId, "APPROVAL,AI", "APPROVAL");
      const cookie = await sessionCookie(loginId);
      return { loginId, api: await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `ars_session=${cookie.value}` } }) };
    }),
  );
  await fetch(`http://127.0.0.1:${MOCK_PROVIDER_PORT}/stats/reset`, { method: "POST" });
  const started = Date.now();
  const results = await Promise.all(
    clients.map(async ({ loginId, api }) => {
      const t0 = Date.now();
      const response = await api.post("/api/ai/chat", { data: { conversationId: null, mode: "APPROVAL", question: `What's waiting for me, ${loginId}?`, requestKey: crypto.randomUUID() } });
      const body = (await response.json()) as { success: boolean; data?: { conversationId: number; messages: { role: string; content: string }[] } };
      return { loginId, status: response.status(), ms: Date.now() - t0, body };
    }),
  );
  const wallMs = Date.now() - started;
  const stats = (await (await fetch(`http://127.0.0.1:${MOCK_PROVIDER_PORT}/stats`)).json()) as { peak: number; calls: number };
  for (const result of results) {
    expect(result.status, result.loginId).toBe(200);
    const messages = result.body.data!.messages;
    expect(messages[0]!.content).toContain(result.loginId); // its own question
    expect(messages.at(-1)!.content).toBe(`Answer for Person ${result.loginId}: 0 waiting.`); // its own answer
  }
  const latencies = results.map((result) => result.ms).sort((a, b) => a - b);
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    path.join("test-results", "picbot-http-concurrency.json"),
    JSON.stringify({ clients: 10, succeeded: results.filter((result) => result.status === 200).length, failed: results.filter((result) => result.status !== 200).length, avgMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length), p95Ms: latencies[Math.ceil(0.95 * latencies.length) - 1], maxMs: latencies.at(-1), wallMs, providerCalls: stats.calls, peakProviderCallsInFlight: stats.peak, mockProviderMsPerCall: 300 }, null, 2),
  );
  await Promise.all(clients.map(({ api }) => api.dispose()));
});

test("the Super Admin sees the Salesforce connection with its callback URL; Connect without an app explains what's missing", async ({ page, context }) => {
  await context.addCookies([await sessionCookie("E2E_SUPER")]);
  await page.goto("/superadmin/salesforce");
  const card = page.getByTestId("sf-connection");
  await expect(card).toContainText("Not connected");
  await expect(card).toContainText(`${BASE}/api/integrations/salesforce/callback`);
  await card.getByRole("link", { name: "Connect Salesforce" }).click();
  await expect(page).toHaveURL(/\/superadmin\/salesforce\?salesforce=CONFIG$/);
  await expect(page.getByText("Enter the Salesforce app's consumer key and secret")).toBeVisible();
  await page.goto("/superadmin/ai");
  await expect(page.getByTestId("ai-live")).toContainText("being answered");
});

test("an admin sets a person's Pico Bot chat modes and Salesforce scope; they persist", async ({ page, context }) => {
  const id = await person(`PB_D_${tag}`, "APPROVAL,AI", "APPROVAL");
  await context.addCookies([await sessionCookie("E2E_ADMIN")]);
  await page.goto(`/admin/users/${id}`);
  const chat = page.getByTestId("chat-access");
  await chat.getByRole("checkbox", { name: /^Salesforce data/ }).check();
  await chat.getByLabel("Salesforce records Pico Bot may read for this person").selectOption("OWN");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("user-chat-modes")).toHaveText("Approvals, Salesforce data · Salesforce: own records");
});

test("Bug 1: after an answer, New chat opens an empty chat and stays there (sidebar too)", async ({ page, context }) => {
  await person(`PB_N_${tag}`, "APPROVAL,AI", "APPROVAL");
  await context.addCookies([await sessionCookie(`PB_N_${tag}`)]);
  await page.goto("/users/ai/assistant");
  await page.getByLabel("Your question").fill("What is waiting for me?");
  await page.getByLabel("Your question").press("Enter");
  // D-203: the question leaves the box at once (it shows in the conversation).
  await expect(page.getByLabel("Your question")).toHaveValue("", { timeout: 200 });
  await expect(page).toHaveURL(/\/users\/ai\/assistant\?c=\d+$/);
  await expect(page.getByTestId("ai-answer")).toContainText(`Answer for Person PB_N_${tag}`);
  await page.getByTestId("ai-strip").getByRole("link", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/users\/ai\/assistant$/);
  await page.waitForTimeout(1000); // the old answer must not pull the page back
  await expect(page).toHaveURL(/\/users\/ai\/assistant$/);
  await expect(page.getByTestId("ai-answer")).toHaveCount(0);
  await expect(page.getByLabel("Your question")).toHaveValue("");
  // The same from the sidebar's AI Assistant header, starting from the chat.
  await page.getByTestId("sidebar").getByTestId("nav-chats").getByRole("link").first().click();
  await expect(page).toHaveURL(/\?c=\d+$/);
  await page.getByTestId("sidebar").getByRole("button", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/\/users\/ai\/assistant$/);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/users\/ai\/assistant$/);
});
