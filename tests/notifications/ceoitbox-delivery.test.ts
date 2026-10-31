import { describe, expect, it, vi } from "vitest";
import { retryAfterSeconds, sendTemplateMessage, CeoitboxError } from "@/server/integrations/ceoitbox/client";
import { whatsAppSlotsFor, tryConsumeWhatsAppRateLimit } from "@/lib/db/repositories/whatsapp.repository";

// D-243: audit DB-008 (429 is retryable), DB-010 (the timeout covers the body)
// and DB-011 (an atomic local limit with slots kept for sign-in codes).
const config = { baseUrl: "https://official.ceoitbox.com", phoneId: null, apiKey: "test-key", timeoutMs: 50, rateLimitPerMinute: 60, retryLimit: 3 };
const input = { to: "919876543210", templateName: "t", language: "en", templateVariables: [] };

describe("CEOITBox 429 (DB-008)", () => {
  it("is RATE_LIMITED (retryable) and carries Retry-After", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ title: "Too many" }), { status: 429, headers: { "Retry-After": "90" } }));
    const error = await sendTemplateMessage(config, input, { fetch: fetcher, tryConsumeRateLimit: async () => true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CeoitboxError);
    expect(error).toMatchObject({ code: "CEOITBOX_RATE_LIMITED", providerStatus: 429, retryAfterSeconds: 90 });
  });

  it("is RATE_LIMITED without a Retry-After too; other 4xx stay REJECTED", async () => {
    const send = (status: number) => sendTemplateMessage(config, input, { fetch: vi.fn(async () => new Response("{}", { status })), tryConsumeRateLimit: async () => true });
    await expect(send(429)).rejects.toMatchObject({ code: "CEOITBOX_RATE_LIMITED", retryAfterSeconds: undefined });
    await expect(send(400)).rejects.toMatchObject({ code: "CEOITBOX_REJECTED" });
  });

  it("reads Retry-After as seconds or a date, capped at an hour", () => {
    const now = Date.parse("2026-10-31T10:00:00Z");
    expect(retryAfterSeconds("120", now)).toBe(120);
    expect(retryAfterSeconds("Sat, 31 Oct 2026 10:01:00 GMT", now)).toBe(60);
    expect(retryAfterSeconds("99999", now)).toBe(3600);
    expect(retryAfterSeconds("soon", now)).toBeNull();
    expect(retryAfterSeconds(null, now)).toBeNull();
  });
});

describe("CEOITBox timeout (DB-010)", () => {
  it("covers reading the body: headers then a stalled body ends as TIMEOUT", async () => {
    // Headers arrive at once; the body never ends unless the request is aborted.
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          }),
      } as unknown as Response;
    });
    const outcome = await Promise.race([
      sendTemplateMessage(config, input, { fetch: fetcher as unknown as typeof fetch, tryConsumeRateLimit: async () => true }).catch((e: unknown) => e),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 1000)),
    ]);
    expect(outcome).toBeInstanceOf(CeoitboxError);
    expect(outcome).toMatchObject({ code: "CEOITBOX_TIMEOUT" });
  });
});

describe("local WhatsApp send limit (DB-011)", () => {
  it("keeps a fifth of the minute for sign-in codes", () => {
    expect(whatsAppSlotsFor(60, "BULK")).toBe(48);
    expect(whatsAppSlotsFor(60, "OTP")).toBe(60);
    expect(whatsAppSlotsFor(4, "BULK")).toBe(3);
    expect(whatsAppSlotsFor(1, "BULK")).toBe(1);
    expect(whatsAppSlotsFor(0, "OTP")).toBe(0);
  });

  it("the client asks for the OTP priority only when told to", async () => {
    const consume = vi.fn(async () => true);
    const ok = vi.fn(async () => new Response(JSON.stringify({ id: "1", waMessageId: "w" }), { status: 200 }));
    await sendTemplateMessage(config, input, { fetch: ok, tryConsumeRateLimit: consume });
    await sendTemplateMessage(config, { ...input, priority: "OTP" }, { fetch: ok, tryConsumeRateLimit: consume });
    expect(consume.mock.calls).toEqual([
      [60, "BULK"],
      [60, "OTP"],
    ]);
  });

  // A fake MySQL: the named lock serialises callers, like GET_LOCK does.
  function fakeDb(recent: { count: number }) {
    let held = false;
    const waiters: (() => void)[] = [];
    const log: string[] = [];
    const connect = async () => ({
      release: () => undefined,
      query: async (sql: string) => {
        log.push(sql.split(" ").slice(0, 2).join(" "));
        if (sql.startsWith("SELECT GET_LOCK")) {
          while (held) await new Promise<void>((resolve) => waiters.push(resolve));
          held = true;
          return [[{ got: 1 }]];
        }
        if (sql.startsWith("DO RELEASE_LOCK")) {
          held = false;
          waiters.shift()?.();
          return [{}];
        }
        if (sql.startsWith("SELECT COUNT")) {
          await new Promise((resolve) => setTimeout(resolve, 1)); // let others run
          return [[{ recent: recent.count }]];
        }
        if (sql.startsWith("INSERT")) recent.count += 1;
        return [{}];
      },
    });
    return { connect: connect as never, log };
  }

  it("is atomic: ten parallel senders with one slot left let exactly one through", async () => {
    const recent = { count: 47 }; // 48 bulk slots at 60/min
    const db = fakeDb(recent);
    const results = await Promise.all(Array.from({ length: 10 }, () => tryConsumeWhatsAppRateLimit(60, "BULK", db.connect)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(recent.count).toBe(48);
    expect(db.log.filter((line) => line.startsWith("DO RELEASE_LOCK"))).toHaveLength(10);
  });

  it("a burst of bulk sends can't block a sign-in code", async () => {
    const recent = { count: 0 };
    const db = fakeDb(recent);
    let bulk = 0;
    for (let i = 0; i < 100; i += 1) if (await tryConsumeWhatsAppRateLimit(60, "BULK", db.connect)) bulk += 1;
    expect(bulk).toBe(48);
    expect(await tryConsumeWhatsAppRateLimit(60, "OTP", db.connect)).toBe(true);
  });
});
