import { describe, expect, it } from "vitest";
import { buildStepMap } from "@/server/approvals/step-map";
import { buildRoad, type Road } from "@/server/approvals/road";
import { decide, startInstance } from "@/server/engine";
import { validateWorkflow } from "@/server/engine/validate";
import { compileBuilder } from "@/server/workflows/builder";
import { arrivedPos, blendRoad, documentOut, planScenes, vanStop } from "@/features/journey/controller";
import { deliveryOf, journeyVersion, overallDelivery } from "@/server/journey/types";
import { levelSubline, statusText, whenDate, whenLong } from "@/features/journey/format";
import { approval, chain, ctx, makeDirectory, user } from "../helpers/engine-fixtures";

// D-273 (owner's journey brief): the journey engine. The engine side (a work
// step that doesn't hold the request up) and the controller that turns two
// confirmed states into the scenes the van plays.
const directory = makeDirectory();
const names = new Map([[2, "Anil"], [3, "Bina"], [4, "Chitra"], [5, "Dev"], [6, "Esha"]]);

function levels(count: number) {
  return chain(...Array.from({ length: count }, (_, index) => approval(`l${index + 1}`, [user((index % 5) + 2)])));
}
function roadOf(definition: ReturnType<typeof levels>, state: ReturnType<typeof startInstance>["state"]): Road {
  return buildRoad(buildStepMap(definition, state, null, names), { status: state.status });
}
function approveNext(definition: ReturnType<typeof levels>, state: ReturnType<typeof startInstance>["state"]) {
  const task = state.tasks.find((item) => item.status === "PENDING")!;
  return decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "APPROVE" }, ctx(), directory).state;
}

describe("background work steps (the request doesn't wait)", () => {
  const definition = chain(approval("work", [user(5)], { type: "ALL" }, { mode: "WORK", background: true }), approval("boss", [user(2)]));

  it("hands the work out and moves straight on to the next level", () => {
    const result = startInstance(definition, ctx(), directory);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "WORK_ASSIGNED", nodeId: "work", userIds: [5] }));
    expect(result.state.nodes.work!.status).toBe("APPROVED");
    expect(result.state.nodes.work!.assigned).toEqual([5]);
    expect(result.state.tasks.filter((task) => task.status === "PENDING").map((task) => task.nodeId)).toEqual(["boss"]);
  });

  it("is an activity, not a checkpoint: the road has only the approval level", () => {
    const state = startInstance(definition, ctx(), directory).state;
    const road = roadOf(definition, state);
    expect(road.checkpoints.map((point) => point.label)).toEqual(["Request submitted", "boss"]);
    expect(road.levels).toBe(1);
    const step = buildStepMap(definition, state, null, names).flatMap((stage) => stage.steps).find((item) => item.nodeId === "work")!;
    expect(step).toMatchObject({ background: true, people: [{ name: "Dev", status: "ASSIGNED" }] });
  });

  it("only a work step may run in the background", () => {
    const bad = chain(approval("a", [user(2)], { type: "ALL" }, { background: true }));
    expect(validateWorkflow(bad).errors.map((error) => error.code)).toContain("BACKGROUND_NOT_WORK");
  });

  it("the builder's 'request waits' box compiles to it", () => {
    const compiled = compileBuilder({
      stages: [
        { kind: "STEP", step: { id: "w", label: "Check papers", type: "WORK", holdsUp: false, approvers: { kind: "PEOPLE", userIds: [5] }, rule: "ALL" } },
        { kind: "STEP", step: { id: "a", label: "Boss", approvers: { kind: "PEOPLE", userIds: [2] }, rule: "ALL" } },
      ],
    } as never);
    expect(compiled.ok).toBe(true);
    const node = compiled.ok ? compiled.definition.nodes.find((item) => item.id === "step_w") : null;
    expect(node).toMatchObject({ mode: "WORK", background: true });
  });
});

