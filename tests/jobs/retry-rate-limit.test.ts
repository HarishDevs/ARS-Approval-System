import { describe, expect, it, vi } from "vitest";
import { nextRetryMinutes, runDeliveryRetriesWithDeps, type RetryDeps } from "@/server/jobs/retry-deliveries";
import { bucketsFor, enforceRateLimit } from "@/server/auth/rate-limit";
import { AuthError } from "@/server/auth/errors";
import { CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { EmailSendError } from "@/server/integrations/resend/client";

describe("retry backoff (D-058)", () => {
  // D-243 (audit DB-009): a limit of N gives N retries; 0 gives none.
  it("waits 2, 4, 8 minutes and stops after the retry limit", () => {
    expect(nextRetryMinutes(1, 3)).toBe(2);
    expect(nextRetryMinutes(2, 3)).toBe(4);
    expect(nextRetryMinutes(3, 3)).toBe(8);
    expect(nextRetryMinutes(4, 3)).toBeNull();
    expect(nextRetryMinutes(1, 0)).toBeNull();
  });
});

function deps(overrides: Partial<RetryDeps> = {}) {
  const calls = { sent: [] as number[], failed: [] as [number, string, number | null][] };
  const base: RetryDeps = {
    lease: async () => [
      { id: 1, channel: "EMAIL", attemptCount: 1, payload: { to: "a@example.test", subject: "S", text: "T" } },
      { id: 2, channel: "WHATSAPP", attemptCount: 2, payload: { to: "919876543210", templateId: 4, variables: ["x"] } },
    ],
    sendEmail: vi.fn(async () => "re_1"),
    sendWhatsApp: vi.fn(async () => "wamid.2"),
    markSent: async (id) => {
      calls.sent.push(id);
    },
    markFailed: async (id, code, minutes) => {
      calls.failed.push([id, code, minutes]);
    },
    retryLimit: async () => 3,
    ...overrides,
  };
  return { deps: base, calls };
}

describe("retry runner", () => {
  it("resends email and WhatsApp from the stored payload", async () => {
    const { deps: d, calls } = deps();
    expect(await runDeliveryRetriesWithDeps(d)).toEqual({ attempted: 2, sent: 2, rescheduled: 0, gaveUp: 0, unconfirmed: 0 });
    expect(d.sendWhatsApp).toHaveBeenCalledWith({ to: "919876543210", templateId: 4, variables: ["x"], reference: "ars-d2" });
    expect(calls.sent).toEqual([1, 2]);
  });

  it("reschedules retryable failures and gives up on the rest", async () => {
    const { deps: d, calls } = deps({
      sendEmail: async () => {
        throw new EmailSendError("EMAIL_REQUEST_FAILED", "down");
      },
      sendWhatsApp: async () => {
        throw new CeoitboxError("CEOITBOX_NOT_CONFIGURED", "no key");
      },
    });
    expect(await runDeliveryRetriesWithDeps(d)).toEqual({ attempted: 2, sent: 0, rescheduled: 1, gaveUp: 1, unconfirmed: 0 });
    expect(calls.failed).toEqual([
      [1, "EMAIL_REQUEST_FAILED", 4],
      [2, "CEOITBOX_NOT_CONFIGURED", null],
    ]);
  });
});

describe("rate limits (D-059)", () => {
  it("uses IP and User ID buckets, case-insensitive", () => {
    expect(bucketsFor("SIGNIN", { ipAddress: "1.2.3.4" }, " EMP005 ").map((b) => b.bucket)).toEqual(["signin:ip:1.2.3.4", "signin:login:emp005"]);
    expect(bucketsFor("CODE", { ipAddress: null }).map((b) => b.bucket)).toEqual(["code:ip:unknown"]);
    expect(bucketsFor("FORGOT", { ipAddress: "1.2.3.4" }).map((b) => b.bucket)).toEqual(["forgot:ip:1.2.3.4"]);
  });

  it("refuses once a bucket is over its limit", async () => {
    const counts = new Map<string, number>();
    const hit = async (bucket: string) => {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      return counts.get(bucket)!;
    };
    for (let i = 0; i < 10; i += 1) await enforceRateLimit("SIGNIN", { ipAddress: `10.0.0.${i}` }, "emp005", hit);
    const error = await enforceRateLimit("SIGNIN", { ipAddress: "10.0.0.99" }, "EMP005", hit).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).code).toBe("AUTH_RATE_LIMITED");
    // A different User ID from the same place is still fine.
    await expect(enforceRateLimit("SIGNIN", { ipAddress: "10.0.0.98" }, "emp006", hit)).resolves.toBeUndefined();
  });
});
