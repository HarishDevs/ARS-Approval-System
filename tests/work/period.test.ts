import { describe, expect, it } from "vitest";
import { changePercent, mondayOf, parsePeriod } from "@/server/work/period";

// D-265: Home's reporting periods (India days; `to` is exclusive).
describe("Home periods", () => {
  const today = "2026-11-04"; // a Wednesday

  it("this week runs Monday to Sunday, compared with the week before", () => {
    const week = parsePeriod({}, today);
    expect(week.key).toBe("week");
    expect([week.fromDay, week.toDay, week.days]).toEqual(["2026-11-02", "2026-11-08", 7]);
    expect(week.from.toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(week.to.toISOString()).toBe("2026-11-08T18:30:00.000Z");
    expect(week.prevFrom.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(week.prevTo.getTime()).toBe(week.from.getTime());
  });

  it("this month is the calendar month; the previous one may be shorter", () => {
    const month = parsePeriod({ period: "month" }, "2026-03-15");
    expect([month.fromDay, month.toDay]).toEqual(["2026-03-01", "2026-03-31"]);
    expect(month.prevFrom.toISOString()).toBe("2026-01-31T18:30:00.000Z"); // 1 Feb, India
    expect(parsePeriod({ period: "month" }, "2026-12-10").toDay).toBe("2026-12-31");
    expect(parsePeriod({ period: "month" }, "2026-01-10").prevFrom.toISOString()).toBe("2025-11-30T18:30:00.000Z");
  });

  it("today, last 30 and 90 days end today", () => {
    expect(parsePeriod({ period: "today" }, today).days).toBe(1);
    expect(parsePeriod({ period: "30d" }, today).fromDay).toBe("2026-10-06");
    expect(parsePeriod({ period: "90d" }, today).days).toBe(90);
  });

  it("a custom period must be valid, in order and at most a year; otherwise this week", () => {
    expect(parsePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-10" }, today).days).toBe(10);
    expect(parsePeriod({ period: "custom", from: "2026-10-10", to: "2026-10-01" }, today).key).toBe("week");
    expect(parsePeriod({ period: "custom", from: "2024-01-01", to: "2026-01-01" }, today).key).toBe("week");
    expect(parsePeriod({ period: "custom", from: "x", to: "y" }, today).key).toBe("week");
    expect(parsePeriod({ period: "nonsense" }, today, "month").key).toBe("month");
  });

  it("Monday of a Sunday is six days before", () => {
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
  });

  it("the change says nothing when there was nothing before", () => {
    expect(changePercent(5, 0)).toBeNull();
    expect(changePercent(6, 4)).toBe(50);
    expect(changePercent(2, 4)).toBe(-50);
  });
});
