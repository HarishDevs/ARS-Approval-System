import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { formDueDay } from "@/server/approvals/form-due";

// v1.53.0 (owner: "due date is given but not reflecting" on Waiting for me).
describe("a request's own due date from its form", () => {
  it("is the date field whose key or label says due", () => {
    expect(formDueDay([{ key: "due_date", label: "Due date", type: "DATE" }], { due_date: "2026-11-20" })).toBe("2026-11-20");
    expect(formDueDay([{ key: "f7", label: "Due date", type: "DATE" }], { f7: "2026-11-20" })).toBe("2026-11-20");
    expect(formDueDay(JSON.stringify([{ key: "due", label: "Deadline", type: "DATETIME" }]), JSON.stringify({ due: "2026-11-20T10:00" }))).toBe("2026-11-20");
  });
  it("ignores other dates, other types, empty values and confidential fields", () => {
    expect(formDueDay([{ key: "invoice_date", label: "Invoice date", type: "DATE" }], { invoice_date: "2026-11-20" })).toBeNull();
    expect(formDueDay([{ key: "due_note", label: "Due note", type: "TEXT" }], { due_note: "2026-11-20" })).toBeNull();
    expect(formDueDay([{ key: "due_date", label: "Due date", type: "DATE" }], { due_date: "" })).toBeNull();
    expect(formDueDay([{ key: "due_date", label: "Due date", type: "DATE", confidential: true }], { due_date: "2026-11-20" })).toBeNull();
    expect(formDueDay(null, null)).toBeNull();
  });
});
