import { describe, expect, it } from "vitest";
import { alertDecision, describeSchedule, nextRunAt } from "@/server/reports/schedule-time";

// Scheduled report slots (India time) and alert firing rules (pure).
const ist = (date: Date) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");

describe("nextRunAt", () => {
  it("daily: later today if the hour hasn't passed, else tomorrow", () => {
    expect(ist(nextRunAt({ frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 }, new Date("2026-10-10T01:00:00Z")))).toBe("2026-10-10 08:00"); // 06:30 IST
    expect(ist(nextRunAt({ frequency: "DAILY", weekday: null, monthDay: null, hourIst: 8 }, new Date("2026-10-10T02:30:00Z")))).toBe("2026-10-11 08:00"); // exactly 08:00 IST
  });
  it("crosses midnight in India time correctly", () => {
    // 23:00 UTC on the 9th is 04:30 IST on the 10th.
    expect(ist(nextRunAt({ frequency: "DAILY", weekday: null, monthDay: null, hourIst: 2 }, new Date("2026-10-09T23:00:00Z")))).toBe("2026-10-11 02:00");
  });
  it("weekly on the chosen day", () => {
    // 10 Oct 2026 is a Saturday.
    expect(ist(nextRunAt({ frequency: "WEEKLY", weekday: 1, monthDay: null, hourIst: 9 }, new Date("2026-10-10T04:00:00Z")))).toBe("2026-10-12 09:00");
    expect(ist(nextRunAt({ frequency: "WEEKLY", weekday: 6, monthDay: null, hourIst: 9 }, new Date("2026-10-10T04:00:00Z")))).toBe("2026-10-17 09:00"); // 09:30 IST already past 09:00
    expect(ist(nextRunAt({ frequency: "WEEKLY", weekday: 7, monthDay: null, hourIst: 9 }, new Date("2026-10-10T04:00:00Z")))).toBe("2026-10-11 09:00");
  });
  it("monthly on day 1–28, rolling over the year", () => {
    expect(ist(nextRunAt({ frequency: "MONTHLY", weekday: null, monthDay: 5, hourIst: 7 }, new Date("2026-12-20T00:00:00Z")))).toBe("2027-01-05 07:00");
    expect(ist(nextRunAt({ frequency: "MONTHLY", weekday: null, monthDay: 28, hourIst: 7 }, new Date("2026-02-01T00:00:00Z")))).toBe("2026-02-28 07:00");
  });
  it("describes itself", () => {
    expect(describeSchedule({ frequency: "WEEKLY", weekday: 1, monthDay: null, hourIst: 9 })).toBe("Every Monday at 09:00");
  });
});

describe("alertDecision", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  it("fires on crossing, not again within the cool-down, again after it; resets below the line", () => {
    expect(alertDecision({ threshold: 5, firing: false, lastFiredAt: null, cooldownHours: 24 }, 4, now)).toEqual({ fire: false, firing: false });
    expect(alertDecision({ threshold: 5, firing: false, lastFiredAt: null, cooldownHours: 24 }, 5, now)).toEqual({ fire: true, firing: true });
    expect(alertDecision({ threshold: 5, firing: true, lastFiredAt: new Date("2026-10-10T00:00:00Z"), cooldownHours: 24 }, 9, now)).toEqual({ fire: false, firing: true });
    expect(alertDecision({ threshold: 5, firing: true, lastFiredAt: new Date("2026-10-09T09:00:00Z"), cooldownHours: 24 }, 9, now)).toEqual({ fire: true, firing: true });
    expect(alertDecision({ threshold: 5, firing: true, lastFiredAt: new Date("2026-10-10T09:00:00Z"), cooldownHours: 24 }, 2, now)).toEqual({ fire: false, firing: false });
    // Crossing again after a reset alerts at once.
    expect(alertDecision({ threshold: 5, firing: false, lastFiredAt: new Date("2026-10-10T09:00:00Z"), cooldownHours: 24 }, 6, now)).toEqual({ fire: true, firing: true });
  });
});
