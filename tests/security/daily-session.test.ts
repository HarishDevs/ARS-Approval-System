import { describe, expect, it } from "vitest";
import { dailySessionApplies, isHandheldUserAgent, nextIndiaMidnight, parseClientKind, secondsUntilIndiaMidnight } from "@/lib/session/daily";

// D-250: the owner's table (India time) -> the next midnight, India time.
const ist = (text: string) => new Date(`${text}+05:30`);

describe("daily session ends at the next midnight, India time", () => {
  it.each([
    ["2026-11-01T08:00:00", "2026-11-02T00:00:00"],
    ["2026-11-01T14:00:00", "2026-11-02T00:00:00"],
    ["2026-11-01T22:30:00", "2026-11-02T00:00:00"],
    ["2026-11-02T00:15:00", "2026-11-03T00:00:00"],
    ["2026-12-31T23:59:59", "2027-01-01T00:00:00"],
  ])("signed in %s IST -> ends %s IST", (signedIn, ends) => {
    expect(nextIndiaMidnight(ist(signedIn)).toISOString()).toBe(ist(ends).toISOString());
  });

  it("is worked out from the server's clock, never the device's time zone", () => {
    // 20:00 UTC is 01:30 IST the next day: the session ends at the following midnight.
    expect(nextIndiaMidnight(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe("2026-11-02T18:30:00.000Z");
    expect(secondsUntilIndiaMidnight(ist("2026-11-01T23:00:00"))).toBe(3600);
    expect(secondsUntilIndiaMidnight(ist("2026-11-02T00:00:00"))).toBe(24 * 3600);
  });
});

describe("who gets the daily session", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
  const windows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
  const ipadOs = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

  it("phones and tablets by their browser; iPad and the installed app by the app's own hint", () => {
    expect(isHandheldUserAgent(iphone)).toBe(true);
    expect(isHandheldUserAgent(android)).toBe(true);
    expect(isHandheldUserAgent(windows)).toBe(false);
    expect(dailySessionApplies("DEVICES", iphone, null)).toBe(true);
    expect(dailySessionApplies("DEVICES", windows, null)).toBe(false);
    expect(dailySessionApplies("DEVICES", ipadOs, "handheld")).toBe(true);
    expect(dailySessionApplies("DEVICES", windows, "app")).toBe(true);
  });

  it("the Super Admin's scope wins", () => {
    expect(dailySessionApplies("EVERYONE", windows, null)).toBe(true);
    expect(dailySessionApplies("OFF", iphone, "app")).toBe(false);
  });

  it("only the two known hints are read", () => {
    expect(parseClientKind("app")).toBe("app");
    expect(parseClientKind("handheld")).toBe("handheld");
    expect(parseClientKind("desktop")).toBeNull();
    expect(parseClientKind(undefined)).toBeNull();
  });
});
