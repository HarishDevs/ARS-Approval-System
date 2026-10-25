import { describe, expect, it } from "vitest";
import { indiaDayStartUtc, readRecordFilter, recordQuery } from "@/server/records/filters";
import { REQUEST_COLUMNS, TASK_COLUMNS, INFO_COLUMNS } from "@/server/records/columns";
import { SORTS } from "@/server/records/filters";

// D-191: the Admin registers read their filters from the address.
describe("records filters", () => {
  it("keeps only known values; everything else is ignored", () => {
    const filter = readRecordFilter("requests", { q: "  PUR-2026 ", status: "APPROVED", type: "12", department: "x", person: "7", waiting: "9", priority: "URGENT", sort: "title", dir: "asc", page: "3", from: "2026-10-01", to: "2026-10-31" });
    expect(filter).toMatchObject({ q: "PUR-2026", status: "APPROVED", type: 12, department: null, person: 7, waitingOn: 9, priority: "", sort: "title", dir: "asc", page: 3, from: "2026-10-01", to: "2026-10-31" });
    const bad = readRecordFilter("tasks", { status: "DROP TABLE", sort: "password", dir: "sideways", page: "-4", from: "01/10/2026", priority: "HIGH", overdue: "1", waiting: "5" });
    expect(bad).toMatchObject({ status: "", sort: "no", dir: "desc", page: 1, from: null, priority: "HIGH", overdue: true, waitingOn: null });
    expect(readRecordFilter("information", { status: "PUBLISHED", priority: "IMPORTANT", overdue: "1" })).toMatchObject({ status: "PUBLISHED", priority: "IMPORTANT", overdue: false });
  });
  it("a 'to' date before 'from' is moved up to it", () => {
    expect(readRecordFilter("tasks", { from: "2026-10-10", to: "2026-10-01" }).to).toBe("2026-10-10");
  });
  it("links keep the filters and drop the defaults", () => {
    const filter = readRecordFilter("requests", { q: "laptop", status: "IN_PROGRESS", page: "2" });
    expect(recordQuery(filter)).toBe("?q=laptop&status=IN_PROGRESS&page=2");
    expect(recordQuery(filter, { page: null, sort: "submitted", dir: "asc" })).toBe("?q=laptop&status=IN_PROGRESS&sort=submitted&dir=asc");
  });
  it("India dates start at 18:30 UTC the day before", () => {
    expect(indiaDayStartUtc("2026-10-25").toISOString()).toBe("2026-10-24T18:30:00.000Z");
  });
  it("every sortable column has a sort expression", () => {
    for (const [kind, columns] of [["requests", REQUEST_COLUMNS], ["tasks", TASK_COLUMNS], ["information", INFO_COLUMNS]] as const)
      for (const column of columns) if (column.sort) expect(SORTS[kind][column.sort], `${kind}.${column.key}`).toBeDefined();
  });
});
