import { describe, expect, it } from "vitest";
import { DEFAULT_STEP_POLICY, parseStepPolicy, unavailableFeatures, type StepPolicy } from "@/server/workflows/step-policy";
import { boardsFor } from "@/server/analytics/center";
import type { BuilderSpec } from "@/server/workflows/builder";

// D-206 (owner): custom approvals offer levels and parallel steps to
// everyone; the DoA matrix, the choice and "Skip this step when…" only when
// IT switches them on. Analytics shows each person only the dashboards they need.
const step = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL", ...extra });
const spec = (stages: unknown[]) => ({ stages }) as unknown as BuilderSpec;
const on = (features: Partial<StepPolicy["features"]>): StepPolicy => ({ ...DEFAULT_STEP_POLICY, features: { ...DEFAULT_STEP_POLICY.features, ...features } });

describe("custom approval options (D-206)", () => {
  it("are off unless IT switches them on, also for set-ups saved before", () => {
    expect(DEFAULT_STEP_POLICY.features).toEqual({ choice: false, skip: false });
    expect(parseStepPolicy({ rule: { value: "ALL", editable: true } }).features).toEqual({ choice: false, skip: false });
    // D-235: an old stored "doa" choice is dropped.
    expect(parseStepPolicy({ features: { doa: true, choice: true } }).features).toEqual({ choice: true, skip: false });
  });
  it("levels and parallel steps are always allowed", () => {
    expect(unavailableFeatures(spec([{ kind: "STEP", step: step("a") }, { kind: "PARALLEL", id: "p", label: "P", join: "ALL", steps: [step("b"), step("c")] }]), DEFAULT_STEP_POLICY)).toEqual([]);
  });
  it("a DoA matrix, a choice or a skip condition is refused when off, accepted when on", () => {
    const doa = spec([{ kind: "DOA", id: "d", label: "DoA", field: "amount", limits: [1], levels: [{ step: step("l1"), bands: [true, true] }] }]);
    const choice = spec([{ kind: "BRANCH", id: "b", label: "If", condition: { field: "amount", operator: "GT", value: 1 }, then: [{ kind: "STEP", step: step("t", { skipWhen: { field: "amount", operator: "LT", value: 5 } }) }], otherwise: [] }]);
    const skip = spec([{ kind: "STEP", step: step("s", { skipWhen: { field: "amount", operator: "LT", value: 5 } }) }]);
    expect(unavailableFeatures(doa, DEFAULT_STEP_POLICY)).toEqual(["A DoA matrix isn't available on custom approvals."]);
    expect(unavailableFeatures(choice, DEFAULT_STEP_POLICY)).toEqual(["A choice (if / otherwise) isn't available on custom approvals.", "“Skip this step when…” isn't available on custom approvals."]);
    expect(unavailableFeatures(skip, DEFAULT_STEP_POLICY)).toEqual(["“Skip this step when…” isn't available on custom approvals."]);
    // D-235: DoA is never available on a custom approval, whatever is switched on.
    expect(unavailableFeatures(doa, on({ choice: true, skip: true }))).toEqual(["A DoA matrix isn't available on custom approvals."]);
    expect(unavailableFeatures(choice, on({ choice: true, skip: true }))).toEqual([]);
    expect(unavailableFeatures(skip, on({ skip: true }))).toEqual([]);
  });
});

describe("analytics dashboards per person (D-206)", () => {
  const all = { approval: true, task: true, information: true };
  it("a plain user with only Approvals sees the overview, approvals, SLA and trends", () => {
    expect(boardsFor({ modules: { approval: true, task: false, information: false }, scopes: ["MINE"] })).toEqual(["overview", "approvals", "sla", "trends"]);
  });
  it("a manager also sees employees; an HOD also departments; IT also data quality", () => {
    expect(boardsFor({ modules: all, scopes: ["MINE", "APPROVALS", "TEAM"] })).toEqual(["overview", "approvals", "tasks", "information", "employees", "sla", "trends"]);
    expect(boardsFor({ modules: all, scopes: ["MINE", "DEPARTMENT"] })).toContain("departments");
    expect(boardsFor({ modules: all, scopes: ["MINE", "ORGANISATION"] })).toEqual(["overview", "approvals", "tasks", "information", "employees", "departments", "sla", "trends", "quality"]);
  });
  it("someone with no task or approval module gets no SLA board", () => {
    expect(boardsFor({ modules: { approval: false, task: false, information: true }, scopes: ["MINE"] })).toEqual(["overview", "information", "trends"]);
  });
});

// v1.52.0 (owner): Meeting analytics, for people with the Meeting module.
describe("Meeting analytics board", () => {
  it("is offered only with the Meeting module", () => {
    expect(boardsFor({ modules: { approval: false, task: false, information: false, meeting: true }, scopes: ["MINE"] })).toContain("meetings");
    expect(boardsFor({ modules: { approval: true, task: true, information: true }, scopes: ["MINE"] })).not.toContain("meetings");
  });
});
