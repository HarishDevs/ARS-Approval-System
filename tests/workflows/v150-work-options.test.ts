import { describe, expect, it } from "vitest";
import { builderSpecSchema, compileBuilder, type BuilderSpec } from "@/server/workflows/builder";
import { limitKey } from "@/server/auth/rate-limit";

// v1.50.0 (owner): a work step carries the task's priority and due date into
// the workflow; (security review) one rate-limit bucket per mobile number.
const spec: BuilderSpec = {
  stages: [
    { kind: "STEP", step: { id: "mgr", label: "Manager", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL" } },
    { kind: "STEP", step: { id: "fix", label: "Fix the pump", type: "WORK", approvers: { kind: "PEOPLE", userIds: [7] }, rule: "ALL", workPriority: "URGENT", workDueOn: "2031-01-15" } },
    { kind: "STEP", step: { id: "ok", label: "Approver", approvers: { kind: "PEOPLE", userIds: [8] }, rule: "ALL", workPriority: "HIGH", workDueOn: "2031-01-15" } },
  ],
};

describe("work step priority and due date", () => {
  it("reach the work step's node, and only work steps", () => {
    const result = compileBuilder(builderSpecSchema.parse(spec));
    if (!result.ok) throw new Error(result.errors.join("; "));
    const work = result.definition.nodes.find((node) => node.id === "step_fix");
    const approve = result.definition.nodes.find((node) => node.id === "step_ok");
    expect(work).toMatchObject({ mode: "WORK", workPriority: "URGENT", workDueOn: "2031-01-15" });
    expect(approve).not.toHaveProperty("workPriority");
    expect(approve).not.toHaveProperty("workDueOn");
  });

  it("refuses a due date that isn't a date", () => {
    const bad = { stages: [{ kind: "STEP", step: { id: "fix", label: "Fix", type: "WORK", approvers: { kind: "REQUESTER_MANAGER" }, rule: "ALL", workDueOn: "15/01/2031" } }] };
    expect(builderSpecSchema.safeParse(bad).success).toBe(false);
  });
});

describe("sign-in rate-limit key", () => {
  it("is the same for one mobile number however it is typed", () => {
    expect(limitKey("98765 43210")).toBe("9876543210");
    expect(limitKey("+91-98765-43210")).toBe("9876543210");
    expect(limitKey("919876543210")).toBe("9876543210");
    expect(limitKey("  RAVI01 ")).toBe("ravi01");
    expect(limitKey("Name@Example.com")).toBe("name@example.com");
  });
});
