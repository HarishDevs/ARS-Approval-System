import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { E2E_ENV } from "../../playwright.config";

// Test-only helpers for the e2e suite: direct SQL against ars_approvals_test
// and session cookies signed the same way the app signs them.
export async function db() {
  return mysql.createConnection({
    host: E2E_ENV.DB_HOST,
    port: Number(E2E_ENV.DB_PORT),
    user: E2E_ENV.DB_USER,
    password: E2E_ENV.DB_PASSWORD,
    database: E2E_ENV.DB_NAME,
  });
}

export async function userIdByLogin(loginId: string): Promise<number> {
  const conn = await db();
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>("SELECT id FROM users WHERE login_id = ?", [loginId]);
    if (!rows[0]) throw new Error(`no e2e user ${loginId}`);
    return rows[0].id as number;
  } finally {
    await conn.end();
  }
}

// A real session row + the signed cookie value (as lib/session/token.ts).
export async function sessionCookie(loginId: string): Promise<{ name: string; value: string; domain: string; path: string }> {
  const userId = await userIdByLogin(loginId);
  const sid = crypto.randomUUID();
  const conn = await db();
  try {
    await conn.query(
      "INSERT INTO user_sessions (id, user_id, auth_method, user_agent, expires_at) VALUES (?, ?, 'GOOGLE', 'e2e', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 HOUR))",
      [sid, userId],
    );
  } finally {
    await conn.end();
  }
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ sid, uid: userId, iat: now, exp: now + 7200 })).toString("base64url");
  const signature = crypto.createHmac("sha256", E2E_ENV.SESSION_SECRET).update(`session:${encoded}`).digest("base64url");
  return { name: "ars_session", value: `${encoded}.${signature}`, domain: "localhost", path: "/" };
}
