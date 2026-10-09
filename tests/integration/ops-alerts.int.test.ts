import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { alertSuperAdmin } from "@/server/ops/alerts";
import { createUser } from "./helpers";

// #14: a failed backup or job run reaches the Super Admin at most once a day.
afterAll(async () => {
  await getDbPool().end();
});

describe("Super Admin alerts", () => {
  it("sends once a day per kind", async () => {
    const superAdmin = await createUser({ roles: ["USER", "SUPER_ADMIN"] });
    expect(await alertSuperAdmin("BACKUP_FAILED", "ref-12345678")).toBe(true);
    expect(await alertSuperAdmin("BACKUP_FAILED", "ref-87654321")).toBe(false);
    expect(await alertSuperAdmin("JOB_RUNNER_FAILED", null)).toBe(true);
    const [rows] = await getDbPool().query<RowDataPacket[]>("SELECT title, message FROM notifications WHERE user_id = ? AND event_type = 'OPS_ALERT' ORDER BY id", [superAdmin]);
    expect(rows.map((row) => row.title)).toEqual(["Daily backup failed", "Scheduled jobs failed"]);
    expect(rows[0]!.message).toContain("ref-12345678");
  });
});
