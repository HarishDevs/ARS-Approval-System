// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseQueueFilter, queueFilterSql, queueHref } from "@/server/approvals/queue-filters";
import { isTyping } from "@/features/shell/shortcuts";

describe("Waiting for me filters (WS-01)", () => {
  it("reads only known values, with safe defaults", () => {
    // v1.7.2 added more filters; all default to "not set".
    const none = { q: "", requesterId: null, departmentId: null, step: null, forWhom: null, dueWithinDays: null, hasFiles: null, raisedFrom: null, raisedTo: null, waitingFrom: null, waitingTo: null, size: 25 };
    expect(parseQueueFilter({})).toEqual({ show: "all", typeId: null, sort: "oldest", ...none });
    expect(parseQueueFilter({ show: "overdue", type: "12", sort: "due" })).toEqual({ show: "overdue", typeId: 12, sort: "due", ...none });
    expect(parseQueueFilter({ show: "DROP TABLE", type: "1 OR 1=1", sort: "x", raisedBy: "1 OR 1=1", files: "maybe", for: "everyone", size: "9999" })).toEqual({ show: "all", typeId: null, sort: "oldest", ...none });
  });

  it("builds conditions with parameters only, and the order", () => {
    const sql = queueFilterSql({ show: "work", typeId: 7, sort: "due" });
    expect(sql.where).toContain("t.task_type = 'WORK'");
    expect(sql.where).toContain("v.workflow_id = ?");
    expect(sql.params).toEqual([7]);
    expect(sql.orderBy).toBe("t.due_at IS NULL, t.due_at, t.id");
    expect(queueFilterSql({ show: "all", typeId: null, sort: "oldest" })).toEqual({ where: "", params: [], orderBy: "t.created_at, t.id" });
  });

  it("links leave defaults out", () => {
    expect(queueHref({ show: "all", typeId: null, sort: "oldest" })).toBe("/users/queue");
    expect(queueHref({ show: "overdue", typeId: 3, sort: "newest" }, 2)).toBe("/users/queue?show=overdue&type=3&sort=newest&page=2");
  });
});

describe("shortcuts never fire while typing (WS-02)", () => {
  it("text fields, text areas, selects and editable areas count as typing; buttons and checkboxes don't", () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild;
    };
    expect(isTyping(make('<input type="text">'))).toBe(true);
    expect(isTyping(make('<input type="search">'))).toBe(true);
    expect(isTyping(make("<textarea></textarea>"))).toBe(true);
    expect(isTyping(make("<select></select>"))).toBe(true);
    const editable = make("<div contenteditable='true'></div>") as HTMLElement;
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTyping(editable)).toBe(true);
    expect(isTyping(make('<input type="checkbox">'))).toBe(false);
    expect(isTyping(make("<button>Go</button>"))).toBe(false);
    expect(isTyping(make("<a href='/x'>x</a>"))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
