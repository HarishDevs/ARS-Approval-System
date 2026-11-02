import { describe, expect, it } from "vitest";
import { originLockOn } from "@/server/ops/origin-lock";

// Q-021 (owner, 2 Nov 2026): the Super Admin home shows on/off only.
describe("origin lock status (Q-021)", () => {
  it("is on only when ORIGIN_SECRET is set, and returns no value", () => {
    expect(originLockOn({ ORIGIN_SECRET: "a-long-enough-secret-value-123" })).toBe(true);
    expect(originLockOn({ ORIGIN_SECRET: "" })).toBe(false);
    expect(originLockOn({})).toBe(false);
  });
});
