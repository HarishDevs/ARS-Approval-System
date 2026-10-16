import { describe, expect, it } from "vitest";
import { agingBucket, countByBucket, median, percentChange, percentile, share, slaStatus } from "@/server/analytics/semantics";
import { bucketKey, buckets, grainFor, indiaToday, previousPeriod, resolvePeriod } from "@/server/analytics/periods";
import { ALL_METRICS as METRICS } from "@/server/analytics/metrics";
import fs from "node:fs";

// Addendum A §7 definitions, periods and the metric dictionary (pure).
const at = (iso: string) => new Date(iso);

describe("SLA status", () => {
  const created = at("2026-10-01T00:00:00Z");
  const due = at("2026-10-01T10:00:00Z");
  it("no response time is never overdue", () => {
    expect(slaStatus({ createdAt: created, dueAt: null, decidedAt: null }, at("2026-12-01T00:00:00Z"))).toBe("NOT_CONFIGURED");
  });
  it("within, approaching at 75 %, and passed", () => {
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: null }, at("2026-10-01T07:00:00Z"))).toBe("WITHIN");
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: null }, at("2026-10-01T07:30:00Z"))).toBe("APPROACHING");
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: null }, at("2026-10-01T10:00:01Z"))).toBe("BREACHED");
  });
  it("paused while on hold; decided in time or late", () => {
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: null, paused: true }, at("2026-10-02T00:00:00Z"))).toBe("PAUSED");
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: at("2026-10-01T10:00:00Z") }, at("2026-10-05T00:00:00Z"))).toBe("COMPLETED_WITHIN");
    expect(slaStatus({ createdAt: created, dueAt: due, decidedAt: at("2026-10-01T10:00:01Z") }, at("2026-10-05T00:00:00Z"))).toBe("COMPLETED_AFTER");
  });
});

describe("aging and statistics", () => {
  it("buckets by calendar hours at the edges", () => {
    expect([0, 23.9, 24, 47.9, 48, 167.9, 168, 335.9, 336, 719.9, 720, -5].map(agingBucket)).toEqual(["lt1d", "lt1d", "1to2d", "1to2d", "3to7d", "3to7d", "8to14d", "8to14d", "15to30d", "15to30d", "gt30d", "lt1d"]);
    expect(countByBucket([1, 2, 30, 1000])).toMatchObject({ lt1d: 2, "1to2d": 1, gt30d: 1 });
  });
  it("median, percentile, change and share", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 0)).toBeNull(); // no meaningful % from zero
    expect(share(1, 3)).toBe(33.3);
    expect(share(1, 0)).toBeNull();
  });
});

describe("periods (India time)", () => {
  it("today is the India date", () => {
    expect(indiaToday(at("2026-10-09T19:00:00Z"))).toBe("2026-10-10"); // 00:30 IST
  });
  it("presets, financial year and quarter", () => {
    expect(resolvePeriod({ key: "7d" }, "2026-10-10")).toMatchObject({ from: "2026-10-04", to: "2026-10-10" });
    expect(resolvePeriod({ key: "last_month" }, "2026-01-15")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod({ key: "this_fy" }, "2026-02-01")).toMatchObject({ from: "2025-04-01" });
    expect(resolvePeriod({ key: "last_fy" }, "2026-10-10")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(resolvePeriod({ key: "this_quarter" }, "2026-11-20")).toMatchObject({ from: "2026-10-01" });
    expect(resolvePeriod({ key: "nonsense" }, "2026-10-10").key).toBe("30d");
  });
  it("custom ranges are checked and capped at two years", () => {
    expect(resolvePeriod({ key: "custom", from: "2026-05-10", to: "2026-05-01" }, "2026-10-10")).toMatchObject({ from: "2026-05-10", to: "2026-05-10" });
    expect(resolvePeriod({ key: "custom", from: "2020-01-01", to: "2026-01-01" }, "2026-10-10").to).toBe("2021-12-31");
  });
  it("the previous period is equally long and just before", () => {
    expect(previousPeriod({ key: "custom", label: "", from: "2026-10-01", to: "2026-10-10" })).toMatchObject({ from: "2026-09-21", to: "2026-09-30" });
  });
  it("chart grain and buckets", () => {
    const month = resolvePeriod({ key: "30d" }, "2026-10-10");
    expect(grainFor(month)).toBe("day");
    expect(buckets(month, "day")).toHaveLength(30);
    expect(grainFor(resolvePeriod({ key: "90d" }, "2026-10-10"))).toBe("week");
    expect(bucketKey("2026-10-10", "week")).toBe("2026-10-05"); // Monday
    expect(grainFor(resolvePeriod({ key: "last_fy" }, "2026-10-10"))).toBe("month");
  });
});

describe("metric dictionary", () => {
  it("every metric is complete, unique, and in the document", () => {
    const keys = METRICS.map((metric) => metric.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const metric of METRICS) for (const field of ["name", "meaning", "formula", "includes", "excludes", "source"] as const) expect(metric[field].length, `${metric.key}.${field}`).toBeGreaterThan(2);
    const doc = fs.readFileSync("docs/ANALYTICS_METRIC_DICTIONARY.md", "utf8");
    for (const metric of METRICS) expect(doc, metric.key).toContain(`\`${metric.key}\``);
  });
});
