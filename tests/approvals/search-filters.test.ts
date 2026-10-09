import { describe, expect, it } from "vitest";
import { likeEscape, parseSearchFilters, searchQuery } from "@/server/search/filters";

describe("search filters (#4)", () => {
  it("keeps only known values; bad input falls back safely", () => {
    const filters = parseSearchFilters({ q: "  laptop   for  ENG ", status: "APPROVED", role: "raised", type: "7", dept: "2", from: "2026-10-01", to: "2026-09-01", overdue: "1", sort: "due", page: "3" });
    expect(filters).toEqual({ q: "laptop for ENG", status: "APPROVED", role: "raised", typeId: 7, departmentId: 2, from: "2026-10-01", to: "2026-10-01", overdue: true, sort: "due", page: 3 });
    const bad = parseSearchFilters({ q: "x".repeat(500), status: "DROP TABLE", role: "boss", type: "1 OR 1=1", from: "yesterday", sort: "random", page: "-4" });
    expect(bad).toMatchObject({ status: null, role: "any", typeId: null, from: null, sort: "newest", page: 1 });
    expect(bad.q).toHaveLength(100);
  });

  it("round-trips to the address bar without defaults", () => {
    expect(searchQuery(parseSearchFilters({ q: "a", role: "any", sort: "newest", page: "1" }))).toEqual({ q: "a" });
  });

  it("LIKE wildcards in what people type match themselves", () => {
    expect(likeEscape("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
