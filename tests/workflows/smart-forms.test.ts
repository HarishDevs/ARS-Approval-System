import { describe, expect, it } from "vitest";
import { computeLine, computeLines, dependencyOrder, evaluateFormula, formatPaise, parseFormula, roundTo, ruleHolds, visibleFields, FormulaError } from "@/server/forms/dynamic";
import { checkFormDefinition, displayValue, parseFormSubmission, storedLines, type FormField } from "@/server/forms/fields";

// Smart forms (EN-01..03): rules, formulas, line items, server recompute.
describe("rules", () => {
  it("compare numbers as numbers and text case-insensitively", () => {
    expect(ruleHolds({ field: "amount", op: "GT", value: "1,00,000" }, { amount: 150000 })).toBe(true);
    expect(ruleHolds({ field: "amount", op: "LTE", value: "100000" }, { amount: "1,00,000" })).toBe(true);
    expect(ruleHolds({ field: "kind", op: "EQ", value: "capex" }, { kind: "Capex" })).toBe(true);
    expect(ruleHolds({ field: "kind", op: "NEQ", value: "Capex" }, { kind: "Opex" })).toBe(true);
    expect(ruleHolds({ field: "kind", op: "FILLED" }, { kind: "" })).toBe(false);
    expect(ruleHolds({ field: "kind", op: "EMPTY" }, {})).toBe(true);
    // An empty value never matches a comparison.
    expect(ruleHolds({ field: "amount", op: "LT", value: "5" }, {})).toBe(false);
  });
});

describe("formulas", () => {
  it("parse with precedence and brackets; never eval", () => {
    const expr = parseFormula("quantity * rate * (1 + gst / 100)");
    expect(evaluateFormula(expr, { quantity: 2, rate: 1000, gst: 18 })).toBeCloseTo(2360);
    expect(evaluateFormula(parseFormula("round(10 / 3, 2)"), {})).toBe(3.33);
    expect(evaluateFormula(parseFormula("-amount + 5"), { amount: 2 })).toBe(3);
    expect(() => parseFormula("process.exit()")).toThrow(FormulaError);
    expect(() => parseFormula("a +")).toThrow(FormulaError);
    expect(() => parseFormula("alert('x')")).toThrow(FormulaError);
  });

  it("missing inputs and division by zero give no value (never 0)", () => {
    expect(evaluateFormula(parseFormula("a + b"), { a: 1 })).toBeNull();
    expect(evaluateFormula(parseFormula("a / b"), { a: 1, b: 0 })).toBeNull();
  });

  it("rounds half away from zero, without binary-fraction surprises", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });
});

describe("line items in paise", () => {
  it("quantity × rate + GST, rounded per line to the paisa", () => {
    const line = computeLine({ description: "Bearing", quantity: "3", rate: "1,234.56", gst: "18" });
    expect(line).toMatchObject({ ok: true, line: { amountPaise: 370368, taxPaise: 66666, totalPaise: 437034 } });
    // 0.1 + 0.2 style sums stay exact.
    const total = computeLines([
      { description: "A", quantity: "1", rate: "0.10" },
      { description: "B", quantity: "1", rate: "0.20" },
    ]);
    expect(total).toMatchObject({ ok: true, totalPaise: 30 });
    expect(formatPaise(437034)).toBe("₹4,370.34");
  });

  it("refuses bad rows with a plain reason", () => {
    expect(computeLine({ description: "", quantity: "1", rate: "1" })).toMatchObject({ ok: false });
    expect(computeLine({ description: "X", quantity: "0", rate: "1" })).toMatchObject({ ok: false, message: expect.stringMatching(/quantity/) });
    expect(computeLine({ description: "X", quantity: "1", rate: "1.234" })).toMatchObject({ ok: false, message: expect.stringMatching(/rate/) });
    expect(computeLine({ description: "X", quantity: "1", rate: "1", gst: "120" })).toMatchObject({ ok: false, message: expect.stringMatching(/GST/) });
  });
});