describe("the journey controller", () => {
  it("draws an opened request straight in its state (no replay) and only plays the sealing just after submitting", () => {
    const definition = levels(3);
    const road = roadOf(definition, startInstance(definition, ctx(), directory).state);
    expect(planScenes(null, road)).toEqual([]);
    expect(planScenes(null, road, { fresh: true }).map((scene) => scene.kind)).toEqual(["seal", "drive", "unload"]);
    expect(vanStop(road)).toBeCloseTo(1 - 0.34);
    expect(documentOut(road)).toBe(true);
  });

  it("an approval stamps, reloads and drives to the next level; repeated news plays nothing", () => {
    const definition = levels(3);
    let state = startInstance(definition, ctx(), directory).state;
    const before = roadOf(definition, state);
    state = approveNext(definition, state);
    const after = roadOf(definition, state);
    const scenes = planScenes(before, after);
    expect(scenes.map((scene) => scene.kind)).toEqual(["stamp", "reload", "drive", "unload"]);
    expect(scenes[0]).toMatchObject({ kind: "stamp", at: 1, mark: "approve" });
    expect(scenes[2]).toMatchObject({ kind: "drive", to: 2 - 0.34 });
    expect(planScenes(after, after)).toEqual([]);
    // Older news (the road before) is never played backwards.
    expect(planScenes(after, before)).toEqual([]);
  });

  it("works for any number of levels (1, 5, 10) and ends at the flag", () => {
    for (const count of [1, 5, 10]) {
      const definition = levels(count);
      let state = startInstance(definition, ctx(), directory).state;
      let road = roadOf(definition, state);
      expect(road.checkpoints).toHaveLength(count + 1);
      for (let level = 1; level <= count; level += 1) {
        state = approveNext(definition, state);
        const next = roadOf(definition, state);
        const scenes = planScenes(road, next);
        expect(scenes.filter((scene) => scene.kind === "stamp")).toHaveLength(1);
        road = next;
      }
      expect(road.outcome).toBe("APPROVED");
      expect(road.percent).toBe(100);
      expect(vanStop(road)).toBe(arrivedPos(road));
    }
  });

  it("two levels approved between two looks are played in order", () => {
    const definition = levels(3);
    let state = startInstance(definition, ctx(), directory).state;
    const before = roadOf(definition, state);
    state = approveNext(definition, approveNext(definition, state));
    const scenes = planScenes(before, roadOf(definition, state));
    expect(scenes.filter((scene) => scene.kind === "stamp").map((scene) => (scene as { at: number }).at)).toEqual([1, 2]);
    expect(scenes.at(-1)).toMatchObject({ kind: "unload", at: 3 });
  });

  it("the last approval drives to the flag and finishes", () => {
    const definition = levels(2);
    let state = approveNext(definition, startInstance(definition, ctx(), directory).state);
    const before = roadOf(definition, state);
    state = approveNext(definition, state);
    const scenes = planScenes(before, roadOf(definition, state));
    expect(scenes.map((scene) => scene.kind)).toEqual(["stamp", "reload", "drive", "finish"]);
    expect(scenes[2]).toMatchObject({ to: arrivedPos(before) });
  });

  it("a rejection stamps red where the van stopped; changes asked reverses to the start", () => {
    const definition = levels(3);
    const state = startInstance(definition, ctx(), directory).state;
    const before = roadOf(definition, state);
    const task = state.tasks.find((item) => item.status === "PENDING")!;
    const rejected = decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "REJECT", comment: "No budget" }, ctx(), directory).state;
    expect(planScenes(before, roadOf(definition, rejected))).toEqual([{ kind: "stamp", at: 1, mark: "reject" }]);
    const returned = decide(definition, state, { taskId: task.id, actorId: task.approverId, decision: "REQUEST_CHANGES", comment: "Add the quote" }, ctx(), directory).state;
    const back = roadOf(definition, returned);
    expect(planScenes(before, back).map((scene) => scene.kind)).toEqual(["stamp", "reload", "drive"]);
    expect(planScenes(before, back).at(-1)).toMatchObject({ kind: "drive", to: 0 });
    expect(vanStop(back)).toBe(0);
  });

  it("while scenes play, points beyond the van keep their old state", () => {
    const definition = levels(3);
    let state = startInstance(definition, ctx(), directory).state;
    const before = roadOf(definition, state);
    state = approveNext(definition, state);
    const after = roadOf(definition, state);
    const blended = blendRoad(before, after, 0);
    expect(blended.checkpoints[1]!.state).toBe("current");
    expect(blendRoad(before, after, 2).checkpoints[1]!.state).toBe("done");
  });
});

