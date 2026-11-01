import { describe, expect, it } from "vitest";
import { buildStepMap, summarizeTracker } from "@/server/approvals/step-map";
import { buildRoad } from "@/server/approvals/road";
import { decide, startInstance } from "@/server/engine";
import type { WorkflowDefinition } from "@/server/engine/types";
import { approval, ctx, edge, end, join, makeDirectory, split, start, user } from "../helpers/engine-fixtures";

// QA-WF-01 (v1.42.1): a parallel level where any one is enough. When A
// approves, the engine closes B as "not required"; the level is done, the
// road's van moves on and the tracker counts it (it said "cancelled" and
// stopped the van before).
const directory = makeDirectory();
const names = new Map([[2, "Anil"], [3, "Bina"], [8, "Meera"]]);
const definition: WorkflowDefinition = {
  nodes: [start(), split("s"), approval("a", [user(2)]), approval("b", [user(3)]), join("j", { type: "ANY_ONE" }), approval("md", [user(8)]), end()],
  edges: [edge("start", "s"), edge("s", "a"), edge("s", "b"), edge("a", "j"), edge("b", "j"), edge("j", "md"), edge("md", "end")],
} as WorkflowDefinition;

describe("a parallel any-one level", () => {
  it("is done once one person approves: the van moves on and the count includes it", () => {
    let state = startInstance(definition, ctx(), directory).state;
    const first = state.tasks.find((task) => task.nodeId === "a" && task.status === "PENDING")!;
    state = decide(definition, state, { taskId: first.id, actorId: 2, decision: "APPROVE" }, ctx(), directory).state;
    const stages = buildStepMap(definition, state, null, names);
    const b = stages.flatMap((stage) => stage.steps).find((step) => step.nodeId === "b")!;
    expect(b.status).toBe("SKIPPED");
    const road = buildRoad(stages, { status: state.status });
    // (Built by hand without the builder's layout, each parallel step is its own checkpoint.)
    expect(road.checkpoints.map((point) => point.state)).toEqual(["done", "done", "skipped", "current"]);
    expect(road.checkpoints[road.vanAt]!.label).toBe("md"); // the van is at Meera's level, not stuck at B
    // Meera approves: fully approved, every step counted.
    const last = state.tasks.find((task) => task.nodeId === "md" && task.status === "PENDING")!;
    state = decide(definition, state, { taskId: last.id, actorId: 8, decision: "APPROVE" }, ctx(), directory).state;
    const done = summarizeTracker(buildStepMap(definition, state, null, names), { status: state.status, requesterName: "Ravi" });
    expect(done).toMatchObject({ headline: "Fully approved", done: 3, total: 3 });
  });
});
