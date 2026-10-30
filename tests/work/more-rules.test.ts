import { describe, expect, it } from "vitest";
import { checkFieldValue, cleanFieldOptions, countTemplateTasks, digestText, nextDueDay, parseDigestSettings, parseRecurrence, parseRecurrenceSettings, parseTemplate, recurrenceLabel, shiftDays } from "@/server/work/more-rules";
import { holidayName, DEFAULT_HOLIDAY_SETTINGS } from "@/server/work/holidays";

// D-218: repeating tasks, fields, templates, the morning summary.
describe("repeating tasks", () => {
  it("reads only well-formed rules", () => {
    expect(parseRecurrence({ kind: "DAILY", every: 2 })).toEqual({ kind: "DAILY", every: 2, weekdays: [] });
    expect(parseRecurrence('{"kind":"WEEKLY","every":1,"weekdays":[5,1,1]}')).toEqual({ kind: "WEEKLY", every: 1, weekdays: [1, 5] });
    expect(parseRecurrence({ kind: "HOURLY", every: 1 })).toBeNull();
    expect(parseRecurrence({ kind: "DAILY", every: 0 })).toBeNull();
    expect(parseRecurrence("{bad")).toBeNull();
  });
  it("labels", () => {
    expect(recurrenceLabel({ kind: "WEEKLY", every: 2, weekdays: [1, 3] })).toBe("Every 2 weeks on Mon, Wed");
    expect(recurrenceLabel({ kind: "AFTER_DONE", every: 3, weekdays: [] })).toBe("3 days after it is completed");
    expect(recurrenceLabel({ kind: "MONTHLY", every: 1, weekdays: [] })).toBe("Every month");
  });
  it("the next due day", () => {
    expect(nextDueDay({ kind: "DAILY", every: 1, weekdays: [] }, "2026-10-30", "2026-10-30")).toBe("2026-10-31");
    expect(nextDueDay({ kind: "MONTHLY", every: 1, weekdays: [] }, "2027-01-31", "2027-01-31")).toBe("2027-02-28");
    expect(nextDueDay({ kind: "YEARLY", every: 1, weekdays: [] }, "2028-02-29", "2028-02-29")).toBe("2029-02-28");
    expect(nextDueDay({ kind: "AFTER_DONE", every: 5, weekdays: [] }, "2026-10-01", "2026-10-30")).toBe("2026-11-04");
    expect(nextDueDay({ kind: "DAILY", every: 7, weekdays: [] }, null, "2026-10-30")).toBe("2026-11-06");
    // Weekly on Mon and Thu, from Friday 30 Oct 2026 → Monday 2 Nov.
    expect(nextDueDay({ kind: "WEEKLY", every: 1, weekdays: [1, 4] }, "2026-10-30", "2026-10-30")).toBe("2026-11-02");
    // From Monday 2 Nov → Thursday 5 Nov.
    expect(nextDueDay({ kind: "WEEKLY", every: 1, weekdays: [1, 4] }, "2026-11-02", "2026-11-02")).toBe("2026-11-05");
    // Every 2 weeks on Monday, from Monday 2 Nov → Monday 16 Nov.
    expect(nextDueDay({ kind: "WEEKLY", every: 2, weekdays: [1] }, "2026-11-02", "2026-11-02")).toBe("2026-11-16");
    expect(nextDueDay({ kind: "WEEKLY", every: 1, weekdays: [] }, "2026-11-02", "2026-11-02")).toBe("2026-11-09");
  });
  it("settings default to on and holiday-aware", () => {
    expect(parseRecurrenceSettings(null)).toEqual({ enabled: true, skipHolidays: true });
    expect(parseRecurrenceSettings('{"enabled":false}')).toEqual({ enabled: false, skipHolidays: true });
  });
});

describe("custom fields", () => {
  it("choices come one per line or comma, without repeats", () => {
    expect(cleanFieldOptions("SELECT", "Plant A\nPlant B, Plant A\n\n")).toEqual(["Plant A", "Plant B"]);
    expect(cleanFieldOptions("TEXT", "x")).toEqual([]);
  });
  it("values are checked by kind; empty clears", () => {
    expect(checkFieldValue("NUMBER", [], "1,50,000")).toEqual({ ok: true, value: "150000" });
    expect(checkFieldValue("NUMBER", [], "abc").ok).toBe(false);
    expect(checkFieldValue("SELECT", ["A", "B"], "B")).toEqual({ ok: true, value: "B" });
    expect(checkFieldValue("SELECT", ["A", "B"], "C").ok).toBe(false);
    expect(checkFieldValue("DATE", [], "2026-11-02")).toEqual({ ok: true, value: "2026-11-02" });
    expect(checkFieldValue("DATE", [], "2/11/2026").ok).toBe(false);
    expect(checkFieldValue("TEXT", [], "  ")).toEqual({ ok: true, value: null });
    expect(checkFieldValue("TEXT", [], "x".repeat(501)).ok).toBe(false);
  });
});

describe("templates", () => {
  it("are checked and counted with their subtasks", () => {
    const template = parseTemplate({
      sections: ["To do"],
      fields: [{ name: "Plant", kind: "SELECT", options: ["A", "B"] }],
      tasks: [{ title: "Survey", description: null, priority: "HIGH", section: 0, dueOffset: 3, startOffset: 0, isMilestone: false, tags: ["site"], fields: { Plant: "A" }, subtasks: [{ title: "East", description: null, priority: "NORMAL", section: 0, dueOffset: null, startOffset: null, isMilestone: false, tags: [], fields: {}, subtasks: [] }] }],
    });
    expect(template).not.toBeNull();
    expect(countTemplateTasks(template!.tasks)).toBe(2);
    expect(parseTemplate({ sections: [], fields: [], tasks: [] })).toBeNull(); // needs a section
    expect(shiftDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("morning summary", () => {
  it("says nothing when there is nothing", () => {
    expect(digestText({ name: "Ravi", overdue: [], today: [], assigned: [] })).toBeNull();
  });
  it("lists overdue, today and new, at most 15 each", () => {
    const many = Array.from({ length: 17 }, (_, index) => ({ taskNo: `TSK-${index}`, title: `Task ${index}`, dueDay: "2026-10-29" }));
    const digest = digestText({ name: "Ravi", overdue: many, today: [{ taskNo: "TSK-X", title: "Report", dueDay: "2026-10-30" }], assigned: [] })!;
    expect(digest.title).toBe("Your tasks today: 17 overdue, 1 due today");
    expect(digest.text).toContain("Overdue (17):");
    expect(digest.text).toContain("- and 2 more");
    expect(digest.text).toContain("Due today (1):\n- TSK-X Report (due 2026-10-30)");
  });
  it("settings: on at 9 on working days by default", () => {
    expect(parseDigestSettings(null)).toEqual({ enabled: true, hour: 9, workingDaysOnly: true });
    expect(parseDigestSettings('{"hour":3}')).toEqual({ enabled: true, hour: 9, workingDaysOnly: true }); // out of range: defaults
  });
});

describe("department holidays merge with the organisation's", () => {
  it("a department's own day counts like any holiday", () => {
    const calendar = { holidays: new Map([["2026-11-04", "Plant shutdown"]]), workingDays: new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT"] as const) };
    expect(holidayName("2026-11-04", calendar as never, DEFAULT_HOLIDAY_SETTINGS)).toBe("Plant shutdown");
  });
});
