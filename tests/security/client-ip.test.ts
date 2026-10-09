import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/http/client-ip";

const from = (headers: Record<string, string>) => clientIpFrom((name) => headers[name] ?? null);

describe("client IP (Q-018, D-092)", () => {
  it("uses Cloudflare's CF-Connecting-IP and ignores whatever the visitor put in X-Forwarded-For", () => {
    expect(from({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9, 198.51.100.7, 172.70.1.1" })).toBe("198.51.100.7");
    expect(from({ "cf-connecting-ip": "2001:db8::1" })).toBe("2001:db8::1");
  });

  it("without Cloudflare, trusts only the right-most X-Forwarded-For entry (the nearest proxy's)", () => {
    expect(from({ "x-forwarded-for": "203.0.113.9, 10.0.0.5" })).toBe("10.0.0.5");
    expect(from({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("drops values that aren't addresses, and falls back to X-Real-IP, then nothing", () => {
    expect(from({ "cf-connecting-ip": "not-an-ip", "x-forwarded-for": "garbage", "x-real-ip": "192.0.2.4" })).toBe("192.0.2.4");
    expect(from({})).toBeNull();
  });
});
