import { describe, expect, it } from "vitest";
import { priorityField, priorityRankSql, priorityText, requestPriority, requestPriorityFromJson, shownPriority } from "@/server/approvals/priority";
import { requestColumns } from "@/server/records/columns";
import type { FormField } from "@/server/forms/fields";

// v1.47.0 (owner, 2 Nov 2026): "custom approvals will have priority".
const options = ["Critical", "Most important", "Important", "High", "Low"];
const form: FormField[] = [
  { key: "item", label: "Item", type: "TEXT", required: true },
  { key: "priority", label: "Priority", type: "CHOICE", required: true, options, optionColors: { Critical: "red", Important: "yellow" } },
];

describe("requestPriority", () => {
  it("is the value of the choice field keyed priority, with its colour and option order", () => {
    expect(requestPriority(form, { priority: "Critical" })).toEqual({ label: "Critical", color: "red", rank: 0, confidential: false });
    // v1.47.1: an uncoloured option takes its colour from its name.
    expect(requestPriority(form, { priority: "Low" })).toEqual({ label: "Low", color: "grey", rank: 4, confidential: false });
    expect(requestPriority(form, { priority: "Important" })?.color).toBe("yellow");
  });

  it("is null without a priority field, a value, or for a non-choice field keyed priority", () => {
    expect(requestPriority([form[0]!], { priority: "Critical" })).toBeNull();
    expect(requestPriority(form, {})).toBeNull();
    expect(requestPriority(form, { priority: "" })).toBeNull();
    expect(requestPriority([{ key: "priority", label: "Priority", type: "TEXT", required: false }], { priority: "Critical" })).toBeNull();
    expect(requestPriority(null, null)).toBeNull();
    expect(priorityField(form)?.key).toBe("priority");
  });

  it("works for radio buttons and multi-select (first pick gives the colour)", () => {
    const multi: FormField[] = [{ ...form[1]!, type: "MULTI_CHOICE" }];
    expect(requestPriority(multi, { priority: ["Critical", "Low"] })).toEqual({ label: "Critical, Low", color: "red", rank: 0, confidential: false });
    expect(requestPriority([{ ...form[1]!, type: "RADIO" }], { priority: "Important" })?.rank).toBe(2);
  });

  it("reads the database columns (JSON text or objects)", () => {
    expect(requestPriorityFromJson(JSON.stringify(form), JSON.stringify({ priority: "Critical" }))?.label).toBe("Critical");
    expect(requestPriorityFromJson(form, { priority: "High" })?.rank).toBe(3);
    expect(requestPriorityFromJson("not json", "{")).toBeNull();
  });

  it("a confidential priority is Hidden for viewers who may not see confidential values", () => {
    const secret = requestPriority([{ ...form[1]!, confidential: true }], { priority: "Critical" });
    expect(secret?.confidential).toBe(true);
    expect(shownPriority(secret, false)).toEqual({ label: "Hidden", color: null, rank: Number.MAX_SAFE_INTEGER, hidden: true });
    expect(shownPriority(secret, true)).toEqual({ label: "Critical", color: "red", rank: 0 });
    expect(shownPriority(null, true)).toBeNull();
    expect(priorityText(null)).toBe("");
  });

  it("the Records column (table and CSV) sits after Amount and follows the confidential rule", () => {
    const columns = requestColumns(false);
    expect(columns.map((column) => column.label).slice(3, 5)).toEqual(["Amount", "Priority"]);
    const row = { priority: requestPriority([{ ...form[1]!, confidential: true }], { priority: "Critical" }) } as Parameters<(typeof columns)[number]["value"]>[0];
    expect(columns.find((column) => column.key === "priority")!.value(row)).toBe("Hidden");
    const open = requestColumns(true).find((column) => column.key === "priority")!;
    expect(open.value(row)).toBe("Critical");
    expect(open.color!(row)).toBe("red");
  });

  it("the sort SQL uses only JSON functions on the request and its version", () => {
    const sql = priorityRankSql("r", "v");
    expect(sql).toContain("JSON_SEARCH(v.form_json, 'one', 'priority', NULL, '$[*].key')");
    expect(sql).toContain("JSON_EXTRACT(r.form_data_json, '$.priority')");
    expect(sql).toContain("CAST('true' AS JSON)");
    expect(sql).not.toContain("?");
  });
});

// v1.47.1 (owner: the colours wherever priority shows): an uncoloured
// priority option takes a colour from its name; a chosen colour wins.
import { priorityNameColor } from "@/server/forms/option-colors";
describe("priority colours by name", () => {
  it("colours the owner's options even before IT picks colours", () => {
    expect(["Critical", "Most important", "Important", "High", "Normal", "Medium", "Low", "Something else"].map(priorityNameColor)).toEqual([
      "red",
      "orange",
      "yellow",
      "orange",
      "blue",
      "blue",
      "grey",
      null,
    ]);
  });
});
