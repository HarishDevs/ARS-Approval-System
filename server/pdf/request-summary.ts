import { APP_BRANDING } from "@/lib/branding";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { flatSteps, type MapStage } from "@/server/approvals/step-map";
import { isOptionColor, OPTION_COLOR_SWATCH } from "@/server/forms/option-colors";

// #10 PDF summary of a request. v1.50.0 (owner: "for PDF download I want the
// exact format as the approval screen"): laid out like the request page: the
// ARS header, the title with its status and priority pills, then the same
// cards in the same order (Request details as label/value pairs, Approval
// levels, Work tasks, Linked requests, Attachments, History). Built from the
// same view the request page shows (so the same access check applies).
// pdf-lib's built-in Helvetica covers English; anything it can't draw (₹,
// Hindi) is written as a plain stand-in rather than failing.
export interface SummaryInput {
  requestNo: string;
  title: string;
  workflowName: string;
  statusLabel: string;
  statusKey?: string; // IN_PROGRESS, APPROVED… (the pill's colour)
  requesterName: string;
  progress: string;
  priority?: { label: string; color: string | null } | null; // v1.47.0: the Priority field (pill in the option's colour)
  requester?: { loginId?: string | null; department?: string | null; designation?: string | null; email?: string | null; manager?: string | null } | null;
  raisedOn?: string | null;
  fields: { label: string; value: string }[];
  stages: MapStage[];
  tasks?: { taskNo: string; title: string; assignee: string; due: string | null; status: string }[];
  links?: { requestNo: string; title: string; status: string; relation: string }[];
  timeline: { at: string; text: string }[];
  attachments: { name: string; size: string }[];
  logo?: Uint8Array | null; // PNG
  generatedAt: string;
  generatedBy: string;
}

const STEP_LABEL: Record<string, string> = {
  WAITING: "Not started",
  ACTIVE: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  BLOCKED: "Blocked",
  CANCELLED: "Not needed",
};
const PERSON_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHANGES_REQUESTED: "Asked for changes",
  NOT_REQUIRED: "Not needed",
  CANCELLED: "Closed",
  TOLD: "Informed",
};

