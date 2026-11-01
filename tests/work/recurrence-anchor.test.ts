import { describe, expect, it } from "vitest";
import { nextOccurrence, parseRecurrence } from "@/server/work/more-rules";

// QA-WF-04 (v1.42.1): a series keeps its day of the month and its planned day.
describe("repeating tasks don't drift", () => {
  it("monthly on the 31st: 31 Jan → 28 Feb → 31 Mar", () => {
    const rule = parseRecurrence({ kind: "MONTHLY", every: 1 })!;
    const feb = nextOccurrence(rule, "2027-01-31", "2027-01-31");
    expect(feb.planned).toBe("2027-02-28");
    const mar = nextOccurrence(parseRecurrence(JSON.parse(JSON.stringify(feb.rule)))!, "2027-02-28", "2027-02-28");
    expect(mar.planned).toBe("2027-03-31");
  });

  it("a holiday move of one occurrence doesn't move the next", () => {
    const rule = parseRecurrence({ kind: "MONTHLY", every: 1 })!;
    const first = nextOccurrence(rule, "2027-02-15", "2027-02-15"); // planned 15 Mar
    expect(first.planned).toBe("2027-03-15");
    // 15 Mar was moved to 16 Mar for a holiday, so the task's due day is the 16th.
    const second = nextOccurrence(first.rule, "2027-03-16", "2027-03-16");
    expect(second.planned).toBe("2027-04-15");
  });

  it("weekly after a holiday move keeps its weekday", () => {
    const rule = parseRecurrence({ kind: "WEEKLY", every: 1, weekdays: [1] })!; // Mondays
    const next = nextOccurrence(rule, "2027-03-01", "2027-03-01");
    expect(next.planned).toBe("2027-03-08");
    expect(nextOccurrence(next.rule, "2027-03-09", "2027-03-09").planned).toBe("2027-03-15");
  });

  it("an old rule without the new fields still works", () => {
    expect(parseRecurrence('{"kind":"DAILY","every":2}')).toMatchObject({ kind: "DAILY", every: 2 });
  });
});
