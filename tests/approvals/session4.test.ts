import { describe, expect, it } from "vitest";
import { decide, reassignTask, startInstance } from "@/server/engine";
import { EngineError } from "@/server/engine/types";
import { compileBuilder, newStep, type BuilderSpec } from "@/server/workflows/builder";
import { deriveDoaTable } from "@/server/workflows/doa";
import { checkCustomSpec } from "@/server/approvals/service";
import { checkDelegationInput } from "@/server/approvals/collab";
import { slaActions } from "@/server/jobs/sla";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

const directory = makeDirectory();

describe("handover: reassignTask (F-16)", () => {
  const definition = chain(approval("ed", [user(7)]), approval("md", [user(8)]));

  it("moves a pending task to the new person, who can then decide it", () => {
    const { state } = startInstance(definition, ctx(), directory);
    const task = state.tasks[0]!;
    const moved = reassignTask(state, { taskId: task.id, toUserId: 9, actorId: 4 }, ctx(), directory);
    expect(moved.events).toEqual([{ type: "TASK_REASSIGNED", taskId: task.id, nodeId: "ed", fromId: 7, toId: 9, actorId: 4 }]);
    expect(() => decide(definition, moved.state, { taskId: task.id, actorId: 7, decision: "APPROVE" }, ctx(), directory)).toThrow(EngineError);
    const done = decide(definition, moved.state, { taskId: task.id, actorId: 9, decision: "APPROVE" }, ctx(), directory);
    expect(done.state.nodes.md!.status).toBe("ACTIVE");
  });

  it("refuses the requester, inactive people, same person and decided tasks", () => {
    const { state } = startInstance(definition, ctx(), directory);
    const task = state.tasks[0]!;
    expect(() => reassignTask(state, { taskId: task.id, toUserId: 1, actorId: 4 }, ctx(), directory)).toThrow(/own request/);
    expect(() => reassignTask(state, { taskId: task.id, toUserId: 11, actorId: 4 }, ctx(), directory)).toThrow(/active/);
    expect(() => reassignTask(state, { taskId: task.id, toUserId: 7, actorId: 4 }, ctx(), directory)).toThrow(/already has/);
    const decided = decide(definition, state, { taskId: task.id, actorId: 7, decision: "APPROVE" }, ctx(), directory).state;
    expect(() => reassignTask(decided, { taskId: task.id, toUserId: 9, actorId: 4 }, ctx(), directory)).toThrow(/no longer pending/);
  });

  it("won't put two tasks on one step for the same person", () => {
    const pair = chain(approval("pair", [user(7), user(8)]));
    const { state } = startInstance(pair, ctx(), directory);
    expect(() => reassignTask(state, { taskId: state.tasks[0]!.id, toUserId: 8, actorId: 4 }, ctx(), directory)).toThrow(/already an approver/);
  });

  it("a delegate acts on behalf, recorded as actor + on-behalf-of (D-062)", () => {
    const { state } = startInstance(definition, ctx(), directory);
    const result = decide(definition, state, { taskId: state.tasks[0]!.id, actorId: 12, decision: "APPROVE" }, ctx(), directory);
    expect(result.state.tasks[0]).toMatchObject({ decidedBy: 12, onBehalfOf: 7, status: "APPROVED" });
  });
});

describe("custom approvals (D-060)", () => {
  it("refuses a step made only of the requester", () => {
    const spec: BuilderSpec = { stages: [{ kind: "STEP", step: { ...newStep("a", "Me"), approvers: { kind: "PEOPLE", userIds: [5] } } }] };
    expect(checkCustomSpec(spec, 5)).toHaveLength(1);
    const ok: BuilderSpec = { stages: [{ kind: "STEP", step: { ...newStep("a", "Boss"), approvers: { kind: "PEOPLE", userIds: [5, 6] } } }] };
    expect(checkCustomSpec(ok, 5)).toEqual([]);
  });
});

