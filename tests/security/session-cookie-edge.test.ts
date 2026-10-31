import { describe, expect, it } from "vitest";
import { createSessionToken } from "@/lib/session/token";
import { sessionCookieLooksValid } from "@/lib/security/session-cookie-edge";

// D-244 (audit OPS-20): the middleware's early check agrees with the server's
// own session token (same secret, same signature, expiry respected).
describe("session cookie check in the middleware", () => {
  const secret = process.env.SESSION_SECRET;
  const now = Math.floor(Date.now() / 1000);

  it("accepts a token the server made, and refuses a tampered, foreign or expired one", async () => {
    const token = createSessionToken("sid-1", 5, now);
    expect(await sessionCookieLooksValid(token, secret, now)).toBe(true);
    expect(await sessionCookieLooksValid(`${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`, secret, now)).toBe(false);
    expect(await sessionCookieLooksValid(token, "another-secret-of-enough-length-0123456789", now)).toBe(false);
    expect(await sessionCookieLooksValid(createSessionToken("sid-2", 5, now - 10 * 86_400), secret, now)).toBe(false);
  });

  it("refuses garbage and missing values", async () => {
    for (const value of [undefined, null, "", "garbage", "a.b", "invalid.invalid"]) expect(await sessionCookieLooksValid(value, secret, now)).toBe(false);
    expect(await sessionCookieLooksValid(createSessionToken("sid-3", 5, now), undefined, now)).toBe(false);
  });
});
