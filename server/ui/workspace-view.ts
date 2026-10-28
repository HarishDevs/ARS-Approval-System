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
