import "server-only";
import { claimOutbox, markOutboxSent, releaseOutboxClaim, type OutboxClaim } from "@/lib/db/repositories/outbox.repository";
import { notify, type NotifyInput, type NotifyOptions, type NotifySummary } from "@/server/notifications/notify";
import { logError } from "@/lib/logging/logger";

// Outbox sender (D-QA-06; D-243, audit DB-014). Each row is claimed with a
// token before any provider is called, so it is sent by one sender only:
//   - sent and recorded: marked sent (one more try if that write fails);
//   - nothing recorded (notify sent nothing, e.g. the database was busy): the
//     claim is given back and the job runner tries again;
//   - anything else (the sender stopped, or the "sent" write kept failing):
//     the row stays claimed and is never resent by itself; IT checks it under
//     Messages not sent before using Resend.
// Every send carries the reference "ars-o<id>", which becomes the email
// idempotency key (Resend drops a repeat within 24 hours) and the WhatsApp
// userMessageId.
export interface OutboxSenderDeps {
  claim: (id: number) => Promise<OutboxClaim | null>;
  notify: (message: NotifyInput, options: NotifyOptions) => Promise<NotifySummary>;
  markSent: (id: number) => Promise<void>;
  release: (id: number, claimToken: string) => Promise<void>;
}

const defaultDeps: OutboxSenderDeps = {
  claim: (id) => claimOutbox(id),
  notify: (message, options) => notify(message, options),
  markSent: (id) => markOutboxSent(id),
  release: (id, claimToken) => releaseOutboxClaim(id, claimToken),
};

export const outboxReference = (id: number) => `ars-o${id}`;

async function recordSent(deps: OutboxSenderDeps, id: number): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await deps.markSent(id);
      return true;
    } catch (error) {
      logError("outbox: sent, but couldn't record it", error, { outboxId: id, attempt });
    }
  }
  return false;
}

export async function deliverOutboxWithDeps(ids: readonly number[], deps: OutboxSenderDeps): Promise<number> {
  let sent = 0;
  for (const id of ids) {
    let claim: OutboxClaim | null;
    try {
      claim = await deps.claim(id);
    } catch (error) {
      logError("outbox: couldn't claim a message", error, { outboxId: id });
      continue;
    }
    if (!claim) continue;
    let summary: NotifySummary;
    try {
      summary = await deps.notify(claim.message, { reference: outboxReference(id) });
    } catch (error) {
      // notify() never throws; if it ever does, something may have gone out.
      logError("outbox: delivery failed; left for review", error, { outboxId: id });
      continue;
    }
    // Audit AUD-08 (v1.9.0): nothing recorded = nothing sent; given back so
    // the job runner tries again.
    if (!summary.recorded && !summary.inactive) {
      logError("outbox: message not recorded; will retry", null, { outboxId: id });
      await deps.release(id, claim.claimToken).catch((error: unknown) => logError("outbox: couldn't give back a claim", error, { outboxId: id }));
      continue;
    }
    if (await recordSent(deps, id)) sent += 1;
  }
  return sent;
}

export function deliverOutboxRows(ids: readonly number[]): Promise<number> {
  return deliverOutboxWithDeps(ids, defaultDeps);
}