describe("FYI delivery and the journey version", () => {
  it("reads delivery honestly: no message yet or queued is pending, any failure is failed", () => {
    expect(deliveryOf(false, [])).toBe("PENDING");
    expect(deliveryOf(true, [])).toBe("DELIVERED"); // in-app only
    expect(deliveryOf(true, ["SENT", "QUEUED"])).toBe("PENDING");
    expect(deliveryOf(true, ["SENT", "FAILED"])).toBe("FAILED");
    expect(overallDelivery(["DELIVERED", "PENDING"])).toBe("PENDING");
    expect(overallDelivery(["DELIVERED", "FAILED"])).toBe("FAILED");
  });

  it("changes when a linked task changes (it has no request event)", () => {
    const definition = levels(1);
    const road = roadOf(definition, startInstance(definition, ctx(), directory).state);
    const task = { id: 1, taskNo: "TSK-1", title: "t", assignee: "Dev", status: "OPEN" as const, createdAt: "2026-11-02T00:00:00Z", overdue: false, blocking: false };
    expect(journeyVersion(road, [task], [], 5)).not.toBe(journeyVersion(road, [{ ...task, status: "COMPLETED" }], [], 5));
  });
});

// v1.48 (owner's journey design): the header and the Request Status card.
describe("the journey's request facts", () => {
  const road = roadOf(levels(2), startInstance(levels(2), ctx(), directory).state);

  it("a change only in the title, the valid-until date or expiry is news (no request event for expiry)", () => {
    const base = journeyVersion(road, [], [], 5, { title: "Laptops", validUntil: null, expired: false });
    expect(journeyVersion(road, [], [], 5, { title: "Laptops", validUntil: null, expired: false })).toBe(base);
    expect(journeyVersion(road, [], [], 5, { title: "Laptops (6)", validUntil: null, expired: false })).not.toBe(base);
    expect(journeyVersion(road, [], [], 5, { title: "Laptops", validUntil: "2026-11-30T00:00:00.000Z", expired: false })).not.toBe(base);
    expect(journeyVersion(road, [], [], 5, { title: "Laptops", validUntil: "2026-11-30T00:00:00.000Z", expired: true })).not.toBe(journeyVersion(road, [], [], 5, { title: "Laptops", validUntil: "2026-11-30T00:00:00.000Z", expired: false }));
  });

  it("dates read in India time, with the year on the card", () => {
    expect(whenDate("2026-11-01T17:00:00.000Z")).toBe("01 Nov 2026");
    expect(whenLong("2026-11-01T17:00:00.000Z")).toBe("01 Nov 2026, 10:30 pm");
    expect(whenDate(null)).toBeNull();
  });

  it("each milestone says its status and who decided", () => {
    expect(statusText(road.checkpoints[1]!, 1).word).toBe("Waiting for approval");
    expect(statusText(road.checkpoints[2]!, 2).word).toBe("Pending");
    expect(levelSubline(road.checkpoints[0]!, 0, "Harish Kumar")).toBe("by Harish Kumar");
    expect(levelSubline(road.checkpoints[1]!, 1, "Harish Kumar")).toBe("Waiting for approval");
    expect(levelSubline(road.checkpoints[2]!, 2, "Harish Kumar")).toBe("Pending");
    const after = roadOf(levels(2), approveNext(levels(2), startInstance(levels(2), ctx(), directory).state));
    expect(after.checkpoints[1]!.state).toBe("done");
    expect(levelSubline(after.checkpoints[1]!, 1, "Harish Kumar")).toBe("Approved by Anil");
  });
});
