import { describe, expect, it } from "vitest";
import { approverFieldKeys, ineligibleChoices, isApproverEligible, namedApprovers, whyNotApprover, type ApproverStatus } from "@/server/approvals/approver-rules";
import { approvalRate, financialYearStart, hoursText, parseDashboardFilter, presets, CUSTOM_TYPE } from "@/server/dashboards/filters";
import type { WorkflowDefinition } from "@/server/engine/types";

// S11: approver designations (D-085) and dashboard filters (D-087).
const person = (over: Partial<ApproverStatus>): ApproverStatus => ({ id: 1, name: "Ravi", active: true, isBreakGlass: false, designation: "Manager", designationIsApprover: true, ...over });

describe("approver eligibility (D-085)", () => {
  it("active, not break-glass, designation ticked as Approver", () => {
    expect(isApproverEligible(person({}))).toBe(true);
    expect(isApproverEligible(person({ designationIsApprover: false }))).toBe(false);
    expect(isApproverEligible(person({ active: false }))).toBe(false);
    expect(isApproverEligible(person({ isBreakGlass: true }))).toBe(false);
  });

  it("says why someone can't be chosen", () => {
    expect(whyNotApprover(person({ designation: null, designationIsApprover: false }))).toMatch(/no designation/);
    expect(whyNotApprover(person({ designation: "Executive", designationIsApprover: false }))).toMatch(/designation Executive isn't ticked as Approver/);
    expect(whyNotApprover(undefined)).toMatch(/no longer exists/);
  });

  it("only new choices are checked; what was saved before stays valid", () => {
    const statuses = new Map([
      [1, person({ id: 1 })],
      [2, person({ id: 2, name: "Junior", designation: "Executive", designationIsApprover: false })],
    ]);
    expect(ineligibleChoices([1, 2], [], statuses)).toHaveLength(1);
    expect(ineligibleChoices([1, 2], [2], statuses)).toEqual([]);
  });

  it("finds named approvers and approver person fields in a workflow", () => {
    const definition: Pick<WorkflowDefinition, "nodes"> = {
      nodes: [
        { id: "start", kind: "START", label: "Start" },
        { id: "a", kind: "APPROVAL", label: "A", approvers: [{ type: "USER", userId: 5 }, { type: "REQUESTER_MANAGER" }], completion: { type: "ALL" } },
        { id: "b", kind: "APPROVAL", label: "B", approvers: [{ type: "USER", userId: 5 }, { type: "FORM_FIELD_USER", fieldKey: "approver" }], completion: { type: "ANY_ONE" } },
        { id: "end", kind: "END", label: "End" },
      ],
    };
    expect(namedApprovers(definition)).toEqual([5]);
    expect(approverFieldKeys(definition)).toEqual(["approver"]);
  });
});

describe("dashboard filters (D-087)", () => {
  it("defaults to the Indian financial year to date", () => {
    expect(financialYearStart("2026-10-08")).toBe("2026-04-01");
    expect(financialYearStart("2027-02-01")).toBe("2026-04-01");
    expect(parseDashboardFilter({}, "2026-10-08")).toEqual({ from: "2026-04-01", to: "2026-10-08", workflowId: null, departmentId: null });
  });

  it("swaps reversed dates, ignores bad ones, and knows custom approvals", () => {
    expect(parseDashboardFilter({ from: "2026-09-30", to: "2026-09-01", type: String(CUSTOM_TYPE), dept: "7" }, "2026-10-08")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      workflowId: CUSTOM_TYPE,
      departmentId: 7,
    });
    expect(parseDashboardFilter({ from: "2026-02-31", type: "-5", dept: "x" }, "2026-10-08")).toMatchObject({ from: "2026-04-01", workflowId: null, departmentId: null });
  });

  it("presets and maths", () => {
    expect(presets("2026-10-08").map((preset) => [preset.from, preset.to])).toEqual([
      ["2026-10-01", "2026-10-08"],
      ["2026-07-11", "2026-10-08"],
      ["2026-04-01", "2026-10-08"],
      ["2025-04-01", "2026-03-31"],
    ]);
    expect(approvalRate(3, 1)).toBe(75);
    expect(approvalRate(0, 0)).toBeNull();
    expect(hoursText(0.5)).toBe("30 min");
    expect(hoursText(72)).toBe("3.0 days");
    expect(hoursText(null)).toBe("—");
  });
});
