import { describe, expect, it } from "vitest";
import { checkFormDefinition, displayValue, formSchema, parseFormSubmission, type FieldLookups, type FormField } from "@/server/forms/fields";
import { evaluateComparison } from "@/server/engine/conditions";
import { validateWorkflow } from "@/server/engine/validate";
import { slugKey, operatorsFor } from "@/features/admin/FormFieldsEditor";

// S12 (F-75, D-088): every field type the builder can create, end to end on
// the server side: definition checks, parsing what the requester sends,
// showing it back, and conditions on it.
const lookups: FieldLookups = {
  DEPARTMENT: [
    { code: "FIN", name: "Finance & Accounts" },
    { code: "HR", name: "HR & Admin" },
  ],
  DESIGNATION: [{ code: "MGR", name: "Manager" }],
};

const ALL_TYPES: FormField[] = [
  { key: "title_note", label: "Note", type: "TEXT", required: true },
  { key: "details", label: "Details", type: "LONG_TEXT", required: false },
  { key: "amount", label: "Amount (₹)", type: "NUMBER", required: true, min: 0 },
  { key: "needed_by", label: "Needed by", type: "DATE", required: true },
  { key: "purchase_type", label: "Purchase type", type: "CHOICE", required: true, options: ["Capex", "Opex", "Services"] },
  { key: "department", label: "Department", type: "LOOKUP", source: "DEPARTMENT", required: true },
  { key: "designation", label: "Designation", type: "LOOKUP", source: "DESIGNATION", required: false },
  { key: "assignee", label: "Assigned to", type: "PERSON", required: false },
];

describe("form definitions (what IT saves)", () => {
  it("a form with every type is valid and passes the schema", () => {
    expect(checkFormDefinition(ALL_TYPES)).toEqual([]);
    expect(formSchema.safeParse(ALL_TYPES).success).toBe(true);
  });

  it("refuses a dropdown with fewer than two or repeated options, a list field without a list, and options or lists on other types", () => {
    expect(checkFormDefinition([{ key: "a", label: "A", type: "CHOICE", required: false, options: ["Only"] }])).toEqual(['"A" needs at least two choices.']);
    expect(checkFormDefinition([{ key: "a", label: "A", type: "CHOICE", required: false, options: ["Yes", "yes"] }])).toEqual(['"A" has the same choice twice.']);
    expect(checkFormDefinition([{ key: "a", label: "A", type: "LOOKUP", required: false }])).toEqual(['"A" needs a list to choose from (departments or designations).']);
    expect(checkFormDefinition([{ key: "a", label: "A", type: "TEXT", required: false, source: "DEPARTMENT" }])).toEqual(['"A" has a list but isn\'t a list field.']);
    expect(formSchema.safeParse([{ key: "a", label: "A", type: "LOOKUP", required: false, source: "LOCATION" }]).success).toBe(false);
  });
});

describe("what the requester sends", () => {
  const valid = {
    title_note: "Urgent",
    details: "Two motors",
    amount: "12,50,000",
    needed_by: "2026-11-15",
    purchase_type: "Capex",
    department: "FIN",
    designation: "",
    assignee: "7",
  };

  it("every type is stored as its own kind of value", () => {
    expect(parseFormSubmission(ALL_TYPES, valid, new Set([7]), lookups)).toEqual({
      ok: true,
      data: { title_note: "Urgent", details: "Two motors", amount: 1250000, needed_by: "2026-11-15", purchase_type: "Capex", department: "FIN", assignee: 7 },
    });
  });

  it("refuses bad values field by field, and keeps the good ones for test mode", () => {
    const result = parseFormSubmission(
      ALL_TYPES,
      { ...valid, amount: "-5", needed_by: "2026-02-30", purchase_type: "Gold", department: "XYZ", designation: "CEO", assignee: "99" },
      new Set([7]),
      lookups,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      amount: "Enter 0 or more.",
      needed_by: "Choose a valid date.",
      purchase_type: "Choose one of the options.",
      department: "Choose one of the options.",
      designation: "Choose one of the options.",
      assignee: "Choose an active person.",
    });
    expect(result.data).toEqual({ title_note: "Urgent", details: "Two motors" });
  });

  it("required fields must be filled; a date must be a real calendar date", () => {
    const result = parseFormSubmission(ALL_TYPES, {}, new Set(), lookups);
    expect(result.ok ? [] : Object.keys(result.errors)).toEqual(["title_note", "amount", "needed_by", "purchase_type", "department"]);
    for (const bad of ["15/11/2026", "2026-13-01", "tomorrow", "2026-1-5"]) {
      const parsed = parseFormSubmission([ALL_TYPES[3]!], { needed_by: bad }, new Set(), lookups);
      expect(parsed.ok).toBe(false);
    }
  });

  it("shows stored values back readably", () => {
    const names = new Map([[7, "Ravi Kumar"]]);
    const lookupNames = new Map([["DEPARTMENT:FIN", "Finance & Accounts"]]);
    expect(displayValue(ALL_TYPES[3]!, "2026-11-05", names)).toBe("05 Nov 2026");
    expect(displayValue(ALL_TYPES[5]!, "FIN", names, lookupNames)).toBe("Finance & Accounts");
    expect(displayValue(ALL_TYPES[5]!, "OLD", names, lookupNames)).toBe("OLD");
    expect(displayValue(ALL_TYPES[2]!, 1250000, names)).toBe("12,50,000");
    expect(displayValue(ALL_TYPES[7]!, 7, names)).toBe("Ravi Kumar");
  });
});

