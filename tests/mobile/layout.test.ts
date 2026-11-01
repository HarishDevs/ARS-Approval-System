import { describe, expect, it } from "vitest";
import { MOBILE_MAX_WIDTH, PHONE_UA } from "@/lib/ui/layout";
import { waitedFor } from "@/features/mobile/ApprovalCard";

// v1.43.0: which browsers get the mobile layout before the window has said
// its width, and how a card says how long something has waited.
describe("mobile layout", () => {
  it("knows phones by their browser, not tablets or computers", () => {
    expect(PHONE_UA.test("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(true);
    expect(PHONE_UA.test("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe(true);
    expect(PHONE_UA.test("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36")).toBe(false);
    expect(PHONE_UA.test("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(PHONE_UA.test("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36")).toBe(false);
  });

  it("switches below 768 px", () => {
    expect(MOBILE_MAX_WIDTH).toBe(767);
  });

  it("says how long something waited", () => {
    const now = Date.UTC(2026, 10, 1, 12, 0);
    expect(waitedFor(new Date(now - 5 * 60_000), now)).toBe("5 min");
    expect(waitedFor(new Date(now - 3 * 3_600_000), now)).toBe("3 h");
    expect(waitedFor(new Date(now - 50 * 3_600_000), now)).toBe("2 d 2 h");
    expect(waitedFor(new Date(now - 48 * 3_600_000), now)).toBe("2 d");
    expect(waitedFor(new Date(now + 60_000), now)).toBe("0 min");
  });
});
