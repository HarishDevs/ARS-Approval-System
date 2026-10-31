import { describe, expect, it, vi } from "vitest";
import { deliverOutboxWithDeps, type OutboxSenderDeps } from "@/server/notifications/outbox-sender";
import { sendEmail } from "@/server/integrations/resend/client";
import type { NotifyInput, NotifySummary } from "@/server/notifications/notify";

// D-243 (audit DB-014): the outbox sends each message at most once without a
// person's review, and gives every send a stable reference.
const message: NotifyInput = { eventType: "TEST", userId: 1, title: "t", message: "m", email: null, whatsappVariables: null };
const done: NotifySummary = { recorded: true, email: null, whatsapp: null };

function deps(overrides: Partial<OutboxSenderDeps> = {}) {
  const state = { claimed: new Set<number>(), sent: new Set<number>(), released: [] as number[] };
  const base: OutboxSenderDeps = {
    claim: vi.fn(async (id: number) => {
      if (state.claimed.has(id) || state.sent.has(id)) return null;
      state.claimed.add(id);
      return { message, claimToken: `token-${id}` };
    }),
    notify: vi.fn(async () => done),
    markSent: vi.fn(async (id: number) => {
      state.sent.add(id);
    }),
    release: vi.fn(async (id: number, token: string) => {
      if (token === `token-${id}`) state.claimed.delete(id);
      state.released.push(id);
    }),
    ...overrides,
  };
  return { deps: base, state };
}

describe("outbox sender (DB-014)", () => {
  it("sends with the outbox reference and marks it sent", async () => {
    const { deps: d } = deps();
    expect(await deliverOutboxWithDeps([12], d)).toBe(1);
    expect(d.notify).toHaveBeenCalledWith(message, { reference: "ars-o12" });
  });

  it("a send whose 'sent' write fails is not sent again by a later run", async () => {
    const { deps: d, state } = deps({
      markSent: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await deliverOutboxWithDeps([12], d)).toBe(0);
    expect(d.markSent).toHaveBeenCalledTimes(2);
    // The job runner's next pass: the row is still claimed, so it isn't sent.
    expect(await deliverOutboxWithDeps([12], d)).toBe(0);
    expect(d.notify).toHaveBeenCalledTimes(1);
    expect(state.released).toEqual([]);
  });

  it("nothing recorded (nothing sent): the claim is given back for a retry", async () => {
    const notify = vi.fn(async () => ({ recorded: false, email: null, whatsapp: null }) as NotifySummary);
    const { deps: d, state } = deps({ notify });
    expect(await deliverOutboxWithDeps([12], d)).toBe(0);
    expect(state.released).toEqual([12]);
    notify.mockResolvedValueOnce(done);
    expect(await deliverOutboxWithDeps([12], d)).toBe(1);
  });

  it("a throw from the sender leaves the row claimed for review", async () => {
    const { deps: d, state } = deps({
      notify: vi.fn(async () => {
        throw new Error("crash");
      }),
    });
    expect(await deliverOutboxWithDeps([12], d)).toBe(0);
    expect(state.released).toEqual([]);
    expect(state.claimed.has(12)).toBe(true);
  });
});

describe("Resend idempotency key (DB-014)", () => {
  const config = { apiKey: "test-key", fromName: "ARS", fromAddress: "no_reply@example.test", replyTo: null } as never;

  it("is sent as the Idempotency-Key header when given", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    await sendEmail(config, { to: "a@example.test", subject: "S", text: "T", idempotencyKey: "ars-o12-email" }, { fetch: fetcher });
    await sendEmail(config, { to: "a@example.test", subject: "S", text: "T" }, { fetch: fetcher });
    const headers = (fetcher.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => init.headers as Record<string, string>);
    expect(headers[0]!["Idempotency-Key"]).toBe("ars-o12-email");
    expect(headers[1]!["Idempotency-Key"]).toBeUndefined();
  });
});
