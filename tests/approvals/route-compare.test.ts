import { describe, expect, it } from "vitest";
import { compareRoutes, type RouteSummary } from "@/server/approvals/route-compare";

const route = (stages: [string, string[]][][], skipped: string[] = [], outcome: RouteSummary["outcome"] = "APPROVED"): RouteSummary => ({
  outcome,
  skipped,
  stages: stages.map((stage) => stage.map(([label, people]) => ({ label, rule: "All must approve", people }))),
});

describe("test mode: compare with the live version (#11)", () => {
  it("the same route says so", () => {
    expect(compareRoutes(route([[["HOD", ["Ravi"]]]]), route([[["HOD", ["Ravi"]]]]))).toEqual({ same: true, notes: [] });
  });

  it("names changed, new and removed stages, skips and the outcome", () => {
    const result = compareRoutes(
      route([[["HOD", ["Ravi"]]], [["Finance", ["Meena"]]], [["CFO", ["Arun"]]]], ["Plant head"]),
      route([[["HOD", ["Ravi"]]], [["Finance", ["Kiran"]]]], [], "BLOCKED"),
    );
    expect(result.same).toBe(false);
    expect(result.notes).toEqual([
      "Stage 2: Finance (Meena) (live: Finance (Kiran)).",
      "Stage 3 is new: CFO (Arun).",
      "Now skipped: Plant head.",
      "This version gets through where the live one gets stuck.",
    ]);
    expect(compareRoutes(route([]), route([[["HOD", ["Ravi"]]]])).notes).toEqual(["Stage 1 is no longer there (was HOD (Ravi))."]);
  });
});
