import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formFieldSchema, formSchema } from "@/server/forms/fields";
import { cleanOptionColors, contrastRatio, OPTION_COLOR_SWATCH, OPTION_COLORS, optionColor, reconcileOptionColors } from "@/server/forms/option-colors";
import { withType } from "@/features/admin/form-designer/model";
import { ChoicePill, ChoicePills, PriorityPill, RequestPriorityBadge, TaskPriorityPill } from "@/features/ui/ChoicePill";
import { columnsToSave, parseColumns } from "@/server/requests/list-columns";

// v1.47.0 (owner, 2 Nov 2026): "add Color selector in the Dropdown so that
// dropdowns can be highlighted in the tables".
const priority = { key: "priority", label: "Priority", type: "CHOICE", required: true, options: ["Critical", "Most important", "Important", "High", "Low"] };

describe("option colours in the form schema", () => {
  it("keeps the colours of existing options", () => {
    const parsed = formFieldSchema.parse({ ...priority, optionColors: { Critical: "red", Important: "yellow" } });
    expect(parsed.optionColors).toEqual({ Critical: "red", Important: "yellow" });
    expect(formSchema.parse([{ ...priority, optionColors: { Low: "grey" } }])[0]!.optionColors).toEqual({ Low: "grey" });
  });

  it("drops unknown options, colours outside the palette, and colours on non-choice fields", () => {
    const parsed = formFieldSchema.parse({ ...priority, optionColors: { Critical: "red", Gone: "blue", High: "magenta", Low: 3 } });
    expect(parsed.optionColors).toEqual({ Critical: "red" });
    expect(formFieldSchema.parse({ ...priority, optionColors: { Gone: "blue" } }).optionColors).toBeUndefined();
    expect(formFieldSchema.parse({ key: "note", label: "Note", type: "TEXT", required: false, optionColors: { a: "red" } }).optionColors).toBeUndefined();
    // Older data with no colours still loads unchanged.
    expect(formFieldSchema.parse(priority)).not.toHaveProperty("optionColors");
  });

  it("works for radio buttons and multi-select too", () => {
    for (const type of ["RADIO", "MULTI_CHOICE"]) expect(formFieldSchema.parse({ ...priority, type, optionColors: { High: "orange" } }).optionColors).toEqual({ High: "orange" });
  });

  it("carries a renamed option's colour and drops a removed one's", () => {
    const colors = { Critical: "red", High: "orange" } as const;
    expect(reconcileOptionColors(["Critical", "High", "Low"], ["Critical", "Very high", "Low"], colors)).toEqual({ Critical: "red", "Very high": "orange" });
    expect(reconcileOptionColors(["Critical", "High", "Low"], ["Critical", "Low"], colors)).toEqual({ Critical: "red" });
    expect(reconcileOptionColors(["Critical", "High"], ["Critical", "High", "Medium"], colors)).toEqual(colors);
    expect(reconcileOptionColors(["Critical", "High"], ["critical", "High"], colors)).toEqual({ critical: "red", High: "orange" });
    expect(reconcileOptionColors(["Critical"], ["Low"], undefined)).toBeUndefined();
    expect(cleanOptionColors(["A"], ["red"])).toBeUndefined();
  });

  it("keeps colours when the type changes between choice types, drops them otherwise", () => {
    const field = { ...priority, type: "CHOICE" as const, optionColors: { Critical: "red" as const } };
    expect(withType(field, "RADIO").optionColors).toEqual({ Critical: "red" });
    expect(withType(field, "TEXT").optionColors).toBeUndefined();
  });

  it("finds the colour of a stored value", () => {
    expect(optionColor({ optionColors: { Critical: "red" } }, "Critical")).toBe("red");
    expect(optionColor({ optionColors: { Critical: "red" } }, "Low")).toBeNull();
    expect(optionColor({}, "Critical")).toBeNull();
    expect(optionColor({ optionColors: { Critical: "red" } }, 3)).toBeNull();
  });
});

describe("ChoicePill", () => {
  it("every palette colour is readable (WCAG AA 4.5:1) in light and dark", () => {
    expect(OPTION_COLORS.length).toBeGreaterThanOrEqual(8);
    for (const color of OPTION_COLORS) {
      const { light, dark } = OPTION_COLOR_SWATCH[color];
      expect(contrastRatio(light.fg, light.bg), `${color} light`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.fg, dark.bg), `${color} dark`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("renders a coloured pill with its swatch, or plain text without a colour", () => {
    const html = renderToStaticMarkup(<ChoicePill label="Critical" color="red" />);
    expect(html).toContain('class="choice-pill ');
    expect(html).toContain('data-color="red"');
    expect(html).toContain("--pill-bg:#fee2e2");
    expect(html).toContain("--pill-fg-dark:#fca5a5");
    expect(renderToStaticMarkup(<ChoicePill label="Low" color={null} />)).toBe("<span>Low</span>");
    expect(renderToStaticMarkup(<ChoicePill label="Low" color="magenta" />)).not.toContain("choice-pill");
  });

  it("shows several values, a dash for none, Hidden for a confidential priority", () => {
    expect(renderToStaticMarkup(<ChoicePills values={[{ label: "A", color: "red" }, { label: "B", color: null }]} />)).toContain('data-color="red"');
    expect(renderToStaticMarkup(<ChoicePills values={[{ label: "A", color: null }, { label: "B", color: null }]} />)).toBe("<span>A, B</span>");
    expect(renderToStaticMarkup(<PriorityPill priority={null} />)).toContain("—");
    expect(renderToStaticMarkup(<PriorityPill priority={{ label: "Hidden", color: null, hidden: true }} />)).toContain("Hidden");
    expect(renderToStaticMarkup(<RequestPriorityBadge priority={{ label: "Critical", color: "red" }} />)).toContain("Priority: ");
  });

  it("task priorities: Urgent red, High orange, Low grey, Normal plain (or nothing)", () => {
    expect(renderToStaticMarkup(<TaskPriorityPill priority="URGENT" />)).toContain('data-color="red"');
    expect(renderToStaticMarkup(<TaskPriorityPill priority="HIGH" />)).toContain('data-color="orange"');
    expect(renderToStaticMarkup(<TaskPriorityPill priority="LOW" />)).toContain('data-color="grey"');
    expect(renderToStaticMarkup(<TaskPriorityPill priority="NORMAL" />)).toBe("");
    expect(renderToStaticMarkup(<TaskPriorityPill priority="NORMAL" showNormal />)).toContain("Normal");
  });
});

describe("the Priority list column", () => {
  const available = ["status", "priority", "waiting", "raised"] as const;
  it("shows for lists saved before it existed, and stays hidden once unticked", () => {
    expect(parseColumns(JSON.stringify(["status", "raised"]), available)).toEqual(["status", "priority", "raised"]);
    expect(columnsToSave(["status", "raised", "bogus"])).toEqual(["status", "raised", "!priority"]);
    expect(parseColumns(JSON.stringify(columnsToSave(["status", "raised"])), available)).toEqual(["status", "raised"]);
    expect(parseColumns(JSON.stringify(columnsToSave(["status", "priority"])), available)).toEqual(["status", "priority"]);
  });
});
