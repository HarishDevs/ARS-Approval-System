import { describe, expect, it } from "vitest";
import { buildWorkbook } from "@/server/import/xlsx";
import { readXlsxRows, rowsToCsvText, XlsxError } from "@/server/import/xlsx-read";
import { parseCsv } from "@/server/import/csv";
import { zip } from "@/server/reports/export";

// v1.49.1 (owner: "instead of CSV give an Excel file, any format accepted,
// and the template in Excel"): the workbook writer and the upload reader.
const enc = (text: string) => new TextEncoder().encode(text);

// What Excel itself writes: deflated parts, shared strings, numbers, a date
// style, TRUE/FALSE, a gap column and trailing empty rows.
function excelLikeWorkbook(): Uint8Array {
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" s="0"/></row>
    <row r="2"><c r="A2"><v>6299</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>917539978834</v></c><c r="D2" t="b"><v>1</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>ED</t></is></c><c r="C3" s="1"><v>46048</v></c><c r="D3" t="b"><v>0</v></c></row>
    <row r="4"><c r="A4" s="0"/></row>
  </sheetData></worksheet>`;
  const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>login_id</t></si><si><t>name</t></si><si><t>date</t></si><si><t>active</t></si><si><r><t>HR &amp; </t></r><r><t xml:space="preserve">Admin</t></r><rPh><t>x</t></rPh></si></sst>`;
  const styles = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  return zip([
    { name: "xl/workbook.xml", data: enc(`<workbook xmlns:r="r"><sheets><sheet name="Data" sheetId="1" r:id="rId7"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(`<Relationships><Relationship Id="rId7" Type="worksheet" Target="/xl/worksheets/data.xml"/></Relationships>`) },
    { name: "xl/worksheets/data.xml", data: enc(sheet) },
    { name: "xl/sharedStrings.xml", data: enc(shared) },
    { name: "xl/styles.xml", data: enc(styles) },
  ]);
}

describe("Excel import files", () => {
  it("reads what Excel writes: shared text, numbers as typed, dates, TRUE/FALSE, gaps", () => {
    expect(readXlsxRows(excelLikeWorkbook())).toEqual([
      ["login_id", "name", "date", "active"],
      ["6299", "HR & Admin", "917539978834", "Yes"],
      ["ED", "", "2026-01-26", "No"],
    ]);
  });

  it("reads back its own template and data workbooks, through to the importer's CSV", () => {
    const book = buildWorkbook([
      { name: "Users", header: ["login_id", "name", "whatsapp_number"], rows: [["0042", 'Ravi "R" Kumar, Jr', "917000000001"], ["ED", "ED", null]] },
      { name: "How to fill", header: ["column"], rows: [["login_id"]] },
    ]);
    const rows = readXlsxRows(book);
    expect(rows).toEqual([
      ["login_id", "name", "whatsapp_number"],
      ["0042", 'Ravi "R" Kumar, Jr', "917000000001"],
      ["ED", "ED", ""],
    ]);
    const parsed = parseCsv(rowsToCsvText(rows));
    expect(parsed.header).toEqual(["login_id", "name", "whatsapp_number"]);
    expect(parsed.rows[0]!.cells).toEqual(["0042", 'Ravi "R" Kumar, Jr', "917000000001"]);
  });

  it("refuses a file that isn't a workbook", () => {
    expect(() => readXlsxRows(enc("login_id,name"))).toThrow(XlsxError);
  });
});
