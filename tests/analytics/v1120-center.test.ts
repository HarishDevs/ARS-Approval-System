import { describe, expect, it } from "vitest";
import { agingBuckets, averageOf, BOARDS, countBuckets, departmentAlerts, forecastNext, lastMonths, medianOf, moduleAlerts, p90Of, parseBoard, rate } from "@/server/analytics/center";
import { resolvePeriod } from "@/server/analytics/periods";
import { ALL_METRICS, METRIC } from "@/server/analytics/metrics";

// v1.12.0 Analytics Center: the pure rules.
describe("boards", () => {
  it("are tabs of one page, in the brief's order; unknown → executive overview", () => {
    expect(BOARDS.map((board) => board.key)).toEqual(["overview", "approvals", "tasks", "information", "meetings", "employees", "departments", "sla", "trends", "quality"]);
    expect(parseBoard("nope")).toBe("overview");
    expect(parseBoard("tasks")).toBe("tasks");
  });
});

describe("age buckets are a setting", () => {
  it("default 1,3,7,14 → under 1 day, 2–3, 4–7, 8–14, over 14", () => {
    expect(agingBuckets(null).map((bucket) => bucket.label)).toEqual(["Under 1 day", "2–3 days", "4–7 days", "8–14 days", "Over 14 days"]);
  });
  it("custom edges are sorted and de-duplicated; junk falls back", () => {
    expect(agingBuckets("30,7,7,x").map((bucket) => bucket.key)).toEqual(["le7", "le30", "gt30"]);
    expect(agingBuckets("0,-3").map((bucket) => bucket.key)).toEqual(["le1", "le3", "le7", "le14", "gt14"]);
  });
  it("counts into buckets at the edges", () => {
    const buckets = agingBuckets("1,3");
    expect(countBuckets([0, 23.9, 24, 71.9, 72, 500], buckets)).toEqual({ le1: 2, le3: 2, gt3: 2 });
  });
});

describe("safe arithmetic", () => {
  it("a rate with no denominator is unavailable, never 0% or NaN", () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 3)).toBe(33.3);
    expect(medianOf([])).toBeNull();
    expect(medianOf([5, 1, 3, 2])).toBe(2.5);
    expect(averageOf([])).toBeNull();
  });
  it("the 90th percentile needs 10 values", () => {
    expect(p90Of([1, 2, 3])).toBeNull();
    expect(p90Of(Array.from({ length: 10 }, (_, index) => index + 1))).toBe(9);
  });
});

describe("alerts are explainable rules", () => {
  it("falling completion and rising lateness", () => {
    const alerts = moduleAlerts({ module: "Tasks", completionRate: 60, previousCompletionRate: 75, lateCount: 10, previousLateCount: 6 });
    expect(alerts.map((alert) => alert.key)).toEqual(["Tasks-completion", "Tasks-late"]);
    expect(alerts.every((alert) => alert.rule.length > 10)).toBe(true);
    expect(moduleAlerts({ module: "Tasks", completionRate: 70, previousCompletionRate: 75, lateCount: 4, previousLateCount: 0 })).toEqual([]);
    expect(moduleAlerts({ module: "Approvals", completionRate: null, previousCompletionRate: 90, lateCount: 0, previousLateCount: 0 })).toEqual([]);
  });
  it("a department with unusually high open work", () => {
    expect(departmentAlerts([{ name: "A", open: 5 }, { name: "B", open: 6 }, { name: "C", open: 30 }]).map((alert) => alert.key)).toEqual(["dept-C"]);
    expect(departmentAlerts([{ name: "A", open: 4 }, { name: "B", open: 9 }])).toEqual([]); // under the 10-item floor
  });
});

describe("trends and forecasts", () => {
  it("lists the last months, oldest first, across a year end", () => {
    expect(lastMonths("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("no forecast without 12 months of steady history", () => {
    expect(forecastNext([5, 6, 7])).toBeNull();
    expect(forecastNext([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6])).toBeNull();
    const forecast = forecastNext([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(forecast).toEqual({ value: 22, low: 22, high: 22 });
  });
});

describe("periods (brief §2.1 presets)", () => {
  it("today, yesterday, previous quarter (financial quarters)", () => {
    expect(resolvePeriod({ key: "today" }, "2026-10-16")).toMatchObject({ from: "2026-10-16", to: "2026-10-16" });
    expect(resolvePeriod({ key: "yesterday" }, "2026-10-16")).toMatchObject({ from: "2026-10-15", to: "2026-10-15" });
    expect(resolvePeriod({ key: "last_quarter" }, "2026-10-16")).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
    expect(resolvePeriod({ key: "last_quarter" }, "2026-02-01")).toMatchObject({ from: "2025-10-01", to: "2025-12-31" });
  });
});

describe("metric dictionary", () => {
  it("every Analytics Center metric has a board and a reliability; unavailable ones explain why", () => {
    for (const metric of ALL_METRICS) {
      expect(metric.board, metric.key).toBeTruthy();
      expect(["Reliable", "Partial", "Unavailable"]).toContain(metric.reliability);
      if (metric.reliability !== "Reliable") expect((metric.limits ?? "").length, metric.key).toBeGreaterThan(20);
    }
    expect(METRIC.x_ack_overdue?.reliability).toBe("Unavailable");
    expect(METRIC.t_effort?.reliability).toBe("Unavailable");
  });
  it("names are unique, so approval tasks and Task Management tasks are never confused", () => {
    const names = ALL_METRICS.map((metric) => metric.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
