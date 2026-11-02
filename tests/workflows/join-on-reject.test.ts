import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder, newStep, type BuilderSpec } from "@/server/workflows/builder";
import { validateWorkflow } from "@/server/engine/validate";

// DR-01 (owner, 2 Nov 2026): a parallel level's "if one branch rejects"
// choice compiles onto its join, only for "any one" / "any N".
const spec = (join: "ALL" | "ANY_ONE" | "ANY_N", onReject?: "END" | "WHEN_UNREACHABLE"): BuilderSpec =>
  builderSpecSchema.parse({
    stages: [{ kind: "PARALLEL", id: "p", label: "Heads", join, ...(join === "ANY_N" ? { n: 2 } : {}), ...(onReject ? { onReject } : {}), steps: [newStep("a"), newStep("b"), newStep("c")] }],
  });

const joinOf = (input: BuilderSpec) => {
  const compiled = compileBuilder(input);
  if (!compiled.ok) throw new Error(compiled.errors.join(" "));
  return { definition: compiled.definition, join: compiled.definition.nodes.find((node) => node.kind === "JOIN")! };
};

describe("parallel level: if one branch rejects (DR-01)", () => {
  it("WHEN_UNREACHABLE on any one / any N is written on the join and passes validation", () => {
    for (const rule of ["ANY_ONE", "ANY_N"] as const) {
      const { definition, join } = joinOf(spec(rule, "WHEN_UNREACHABLE"));
      expect(join).toMatchObject({ kind: "JOIN", onReject: "WHEN_UNREACHABLE" });
      expect(validateWorkflow(definition).valid).toBe(true);
    }
  });

  it("END, no choice, or an ALL join leave the join as before (absent = END)", () => {
    expect(joinOf(spec("ANY_ONE", "END")).join).not.toHaveProperty("onReject");
    expect(joinOf(spec("ANY_ONE")).join).not.toHaveProperty("onReject");
    expect(joinOf(spec("ALL", "WHEN_UNREACHABLE")).join).not.toHaveProperty("onReject");
  });

  it("only the two values are accepted", () => {
    const result = builderSpecSchema.safeParse({ stages: [{ kind: "PARALLEL", id: "p", label: "P", join: "ANY_ONE", onReject: "LATER", steps: [newStep("a"), newStep("b")] }] });
    expect(result.success).toBe(false);
  });
});
