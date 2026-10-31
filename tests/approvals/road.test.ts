import { describe, expect, it } from "vitest";
import { buildRoad, miniRoad } from "@/server/approvals/road";
import type { MapStage, MapStep } from "@/server/approvals/step-map";

// D-253: the road's checkpoints, van and percentage from the level map.
const step = (label: string, status: MapStep["status"], people: { name: string; status: string; decidedAt?: string }[] = [], extra: Partial<MapStep> = {}): MapStep => ({
  nodeId: label,
  label,
  status,
  rule: "Any one",
  people: people.map((person, index) => ({ userId: index + 1, name: person.name, status: person.status as never, ...(person.decidedAt ? { decidedAt: person.decidedAt } : {}) })),
  ...extra,
});
const single = (label: string, status: MapStep["status"], people: { name: string; status: string; decidedAt?: string }[] = []): MapStage => ({ kind: "STEP", label, steps: [step(label, status, people)] });

describe("the approval road", () => {
  it("four points: submitted, then each level; the van waits at the active one", () => {
    const road = buildRoad([single("HOD", "APPROVED", [{ name: "Hari", status: "APPROVED", decidedAt: "2026-11-01T05:00:00Z" }]), single("Finance", "ACTIVE"), single("Management", "WAITING")], { status: "IN_PROGRESS", submittedAt: "2026-11-01T04:30:00Z" });
    expect(road.checkpoints.map((point) => point.label)).toEqual(["Request submitted", "HOD", "Finance", "Management"]);
    expect(road.checkpoints.map((point) => point.state)).toEqual(["done", "done", "current", "waiting"]);
    expect(road.vanAt).toBe(2);
    expect(road.levelsDone).toBe(1);
    expect(road.levels).toBe(3);
    expect(road.percent).toBe(33);
    expect(road.checkpoints[1]!.finishedAt).toBe("2026-11-01T05:00:00Z");
    expect(road.outcome).toBeNull();
  });

  it("fully approved: the van reaches the finish and only then 100%", () => {
    const road = buildRoad([single("HOD", "APPROVED"), single("MD", "APPROVED")], { status: "APPROVED" });
    expect(road.vanAt).toBe(2);
    expect(road.percent).toBe(100);
    expect(road.outcome).toBe("APPROVED");
    // Every level finished but the request not approved (e.g. a last check): never 100%.
    expect(buildRoad([single("HOD", "APPROVED")], { status: "IN_PROGRESS" }).percent).toBe(99);
  });

  it("a parallel level is one checkpoint and the van stays until the level is complete", () => {
    const parallel: MapStage = {
      kind: "PARALLEL",
      label: "Managers",
      joinRule: "All must approve",
      steps: [step("A", "APPROVED", [{ name: "A", status: "APPROVED" }]), step("B", "APPROVED", [{ name: "B", status: "APPROVED" }]), step("C", "ACTIVE", [{ name: "C", status: "PENDING" }])],
    };
    const road = buildRoad([parallel, single("MD", "WAITING")], { status: "IN_PROGRESS" });
    expect(road.checkpoints).toHaveLength(3);
    expect(road.checkpoints[1]).toMatchObject({ label: "Managers", parallel: true, state: "current", rule: "All must approve" });
    expect(road.checkpoints[1]!.people).toHaveLength(3);
    expect(road.vanAt).toBe(1);
  });

  it("only the path a choice took; an undecided choice is one checkpoint; FYI levels are left out", () => {
    const choice: MapStage = {
      kind: "CHOICE",
      label: "Amount over 1 lakh?",
      steps: [],
      paths: [
        { label: "Yes", taken: true, stages: [single("Director", "ACTIVE")] },
        { label: "No", taken: false, stages: [single("Manager", "WAITING")] },
      ],
    };
    const fyi: MapStage = { kind: "STEP", label: "Tell accounts", steps: [step("Tell accounts", "APPROVED", [], { type: "NOTIFY" })] };
    const road = buildRoad([single("HOD", "APPROVED"), fyi, choice], { status: "IN_PROGRESS" });
    expect(road.checkpoints.map((point) => point.label)).toEqual(["Request submitted", "HOD", "Director"]);
    const open: MapStage = { ...choice, paths: choice.paths!.map((path) => ({ ...path, taken: null })) };
    expect(buildRoad([single("HOD", "ACTIVE"), open], { status: "IN_PROGRESS" }).checkpoints.map((point) => point.label)).toEqual(["Request submitted", "HOD", "Amount over 1 lakh?"]);
  });

  it("rejected stops where it was rejected and never reaches the finish", () => {
    const road = buildRoad([single("HOD", "APPROVED"), single("Finance", "REJECTED"), single("MD", "CANCELLED")], { status: "REJECTED" });
    expect(road.outcome).toBe("REJECTED");
    expect(road.vanAt).toBe(2);
    expect(road.checkpoints[2]!.state).toBe("rejected");
    expect(road.percent).toBeLessThan(100);
  });

  it("changes asked, on hold and stuck are amber states at the current level; withdrawn mutes what's left", () => {
    expect(buildRoad([single("HOD", "ACTIVE")], { status: "CHANGES_REQUIRED" }).checkpoints[1]!.state).toBe("returned");
    expect(buildRoad([single("HOD", "ACTIVE")], { status: "ON_HOLD", holdSince: "2026-11-01T06:00:00Z" }).checkpoints[1]).toMatchObject({ state: "hold", since: "2026-11-01T06:00:00Z" });
    expect(buildRoad([single("HOD", "BLOCKED")], { status: "IN_PROGRESS" }).checkpoints[1]!.state).toBe("blocked");
    const withdrawn = buildRoad([single("HOD", "APPROVED"), single("MD", "ACTIVE")], { status: "CANCELLED" });
    expect(withdrawn.checkpoints.map((point) => point.state)).toEqual(["done", "done", "cancelled"]);
    expect(withdrawn.outcome).toBe("CANCELLED");
  });

  it("skipped levels count as passed; ten or more levels each get a checkpoint", () => {
    const many = Array.from({ length: 12 }, (_, index) => single(`Level ${index + 1}`, index < 4 ? (index === 2 ? "SKIPPED" : "APPROVED") : index === 4 ? "ACTIVE" : "WAITING"));
    const road = buildRoad(many, { status: "IN_PROGRESS" });
    expect(road.checkpoints).toHaveLength(13);
    expect(road.checkpoints[3]!.state).toBe("skipped");
    expect(road.levelsDone).toBe(4);
    expect(road.vanAt).toBe(5);
  });

  it("the version changes with any visible change (so repeated news is ignored)", () => {
    const before = buildRoad([single("HOD", "ACTIVE", [{ name: "H", status: "PENDING" }])], { status: "IN_PROGRESS" });
    const same = buildRoad([single("HOD", "ACTIVE", [{ name: "H", status: "PENDING" }])], { status: "IN_PROGRESS" });
    const after = buildRoad([single("HOD", "APPROVED", [{ name: "H", status: "APPROVED" }])], { status: "APPROVED" });
    expect(same.version).toBe(before.version);
    expect(after.version).not.toBe(before.version);
    expect(miniRoad(after)).toMatchObject({ percent: 100, outcome: "APPROVED", current: null });
    expect(miniRoad(before)).toMatchObject({ percent: 0, current: "HOD", state: "current" });
  });
});
