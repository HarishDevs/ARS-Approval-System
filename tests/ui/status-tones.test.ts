import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/server/forms/option-colors";
import { STATUS_TONES, TONE_NAMES } from "@/features/ui/status-tones";
import { REQUEST_STATUS, STEP_STATUS, taskStatusText, requestStatusDisplay, PERSON_EXTRA } from "@/features/requests/StatusPill";
import { STATE_TONE } from "@/features/journey/format";

// v1.48 (owner: "make the status colours match across all lists"): one tone
// per status, light and dark, every pair AA; the CSS carries the same values.
const css = readFileSync(join(process.cwd(), "styles/globals.css"), "utf8").replace(/\r\n/g, "\n");
const SURFACES = { light: ["#ffffff", "#f1f5f9"], dark: ["#151c27", "#1e2734", "#0b1526", "#0f1c31"] } as const;

function block(selectorStart: string): string {
  const at = css.indexOf(selectorStart);
  expect(at, `${selectorStart} in globals.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
}

describe("status tones", () => {
  it("every text colour passes WCAG AA (4.5:1) on its tint and on the page surfaces, light and dark", () => {
    for (const name of TONE_NAMES) {
      const tone = STATUS_TONES[name];
      for (const theme of ["light", "dark"] as const) {
        const { fg, bg } = tone[theme];
        expect(contrastRatio(fg, bg), `${name} ${theme} pill`).toBeGreaterThanOrEqual(4.5);
        for (const surface of SURFACES[theme]) expect(contrastRatio(fg, surface), `${name} ${theme} text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the stylesheet holds the same values (light, dark theme, the device's dark setting)", () => {
    const light = block(":root {\n  --tone-blue-fg");
    const dark = block(':root[data-theme="dark"],\n.jr-panel');
    const system = block(":root:not([data-theme]) {\n    --tone-blue-fg");
    for (const name of TONE_NAMES) {
      const tone = STATUS_TONES[name];
      expect(light).toContain(`--tone-${name}-fg: ${tone.light.fg};`);
      expect(light).toContain(`--tone-${name}-bg: ${tone.light.bg};`);
      for (const part of [dark, system]) {
        expect(part).toContain(`--tone-${name}-fg: ${tone.dark.fg};`);
        expect(part).toContain(`--tone-${name}-bg: ${tone.dark.bg};`);
      }
      expect(css).toContain(`.st-${name} { --st-fg: var(--tone-${name}-fg); --st-bg: var(--tone-${name}-bg); }`);
    }
  });

  it("maps every status to the owner's colours", () => {
    expect(Object.fromEntries(Object.entries(REQUEST_STATUS).map(([key, value]) => [key, value.tone]))).toEqual({
      IN_PROGRESS: "blue",
      ON_HOLD: "amber",
      CHANGES_REQUIRED: "orange",
      APPROVED: "green",
      REJECTED: "red",
      CANCELLED: "purple",
    });
    expect(Object.fromEntries(Object.entries(STEP_STATUS).map(([key, value]) => [key, value.tone]))).toEqual({
      WAITING: "grey",
      ACTIVE: "blue",
      APPROVED: "green",
      REJECTED: "red",
      SKIPPED: "purple",
      BLOCKED: "orangered",
      CANCELLED: "grey",
    });
    expect(taskStatusText("PENDING").tone).toBe("blue");
    expect(taskStatusText("APPROVED").tone).toBe("green");
    expect(taskStatusText("REJECTED").tone).toBe("red");
    expect(taskStatusText("CHANGES_REQUESTED").tone).toBe("orange");
    expect(taskStatusText("NOT_REQUIRED").tone).toBe("grey");
    expect(taskStatusText("CANCELLED").tone).toBe("grey");
    expect([PERSON_EXTRA.TOLD.tone, PERSON_EXTRA.ASSIGNED.tone, PERSON_EXTRA.DONE.tone]).toEqual(["purple", "purple", "green"]);
    // Expired: derived, grey; the stored status stays Approved.
    expect(requestStatusDisplay("APPROVED", "2020-01-01T00:00:00Z")).toMatchObject({ label: "Expired", tone: "grey", style: "st-pill st-grey" });
    expect(requestStatusDisplay("APPROVED", null).tone).toBe("green");
    // The journey's status words use the same tones.
    expect(STATE_TONE).toEqual({ done: "green", current: "blue", waiting: "grey", rejected: "red", returned: "orange", hold: "amber", blocked: "orangered", skipped: "purple", cancelled: "purple" });
    // Blocked is the only status in the warning tone.
    const all = [...Object.values(REQUEST_STATUS), ...Object.values(STEP_STATUS)].filter((item) => item.tone === "orangered").map((item) => item.label);
    expect(all).toEqual(["Blocked"]);
  });
});
