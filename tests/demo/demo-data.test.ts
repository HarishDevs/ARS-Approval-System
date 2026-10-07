import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder } from "@/server/workflows/builder";
import { checkFormDefinition } from "@/server/forms/fields";
import { deriveDoaTable } from "@/server/workflows/doa";
import { validateWorkflow } from "@/server/engine";
import { DEMO_DEPARTMENTS, DEMO_GROUPS, DEMO_PEOPLE, PURCHASE_DOA_BANDS, demoEmail, demoLoginId, demoWorkflows } from "@/server/demo/demo-data";

// S6-02a / S6-03 (D-071): the demo set must load cleanly and every first
// approval type must compile, validate and be publishable.
const groupIds = new Map<string, number>(DEMO_GROUPS.map((group, index) => [group.code, 100 + index]));
const departmentIds = new Map<string, number>(DEMO_DEPARTMENTS.map((department, index) => [department.code, 200 + index]));
const workflows = demoWorkflows({ group: (code) => groupIds.get(code)!, department: (code) => departmentIds.get(code)! });

describe("demo staff", () => {
  it("every manager, HOD and group member is a demo person listed earlier", () => {
    const seen = new Set<string>();
    for (const person of DEMO_PEOPLE) {
      if (person.manager) expect(seen.has(person.manager), person.key).toBe(true);
      expect(DEMO_DEPARTMENTS.some((department) => department.code === person.department), person.key).toBe(true);
      seen.add(person.key);
    }
    for (const department of DEMO_DEPARTMENTS) expect(seen.has(department.hod), department.code).toBe(true);
    for (const group of DEMO_GROUPS) for (const member of group.members) expect(seen.has(member), group.code).toBe(true);
  });

  it("User IDs and emails are unique and clearly demo", () => {
    expect(new Set(DEMO_PEOPLE.map((person) => demoLoginId(person.key))).size).toBe(DEMO_PEOPLE.length);
    expect(demoLoginId("md")).toBe("demo.md");
    expect(demoEmail("md")).toBe("itadmin+demo.md@arssteels.co.in");
  });
});

describe("first approval types (F-60 to F-71)", () => {
  it("there are 12, with unique codes and prefixes", () => {
    expect(workflows).toHaveLength(12);
    expect(new Set(workflows.map((workflow) => workflow.code)).size).toBe(12);
    expect(new Set(workflows.map((workflow) => workflow.prefix)).size).toBe(12);
    for (const workflow of workflows) {
      expect(workflow.prefix, workflow.code).toMatch(/^[A-Z]{2,6}$/);
      expect(workflow.code, workflow.code).toMatch(/^[A-Z0-9_]{2,50}$/);
    }
  });

  it("every one compiles and passes the validator with its form", () => {
    for (const workflow of workflows) {
      expect(checkFormDefinition(workflow.form), workflow.code).toEqual([]);
      const compiled = compileBuilder(builderSpecSchema.parse(workflow.builder));
      expect(compiled.ok, workflow.code).toBe(true);
      if (!compiled.ok) continue;
      const result = validateWorkflow(compiled.definition, {
        knownGroupIds: [...groupIds.values()],
        knownDepartmentIds: [...departmentIds.values()],
        knownRoleCodes: ["USER", "IT_ADMIN", "SUPER_ADMIN"],
        knownUserIds: [],
        formFieldKeys: workflow.form.map((field) => field.key),
      });
      expect(result.errors.map((issue) => issue.message), workflow.code).toEqual([]);
    }
  });

  it("Purchase & SCM is the DoA example (Q-004): more levels as the amount grows", () => {
    const purchase = workflows.find((workflow) => workflow.code === "PURCHASE_SCM_APPROVAL")!;
    expect(deriveDoaTable(builderSpecSchema.parse(purchase.builder)).bands).toEqual([
      { from: 0, to: PURCHASE_DOA_BANDS.finance, levels: ["Purchase & SCM head"] },
      { from: PURCHASE_DOA_BANDS.finance + 1, to: PURCHASE_DOA_BANDS.ed, levels: ["Purchase & SCM head", "Finance head"] },
      { from: PURCHASE_DOA_BANDS.ed + 1, to: PURCHASE_DOA_BANDS.md, levels: ["Purchase & SCM head", "Finance head", "ED"] },
      { from: PURCHASE_DOA_BANDS.md + 1, to: null, levels: ["Purchase & SCM head", "Finance head", "ED", "MD"] },
    ]);
  });

  it("the DoA view shows a parallel review as one level, done together", () => {
    const price = workflows.find((workflow) => workflow.code === "PRICE_REALISATION")!;
    expect(deriveDoaTable(builderSpecSchema.parse(price.builder)).bands).toEqual([
      { from: 0, to: null, levels: ["Sales head + Plant head + Purchase & SCM head + Finance controller (together)", "ED", "MD"] },
    ]);
  });

  it("no approval type names a person directly, so real staff can be swapped in", () => {
    expect(JSON.stringify(workflows.map((workflow) => workflow.builder))).not.toContain('"PEOPLE"');
  });
});