// Characters Helvetica (WinAnsi) can draw; the rest become a close stand-in.
export function printable(text: string): string {
  return text
    .replace(/₹/g, "Rs.")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[→]/g, "->")
    .replace(/\t/g, " ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF·•]/g, "?");
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single very long word is cut to fit.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const hex = (value: string): RGB => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;
const INK = hex("#1F2937");
const MUTED = hex("#6B7280");
const LINE = hex("#E3E8EF");
const BRAND = hex("#0A72D9");
const NAVY = hex("#004B8D");
const SECTION_BG = hex("#EAF3FF");
const WHITE = rgb(1, 1, 1);
// The status pills, as on the screen.
const PILL: Record<string, { bg: string; fg: string }> = {
  IN_PROGRESS: { bg: "#DBEAFE", fg: "#1D4ED8" },
  ON_HOLD: { bg: "#FEF3C7", fg: "#B45309" },
  CHANGES_REQUIRED: { bg: "#FEF3C7", fg: "#B45309" },
  APPROVED: { bg: "#DCFCE7", fg: "#15803D" },
  REJECTED: { bg: "#FEE2E2", fg: "#B91C1C" },
  CANCELLED: { bg: "#EDE9FE", fg: "#6D28D9" },
  EXPIRED: { bg: "#FEE2E2", fg: "#B91C1C" },
};
const STEP_TONE: Record<string, string> = { APPROVED: "#15803D", REJECTED: "#B91C1C", ACTIVE: "#1D4ED8", BLOCKED: "#B45309" };

export async function buildRequestSummaryPdf(input: SummaryInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(printable(`${input.requestNo} - ${input.title}`));
  doc.setAuthor(APP_BRANDING.appName);
  doc.setCreator(APP_BRANDING.appName);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (input.logo) logo = await doc.embedPng(input.logo).catch(() => null);
  const width = A4[0] - MARGIN * 2;
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 18) newPage();
  };
  const draw = (value: string, x: number, size: number, font: PDFFont, color: RGB = INK) => page.drawText(printable(value), { x, y: y - size, size, font, color });
  const pill = (label: string, x: number, colors: { bg: string; fg: string }, size = 8.5) => {
    const textWidth = bold.widthOfTextAtSize(printable(label), size);
    page.drawRectangle({ x, y: y - size - 4, width: textWidth + 14, height: size + 7, color: hex(colors.bg), borderColor: hex(colors.bg), borderWidth: 0.5 });
    page.drawText(printable(label), { x: x + 7, y: y - size - 1, size, font: bold, color: hex(colors.fg) });
    return textWidth + 14;
  };

  // ---- the header bar, like the app's top bar --------------------------------
  if (logo) {
    const height = 38;
    page.drawImage(logo, { x: MARGIN, y: y - height, width: (logo.width / logo.height) * height, height });
  } else draw(APP_BRANDING.appName, MARGIN, 14, bold, NAVY);
  const label = "Request summary";
  page.drawText(label, { x: A4[0] - MARGIN - bold.widthOfTextAtSize(label, 10), y: y - 11, size: 10, font: bold, color: NAVY });
  const when = printable(`${input.generatedAt} (India time)`);
  page.drawText(when, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(when, 7.5), y: y - 23, size: 7.5, font: regular, color: MUTED });
  y -= logo ? 44 : 34;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1.5, color: BRAND });
  y -= 16;

  // ---- title, pills and the meta line ----------------------------------------
  for (const line of wrap(input.title, bold, 17, width)) {
    ensure(22);
    draw(line, MARGIN, 17, bold, NAVY);
    y -= 22;
  }
  y -= 4;
  ensure(18);
  let x = MARGIN;
  x += pill(input.statusLabel, x, PILL[input.statusKey ?? ""] ?? { bg: "#EEF2F6", fg: "#374151" }) + 6;
  if (input.priority) {
    const swatch = isOptionColor(input.priority.color) ? OPTION_COLOR_SWATCH[input.priority.color].light : null;
    pill(input.priority.label, x, swatch ? { bg: swatch.bg, fg: swatch.fg } : { bg: "#EEF2F6", fg: "#374151" });
  }
  y -= 20;
  for (const line of wrap(`${input.requestNo} · ${input.workflowName} · raised by ${input.requesterName}`, regular, 9.5, width)) {
    ensure(13);
    draw(line, MARGIN, 9.5, regular, MUTED);
    y -= 13;
  }
  y -= 4;
  // The journey line: where it is now.
  ensure(26);
  page.drawRectangle({ x: MARGIN, y: y - 22, width, height: 22, color: hex("#0F1B2D") });
  page.drawText(printable(`Approval journey · ${input.progress}`), { x: MARGIN + 10, y: y - 15, size: 9, font: bold, color: WHITE });
  y -= 34;

  // ---- cards -----------------------------------------------------------------
  const section = (title: string) => {
    y -= 6;
    ensure(48);
    page.drawRectangle({ x: MARGIN, y: y - 20, width, height: 20, color: SECTION_BG });
    page.drawText(title.toUpperCase(), { x: MARGIN + 10, y: y - 14, size: 9, font: bold, color: NAVY });
    y -= 26;
  };
  const rule = () => page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: A4[0] - MARGIN, y: y + 3 }, thickness: 0.5, color: LINE });

  // Two label/value pairs per row, like the screen's grid.
  const pairs = (rows: { label: string; value: string }[]) => {
    const column = (width - 12) / 2;
    const labelWidth = 92;
    const valueWidth = column - labelWidth - 6;
    for (let index = 0; index < rows.length; index += 2) {
      const cells = rows.slice(index, index + 2).map((row) => ({ label: wrap(row.label, regular, 8.5, labelWidth), value: wrap(row.value || "-", regular, 9.5, valueWidth) }));
      const lines = Math.max(...cells.map((cell) => Math.max(cell.label.length, cell.value.length)));
      const height = lines * 12.5 + 6;
      ensure(height);
      cells.forEach((cell, at) => {
        const left = MARGIN + 6 + at * (column + 12);
        cell.label.forEach((line, n) => page.drawText(line, { x: left, y: y - 9 - n * 12.5, size: 8.5, font: regular, color: MUTED }));
        cell.value.forEach((line, n) => page.drawText(line, { x: left + labelWidth + 6, y: y - 9.5 - n * 12.5, size: 9.5, font: regular, color: INK }));
      });
      y -= height;
      rule();
    }
  };

  // A simple table: header row, then wrapped cells; repeats the header on a new page.
  const table = (columns: { header: string; share: number }[], rows: { cells: string[]; tones?: (RGB | null)[]; bold?: boolean[] }[]) => {
    const widths = columns.map((column) => (width - 12) * column.share);
    const header = () => {
      ensure(18);
      let left = MARGIN + 6;
      columns.forEach((column, index) => {
        page.drawText(column.header.toUpperCase(), { x: left, y: y - 8, size: 7.5, font: bold, color: MUTED });
        left += widths[index]!;
      });
      y -= 14;
      rule();
    };
    header();
    for (const row of rows) {
      const cells = row.cells.map((cell, index) => wrap(cell || "-", row.bold?.[index] ? bold : regular, 9, widths[index]! - 6));
      const height = Math.max(...cells.map((lines) => lines.length)) * 12 + 6;
      if (y - height < MARGIN + 18) {
        newPage();
        header();
      }
      let left = MARGIN + 6;
      cells.forEach((lines, index) => {
        lines.forEach((line, n) => page.drawText(line, { x: left, y: y - 9 - n * 12, size: 9, font: row.bold?.[index] ? bold : regular, color: row.tones?.[index] ?? INK }));
        left += widths[index]!;
      });
      y -= height;
      rule();
    }
  };

  section("Request details");
  const who = input.requester;
  pairs([
    { label: "Requested by", value: `${input.requesterName}${who?.loginId ? ` (${who.loginId})` : ""}` },
    { label: "Department", value: who?.department ?? "-" },
    ...(who ? [
      { label: "Designation", value: who.designation ?? "-" },
      { label: "Email", value: who.email ?? "-" },
      { label: "Reporting manager", value: who.manager ?? "-" },
    ] : []),
    { label: "Request no.", value: input.requestNo },
    ...(input.raisedOn ? [{ label: "Raised on", value: input.raisedOn }] : []),
    { label: "Approval type", value: input.workflowName },
    { label: "Subject", value: input.title },
    ...input.fields,
  ]);

  section("Approval levels");
  const steps = flatSteps(input.stages).filter((step) => !step.notTaken && step.type !== "NOTIFY");
  if (steps.length === 0) {
    ensure(16);
    draw("No approval levels.", MARGIN + 6, 9, regular, MUTED);
    y -= 16;
  } else {
    table(
      [
        { header: "Level", share: 0.24 },
        { header: "People and decisions", share: 0.5 },
        { header: "Status", share: 0.26 },
      ],
      steps.map((step, index) => ({
        cells: [
          `${index + 1}. ${step.label}${step.type === "WORK" ? " (work task)" : ""}${step.rule ? `\n${step.rule}` : ""}`,
          [
            ...step.people.map((person) => {
              const by = person.decidedByName ? ` (by ${person.decidedByName} on their behalf)` : "";
              const at = person.decidedAt ? ` · ${person.decidedAt}` : "";
              return `${person.name}: ${PERSON_LABEL[person.status] ?? person.status}${by}${at}${person.comment ? `\n"${person.comment}"` : ""}`;
            }),
            ...(step.reason ? [step.reason] : []),
          ].join("\n") || "-",
          STEP_LABEL[step.status] ?? step.status,
        ],
        tones: [null, null, STEP_TONE[step.status] ? hex(STEP_TONE[step.status]!) : MUTED],
        bold: [true, false, true],
      })),
    );
  }

  if (input.tasks?.length) {
    section("Work tasks");
    table(
      [
        { header: "Task", share: 0.42 },
        { header: "Assigned to", share: 0.22 },
        { header: "Due date", share: 0.2 },
        { header: "Status", share: 0.16 },
      ],
      input.tasks.map((task) => ({ cells: [`${task.taskNo} · ${task.title}`, task.assignee, task.due ?? "No due date", task.status] })),
    );
  }

  if (input.links?.length) {
    section("Linked requests");
    table(
      [
        { header: "Request", share: 0.6 },
        { header: "Link", share: 0.2 },
        { header: "Status", share: 0.2 },
      ],
      input.links.map((link) => ({ cells: [`${link.requestNo} · ${link.title}`, link.relation, link.status] })),
    );
  }

  if (input.attachments.length > 0) {
    section("Attachments");
    table(
      [
        { header: "File", share: 0.8 },
        { header: "Size", share: 0.2 },
      ],
      input.attachments.map((file) => ({ cells: [file.name, file.size] })),
    );
  }

  section("History");
  table(
    [
      { header: "When", share: 0.24 },
      { header: "What happened", share: 0.76 },
    ],
    input.timeline.map((entry) => ({ cells: [entry.at, entry.text], tones: [MUTED, null] })),
  );

  // Footer on every page: who made it and when, and page numbers.
  const pages = doc.getPages();
  pages.forEach((each, index) => {
    each.drawLine({ start: { x: MARGIN, y: MARGIN - 6 }, end: { x: A4[0] - MARGIN, y: MARGIN - 6 }, thickness: 0.5, color: LINE });
    const footer = printable(`${APP_BRANDING.appName} · ${input.requestNo} · generated ${input.generatedAt} (India time) by ${input.generatedBy} · for internal use`);
    each.drawText(footer, { x: MARGIN, y: MARGIN - 18, size: 7, font: regular, color: MUTED });
    const number = `Page ${index + 1} of ${pages.length}`;
    each.drawText(number, { x: A4[0] - MARGIN - regular.widthOfTextAtSize(number, 7), y: MARGIN - 18, size: 7, font: regular, color: MUTED });
  });
  return doc.save();
}
