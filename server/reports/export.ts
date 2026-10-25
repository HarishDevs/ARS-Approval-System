import { deflateRawSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { toCsv } from "@/server/import/csv";
import { printable } from "@/server/pdf/request-summary";
import type { Cell, Column, ReportResult } from "@/server/reports/catalogue";

// Report exports (Addendum A §10, D-123): the same rows as the screen.
// CSV goes through the formula guard (D-QA); XLSX writes every text as an
// inline string, so nothing is ever read as a formula; PDF is a paged table.
export type ExportFormat = "csv" | "xlsx" | "pdf";
export const CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export interface ExportMeta {
  title: string;
  scopeLabel: string;
  periodLabel: string | null;
  generatedAt: Date;
  generatedBy: string;
}

const IST = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

function display(cell: Cell, column: Column): string {
  if (cell === null || cell === "") return "";
  if (column.kind === "datetime" && typeof cell === "string") return IST(cell);
  if (column.kind === "date" && typeof cell === "string") return cell.slice(0, 10);
  if (typeof cell === "number") return column.kind === "percent" || column.kind === "hours" ? cell.toFixed(1) : cell.toLocaleString("en-IN");
  return String(cell);
}

export function reportCsv(result: ReportResult): string {
  return toCsv(
    result.columns.map((column) => column.label),
    result.rows.map((row) => row.map((cell, index) => (typeof cell === "number" ? cell : display(cell, result.columns[index]!)))),
  );
}

// ---- XLSX: a minimal Office Open XML workbook in a ZIP --------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + compressed.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, ...central, end]));
}

// XML 1.0 can't carry most control characters; drop them.
const xml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function reportXlsx(result: ReportResult, meta: ExportMeta): Uint8Array {
  const enc = (text: string) => new TextEncoder().encode(text);
  const textCell = (ref: string, text: string, style = 0) => `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  const rows: string[] = [];
  const info = [meta.title, `${meta.scopeLabel}${meta.periodLabel ? ` · ${meta.periodLabel}` : ""}`, `Generated ${IST(meta.generatedAt.toISOString())} (India time) by ${meta.generatedBy}`];
  info.forEach((line, index) => rows.push(`<row r="${index + 1}">${textCell(`A${index + 1}`, line, index === 0 ? 1 : 0)}</row>`));
  const headerRow = info.length + 2;
  rows.push(`<row r="${headerRow}">${result.columns.map((column, index) => textCell(`${columnName(index)}${headerRow}`, column.label, 1)).join("")}</row>`);
  result.rows.forEach((row, rowIndex) => {
    const r = headerRow + 1 + rowIndex;
    const cells = row
      .map((cell, index) => {
        const ref = `${columnName(index)}${r}`;
        if (cell === null || cell === "") return "";
        if (typeof cell === "number" && Number.isFinite(cell)) return `<c r="${ref}"><v>${cell}</v></c>`;
        return textCell(ref, display(cell, result.columns[index]!));
      })
      .join("");
    rows.push(`<row r="${r}">${cells}</row>`);
  });
  if (result.truncated) rows.push(`<row r="${headerRow + result.rows.length + 2}">${textCell(`A${headerRow + result.rows.length + 2}`, `Only the first ${result.rows.length} rows are included. Narrow the filters for the rest.`)}</row>`);
  const widths = result.columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.kind === "text" ? 28 : 16}" customWidth="1"/>`).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
  return zip([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheet) },
  ]);
}

// ---- PDF: landscape A4, header on each page, page x of y ------------------------
function fit(text: string, font: PDFFont, size: number, width: number): string {
  let out = printable(text);
  if (font.widthOfTextAtSize(out, size) <= width) return out;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > width) out = out.slice(0, -1);
  return `${out}...`;
}

export async function reportPdf(result: ReportResult, meta: ExportMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(printable(meta.title));
  doc.setCreator("ARS-CMS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = [841.89, 595.28];
  const margin = 36;
  const size = 8;
  const rowHeight = 14;
  const usable = width - margin * 2;
  // Text columns get twice the room of number columns.
  const weights = result.columns.map((column) => (column.kind === "text" ? 2 : 1));
  const unit = usable / weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((weight) => weight * unit);
  const pages: ReturnType<typeof doc.addPage>[] = [];
  let page = doc.addPage([width, height]);
  pages.push(page);
  let y = height - margin;
  const header = () => {
    page.drawText(fit(meta.title, bold, 14, usable), { x: margin, y: y - 14, size: 14, font: bold });
    page.drawText(fit(`${meta.scopeLabel}${meta.periodLabel ? ` · ${meta.periodLabel}` : ""} · generated ${IST(meta.generatedAt.toISOString())} (India time) by ${meta.generatedBy}`, regular, 9, usable), { x: margin, y: y - 30, size: 9, font: regular, color: rgb(0.35, 0.4, 0.47) });
    y -= 48;
    let x = margin;
    result.columns.forEach((column, index) => {
      page.drawText(fit(column.label, bold, size, widths[index]! - 4), { x, y: y - size, size, font: bold });
      x += widths[index]!;
    });
    y -= rowHeight;
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 }, thickness: 0.5, color: rgb(0.8, 0.83, 0.87) });
  };
  header();
  if (!result.rows.length) page.drawText("No rows for these filters.", { x: margin, y: y - size, size: 9, font: regular });
  for (const row of result.rows) {
    if (y < margin + rowHeight + 12) {
      page = doc.addPage([width, height]);
      pages.push(page);
      y = height - margin;
      header();
    }
    let x = margin;
    row.forEach((cell, index) => {
      const column = result.columns[index]!;
      const text = fit(display(cell, column), regular, size, widths[index]! - 4);
      const right = column.kind !== "text" && column.kind !== "datetime" && column.kind !== "date";
      page.drawText(text, { x: right ? x + widths[index]! - 4 - regular.widthOfTextAtSize(text, size) : x, y: y - size, size, font: regular });
      x += widths[index]!;
    });
    y -= rowHeight;
  }
  if (result.truncated) page.drawText(`Only the first ${result.rows.length} rows are included. Narrow the filters for the rest.`, { x: margin, y: Math.max(margin, y - 12), size: 8, font: regular });
  pages.forEach((item, index) => item.drawText(`Page ${index + 1} of ${pages.length}`, { x: width - margin - 60, y: margin / 2, size: 8, font: regular, color: rgb(0.35, 0.4, 0.47) }));
  return doc.save();
}

export async function exportReport(format: ExportFormat, result: ReportResult, meta: ExportMeta): Promise<Uint8Array | string> {
  if (format === "csv") return reportCsv(result);
  if (format === "xlsx") return reportXlsx(result, meta);
  return reportPdf(result, meta);
}

export const fileName = (key: string, format: ExportFormat, at: Date) => `ars-${key.replace(/_/g, "-")}-${at.toISOString().slice(0, 10)}.${format}`;
