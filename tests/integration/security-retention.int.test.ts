import { beforeAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { purgeStatement, runSecurityRetentionWith, SECURITY_RETENTION_TARGETS } from "@/server/ops/security-retention";
import { createUser } from "./helpers";

// DR-06 (owner, 2 Nov 2026): against the real schema. Old sign-in records
// go; recent ones, people under a legal hold and live sessions stay.
let plain: number;
let held: number;

const count = async (sql: string, params: unknown[]) => Number(((await getDbPool().query<RowDataPacket[]>(sql, params))[0][0] as { n: number }).n);

beforeAll(async () => {
  plain = await createUser({ name: "Retention Plain" });
  held = await createUser({ name: "Retention Held" });
  const db = getDbPool();
  for (const userId of [plain, held]) {
    await db.query("INSERT INTO login_logs (user_id, auth_method, step, success, occurred_at) VALUES (?, 'PASSWORD_OTP', 'PASSWORD', FALSE, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 120 DAY))", [userId]);
    await db.query("INSERT INTO login_logs (user_id, auth_method, step, success, occurred_at) VALUES (?, 'PASSWORD_OTP', 'PASSWORD', FALSE, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 10 DAY))", [userId]);
  }
  // An ended session (expired 100 days ago) and a live one.
  await db.query("INSERT INTO user_sessions (id, user_id, auth_method, expires_at, created_at) VALUES (UUID(), ?, 'PASSWORD_OTP', DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 100 DAY), DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 101 DAY))", [plain]);
  await db.query("INSERT INTO user_sessions (id, user_id, auth_method, expires_at) VALUES (UUID(), ?, 'PASSWORD_OTP', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))", [plain]);
  await db.query("INSERT INTO legal_holds (reference, reason, scope_type, scope_id, owner_user_id, created_by) VALUES ('DR06-TEST', 'integration test hold', 'REQUESTER', ?, ?, ?)", [held, held, held]);
});

describe("security records retention (DR-06)", () => {
  it("every statement is valid SQL on the real schema", async () => {
    for (const target of SECURITY_RETENTION_TARGETS) {
      const { sql } = purgeStatement(target);
      await getDbPool().query(`EXPLAIN ${sql}`, [1]);
    }
  });

  it("deletes the old records only, keeps recent ones, live sessions and held people", async () => {
    const audits: Record<string, number>[] = [];
    const result = await runSecurityRetentionWith({ db: getDbPool(), doneRecently: async () => false, audit: async (counts) => void audits.push(counts) });
    expect(result.securityRetention).toBe("DONE");
    expect(await count("SELECT COUNT(*) AS n FROM login_logs WHERE user_id = ? AND occurred_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 90 DAY)", [plain])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM login_logs WHERE user_id = ?", [plain])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM login_logs WHERE user_id = ?", [held])).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = ?", [plain])).toBe(1);
    expect(audits.length).toBe(1);
  });
});
