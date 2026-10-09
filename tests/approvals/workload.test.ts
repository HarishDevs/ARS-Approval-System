import { describe, expect, it } from "vitest";
import { ageText, bandOf, median, suggestHandover, summarizeWorkload } from "@/server/workload/summary";

describe("workload (#12)", () => {
  it("medians, age bands and text", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect([bandOf(2), bandOf(30), bandOf(100), bandOf(500)]).toEqual(["day", "three", "week", "older"]);
    expect([ageText(0.5), ageText(5), ageText(72)]).toEqual(["under 1 h", "5 h", "3 days"]);
  });

  it("groups by person, most overdue first", () => {
    const result = summarizeWorkload([
      { approverId: 1, name: "Asha", ageHours: 2, overdue: false, onHold: false },
      { approverId: 2, name: "Ravi", ageHours: 200, overdue: true, onHold: false },
      { approverId: 1, name: "Asha", ageHours: 10, overdue: false, onHold: true },
    ]);
    expect(result.total).toBe(3);
    expect(result.overdue).toBe(1);
    expect(result.rows.map((row) => row.name)).toEqual(["Ravi", "Asha"]);
    expect(result.rows[1]).toMatchObject({ pending: 2, onHold: 1, medianHours: 6, oldestHours: 10, bands: { day: 2, three: 0, week: 0, older: 0 } });
  });

  it("suggests the people with the fewest waiting, never the person themselves", () => {
    const people = [
      { id: 1, label: "Asha" },
      { id: 2, label: "Ravi" },
      { id: 3, label: "Meena" },
      { id: 4, label: "Kiran" },
    ];
    const suggestions = suggestHandover(people, new Map([[1, 9], [2, 4], [3, 0]]), 4, 2);
    expect(suggestions.map((person) => [person.label, person.pending])).toEqual([["Meena", 0], ["Ravi", 4]]);
  });
});
