import { describe, expect, it } from "vitest";
import type { InstanceState, WorkflowDefinition } from "@/server/engine";
import type { FormField } from "@/server/forms/fields";
import { diffVersions } from "@/server/workflows/version-diff";
import { checkMigration, cleanMapping, remapState } from "@/server/workflows/migration-plan";

// Version diff and the FN7 migration check (pure).
const form: FormField[] = [
  { key: "amount", label: "Amount", type: "NUMBER", required: true },
  { key: "note", label: "Note", type: "TEXT", required: false },
];

function definition(steps: { id: string; label?: string; userId?: number; completion?: "ALL" | "ANY_ONE"; kind?: "APPROVAL" | "NOTIFY" }[]): WorkflowDefinition {
  const nodes: WorkflowDefinition["nodes"] = [{ id: "start", kind: "START", label: "Start" }];
  for (const step of steps) {
    if (step.kind === "NOTIFY") nodes.push({ id: step.id, kind: "NOTIFY", label: step.label ?? step.id, recipients: [{ type: "USER", userId: step.userId ?? 1 }] });
    else nodes.push({ id: step.id, kind: "APPROVAL", label: step.label ?? step.id, approvers: [{ type: "USER", userId: step.userId ?? 1 }], completion: { type: step.completion ?? "ALL" } });
  }
  nodes.push({ id: "end", kind: "END", label: "End" });
  const chain = ["start", ...steps.map((step) => step.id), "end"];
  return { nodes, edges: chain.slice(1).map((to, index) => ({ id: `e${index}`, from: chain[index]!, to })) };
}

function state(nodes: Record<string, InstanceState["nodes"][string]["status"]>, extra: Partial<InstanceState> = {}): InstanceState {
  return {
    status: "IN_PROGRESS",
    round: 1,
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, status]) => [id, { status }])),
    tasks: Object.entries(nodes)
      .filter(([, status]) => status === "ACTIVE" || status === "APPROVED")
      .filter(([id]) => id !== "start")
      .map(([id, status], index) => ({ id: `t${index}`, nodeId: id, round: 1, approverId: 1, status: status === "ACTIVE" ? "PENDING" : "APPROVED", createdAt: "2026-10-10T00:00:00Z" })),
    joins: {},
    seq: 1,
    ...extra,
  } as InstanceState;
}

const v = (id: number, def: WorkflowDefinition, f: FormField[] = form) => ({ id, definition: def, form: f });

describe("diffVersions", () => {
  it("names added, removed and changed steps, routes and fields", () => {
    const before = { definition: definition([{ id: "a", label: "Manager" }, { id: "b", label: "HOD" }]), form };
    const after = {
      definition: definition([{ id: "a", label: "Line manager", completion: "ANY_ONE" }, { id: "c", label: "Finance" }]),
      form: [{ ...form[0]!, required: false }, { key: "vendor", label: "Vendor", type: "TEXT", required: true }] as FormField[],
    };
    const diff = diffVersions(before, after);
    expect(diff.same).toBe(false);
    expect(diff.steps.added).toEqual([{ id: "c", label: "Finance" }]);
    expect(diff.steps.removed).toEqual([{ id: "b", label: "HOD" }]);
    expect(diff.steps.changed[0]).toMatchObject({ id: "a", changes: expect.arrayContaining(['renamed from "Manager" to "Line manager"', "completion rule changed"]) });
    expect(diff.fields.added.map((item) => item.label)).toEqual(["Vendor"]);
    expect(diff.fields.removed.map((item) => item.label)).toEqual(["Note"]);
    expect(diff.fields.changed[0]).toMatchObject({ id: "amount", changes: ["no longer required"] });
    expect(diff.routes.changed.length + diff.routes.added.length).toBeGreaterThan(0);
  });

  it("two identical versions are the same", () => {
    const def = definition([{ id: "a" }]);
    expect(diffVersions({ definition: def, form }, { definition: def, form }).same).toBe(true);
  });
});

