import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDbPool } from "@/lib/db/client";
import { isSessionActive } from "@/lib/db/repositories/sessions.repository";
import { createUser } from "./helpers";

afterAll(async () => {
  await getDbPool().end();
});

async function session(userId: number, idleForMinutes: number): Promise<string> {
  const id = crypto.randomUUID();
  await getDbPool().query(
    `INSERT INTO user_sessions (id, user_id, auth_method, user_agent, expires_at, last_seen_at)
     VALUES (?, ?, 'GOOGLE', 'int', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 HOUR), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE))`,
    [id, userId, idleForMinutes],
  );
  return id;
}

describe("idle sign-out (audit S-05)", () => {
  it("ends a session left unused longer than the idle limit, even before its 12-hour expiry", async () => {
    const userId = await createUser();
    const recent = await session(userId, 5);
    const idle = await session(userId, 180);
    expect(await isSessionActive(recent, userId, 120)).toBe(true);
    expect(await isSessionActive(idle, userId, 120)).toBe(false);
    expect(await isSessionActive(idle, userId, 240)).toBe(true);
  });
});
