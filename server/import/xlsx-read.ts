import { inflateRawSync } from "node:zlib";

// v1.49.1 (owner: "an Excel file with any format accepted"): reads the first
// sheet of an .xlsx/.xlsm upload into rows of text, the same as a CSV would
// give. Numbers come back as typed (917539978834, not 9.17E+11), dates as
// YYYY-MM-DD, TRUE/FALSE as Yes/No; fully empty rows are dropped.

export class XlsxError extends Error {}

function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new XlsxError("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new XlsxError("bad directory");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(raw)));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decodeXml = (text: string) =>
  text
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

// The text of an <si> or <is>: every <t> run, without phonetic hints.
const runText = (fragment: string) =>
  [...fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? "")).join("");

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];

const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function dateStyles(stylesXml: string | undefined): Set<number> {
  const dates = new Set<number>();
  if (!stylesXml) return dates;
  const custom = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(match[1] ?? "", "numFmtId"));
    const code = decodeXml(attr(match[1] ?? "", "formatCode") ?? "");
    custom.set(id, code);
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  [...cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)].forEach((match, index) => {
    const id = Number(attr(match[1] ?? "", "numFmtId") ?? 0);
    const code = custom.get(id);
    const looksLikeDate = code !== undefined ? /[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"|\\./g, "")) && !/^general$/i.test(code) : BUILT_IN_DATES.has(id);
    if (looksLikeDate) dates.add(index);
  });
  return dates;
}

function serialToDate(serial: number): string {
  // Excel's 1900 date system (with its 29 Feb 1900), the usual one.
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

function numberText(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return BigInt(value).toString();
  return String(Number(value.toPrecision(15)));
}

const columnIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
};

export function readXlsxRows(bytes: Uint8Array): string[][] {
  let files: Map<string, Uint8Array>;
  try {
    files = unzip(bytes);
  } catch (error) {
    throw error instanceof XlsxError ? error : new XlsxError("unreadable");
  }
  const text = (name: string) => {
    const data = files.get(name);
    return data ? new TextDecoder().decode(data) : undefined;
  };
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxError("no workbook");
  const firstSheet = /<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? "";
  const relId = attr(firstSheet, "r:id");
  const rels = text("xl/_rels/workbook.xml.rels") ?? "";
  let target = "worksheets/sheet1.xml";
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) if (attr(match[1] ?? "", "Id") === relId) target = attr(match[1] ?? "", "Target") ?? target;
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = text(sheetPath);
  if (!sheet) throw new XlsxError("no sheet");
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => runText(match[1] ?? ""));
  const dates = dateStyles(text("xl/styles.xml"));

  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowMatch[1] ?? "", "r") ?? rows.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = attr(attrs, "r");
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const type = attr(attrs, "t");
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = runText(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "str") value = decodeXml(raw ?? "");
      else if (type === "b") value = raw === "1" ? "Yes" : "No";
      else if (type === "e") value = "";
      else if (raw !== undefined) value = dates.has(Number(attr(attrs, "s") ?? 0)) ? serialToDate(Number(raw)) : numberText(raw);
      cells[index] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows.push(Array.from(cells, (value) => value ?? ""));
  }
  // The header's width (blank header cells at the end, which formatted
  // sheets often have, don't count); data past it is kept only if filled.
  const header = rows[0] ?? [];
  let width = header.length;
  while (width > 0 && !header[width - 1]?.trim()) width -= 1;
  return rows
    .filter((row, index) => index === 0 || row.some((value) => value.trim() !== ""))
    .map((row) => {
      let length = Math.max(width, row.length);
      while (length > width && !row[length - 1]?.trim()) length -= 1;
      return Array.from({ length }, (_, index) => row[index] ?? "");
    });
}

// The rows as CSV text for the importer (every cell quoted, nothing guarded).
export function rowsToCsvText(rows: string[][]): string {
  return rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