describe("checkMigration", () => {
  const source = v(1, definition([{ id: "a" }, { id: "b" }]));
  const request = (nodes: Record<string, InstanceState["nodes"][string]["status"]>, status: InstanceState["status"] = "IN_PROGRESS") => ({ status, state: state(nodes), formData: { amount: 10 } });

  it("compatible when every reached step is still there", () => {
    const target = v(2, definition([{ id: "a" }, { id: "b" }, { id: "c" }]));
    expect(checkMigration({ source, target, request: request({ start: "APPROVED", a: "ACTIVE", b: "WAITING" }) })).toMatchObject({ verdict: "COMPATIBLE", currentSteps: ["a"] });
  });

  it("warns when a new step comes before where the request is", () => {
    const target = v(2, definition([{ id: "pre", label: "Pre-check" }, { id: "a" }, { id: "b" }]));
    const check = checkMigration({ source, target, request: request({ start: "APPROVED", a: "ACTIVE" }) });
    expect(check).toMatchObject({ verdict: "WARNINGS", reasons: [expect.stringMatching(/"Pre-check" comes before/)] });
  });

  it("warns when the waiting step's approvers or rule changed, or a new required field is empty", () => {
    const target = v(2, definition([{ id: "a", userId: 9, completion: "ANY_ONE" }, { id: "b" }]), [...form, { key: "vendor", label: "Vendor", type: "TEXT", required: true }]);
    const check = checkMigration({ source, target, request: request({ start: "APPROVED", a: "ACTIVE" }) });
    expect(check.verdict).toBe("WARNINGS");
    expect(check.reasons.join(" ")).toMatch(/different approvers.*different rule|different rule.*different approvers/s);
    expect(check.reasons.join(" ")).toMatch(/"Vendor" is a new required field/);
  });

  it("needs manual review when a reached step was removed; a mapping onto the same kind fixes it", () => {
    const target = v(2, definition([{ id: "a2", label: "Approver" }, { id: "b" }]));
    const req = request({ start: "APPROVED", a: "ACTIVE" });
    const check = checkMigration({ source, target, request: req });
    expect(check).toMatchObject({ verdict: "MANUAL", unmapped: [{ id: "a", kind: "APPROVAL" }] });
    const mapping = cleanMapping({ a: "a2" }, source.definition, target.definition);
    expect(mapping).toEqual({ a: "a2" });
    expect(checkMigration({ source, target, request: req, mapping }).verdict).toBe("COMPATIBLE");
    // Steps that still exist can't be remapped, and kinds must match.
    expect(cleanMapping({ b: "a2" }, source.definition, target.definition)).toEqual({});
    const notify = v(3, definition([{ id: "n", kind: "NOTIFY" }, { id: "b" }]));
    expect(cleanMapping({ a: "n" }, source.definition, notify.definition)).toEqual({});
  });

  it("blocks finished requests, same version, a changed step kind, and a part-way parallel join", () => {
    const target = v(2, definition([{ id: "a" }, { id: "b" }]));
    expect(checkMigration({ source, target, request: request({ a: "APPROVED" }, "APPROVED") }).verdict).toBe("BLOCKED");
    expect(checkMigration({ source, target: { ...target, id: 1 }, request: request({ a: "ACTIVE" }) }).verdict).toBe("BLOCKED");
    const kindChanged = v(2, definition([{ id: "a", kind: "NOTIFY" }, { id: "b" }]));
    expect(checkMigration({ source, target: kindChanged, request: request({ start: "APPROVED", a: "ACTIVE" }) }).verdict).toBe("BLOCKED");
    const joined = { status: "IN_PROGRESS" as const, state: state({ start: "APPROVED", a: "ACTIVE" }, { joins: { j: ["gone-edge"] } }), formData: {} };
    expect(checkMigration({ source, target, request: joined }).verdict).toBe("BLOCKED");
  });
});

describe("remapState", () => {
  it("renames the step everywhere and keeps decisions", () => {
    const before = state({ start: "APPROVED", a: "ACTIVE" }, { hold: { nodeId: "a", by: 1, at: "x" }, changesRequested: { nodeId: "a", by: 1, at: "x", comment: "c", openNodeIds: ["a"] } });
    const after = remapState(before, { a: "a2" });
    expect(Object.keys(after.nodes)).toEqual(["start", "a2"]);
    expect(after.tasks.map((task) => task.nodeId)).toEqual(["a2"]);
    expect(after.hold?.nodeId).toBe("a2");
    expect(after.changesRequested).toMatchObject({ nodeId: "a2", openNodeIds: ["a2"] });
    expect(before.nodes.a).toBeDefined(); // the input isn't changed
    expect(remapState(before, {})).toBe(before);
  });

  it("lines the step list up with the target: new steps WAITING, unreached old ones dropped", () => {
    const before = state({ start: "APPROVED", a: "ACTIVE", b: "WAITING" });
    const after = remapState(before, {}, definition([{ id: "a" }, { id: "c" }]));
    expect(after.nodes).toMatchObject({ start: { status: "APPROVED" }, a: { status: "ACTIVE" }, c: { status: "WAITING" }, end: { status: "WAITING" } });
    expect(after.nodes.b).toBeUndefined();
  });
});
