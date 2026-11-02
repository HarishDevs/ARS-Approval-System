import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { flatSteps, type MapStage } from "@/server/approvals/step-map";
import { isOptionColor, OPTION_COLOR_SWATCH } from "@/server/forms/option-colors";

// #10 one-page-or-more PDF summary of a request: details, levels with who
// decided what, and the history. Built from the same view the request page
// shows (so the same access check applies). pdf-lib's built-in Helvetica
// covers English text; anything it can't draw (e.g. ₹ or Hindi) is written
// as a plain substitute rather than failing.
export interface SummaryInput {
  requestNo: string;
  title: string;
  workflowName: string;
  statusLabel: string;
  requesterName: string;
  progress: string;
  priority?: { label: string; color: string | null } | null; // v1.47.0: the Priority field (text in the option's colour)
  fields: { label: string; value: string }[];
  stages: MapStage[];
  timeline: { at: string; text: string }[];
  attachments: { name: string; size: string }[];
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
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CHANGES_REQUESTED: "asked for changes",
  NOT_REQUIRED: "not needed",
  CANCELLED: "closed",
  TOLD: "informed",
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

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);

export async function buildRequestSummaryPdf(input: SummaryInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(printable(`${input.requestNo} - ${input.title}`));
  doc.setAuthor("ARS Approval Platform");
  doc.setCreator("ARS Approval Platform");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;
  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed >= MARGIN + 16) return;
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const text = (value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const indent = options.indent ?? 0;
    for (const line of wrap(value, font, size, width - indent)) {
      ensure(size + 4);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color: options.color ?? INK });
      y -= size + 4;
    }
  };
  const heading = (value: string) => {
    y -= 8;
    ensure(30);
    text(value, { size: 12, font: bold });
    page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: A4[0] - MARGIN, y: y + 1 }, thickness: 0.5, color: MUTED });
    y -= 6;
  };

  text("ARS Approval Platform · Request summary", { size: 9, color: MUTED });
  y -= 4;
  text(`${input.requestNo}: ${input.title}`, { size: 16, font: bold });
  text(`${input.workflowName} · raised by ${input.requesterName}`, { color: MUTED });
  text(`Status: ${input.statusLabel} · ${input.progress}`, { font: bold });
  if (input.priority) {
    const hex = isOptionColor(input.priority.color) ? OPTION_COLOR_SWATCH[input.priority.color].light.fg : null;
    text(`Priority: ${input.priority.label}`, { font: bold, color: hex ? rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255) : INK });
  }

  if (input.fields.length > 0) {
    heading("Details");
    for (const field of input.fields) {
      text(field.label, { size: 9, color: MUTED });
      text(field.value || "-", { indent: 8 });
    }
  }

  heading("Approval levels");
  const steps = flatSteps(input.stages).filter((step) => !step.notTaken && step.type !== "NOTIFY");
  if (steps.length === 0) text("No approval levels.", { color: MUTED });
  steps.forEach((step, index) => {
    text(`${index + 1}. ${step.label} · ${STEP_LABEL[step.status] ?? step.status}${step.type === "WORK" ? " (work task)" : ""}${step.rule ? ` · ${step.rule}` : ""}`, { font: bold });
    if (step.reason) text(step.reason, { indent: 12, color: MUTED });
    for (const person of step.people) {
      const by = person.decidedByName ? ` (by ${person.decidedByName} on their behalf)` : "";
      const when = person.decidedAt ? ` · ${person.decidedAt}` : "";
      text(`${person.name}: ${PERSON_LABEL[person.status] ?? person.status}${by}${when}`, { indent: 12 });
      if (person.comment) text(`"${person.comment}"`, { indent: 24, color: MUTED });
    }
  });

  if (input.attachments.length > 0) {
    heading("Files");
    for (const file of input.attachments) text(`${file.name} (${file.size})`);
  }

  heading("History");
  for (const entry of input.timeline) {
    text(entry.at, { size: 8, color: MUTED });
    text(entry.text, { indent: 8 });
  }

  // Footer on every page: who made it and when, and page numbers.
  const pages = doc.getPages();
  pages.forEach((each, index) => {
    const footer = printable(`Generated ${input.generatedAt} (India time) by ${input.generatedBy} · page ${index + 1} of ${pages.length} · for internal use`);
    each.drawText(footer, { x: MARGIN, y: MARGIN - 20, size: 7, font: regular, color: MUTED });
  });
  return doc.save();
}
