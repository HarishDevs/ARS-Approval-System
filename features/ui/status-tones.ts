// v1.48 (owner: "make the status colours match across all lists"; the
// approval-journey reference, STATUS-MODEL.md): one colour system for every
// request, level (step) and person status. Each tone is a text colour on its
// tinted background, for the light theme and the dark theme (and the dark
// journey card in both themes). Every pair passes WCAG AA (4.5:1), also as
// plain text on the page surfaces (tests/ui/status-tones.test.ts).
//
// The same hex values are written once more in styles/globals.css as the
// --tone-* variables the .st-* classes use; the test reads that file and
// fails if the two ever differ.
export type StatusTone = "blue" | "amber" | "orange" | "green" | "red" | "orangered" | "purple" | "grey";

export interface TonePair {
  fg: string;
  bg: string;
}

export const STATUS_TONES: Record<StatusTone, { meaning: string; light: TonePair; dark: TonePair }> = {
  blue: { meaning: "In progress, waiting for approval, pending", light: { fg: "#1d4ed8", bg: "#dbeafe" }, dark: { fg: "#93c5fd", bg: "#172a4a" } },
  amber: { meaning: "On hold", light: { fg: "#92400e", bg: "#fef3c7" }, dark: { fg: "#fcd34d", bg: "#36280c" } },
  orange: { meaning: "Changes required, asked for changes", light: { fg: "#9a3412", bg: "#ffedd5" }, dark: { fg: "#fdba74", bg: "#3b220e" } },
  green: { meaning: "Approved, done", light: { fg: "#166534", bg: "#dcfce7" }, dark: { fg: "#86efac", bg: "#0f2f1f" } },
  red: { meaning: "Rejected", light: { fg: "#b91c1c", bg: "#fee2e2" }, dark: { fg: "#fca5a5", bg: "#3d1518" } },
  orangered: { meaning: "Blocked (stuck: needs IT): the one warning tone", light: { fg: "#b3360f", bg: "#ffe6dc" }, dark: { fg: "#ffa284", bg: "#3d1c12" } },
  purple: { meaning: "Withdrawn, skipped, given the task, told", light: { fg: "#6d28d9", bg: "#ede9fe" }, dark: { fg: "#c4b5fd", bg: "#2a1f4a" } },
  grey: { meaning: "Not started, expired, not needed, closed", light: { fg: "#475569", bg: "#f1f5f9" }, dark: { fg: "#cbd5e1", bg: "#1e293b" } },
};

export const TONE_NAMES = Object.keys(STATUS_TONES) as StatusTone[];

// A pill (text on its tint): use with "badge" or any rounded element.
export const tonePill = (tone: StatusTone) => `st-pill st-${tone}`;
// The tone's text colour only (a status word on the page surface).
export const toneText = (tone: StatusTone) => `st-text st-${tone}`;