describe("delegation dates (D-062)", () => {
  const base = { userId: 5, delegateId: 6, startsOn: "2026-10-01", endsOn: "2026-10-10" };
  it("accepts a normal range and refuses bad ones", () => {
    expect(checkDelegationInput(base, "2026-10-01")).toBeNull();
    expect(checkDelegationInput({ ...base, delegateId: 5 }, "2026-10-01")).toMatch(/own delegate/);
    expect(checkDelegationInput({ ...base, endsOn: "2026-09-30" }, "2026-09-01")).toMatch(/before/);
    expect(checkDelegationInput({ ...base, startsOn: "2026-09-01", endsOn: "2026-09-05" }, "2026-10-01")).toMatch(/past/);
    expect(checkDelegationInput({ ...base, endsOn: "2027-01-15" }, "2026-10-01")).toMatch(/90 days/);
  });
});

describe("SLA (D-063)", () => {
  it("reminds once when due and escalates once at twice the time", () => {
    expect(slaActions({ taskId: 1, isDue: true, isEscalationDue: false, reminded: false, escalated: false })).toEqual(["REMINDER"]);
    expect(slaActions({ taskId: 1, isDue: true, isEscalationDue: false, reminded: true, escalated: false })).toEqual([]);
    expect(slaActions({ taskId: 1, isDue: true, isEscalationDue: true, reminded: true, escalated: false })).toEqual(["ESCALATION"]);
    expect(slaActions({ taskId: 1, isDue: true, isEscalationDue: true, reminded: false, escalated: false })).toEqual(["REMINDER", "ESCALATION"]);
  });

  it("the builder carries respond-within hours onto the step", () => {
    const result = compileBuilder({ stages: [{ kind: "STEP", step: { ...newStep("a"), slaHours: 24 } }] });
    if (!result.ok) throw new Error();
    expect(result.definition.nodes.find((node) => node.id === "step_a")).toMatchObject({ slaHours: 24 });
  });
});

describe("DoA view (D-065)", () => {
  it("turns amount skip conditions into bands", () => {
    const spec: BuilderSpec = {
      stages: [
        { kind: "STEP", step: newStep("hod", "HOD") },
        { kind: "STEP", step: { ...newStep("ed", "ED"), skipWhen: { field: "amount", operator: "LTE", value: 100000 } } },
        { kind: "STEP", step: { ...newStep("md", "MD"), skipWhen: { field: "amount", operator: "LTE", value: 500000 } } },
        { kind: "STEP", step: { ...newStep("fin", "Finance"), skipWhen: { field: "nature", operator: "EQ", value: "Opex" } } },
      ],
    };
    const table = deriveDoaTable(spec);
    expect(table.bands).toEqual([
      { from: 0, to: 100000, levels: ["HOD", "Finance"] },
      { from: 100001, to: 500000, levels: ["HOD", "ED", "Finance"] },
      { from: 500001, to: null, levels: ["HOD", "ED", "MD", "Finance"] },
    ]);
    expect(table.otherConditions).toEqual(["Finance (depends on nature)"]);
  });

  it("a workflow without amount rules is one band", () => {
    expect(deriveDoaTable({ stages: [{ kind: "STEP", step: newStep("a", "A") }] }).bands).toEqual([{ from: 0, to: null, levels: ["A"] }]);
  });
});

describe("multi-level escalation (D-100)", () => {
  it("adds one level per extra response time, up to the levels allowed, each once", () => {
    const base = { taskId: 1, isDue: true, isEscalationDue: false, reminded: false, escalated: false };
    expect(slaActions({ ...base, levelsDue: 3, levelsAllowed: 2, sent: [] })).toEqual(["REMINDER", "ESCALATION", "ESCALATION_2"]);
    expect(slaActions({ ...base, levelsDue: 3, levelsAllowed: 3, sent: ["REMINDER", "ESCALATION"] })).toEqual(["ESCALATION_2", "ESCALATION_3"]);
    expect(slaActions({ ...base, levelsDue: 1, levelsAllowed: 3, sent: ["REMINDER", "ESCALATION"] })).toEqual([]);
  });
});
