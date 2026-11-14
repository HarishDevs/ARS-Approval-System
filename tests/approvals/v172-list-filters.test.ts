import { describe, expect, it } from "vitest";
import { activeCount, listFilterSql, listHref, listQuery, parseListFilters } from "@/server/requests/list-filters";
import { parseQueueFilter, queueFilterSql, queueFiltered, queueHref } from "@/server/approvals/queue-filters";

// v1.7.2: the filters for My requests, Collaborating and Waiting for me.
describe("parseListFilters", () => {
  it("reads every filter, several statuses, and keeps only valid values", () => {
    const f = parseListFilters(
      {
        tab: "open",
        q: "  pump   motor ",
        status: ["APPROVED", "REJECTED,NOPE"],
        type: "7",
        raisedBy: "12",
        dept: "3",
        addedBy: "9",
        step: "Finance",
        waitingWith: "21",
        overdue: "1",
        due: "7",
        files: "yes",
        validity: "expired",
        raisedFrom: "2026-10-31",
        raisedTo: "2026-10-01",
        addedFrom: "2026-09-01",
        closedTo: "2026-10-10",
        activityFrom: "bad",
        sort: "added",
        size: "50",
        page: "3",
      },
      "COLLAB",
    );
    expect(f).toMatchObject({ tab: "open", q: "pump motor", statuses: ["APPROVED", "REJECTED"], typeId: 7, requesterId: 12, departmentId: 3, addedById: 9, step: "Finance", waitingWithId: 21, overdue: true, dueWithinDays: 7, hasFiles: true, validity: "expired", raisedFrom: "2026-10-01", raisedTo: "2026-10-31", addedFrom: "2026-09-01", closedTo: "2026-10-10", activityFrom: null, sort: "added", size: 50, page: 3 });
    expect(activeCount(f)).toBe(15);
  });

  it("collaboration-only filters are ignored on My requests; junk falls back to defaults", () => {
    const f = parseListFilters({ raisedBy: "12", dept: "3", addedBy: "9", addedFrom: "2026-01-01", sort: "added", size: "1000", tab: "everything", due: "500", type: "-5", page: "-2" }, "MINE");
    expect(f).toMatchObject({ requesterId: null, departmentId: null, addedById: null, addedFrom: null, sort: "newest", size: 25, tab: "all", dueWithinDays: null, typeId: null, page: 1 });
    expect(parseListFilters({ type: "-1" }, "MINE").typeId).toBe(-1); // custom approvals
  });

  it("round-trips through the address bar", () => {
    const f = parseListFilters({ status: "APPROVED,ON_HOLD", files: "no", q: "x", raisedFrom: "2026-01-01" }, "COLLAB");
    const again = parseListFilters(listQuery(f), "COLLAB");
    expect(again).toEqual(f);
    expect(listHref("/users/collaborating", f, { q: "", page: 2 })).toBe("/users/collaborating?status=APPROVED%2CON_HOLD&files=no&raisedFrom=2026-01-01&page=2");
  });
});

describe("listFilterSql", () => {
  it("binds every value; collaboration conditions only on Collaborating", () => {
    const f = parseListFilters({ tab: "open", status: "IN_PROGRESS", q: "50%_off", raisedBy: "4", addedBy: "5", step: "HOD", due: "3", files: "yes", sort: "added" }, "COLLAB");
    const sql = listFilterSql(f, "COLLAB");
    expect(sql.params).toEqual([["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"], ["IN_PROGRESS"], "%50\\%\\_off%", "%50\\%\\_off%", "%50\\%\\_off%", "%50\\%\\_off%", "%50\\%\\_off%", 4, 5, "HOD", 3]);
    expect(sql.where.join(" ")).not.toContain("50%");
    expect(sql.orderBy).toContain("k.added_at");
    const mine = listFilterSql(parseListFilters({ raisedBy: "4" }, "MINE"), "MINE");
    expect(mine.where).toEqual([]);
  });
});

describe("Waiting for me filters (v1.7.2)", () => {
  it("parse, filter flag, SQL with the person's id, and the address", () => {
    const f = parseQueueFilter({ q: "crane", raisedBy: "4", dept: "2", step: "MD", for: "covering", due: "3", files: "no", raisedFrom: "2026-10-05", raisedTo: "2026-10-01", waitingFrom: "2026-10-02", size: "100", sort: "number" });
    expect(f).toMatchObject({ q: "crane", requesterId: 4, departmentId: 2, step: "MD", forWhom: "covering", dueWithinDays: 3, hasFiles: false, raisedFrom: "2026-10-01", raisedTo: "2026-10-05", waitingFrom: "2026-10-02", size: 100, sort: "number" });
    expect(queueFiltered(f)).toBe(true);
    expect(queueFiltered(parseQueueFilter({ sort: "due", size: "50" }))).toBe(false);
    const sql = queueFilterSql(f, 77);
    expect(sql.params).toEqual(["%crane%", "%crane%", "%crane%", 4, 2, "MD", 77, 3, "2026-10-01", "2026-10-05", "2026-10-02"]);
    expect(sql.where).toContain("t.approver_id <> ?");
    expect(queueHref(f)).toBe("/users/queue?q=crane&raisedBy=4&dept=2&step=MD&for=covering&due=3&files=no&raisedFrom=2026-10-01&raisedTo=2026-10-05&waitingFrom=2026-10-02&sort=number&size=100");
    expect(parseQueueFilter(Object.fromEntries(new URLSearchParams(queueHref(f).split("?")[1])))).toEqual(f);
  });
});

// v1.54.16 (owner): Group by Department and by any form field.
import { fieldGroupId, groupOrder } from "@/server/requests/list-groups";
describe("v1.54.16 groups", () => {
  it("parses Department on lists with people, and form-field groups anywhere; drops anything else", () => {
    expect(parseListFilters({ group: "dept" }, "APPROVED_BY_ME").group).toBe("dept");
    expect(parseListFilters({ group: "dept" }, "MINE").group).toBeNull();
    expect(parseListFilters({ group: "f:vendor_name" }, "MINE").group).toBe("f:vendor_name");
    for (const bad of ["f:", "f:Vendor", "f:a b", "f:x;drop", "field"]) expect(parseListFilters({ group: bad }, "MINE").group).toBeNull();
  });
  it("matches fields by label and keeps empty groups last", () => {
    expect(fieldGroupId("Vendor name")).toBe("f:vendor_name");
    expect(fieldGroupId("  PO No. / Ref ")).toBe("f:po_no_ref");
    expect(fieldGroupId("***")).toBeNull();
    expect(["No value", "Zeta", "Alpha", "Hidden"].sort(groupOrder)).toEqual(["Alpha", "Zeta", "Hidden", "No value"]);
  });
});
