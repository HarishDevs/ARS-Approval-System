import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { crc32, reportCsv, reportPdf, reportXlsx, zip } from "@/server/reports/export";
import type { ReportResult } from "@/server/reports/catalogue";

// Report exports (Addendum A §10): CSV guard, a readable XLSX zip, a paged PDF.
const result: ReportResult = {
  columns: [
    { key: "no", label: "Request", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "hours", label: "Hours", kind: "hours" },
    { key: "raised", label: "Raised", kind: "datetime" },
  ],
  rows: [
    ["PUR-2026-000001", "=HYPERLINK(\"http://evil\")", 12.345, "2026-10-01T06:30:00.000Z"],
    ["PUR-2026-000002", "Motor & <gearbox> ₹5,000", null, null],
  ],
  truncated: false,
};
const meta = { title: "Request register", scopeLabel: "Whole organisation", periodLabel: "Last 30 days", generatedAt: new Date("2026-10-10T04:00:00Z"), generatedBy: "Test" };

function unzip(data: Uint8Array): Record<string, string> {
  const buffer = Buffer.from(data);
  const out: Record<string, string> = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength;
    const content = inflateRawSync(buffer.subarray(start, start + compressedSize));
    expect(crc32(content)).toBe(buffer.readUInt32LE(offset + 14));
    out[name] = content.toString("utf8");
    offset = start + compressedSize;
  }
  return out;
}

describe("exports", () => {
  it("CRC-32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("CSV neutralises formulas and shows times in India time", () => {
    const csv = reportCsv(result);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("01 Oct 2026");
  });

  it("XLSX is a valid zip; text is never a formula; numbers stay numbers; XML is escaped", () => {
    const files = unzip(reportXlsx(result, meta));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]));
    const sheet = files["xl/worksheets/sheet1.xml"]!;
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://evil&quot;)</t>');
    expect(sheet).toContain("<v>12.345</v>");
    expect(sheet).toContain("Motor &amp; &lt;gearbox&gt; ₹5,000");
    expect(zip([{ name: "a.txt", data: new Uint8Array([1, 2, 3]) }])[0]).toBe(0x50);
  });

  it("PDF pages a long report with a header on each page", async () => {
    const many: ReportResult = { ...result, rows: Array.from({ length: 120 }, (_, index) => [`PUR-${index}`, `Item ${index}`, index, null]) };
    const pdf = await reportPdf(many, meta);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
  });
});
