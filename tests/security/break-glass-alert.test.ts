import { describe, expect, it } from "vitest";
import { breakGlassAlertDue } from "@/server/auth/break-glass-alert";

// D-246 (audit FI-D06): the break-glass account's changes alert the Super
// Admins, at most once per session every 10 minutes (each change is audited).
describe("break-glass action alerts", () => {
  it("alerts on the first change, then again only after 10 minutes, per session", () => {
    const start = 1_000_000;
    expect(breakGlassAlertDue("s1", start)).toBe(true);
    expect(breakGlassAlertDue("s1", start + 60_000)).toBe(false);
    expect(breakGlassAlertDue("s2", start + 60_000)).toBe(true);
    expect(breakGlassAlertDue("s1", start + 10 * 60_000)).toBe(true);
  });
});
