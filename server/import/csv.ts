// CSV for bulk import (S10-01, F-59). Pure; used on the server and in the
// browser (problem-list download). Reads what Excel writes: an optional
// UTF-8 BOM, CRLF or LF, quoted cells with "" escapes, and a comma or, in
// some regional settings, a semicolon between cells.
export const CSV_MIME = "text/csv; charset=utf-8";
const BOM = "﻿";

export interface ParsedCsv {
  header: string[];
  // Each data row with its line number in the file (header = line 1), so
  // problems can point at the row the person sees in Excel.
  rows: { line: number; cells: string[] }[];
}

export function detectDelimiter(firstLine: string): "," | ";" {
  const outsideQuotes = firstLine.replace(/"[^"]*"/g, "");
  const commas = (outsideQuotes.match(/,/g) ?? []).length;
  const semicolons = (outsideQuotes.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(text: string): ParsedCsv {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const delimiter = detectDelimiter(source.split(/\r?\n/, 1)[0] ?? "");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else if (char === "\r" && source[i + 1] === "\n") {
        // A line break inside a cell is kept as \n.
        continue;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) endCell();
    else if (char === "\r" && source[i + 1] === "\n") continue;
    else if (char === "\n" || char === "\r") {
      endRecord();
      line += 1;
      recordLine = line;
    } else cell += char;
  }
  if (cell !== "" || cells.length > 0) endRecord();

  // Blank lines (every cell empty) are ignored, wherever they are.
  const nonBlank = records.filter((record) => record.cells.some((value) => value.trim() !== ""));
  const [head, ...rows] = nonBlank;
  return { header: (head?.cells ?? []).map((name) => name.trim().toLowerCase()), rows };
}

// Excel runs a cell that starts with = + - @ (or a tab / CR) as a formula.
// Downloads prefix such cells with ' and the importer strips it again.
export function guardCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function unguardCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

function quoteCell(value: string): string {
  return /[",\r\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [header, ...rows].map((row) => row.map((value) => quoteCell(guardCell(value === null || value === undefined ? "" : String(value)))).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