describe("dependencies", () => {
  it("orders fields after what they depend on, and finds cycles", () => {
    const order = dependencyOrder([
      { key: "total", type: "CALC", formula: "qty * rate" },
      { key: "qty", type: "NUMBER" },
      { key: "rate", type: "NUMBER" },
    ]);
    expect(order!.indexOf("total")).toBeGreaterThan(order!.indexOf("qty"));
    expect(dependencyOrder([
      { key: "a", type: "TEXT", showIf: { field: "b", op: "FILLED" } },
      { key: "b", type: "TEXT", showIf: { field: "a", op: "FILLED" } },
    ])).toBeNull();
  });

  it("a field hidden by its rule hides the fields that depend on it", () => {
    const shown = visibleFields(
      [
        { key: "kind", type: "CHOICE" },
        { key: "gst_no", type: "TEXT", showIf: { field: "kind", op: "EQ", value: "Capex" } },
        { key: "gst_note", type: "TEXT", showIf: { field: "gst_no", op: "FILLED" } },
      ],
      { kind: "Opex", gst_no: "29ABC", gst_note: "x" },
    );
    expect([...shown]).toEqual(["kind"]);
  });
});

const FORM: FormField[] = [
  { key: "kind", label: "Kind", type: "CHOICE", required: true, options: ["Capex", "Opex"] },
  { key: "gst_no", label: "GSTIN", type: "TEXT", required: false, showIf: { field: "kind", op: "EQ", value: "Capex" }, requiredIf: { field: "kind", op: "EQ", value: "Capex" } },
  { key: "items", label: "Items", type: "LINE_ITEMS", required: true },
  { key: "freight", label: "Freight", type: "NUMBER", required: false },
  { key: "amount", label: "Amount", type: "CALC", required: false, formula: "items + freight", decimals: 2 },
  { key: "head", label: "Details", type: "SECTION", required: false },
];

describe("the server decides (parseFormSubmission)", () => {
  const lines = JSON.stringify([
    { description: "Motor", quantity: "2", rate: "10000", gst: "18" },
    { description: "Cable", quantity: "10.5", rate: "120.40" },
  ]);

  it("works out totals and calculated fields itself, ignoring what the browser sent", () => {
    const result = parseFormSubmission(FORM, { kind: "Opex", items: lines, freight: "500", amount: "1" }, new Set());
    expect(result.ok).toBe(true);
    expect(result.data.items).toBe(24864.2); // 23600 + 1264.20
    expect(result.data.amount).toBe(25364.2); // the sent "1" is ignored
    expect(storedLines(result.data, "items")).toHaveLength(2);
    expect(displayValue(FORM[2]!, result.data.items, new Map())).toBe("₹24,864.20");
  });

  it("clears hidden fields and enforces 'required when'", () => {
    const opex = parseFormSubmission(FORM, { kind: "Opex", items: lines, gst_no: "29ABCDE" }, new Set());
    expect(opex.data.gst_no).toBeUndefined(); // hidden → cleared
    const capex = parseFormSubmission(FORM, { kind: "Capex", items: lines }, new Set());
    expect(capex).toMatchObject({ ok: false, errors: { gst_no: "GSTIN is required." } });
  });

  it("required line items need at least one row; bad JSON is refused", () => {
    expect(parseFormSubmission(FORM, { kind: "Opex", items: "[]" }, new Set())).toMatchObject({ ok: false, errors: { items: "Add at least one line to Items." } });
    expect(parseFormSubmission(FORM, { kind: "Opex", items: "{oops" }, new Set())).toMatchObject({ ok: false, errors: { items: expect.stringMatching(/couldn't be read/) } });
  });
});

describe("form check (builder side)", () => {
  it("accepts the smart form above", () => {
    expect(checkFormDefinition(FORM)).toEqual([]);
  });

  it("refuses unknown references, non-number maths, cycles and self rules", () => {
    expect(checkFormDefinition([{ key: "a", label: "A", type: "CALC", required: false, formula: "nope * 2" }])[0]).toMatch(/isn't a field/);
    expect(checkFormDefinition([{ key: "t", label: "T", type: "TEXT", required: false }, { key: "a", label: "A", type: "CALC", required: false, formula: "t * 2" }])[0]).toMatch(/isn't a number/);
    expect(checkFormDefinition([{ key: "a", label: "A", type: "TEXT", required: false, showIf: { field: "a", op: "FILLED" } }])[0]).toMatch(/itself/);
    expect(
      checkFormDefinition([
        { key: "a", label: "A", type: "TEXT", required: false, showIf: { field: "b", op: "FILLED" } },
        { key: "b", label: "B", type: "TEXT", required: false, showIf: { field: "a", op: "FILLED" } },
      ]),
    ).toEqual([expect.stringMatching(/circle/)]);
  });
});
