import { describe, expect, it } from "vitest";
import { conversionLosses, dependentsOf, duplicateField, fieldProblems, moveItem, newField, uniqueKey, withType } from "@/features/admin/form-designer/model";
import type { FormField } from "@/server/forms/fields";

// D-235: the Form Designer's rules (the server checks the form again on save).
const amount: FormField = { key: "amount", label: "Amount", type: "NUMBER", required: true, min: 0 };
const kind: FormField = { key: "kind", label: "Kind", type: "CHOICE", required: true, options: ["Capex", "Opex"], defaultValue: "Opex" };
const total: FormField = { key: "total", label: "Total", type: "CALC", required: false, formula: "amount * 1.18", decimals: 2 };
const note: FormField = { key: "note", label: "Note", type: "TEXT", required: false, showIf: { field: "kind", operator: "EQ", value: "Capex" } };

describe("Form Designer", () => {
  it("moves a field without losing or duplicating any", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]); // out of range: unchanged
  });
  it("a duplicate gets its own key, and the needed-by date stays on the original", () => {
    expect(uniqueKey("amount", ["amount"])).toBe("amount_2");
    expect(uniqueKey("amount", ["amount", "amount_2"])).toBe("amount_3");
    const due: FormField = { key: "due", label: "Due", type: "DATE", required: false, neededBy: true };
    const copy = duplicateField(due, ["due"]);
    expect(copy).toMatchObject({ key: "due_2", label: "Due (copy)", type: "DATE" });
    expect(copy.neededBy).toBeUndefined();
  });
  it("a type change keeps what still applies and names what it would drop", () => {
    expect(conversionLosses(amount, "CURRENCY")).toEqual([]); // min carries over
    expect(withType(amount, "CURRENCY").min).toBe(0);
    expect(conversionLosses(kind, "TEXT")).toEqual(["its 2 options"]); // the default "Opex" is still a fine text default
    expect(conversionLosses(kind, "NUMBER")).toEqual(["its 2 options", "the default value"]);
    expect(conversionLosses(total, "NUMBER")).toEqual(["the formula", "the decimal places"]);
    expect(withType({ ...note, confidential: true }, "LONG_TEXT").confidential).toBe(true); // used to be dropped
    expect(conversionLosses(kind, "RADIO")).toEqual([]); // options and default kept
  });
  it("knows which fields use a field before it is removed", () => {
    expect(dependentsOf([amount, kind, total, note], "amount")).toEqual(["Total"]);
    expect(dependentsOf([amount, kind, total, note], "kind")).toEqual(["Note"]);
    expect(dependentsOf([amount, kind, total, note], "note")).toEqual([]);
  });
  it("flags what still needs fixing on a card", () => {
    expect(fieldProblems({ key: "", label: "", type: "TEXT", required: false }, [])).toEqual(["Give it a label.", "Give it a key."]);
    expect(fieldProblems({ ...kind, options: ["One"] }, [kind])).toContain("Add at least two options.");
    expect(fieldProblems(amount, [amount, { ...amount }])).toContain('Another field uses the key "amount".');
    expect(fieldProblems({ ...total, formula: "freigt * 2" }, [total])).toContain('"freigt" isn\'t a field on this form.');
    expect(fieldProblems(amount, [amount, kind])).toEqual([]);
  });
  it("a new section from the library has a label and a key", () => {
    expect(newField("SECTION", [])).toMatchObject({ type: "SECTION", label: "New section", key: "section", required: false });
    expect(newField("LOOKUP:DESIGNATION", [])).toMatchObject({ type: "LOOKUP", source: "DESIGNATION" });
  });
});
