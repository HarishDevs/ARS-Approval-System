// D-210 (owner): each person chooses how their workspace looks.
// COMPACT: today's sidebar layout (the default).
// CLASSIC: a Tally-style layout: a Gateway menu after sign-in, each module a
// menu of its pages, page tabs along the top, no sidebar, Esc goes back.
export const WORKSPACE_VIEWS = ["COMPACT", "CLASSIC"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];
export const WORKSPACE_VIEW_SETTING = "ui.workspace_view";

export function parseWorkspaceView(value: string | null | undefined): WorkspaceView {
  return value === "CLASSIC" ? "CLASSIC" : "COMPACT";
}

export const VIEW_LABEL: Record<WorkspaceView, string> = { COMPACT: "Compact", CLASSIC: "Classic" };

// D-211 (owner): "an option to resize all text in the application for
// Classic view". Every text size follows --text-scale on <html>.
export const TEXT_SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SIZE_SETTING = "ui.text_size";
export const TEXT_SCALE: Record<TextSize, number> = { S: 0.9, M: 1, L: 1.15, XL: 1.3, XXL: 1.5 };
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { S: "Small", M: "Normal", L: "Large", XL: "Larger", XXL: "Largest" };

export function parseTextSize(value: string | null | undefined): TextSize {
  return (TEXT_SIZES as readonly string[]).includes(value ?? "") ? (value as TextSize) : "M";
}
