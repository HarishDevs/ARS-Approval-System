import { afterAll, describe, expect, it } from "vitest";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { createDelivery } from "@/lib/db/repositories/notifications.repository";
import { getRunnerHeartbeat, hitRateLimit, leaseDueDeliveries, makeDeliveryDue, markRetryFailed, markRetrySent, pruneDeliveryPayloads, pruneRateLimitHits, recordRunnerHeartbeat } from "@/lib/db/repositories/jobs.repository";
import { createUser } from "./helpers";

afterAll(async () => {
  await getDbPool().end();
});

async function failedDelivery(dueNow: boolean): Promise<number> {
  const userId = await createUser();
  const [notification] = await getDbPool().query<ResultSetHeader>("INSERT INTO notifications (event_type, user_id, title, message) VALUES ('TEST', ?, 't', 'm')", [userId]);
  const [delivery] = await getDbPool().query<ResultSetHeader>(
    `INSERT INTO notification_deliveries (notification_id, channel, provider, status, attempt_count, failure_code, payload_json, next_retry_at)
     VALUES (?, 'EMAIL', 'RESEND', 'FAILED', 1, 'EMAIL_REQUEST_FAILED', ?, ${dueNow ? "DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE)" : "DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR)"})`,
    [notification.insertId, JSON.stringify({ to: "x@example.test", subject: "s", text: "t" })],
  );
  return delivery.insertId;
}

describe("rate-limit window in MySQL", () => {
  it("counts hits in the window and prunes old ones", async () => {
    const bucket = `test:ip:${Date.now()}`;
    expect(await hitRateLimit(bucket, 900)).toBe(1);
    expect(await hitRateLimit(bucket, 900)).toBe(2);
    await getDbPool().query("UPDATE rate_limit_hits SET occurred_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 2 DAY) WHERE bucket = ?", [bucket]);
    expect(await hitRateLimit(bucket, 900)).toBe(1);
    expect(await pruneRateLimitHits()).toBeGreaterThanOrEqual(2);
  });
});

describe("delivery lease", () => {
  it("leases only due rows, and never the same row twice at once", async () => {
    const due = await failedDelivery(true);
    const later = await failedDelivery(false);
    const [first, second] = await Promise.all([leaseDueDeliveries(20, [due, later]), leaseDueDeliveries(20, [due, later])]);
    const leased = [...first, ...second].map((row) => row.id);
    expect(leased).toEqual([due]);
    // Leased rows are pushed ahead, so an immediate second run finds nothing.
    expect(await leaseDueDeliveries(20, [due])).toEqual([]);
  });

  it("marks sent / reschedules / gives up, and Retry now makes it due", async () => {
    const id = await failedDelivery(true);
    await markRetryFailed(id, "EMAIL_REQUEST_FAILED", 4);
    const [rows] = await getDbPool().query<(RowDataPacket & { attempt_count: number; minutes: number })[]>(
      "SELECT attempt_count, TIMESTAMPDIFF(MINUTE, CURRENT_TIMESTAMP, next_retry_at) AS minutes FROM notification_deliveries WHERE id = ?",
      [id],
    );
    expect(rows[0]!.attempt_count).toBe(2);
    expect(Number(rows[0]!.minutes)).toBeGreaterThanOrEqual(3);

    expect(await makeDeliveryDue(id)).toBe(true);
    expect((await leaseDueDeliveries(20, [id])).map((row) => row.id)).toEqual([id]);
    await markRetrySent(id, "re_ok");
    const [after] = await getDbPool().query<(RowDataPacket & { status: string; next_retry_at: Date | null })[]>("SELECT status, next_retry_at FROM notification_deliveries WHERE id = ?", [id]);
    expect(after[0]).toMatchObject({ status: "SENT", next_retry_at: null });
    expect(await makeDeliveryDue(id)).toBe(false);
  });
});

describe("job runner heartbeat", () => {
  it("keeps one row and counts each run, so Super Admin sees when the cron last ran", async () => {
    await recordRunnerHeartbeat();
    const first = await getRunnerHeartbeat();
    await recordRunnerHeartbeat();
    const second = await getRunnerHeartbeat();
    expect(second).toMatchObject({ minutesAgo: 0, runs: (first?.runs ?? 0) + 1 });
    const [rows] = await getDbPool().query<(RowDataPacket & { total: number })[]>("SELECT COUNT(*) AS total FROM jobs WHERE job_type = 'RUNNER_HEARTBEAT'");
    expect(Number(rows[0]?.total)).toBe(1);
  });
});

describe("stored message bodies (audit S-01)", () => {
  it("are encrypted, still retried as written, and wiped once sent or after 7 days", async () => {
    const userId = await createUser();
    const [notification] = await getDbPool().query<ResultSetHeader>("INSERT INTO notifications (event_type, user_id, title, message) VALUES ('SET_PASSWORD', ?, 't', 'm')", [userId]);
    const link = "https://approval.arssteels.net/set-password?token=SECRET_TOKEN_123";
    const body = { to: "x@example.test", subject: "Set your password", text: `Open ${link}` };
    const create = () =>
      createDelivery({ notificationId: notification.insertId, channel: "EMAIL", provider: "RESEND", status: "FAILED", failureCode: "EMAIL_REQUEST_FAILED", payload: body, retryInSeconds: 0 });
    const id = await create();

    const [raw] = await getDbPool().query<(RowDataPacket & { payload: string })[]>("SELECT CAST(payload_json AS CHAR) AS payload FROM notification_deliveries WHERE id = ?", [id]);
    expect(raw[0]!.payload).not.toContain("SECRET_TOKEN_123");
    expect(raw[0]!.payload).toContain("sealed");

    await getDbPool().query("UPDATE notification_deliveries SET next_retry_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE) WHERE id = ?", [id]);
    const [leased] = await leaseDueDeliveries(20, [id]);
    expect(leased!.payload).toEqual(body);
    await markRetrySent(id, "re_ok");
    const [sent] = await getDbPool().query<(RowDataPacket & { payload_json: unknown })[]>("SELECT payload_json FROM notification_deliveries WHERE id = ?", [id]);
    expect(sent[0]!.payload_json).toBeNull();

    const old = await create();
    await getDbPool().query("UPDATE notification_deliveries SET created_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 8 DAY) WHERE id = ?", [old]);
    const fresh = await create();
    expect(await pruneDeliveryPayloads()).toBeGreaterThanOrEqual(1);
    const [rows] = await getDbPool().query<(RowDataPacket & { id: number; kept: number })[]>("SELECT id, payload_json IS NOT NULL AS kept FROM notification_deliveries WHERE id IN (?, ?)", [old, fresh]);
    expect(Object.fromEntries(rows.map((row) => [row.id, Number(row.kept)]))).toEqual({ [old]: 0, [fresh]: 1 });
  });
});
