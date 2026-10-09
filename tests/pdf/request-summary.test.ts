import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildRequestSummaryPdf, printable, wrap } from "@/server/pdf/request-summary";

describe("request summary PDF (#10)", () => {
  it("replaces characters the built-in font can't draw", () => {
    expect(printable("₹ 5,000 – “ok” → done…")).toBe('Rs. 5,000 - "ok" -> done...');
    expect(printable("नमस्ते Asha")).toBe("?????? Asha");
  });

  it("wraps long text, cutting a word too long for a line", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const lines = wrap(`short words ${"x".repeat(200)}`, font, 10, 120);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(120);
  });

  it("builds a valid PDF across pages", async () => {
    const bytes = await buildRequestSummaryPdf({
      requestNo: "PUR-2026-000123",
      title: "Crane motor ₹ 2,40,000",
      workflowName: "Purchase",
      statusLabel: "In progress",
      requesterName: "Asha",
      progress: "Level 2 of 3",
      fields: [{ label: "Amount", value: "₹ 2,40,000" }],
      stages: [{ kind: "STEP", label: "HOD", steps: [{ nodeId: "a", label: "HOD", status: "APPROVED", rule: "All must approve", people: [{ userId: 1, name: "Ravi", status: "APPROVED", comment: "Fine", decidedAt: "09 Oct 2026, 10:00" }] }] }],
      timeline: Array.from({ length: 120 }, (_, index) => ({ at: "09 Oct 2026", text: `Event ${index}` })),
      attachments: [{ name: "quote.pdf", size: "120 KB" }],
      generatedAt: "09 Oct 2026, 12:00",
      generatedBy: "Asha",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });
});
