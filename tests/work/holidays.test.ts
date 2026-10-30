import { describe, expect, it } from "vitest";
import { checkHoliday, DEFAULT_HOLIDAY_SETTINGS, holidayMessage, holidayName, nearestWorkingDay, parseHolidaySettings, type HolidayCalendar } from "@/server/work/holidays";

// D-217: task dates on holidays.
const calendar: HolidayCalendar = {
  holidays: new Map([
    ["2026-11-09", "Diwali"],
    ["2026-11-10", "Diwali (day 2)"],
  ]),
  workingDays: new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT"]),
};
const settings = DEFAULT_HOLIDAY_SETTINGS;

describe("task holidays", () => {
  it("named holidays and (by default) weekly offs are holidays", () => {
    expect(holidayName("2026-11-09", calendar, settings)).toBe("Diwali");
    expect(holidayName("2026-11-08", calendar, settings)).toMatch(/Weekly off \(Sun\)/); // a Sunday
    expect(holidayName("2026-11-08", calendar, { ...settings, weeklyOff: false })).toBeNull();
    expect(holidayName("2026-11-11", calendar, settings)).toBeNull();
  });
  it("offers the nearest working day either way", () => {
    expect(nearestWorkingDay("2026-11-09", calendar, settings)).toBe("2026-11-11");
    expect(nearestWorkingDay("2026-11-10", calendar, settings, "PREVIOUS")).toBe("2026-11-07"); // skips Sunday 8th
    expect(nearestWorkingDay("2026-11-11", calendar, settings)).toBe("2026-11-11");
  });
  it("warn: keep on purpose; block: never; off: no check", () => {
    const hit = checkHoliday("2026-11-09", "due", calendar, settings, false);
    expect(hit).toEqual({ day: "2026-11-09", name: "Diwali", suggestion: "2026-11-11", mode: "WARN", field: "due" });
    expect(holidayMessage(hit!)).toMatch(/Keep it anyway, or move it to 2026-11-11/);
    expect(checkHoliday("2026-11-09", "due", calendar, settings, true)).toBeNull();
    const blocked = checkHoliday("2026-11-09", "due", calendar, { ...settings, mode: "BLOCK" }, true);
    expect(blocked?.mode).toBe("BLOCK");
    expect(holidayMessage(blocked!)).toMatch(/Choose a working day/);
    expect(checkHoliday("2026-11-09", "due", calendar, { ...settings, mode: "OFF" }, false)).toBeNull();
    expect(checkHoliday("2026-11-09", "start", calendar, { ...settings, checkStart: false }, false)).toBeNull();
    expect(checkHoliday(null, "due", calendar, settings, false)).toBeNull();
  });
  it("settings: safe defaults for missing or broken values", () => {
    expect(parseHolidaySettings(null)).toEqual(DEFAULT_HOLIDAY_SETTINGS);
    expect(parseHolidaySettings("{nope")).toEqual(DEFAULT_HOLIDAY_SETTINGS);
    expect(parseHolidaySettings('{"mode":"BLOCK","holdReminders":false}')).toMatchObject({ mode: "BLOCK", holdReminders: false, weeklyOff: true });
    expect(DEFAULT_HOLIDAY_SETTINGS).toMatchObject({ mode: "WARN", suggest: "NEXT", notifyNewHoliday: true });
  });
});
