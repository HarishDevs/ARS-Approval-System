import { describe, expect, it } from "vitest";
import { eventKind, indiaDay, relativeTime } from "@/server/approvals/timeline";
import { diffRounds } from "@/server/approvals/revisions";
import { inlineHeaders, previewKind } from "@/server/attachments/files";
import type { FormField } from "@/server/forms/fields";

describe("timeline (RD-01)", () => {
  it("gives each event a kind for its icon", () => {
    expect(eventKind({ type: "TASK_DECIDED", decision: "REJECT" } as never)).toBe("reject");
    expect(eventKind({ type: "TASK_DECIDED", decision: "APPROVE" } as never)).toBe("approve");
    expect(eventKind({ type: "RESUBMITTED", round: 2 } as never)).toBe("resubmit");
    expect(eventKind({ type: "SOMETHING_NEW" } as never)).toBe("info");
  });

  it("says how long ago, and groups by the India day", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(relativeTime(new Date("2026-10-09T11:59:30Z"), now)).toBe("just now");
    expect(relativeTime(new Date("2026-10-09T10:00:00Z"), now)).toBe("2 h ago");
    expect(relativeTime(new Date("2026-10-08T11:00:00Z"), now)).toBe("yesterday");
    expect(relativeTime(new Date("2026-08-01T12:00:00Z"), now)).toBe("2 months ago");
    // 20:00 UTC is already the next day in India.
    expect(indiaDay(new Date("2026-10-09T20:00:00Z"))).toBe("2026-10-10");
  });
});

describe("what changed between rounds (RD-03)", () => {
  const form: FormField[] = [
    { key: "amount", label: "Amount", type: "NUMBER", required: true },
    { key: "vendor", label: "Vendor", type: "TEXT", required: false },
    { key: "note", label: "Note", type: "TEXT", required: false },
  ];
  const show = (_field: FormField, value: unknown) => (typeof value === "number" ? value.toLocaleString("en-IN") : String(value));

  it("lists changed, added and removed fields, and a new title", () => {
    const changes = diffRounds(form, { title: "Laptop", fields: { amount: 85000, vendor: "Dell" } }, { title: "Laptop (revised)", fields: { amount: 82000, note: "Two quotes" } }, show);
    expect(changes).toEqual([
      { key: "title", label: "Title", kind: "changed", before: "Laptop", after: "Laptop (revised)" },
      { key: "amount", label: "Amount", kind: "changed", before: "85,000", after: "82,000" },
      { key: "vendor", label: "Vendor", kind: "removed", before: "Dell", after: "" },
      { key: "note", label: "Note", kind: "added", before: "", after: "Two quotes" },
    ]);
  });

  it("no changes when only the stored form differs but the shown value is the same", () => {
    expect(diffRounds(form, { title: "x", fields: { amount: 1000, vendor: "" } }, { title: "x", fields: { amount: 1000, vendor: null } }, show)).toEqual([]);
  });
});

describe("file preview (RD-02)", () => {
  it("only images and PDFs can be shown inline; never SVG, HTML or office files", () => {
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/jpeg")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/svg+xml")).toBeNull();
    expect(previewKind("text/html")).toBeNull();
    expect(previewKind("text/plain")).toBeNull();
    expect(previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull();
  });

  it("inline answers are sandboxed and never sniffed", () => {
    const image = inlineHeaders("photo.png", "image/png", 10);
    expect(image["Content-Disposition"]).toMatch(/^inline;/);
    expect(image["Content-Security-Policy"]).toContain("sandbox");
    expect(image["X-Content-Type-Options"]).toBe("nosniff");
    expect(inlineHeaders('a"b\\c.pdf',"application/pdf", 1)["Content-Disposition"]).toContain('filename="a_b_c.pdf"');
  });
});
