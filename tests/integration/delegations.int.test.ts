import { afterAll, describe, expect, it } from "vitest";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { auditDelegationDates } from "@/server/jobs/delegations";
import { createUser } from "./helpers";

// #8: the job runner logs each out-of-office start and end once.
afterAll(async () => {
  await getDbPool().end();
});

async function delegation(startOffset: number, endOffset: number): Promise<number> {
  const away = await createUser();
  const delegate = await createUser();
  const [row] = await getDbPool().query<ResultSetHeader>(
    `INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, created_by)
     VALUES (?, ?, DATE_ADD(DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), INTERVAL ? DAY), DATE_ADD(DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)), INTERVAL ? DAY), ?)`,
    [away, delegate, startOffset, endOffset, away],
  );
  return row.insertId;
}

async function logged(id: number, action: string): Promise<number> {
  const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = ? AND JSON_EXTRACT(metadata_json, '$.delegationId') = ?", [action, id]);
  return Number(row!.n);
}

describe("out of office start and end in the audit log", () => {
  it("logs a start once, an end once, and nothing for one still to come", async () => {
    const running = await delegation(0, 2);
    const finished = await delegation(-5, -1);
    const upcoming = await delegation(3, 4);
    await auditDelegationDates();
    await auditDelegationDates();
    expect(await logged(running, "DELEGATION_ACTIVE")).toBe(1);
    expect(await logged(running, "DELEGATION_EXPIRED")).toBe(0);
    expect(await logged(finished, "DELEGATION_ACTIVE")).toBe(1);
    expect(await logged(finished, "DELEGATION_EXPIRED")).toBe(1);
    expect(await logged(upcoming, "DELEGATION_ACTIVE")).toBe(0);
  });
});