describe("conditions on dates and lists", () => {
  it("dates compare by calendar order", () => {
    const data = { needed_by: "2026-11-15" };
    expect(evaluateComparison({ field: "needed_by", operator: "LT", value: "2026-12-01" }, data)).toBe(true);
    expect(evaluateComparison({ field: "needed_by", operator: "GT", value: "2026-12-01" }, data)).toBe(false);
    expect(evaluateComparison({ field: "needed_by", operator: "GTE", value: "2026-11-15" }, data)).toBe(true);
    expect(evaluateComparison({ field: "needed_by", operator: "LTE", value: "2026-11-14" }, data)).toBe(false);
    expect(evaluateComparison({ field: "department", operator: "EQ", value: "FIN" }, { department: "FIN" })).toBe(true);
  });

  it("the validator accepts a date for before/after and still refuses words", () => {
    const definition = (value: string | number) => ({
      nodes: [
        { id: "start", kind: "START" as const, label: "Start" },
        { id: "a", kind: "APPROVAL" as const, label: "A", approvers: [{ type: "REQUESTER_MANAGER" as const }], completion: { type: "ALL" as const }, skipIf: { field: "needed_by", operator: "LT" as const, value } },
        { id: "end", kind: "END" as const, label: "End" },
      ],
      edges: [
        { id: "e1", from: "start", to: "a" },
        { id: "e2", from: "a", to: "end" },
      ],
    });
    const codes = (value: string | number) => validateWorkflow(definition(value), { formFieldKeys: ["needed_by"] }).errors.map((issue) => issue.code);
    expect(codes("2026-12-01")).not.toContain("CONDITION_VALUE_NOT_NUMBER");
    expect(codes("soon")).toContain("CONDITION_VALUE_NOT_NUMBER");
  });
});

describe("builder helpers", () => {
  it("the key follows the label, always a valid key", () => {
    expect(slugKey("Delivery Date")).toBe("delivery_date");
    expect(slugKey("Amount (₹)")).toBe("amount");
    expect(slugKey("2nd approver")).toBe("f_2nd_approver");
    expect(slugKey("")).toBe("");
  });

  it("offers operators that suit the field type", () => {
    expect(operatorsFor(ALL_TYPES[3]).map(([, label]) => label)).toContain("is before");
    expect(operatorsFor(ALL_TYPES[4]).map(([operator]) => operator)).toEqual(["EQ", "NEQ", "IS_EMPTY", "IS_NOT_EMPTY"]);
    expect(operatorsFor(ALL_TYPES[2]).map(([operator]) => operator)).toContain("GT");
  });
});

describe("the request page's level map previews skip conditions (S12)", () => {
  it("a level not reached yet shows as skipped when its condition already holds, in plain words", async () => {
    const { builderSpecSchema, compileBuilder } = await import("@/server/workflows/builder");
    const { buildStepMap, describeCondition } = await import("@/server/approvals/step-map");
    const { startInstance } = await import("@/server/engine");
    const { ctx, makeDirectory } = await import("../helpers/engine-fixtures");
    const spec = builderSpecSchema.parse({
      stages: [
        { kind: "STEP", step: { id: "mgr", label: "Manager", approvers: { kind: "PEOPLE", userIds: [2] }, rule: "ALL" } },
        { kind: "STEP", step: { id: "plant", label: "Plant head", approvers: { kind: "PEOPLE", userIds: [3] }, rule: "ALL", skipWhen: { field: "department", operator: "EQ", value: "FIN" } } },
        { kind: "STEP", step: { id: "urgent", label: "Urgent check", approvers: { kind: "PEOPLE", userIds: [3] }, rule: "ALL", skipWhen: { field: "needed_by", operator: "GTE", value: "2027-01-01" } } },
      ],
    });
    const compiled = compileBuilder(spec);
    if (!compiled.ok) throw new Error(compiled.errors.join(" "));
    const formData = { department: "FIN", needed_by: "2026-12-01" };
    const state = startInstance(compiled.definition, ctx(formData), makeDirectory({})).state;
    const map = buildStepMap(compiled.definition, state, spec, new Map(), { formData, fieldLabel: (key) => (key === "needed_by" ? "Needed by" : "Department") });
    expect(map.map((stage) => [stage.label, stage.steps[0]!.status, stage.steps[0]!.reason ?? ""])).toEqual([
      ["Manager", "ACTIVE", ""],
      ["Plant head", "SKIPPED", "Skipped: Department is FIN"],
      ["Urgent check", "WAITING", ""],
    ]);
    expect(describeCondition({ field: "needed_by", operator: "LT", value: "2027-01-01" }, () => "Needed by")).toBe("Needed by is before 01 Jan 2027");
  });
});
