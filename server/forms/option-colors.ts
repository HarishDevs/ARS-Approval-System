// v1.47.0 (owner, 2 Nov 2026: "add Color selector in the Dropdown so that
// dropdowns can be highlighted in the tables"): each option of a choice
// field (Dropdown, Radio buttons, Multi-select) may carry a colour from this
// small fixed palette, shown as a coloured pill wherever the value is shown
// (like Asana's custom fields). Pure: used by the Form Designer, the zod
// schema, the pages, the PDF and the tests.
export const OPTION_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "grey"] as const;
export type OptionColor = (typeof OPTION_COLORS)[number];

export const OPTION_COLOR_LABEL: Record<OptionColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  grey: "Grey",
};

// The pill's background and text, light and dark theme. Every pair keeps
// text at 4.5:1 or more (WCAG AA; checked in tests/forms/option-colors.test.ts).
// The one source for the screen (ChoicePill sets them as CSS variables) and the PDF.
export const OPTION_COLOR_SWATCH: Record<OptionColor, { light: { bg: string; fg: string }; dark: { bg: string; fg: string } }> = {
  red: { light: { bg: "#fee2e2", fg: "#991b1b" }, dark: { bg: "#3f1517", fg: "#fca5a5" } },
  orange: { light: { bg: "#ffedd5", fg: "#9a3412" }, dark: { bg: "#3b2210", fg: "#fdba74" } },
  yellow: { light: { bg: "#fef3c7", fg: "#854d0e" }, dark: { bg: "#3a300c", fg: "#fde047" } },
  green: { light: { bg: "#dcfce7", fg: "#166534" }, dark: { bg: "#0f2c1c", fg: "#86efac" } },
  teal: { light: { bg: "#ccfbf1", fg: "#115e59" }, dark: { bg: "#0b2e2b", fg: "#5eead4" } },
  blue: { light: { bg: "#dbeafe", fg: "#1e40af" }, dark: { bg: "#13274a", fg: "#93c5fd" } },
  purple: { light: { bg: "#ede9fe", fg: "#5b21b6" }, dark: { bg: "#2a1d4a", fg: "#c4b5fd" } },
  pink: { light: { bg: "#fce7f3", fg: "#9d174d" }, dark: { bg: "#3a1428", fg: "#f9a8d4" } },
  grey: { light: { bg: "#e2e8f0", fg: "#334155" }, dark: { bg: "#273142", fg: "#cbd5e1" } },
};

export const isOptionColor = (value: unknown): value is OptionColor => typeof value === "string" && (OPTION_COLORS as readonly string[]).includes(value);

// Only colours of options the field still has, and only palette colours.
// Unknown keys and bad colours are dropped; nothing left → undefined.
export function cleanOptionColors(options: readonly string[] | undefined, colors: unknown): Record<string, OptionColor> | undefined {
  if (!options?.length || !colors || typeof colors !== "object" || Array.isArray(colors)) return undefined;
  const out: Record<string, OptionColor> = {};
  for (const option of options) {
    const color = (colors as Record<string, unknown>)[option];
    if (isOptionColor(color)) out[option] = color;
  }
  return Object.keys(out).length ? out : undefined;
}

// When the designer changes the option list: a kept option keeps its colour
// (also when only its capitals changed), a renamed one (the same place in a
// list of the same length, the only one that changed) carries its colour to
// the new name, a removed one drops it.
export function reconcileOptionColors(before: readonly string[], after: readonly string[], colors: Readonly<Record<string, OptionColor>> | undefined): Record<string, OptionColor> | undefined {
  if (!colors) return undefined;
  const out: Record<string, OptionColor> = {};
  const changed = before.length === after.length ? after.map((option, index) => (option !== before[index] ? index : -1)).filter((index) => index >= 0) : [];
  after.forEach((option, index) => {
    let color: string | undefined = colors[option];
    if (!color) {
      const old = before.find((item) => item.toLowerCase() === option.toLowerCase());
      if (old) color = colors[old];
    }
    if (!color && changed.length === 1 && changed[0] === index) color = colors[before[index]!];
    if (isOptionColor(color)) out[option] = color;
  });
  return Object.keys(out).length ? out : undefined;
}

// The colour of one stored value of a field (null when none).
export function optionColor(field: { optionColors?: Readonly<Record<string, string>> }, value: unknown): OptionColor | null {
  if (typeof value !== "string") return null;
  const color = field.optionColors?.[value];
  return isOptionColor(color) ? color : null;
}

// WCAG relative-luminance contrast of two #rrggbb colours (tests, docs).
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((start) => {
      const c = parseInt(hex.slice(start, start + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// v1.47.0 (owner: "add Priority in all possible tables"): the built-in task
// and information priorities use the same pills everywhere: Urgent red,
// High / Important orange, Normal plain, Low grey.
export const BUILT_IN_PRIORITY_COLOR: Record<string, OptionColor | null> = { URGENT: "red", HIGH: "orange", IMPORTANT: "orange", NORMAL: null, LOW: "grey" };
