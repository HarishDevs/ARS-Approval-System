import { afterEach, describe, expect, it, vi } from "vitest";
import { guardCall } from "@/features/ui/form";

// D-233 (UI states): every Server Action call (forms and the task area's
// clicks) answers in words and never throws or waits forever.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("guardCall", () => {
  it("passes a normal answer through", async () => {
    await expect(guardCall(async () => ({ ok: true, message: "Saved." }))).resolves.toEqual({ ok: true, message: "Saved." });
  });
  it("stops waiting at the time limit and says it may still go through", async () => {
    vi.useFakeTimers();
    const pending = guardCall(() => new Promise<never>(() => undefined), 1000);
    await vi.advanceTimersByTimeAsync(1001);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/taking longer than expected/);
  });
  it("a cut connection while offline says offline, not an error", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await guardCall(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/You're offline/) });
  });
  it("an ended session is named (the status check says signed out)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ signedIn: false }), { status: 200 }));
    const result = await guardCall(async () => ({ ok: false, message: "Not found." }));
    expect(result.message).toMatch(/session has ended/);
  });
  it("a server error shows its reference for IT", async () => {
    const result = await guardCall(async () => {
      throw Object.assign(new Error("boom"), { digest: "12345abc" });
    });
    expect(result.message).toMatch(/12345abc/);
  });
});
