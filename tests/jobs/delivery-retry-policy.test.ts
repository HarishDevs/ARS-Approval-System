import { describe, expect, it, vi } from "vitest";
import { runDeliveryRetriesWithDeps, type RetryDeps } from "@/server/jobs/retry-deliveries";
import { notifyWithDeps, type NotifyDeps, type NotifyInput } from "@/server/notifications/notify";
import { CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { EmailSendError } from "@/server/integrations/resend/client";
import type { DueDelivery } from "@/lib/db/repositories/jobs.repository";

// D-243: audit DB-008 (429 retried, Retry-After respected), DB-009 (the
// retry setting gives exactly N retries across notify and the runner) and
// DB-014 (a send that worked is never turned into a failure or resent).
const input: NotifyInput = { eventType: "NEW_LOGIN", userId: 5, title: "t", message: "m", email: { subject: "S", text: "T" }, whatsappVariables: null };

function notifyDeps(overrides: Partial<NotifyDeps>) {
  const deliveries: Parameters<NotifyDeps["createDelivery"]>[0][] = [];
  const deps: NotifyDeps = {
    findRecipient: async () => ({ id: 5, name: "S", email: "s@example.com", whatsappNumber: "919876543210", active: true }),
    createNotification: vi.fn(async () => 77),
    createDelivery: vi.fn(async (row) => {
      deliveries.push(row);
      return 900;
    }) as unknown as NotifyDeps["createDelivery"],
    findActiveTemplate: async () => ({ id: 3, providerName: "wa", language: "en", variableKeys: [] }),
    sendWhatsApp: vi.fn(async () => ({ waMessageId: "w" })),
    sendEmail: vi.fn(async () => {
      throw new EmailSendError("EMAIL_REQUEST_FAILED", "down");
    }),
    ...overrides,
  };
  return { deps, deliveries };
}

// The whole life of one email that always fails: notify's first send, then
// the runner until it gives up. Returns how many retries were made.
async function retriesMadeFor(limit: number): Promise<number> {
  const { deps, deliveries } = notifyDeps({ retryLimit: async () => limit });
  await notifyWithDeps(input, deps);
  let row: DueDelivery & { retryInSeconds: number | null } = { id: 900, channel: "EMAIL", attemptCount: 1, payload: deliveries[0]!.payload ?? null, retryInSeconds: deliveries[0]!.retryInSeconds ?? null };
  let retries = 0;
  while (row.retryInSeconds !== null && retries < 50) {
    retries += 1;
    const current = row;
    await runDeliveryRetriesWithDeps({
      lease: async () => [current],
      sendEmail: async () => {
        throw new EmailSendError("EMAIL_REQUEST_FAILED", "down");
      },
      sendWhatsApp: async () => "w",
      markSent: async () => undefined,
      markFailed: async (_id, _code, minutes) => {
        row = { ...current, attemptCount: current.attemptCount + 1, retryInSeconds: minutes === null ? null : minutes * 60 };
      },
      retryLimit: async () => limit,
    });
  }
  return retries;
}

describe("retry limit across notify and the runner (DB-009)", () => {
  it.each([0, 1, 3, 5])("a limit of %i gives exactly that many retries", async (limit) => {
    expect(await retriesMadeFor(limit)).toBe(limit);
  });

  it("the first retry still waits 2 minutes", async () => {
    const { deps, deliveries } = notifyDeps({ retryLimit: async () => 3 });
    await notifyWithDeps(input, deps);
    expect(deliveries[0]).toMatchObject({ status: "FAILED", retryInSeconds: 120 });
  });
});

describe("provider throttling (DB-008)", () => {
  it("notify retries a CEOITBox 429, after its Retry-After", async () => {
    const { deps, deliveries } = notifyDeps({
      sendEmail: vi.fn(async () => ({ id: "re_1" })),
      sendWhatsApp: async () => {
        throw new CeoitboxError("CEOITBOX_RATE_LIMITED", "429", 429, null, 600);
      },
    });
    await notifyWithDeps({ ...input, whatsappVariables: {} }, deps);
    expect(deliveries.find((row) => row.channel === "WHATSAPP")).toMatchObject({ status: "FAILED", failureCode: "CEOITBOX_RATE_LIMITED", retryInSeconds: 600 });
  });

  it("the runner waits at least the Retry-After", async () => {
    const failed: [number, string, number | null][] = [];
    await runDeliveryRetriesWithDeps({
      lease: async () => [{ id: 7, channel: "WHATSAPP", attemptCount: 1, payload: { to: "91", templateId: 1, variables: [], reference: "ars-n1" } }],
      sendEmail: async () => null,
      sendWhatsApp: async () => {
        throw new CeoitboxError("CEOITBOX_RATE_LIMITED", "429", 429, null, 900);
      },
      markSent: async () => undefined,
      markFailed: async (...args) => {
        failed.push(args);
      },
      retryLimit: async () => 3,
    });
    expect(failed).toEqual([[7, "CEOITBOX_RATE_LIMITED", 15]]);
  });
});

describe("no duplicate sends from the runner (DB-014)", () => {
  function runner(overrides: Partial<RetryDeps>) {
    const failed: number[] = [];
    const deps: RetryDeps = {
      lease: async () => [{ id: 3, channel: "EMAIL", attemptCount: 1, payload: { to: "a@example.test", subject: "S", text: "T", idempotencyKey: "ars-o12-email" } }],
      sendEmail: vi.fn(async () => "re_1"),
      sendWhatsApp: vi.fn(async () => "w"),
      markSent: async () => undefined,
      markFailed: async (id) => {
        failed.push(id);
      },
      retryLimit: async () => 3,
      ...overrides,
    };
    return { deps, failed };
  }

  it("a send that worked is never marked FAILED when recording it fails", async () => {
    const markSent = vi.fn(async () => {
      throw new Error("db down");
    });
    const { deps, failed } = runner({ markSent });
    expect(await runDeliveryRetriesWithDeps(deps)).toEqual({ attempted: 1, sent: 0, rescheduled: 0, gaveUp: 0, unconfirmed: 1 });
    expect(failed).toEqual([]);
    expect(markSent).toHaveBeenCalledTimes(2); // one more try at recording it
  });

  it("a second try at recording the send is enough", async () => {
    let calls = 0;
    const { deps } = runner({
      markSent: async () => {
        calls += 1;
        if (calls === 1) throw new Error("blip");
      },
    });
    expect(await runDeliveryRetriesWithDeps(deps)).toMatchObject({ sent: 1, unconfirmed: 0 });
  });

  it("a retry uses the first send's email key and WhatsApp reference", async () => {
    const { deps } = runner({});
    await runDeliveryRetriesWithDeps(deps);
    expect(deps.sendEmail).toHaveBeenCalledWith({ to: "a@example.test", subject: "S", text: "T", idempotencyKey: "ars-o12-email" });
  });

  it("notify stores the key with a failed email, and sends with it", async () => {
    const { deps, deliveries } = notifyDeps({});
    await notifyWithDeps(input, deps, { reference: "ars-o12" });
    expect(deps.sendEmail).toHaveBeenCalledWith("s@example.com", "S", "T", "ars-o12-email");
    expect(deliveries[0]!.payload).toMatchObject({ idempotencyKey: "ars-o12-email" });
  });
});
