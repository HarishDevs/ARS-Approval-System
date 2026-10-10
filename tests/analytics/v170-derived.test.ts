import { describe, expect, it } from "vitest";
import { comparisonPeriod, resolvePeriod } from "@/server/analytics/periods";
import { heatStep, historyFrom, qualityFrom } from "@/server/analytics/derived";
import { inQuietHours } from "@/server/reports/schedule-time";
import { readFilter, withParams } from "@/server/analytics/query";

// v1.7.0 list B: the database-free definitions.
describe("B04 comparisonPeriod", () => {
  it("this month against the same days of last month, shortened in a short month", () => {
    const period = resolvePeriod({ key: "this_month" }, "2027-03-30");
    expect(comparisonPeriod(period, "PREVIOUS")).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
    expect(comparisonPeriod(resolvePeriod({ key: "this_month" }, "2026-10-10"), "PREVIOUS")).toMatchObject({ from: "2026-09-01", to: "2026-09-10" });
  });
  it("last month against the whole month before; January wraps to December", () => {
    expect(comparisonPeriod(resolvePeriod({ key: "last_month" }, "2026-10-10"), "PREVIOUS")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(comparisonPeriod(resolvePeriod({ key: "this_month" }, "2027-01-15"), "PREVIOUS")).toMatchObject({ from: "2026-12-01", to: "2026-12-15" });
  });
  it("other periods: equally long just before; last year: same dates, 29 Feb → 28 Feb", () => {
    expect(comparisonPeriod(resolvePeriod({ key: "7d" }, "2026-10-10"), "PREVIOUS")).toMatchObject({ from: "2026-09-27", to: "2026-10-03" });
    expect(comparisonPeriod(resolvePeriod({ key: "custom", from: "2028-02-01", to: "2028-02-29" }, "2028-03-10"), "LAST_YEAR")).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
  });
});

describe("B03 qualityFrom", () => {
  it("first pass, rework, withdrawal and the median", () => {
    const quality = qualityFrom([
      { status: "APPROVED", minutes: 60, round: 1, sends: 0 },
      { status: "APPROVED", minutes: 600, round: 2, sends: 1 },
      { status: "REJECTED", minutes: 120, round: 1, sends: 0 },
      { status: "CANCELLED", minutes: 5, round: 1, sends: 0 },
    ]);
    expect(quality).toEqual({ closed: 4, medianCycleHours: 2, firstPassRate: 50, reworkRate: 33.3, withdrawalRate: 25 });
  });
  it("nothing closed: no rates, never a made-up zero", () => {
    expect(qualityFrom([])).toEqual({ closed: 0, medianCycleHours: null, firstPassRate: null, reworkRate: null, withdrawalRate: null });
  });
});

describe("B05 historyFrom", () => {
  const period = resolvePeriod({ key: "custom", from: "2026-10-01", to: "2026-10-03" }, "2026-10-03");
  const at = (iso: string) => new Date(`${iso}Z`);
  it("backlog and overdue at each day's end; breaches and decisions in their day", () => {
    const points = historyFrom({
      period,
      grain: "day",
      requests: [
        { submitted: at("2026-09-30T10:00:00"), closed: at("2026-10-02T09:00:00") },
        { submitted: at("2026-10-02T10:00:00"), closed: null },
      ],
      tasks: [
        { due: at("2026-10-01T12:00:00"), decided: at("2026-10-02T08:00:00") }, // late: breach on 1 Oct, overdue at end of 1 Oct
        { due: at("2026-10-02T12:00:00"), decided: at("2026-10-02T11:00:00") }, // in time
      ],
      decisions: [{ day: "2026-10-02", status: "APPROVED", total: 2 }, { day: "2026-10-03", status: "CHANGES_REQUESTED", total: 1 }],
      now: at("2026-10-03T23:00:00"),
    });
    expect(points.map((point) => point.backlog)).toEqual([1, 1, 1]);
    expect(points.map((point) => point.overdue)).toEqual([1, 0, 0]);
    expect(points.map((point) => point.breaches)).toEqual([1, 0, 0]);
    expect(points.map((point) => point.approved)).toEqual([0, 2, 0]);
    expect(points.map((point) => point.sentBack)).toEqual([0, 0, 1]);
  });
  it("heat steps", () => {
    expect([0, 1, 5, 10].map((value) => heatStep(value, 10))).toEqual([0, 1, 3, 5]);
    expect(heatStep(3, 0)).toBe(0);
  });
});

describe("B08 inQuietHours", () => {
  const india = (hour: number) => new Date(Date.UTC(2026, 9, 10, hour, 0) - 330 * 60_000);
  it("same-day and overnight windows; none when unset or equal", () => {
    expect(inQuietHours({ quietStart: 13, quietEnd: 15 }, india(14))).toBe(true);
    expect(inQuietHours({ quietStart: 13, quietEnd: 15 }, india(15))).toBe(false);
    expect(inQuietHours({ quietStart: 22, quietEnd: 7 }, india(23))).toBe(true);
    expect(inQuietHours({ quietStart: 22, quietEnd: 7 }, india(6))).toBe(true);
    expect(inQuietHours({ quietStart: 22, quietEnd: 7 }, india(12))).toBe(false);
    expect(inQuietHours({ quietStart: null, quietEnd: null }, india(12))).toBe(false);
    expect(inQuietHours({ quietStart: 5, quietEnd: 5 }, india(5))).toBe(false);
  });
});

describe("B01/B02 readFilter", () => {
  const period = resolvePeriod({ key: "30d" }, "2026-10-10");
  it("keeps only valid filters and carries them as address parameters", () => {
    const read = readFilter(
      { type: "7", department: "3", status: "APPROVED", approver: "12", step: "Finance", sla: "BREACHED", aging: "3to7d", compare: "LAST_YEAR" },
      { scope: { kind: "ORGANISATION", label: "Org" }, period, typeIds: [7], departmentIds: [3] },
    );
    expect(read.filter).toMatchObject({ workflowId: 7, departmentId: 3, status: "APPROVED", approverId: 12, step: "Finance", sla: "BREACHED", aging: "3to7d" });
    expect(read.compare).toBe("LAST_YEAR");
    expect(withParams("/users/analytics/list", read.carried, { kind: "open", step: null })).toBe("/users/analytics/list?scope=ORGANISATION&period=30d&type=7&department=3&status=APPROVED&approver=12&sla=BREACHED&aging=3to7d&compare=LAST_YEAR&kind=open");
  });
  it("drops unknown values; the department only counts in the organisation scope", () => {
    const read = readFilter({ type: "99", department: "3", status: "NOPE", approver: "x", sla: "SOON", aging: "old" }, { scope: { kind: "MINE", label: "Mine" }, period, typeIds: [7], departmentIds: [3] });
    expect(read.filter).toMatchObject({ workflowId: null, departmentId: null, status: null, approverId: null, sla: null, aging: null });
    expect(read.carried).toEqual({ scope: "MINE", period: "30d" });
  });
});
