import { afterAll, describe, expect, it } from "vitest";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { claimOutbox, insertOutbox, listStaleOutbox, listUnsentOutbox, markOutboxSent, releaseOutboxClaim, releaseOutboxForResend } from "@/lib/db/repositories/outbox.repository";
import { leaseDueDeliveries, SEND_UNCONFIRMED } from "@/lib/db/repositories/jobs.repository";
import { tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";
import { createUser } from "./helpers";

// D-243: audit DB-014 (no duplicate sends after a crash or a failed status
// write) and DB-011 (an atomic WhatsApp limit with slots for sign-in codes),
// against MySQL. Needs migration 202611010900_outbox_claim_token.sql.
afterAll(async () => {
  await getDbPool().end();
});

async function queued(): Promise<number> {
  const userId = await createUser();
  const [id] = await insertOutbox(null, [{ eventType: "QA_TEST", userId, title: "t", message: "m", email: null, whatsappVariables: null }], getDbPool());
  await getDbPool().query("UPDATE notification_outbox SET created_at = DATE_SUB(created_at, INTERVAL 5 MINUTE) WHERE id = ?", [id]);
  return id!;
}

describe("outbox claims (DB-014)", () => {
  it("a claim that ran out is never taken again by itself, only by IT's Resend", async () => {
    const id = await queued();
    const claim = await claimOutbox(id);
    expect(claim?.claimToken).toMatch(/^[0-9a-f-]{36}$/);
    // The sender died mid-send: 15 minutes later the row is still claimed.
    await getDbPool().query("UPDATE notification_outbox SET claimed_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 15 MINUTE), created_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 40 MINUTE) WHERE id = ?", [id]);
    expect(await listStaleOutbox(500)).not.toContain(id);
    expect(await claimOutbox(id)).toBeNull();
    expect((await listUnsentOutbox(500)).find((row) => row.id === id)).toMatchObject({ unconfirmed: true });
    // IT checked and resends: fresh tries.
    expect(await releaseOutboxForResend({ ids: [id] })).toEqual([id]);
    expect(await claimOutbox(id)).not.toBeNull();
  });

  it("a claim is given back only with its own token", async () => {
    const id = await queued();
    const claim = await claimOutbox(id);
    await releaseOutboxClaim(id, "00000000-0000-0000-0000-000000000000");
    expect(await listStaleOutbox(500)).not.toContain(id);
    await releaseOutboxClaim(id, claim!.claimToken);
    expect(await listStaleOutbox(500)).toContain(id);
  });

  it("a sent row is never claimed again", async () => {
    const id = await queued();
    await claimOutbox(id);
    await markOutboxSent(id);
    expect(await claimOutbox(id)).toBeNull();
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT claim_token FROM notification_outbox WHERE id = ?", [id]);
    expect(row!.claim_token).toBeNull();
  });
});

describe("delivery lease (DB-014)", () => {
  it("a leased row has no next try and is SEND_UNCONFIRMED until recorded", async () => {
    const userId = await createUser();
    const [notification] = await getDbPool().query<ResultSetHeader>("INSERT INTO notifications (event_type, user_id, title, message) VALUES ('TEST', ?, 't', 'm')", [userId]);
    const [delivery] = await getDbPool().query<ResultSetHeader>(
      `INSERT INTO notification_deliveries (notification_id, channel, provider, status, attempt_count, failure_code, payload_json, next_retry_at)
       VALUES (?, 'EMAIL', 'RESEND', 'FAILED', 1, 'EMAIL_REQUEST_FAILED', ?, DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE))`,
      [notification.insertId, JSON.stringify({ to: "x@example.test", subject: "s", text: "t" })],
    );
    expect((await leaseDueDeliveries(20, [delivery.insertId])).map((row) => row.id)).toEqual([delivery.insertId]);
    const [[row]] = await getDbPool().query<RowDataPacket[]>("SELECT failure_code, next_retry_at FROM notification_deliveries WHERE id = ?", [delivery.insertId]);
    expect(row).toMatchObject({ failure_code: SEND_UNCONFIRMED, next_retry_at: null });
    // Even long after, it isn't leased again by itself.
    expect(await leaseDueDeliveries(20, [delivery.insertId])).toEqual([]);
  });
});

describe("WhatsApp send limit (DB-011)", () => {
  it("parallel senders never pass the limit, and sign-in codes keep their slot", async () => {
    await getDbPool().query("DELETE FROM whatsapp_rate_limit_log");
    // Limit 5 a minute: 4 for bulk, the 5th kept for sign-in codes.
    const results = await Promise.all(Array.from({ length: 20 }, () => tryConsumeWhatsAppRateLimit(5, "BULK")));
    expect(results.filter(Boolean)).toHaveLength(4);
    expect(await tryConsumeWhatsAppRateLimit(5, "OTP")).toBe(true);
    expect(await tryConsumeWhatsAppRateLimit(5, "OTP")).toBe(false);
    const [[count]] = await getDbPool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM whatsapp_rate_limit_log");
    expect(Number(count!.n)).toBe(5);
  });
});
