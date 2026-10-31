import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { E2E_ENV } from "../../playwright.config";
import { db, userIdByLogin } from "./db";

// v1.4.0 endpoints and hardening: /api/health (D-103), the CEOITBox receipt
// webhook (S8-03), cross-site API posts refused (P-07), single-use
// "This wasn't me" links (S-07).

function encrypt(plaintext: string): string {
  const key = Buffer.from(E2E_ENV.ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function notMeToken(userId: number): string {
  const encoded = Buffer.from(JSON.stringify({ p: "not-me", uid: userId, sid: null, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = crypto.createHmac("sha256", E2E_ENV.SESSION_SECRET).update(`purpose:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

test("health check: 200 with the version, database and job runner state", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", database: "ok" });
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(["OK", "LATE", "NEVER"]).toContain(body.jobRunner);
  // D-246 (audit OPS-11): the backup's age and an overall "degraded"; the deep
  // check answers 503 when degraded (here: no backup, no job runner yet).
  expect(body).toHaveProperty("backupAgeHours");
  expect(typeof body.degraded).toBe("boolean");
  const deep = await request.get("/api/health/deep");
  expect(deep.status()).toBe(body.degraded ? 503 : 200);
  expect((await deep.json()).database).toBe("ok");
});

test("WhatsApp receipt webhook: refuses without the secret, records delivered and read with it", async ({ request }) => {
  const secret = `whk_${crypto.randomBytes(16).toString("hex")}`;
  const connection = await db();
  try {
    await connection.query(
      "INSERT INTO system_settings (setting_key, setting_group, value_type, encrypted, value) VALUES ('whatsapp.webhook_secret', 'WHATSAPP', 'STRING', TRUE, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [encrypt(secret)],
    );
    const userId = await userIdByLogin("E2E_REQ");
    const [notification] = await connection.query<ResultSetHeader>("INSERT INTO notifications (event_type, user_id, title, message) VALUES ('TEST', ?, 't', 'm')", [userId]);
    const reference = `wamid.e2e.${Date.now()}`;
    const [delivery] = await connection.query<ResultSetHeader>(
      "INSERT INTO notification_deliveries (notification_id, channel, provider, status, provider_reference, attempt_count, sent_at) VALUES (?, 'WHATSAPP', 'CEOITBOX', 'SENT', ?, 1, CURRENT_TIMESTAMP)",
      [notification.insertId, reference],
    );

    expect((await request.post("/api/webhooks/ceoitbox", { data: { id: reference, status: "read" } })).status()).toBe(404);
    expect((await request.post("/api/webhooks/ceoitbox", { data: { id: reference, status: "read" }, headers: { "x-webhook-secret": "wrong" } })).status()).toBe(404);

    const delivered = await request.post("/api/webhooks/ceoitbox", {
      data: { entry: [{ changes: [{ value: { statuses: [{ id: reference, status: "delivered" }] } }] }] },
      headers: { "x-webhook-secret": secret },
    });
    expect(await delivered.json()).toMatchObject({ success: true, data: { receipts: 1, updated: 1 } });
    await request.post("/api/webhooks/ceoitbox", { data: { waMessageId: reference, status: "read" }, headers: { "x-webhook-secret": secret } });
    const [rows] = await connection.query<(RowDataPacket & { status: string; delivered: number; read: number })[]>(
      "SELECT status, delivered_at IS NOT NULL AS delivered, read_at IS NOT NULL AS `read` FROM notification_deliveries WHERE id = ?",
      [delivery.insertId],
    );
    expect(rows[0]).toMatchObject({ status: "READ", delivered: 1, read: 1 });
  } finally {
    await connection.query("DELETE FROM system_settings WHERE setting_key = 'whatsapp.webhook_secret'");
    await connection.end();
  }
});

test("a state-changing API call from another site is refused (P-07)", async ({ request }) => {
  const crossSite = await request.post("/api/auth/logout", { headers: { "sec-fetch-site": "cross-site" } });
  expect(crossSite.status()).toBe(403);
  const sibling = await request.post("/api/auth/logout", { headers: { "sec-fetch-site": "same-site" } });
  expect(sibling.status()).toBe(403);
  const own = await request.post("/api/auth/logout", { headers: { "sec-fetch-site": "same-origin" } });
  expect(own.status()).toBe(200);
});

test("a 'This wasn't me' link works once (S-07)", async ({ request }) => {
  const connection = await db();
  const loginId = `E2E_NOTME_${Date.now()}`;
  try {
    const [created] = await connection.query<ResultSetHeader>("INSERT INTO users (login_id, name, email, sign_in_method, active) VALUES (?, 'Nina NotMe', ?, 'GOOGLE', TRUE)", [loginId, `${loginId.toLowerCase()}@example.test`]);
    const token = notMeToken(created.insertId);
    const first = await request.post("/api/auth/not-me", { data: { token } });
    expect(first.status()).toBe(200);
    // IT unlocks; the same link must not lock the account again.
    await connection.query("UPDATE users SET locked_until = NULL WHERE id = ?", [created.insertId]);
    const again = await request.post("/api/auth/not-me", { data: { token } });
    expect(again.status()).toBe(400);
    const [rows] = await connection.query<(RowDataPacket & { locked: number })[]>("SELECT locked_until IS NOT NULL AS locked FROM users WHERE id = ?", [created.insertId]);
    expect(Number(rows[0]!.locked)).toBe(0);
  } finally {
    await connection.end();
  }
});

test("installable: the web app manifest and icons load without signing in (P8-02)", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ name: "ARS-CMS · Central Management System", start_url: "/users", display: "standalone" });
  for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"]) {
    const response = await request.get(icon);
    expect(response.status(), icon).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});
