import { describe, expect, it } from "vitest";
import { change, compact, costEstimate, duration, failureReason, groupFailures, percent, toolLabel } from "@/server/ai/analytics";

// D-193: AI Analytics arithmetic and words.
describe("AI analytics", () => {
  it("percent, change and cost", () => {
    expect(percent(3, 4)).toBe(75);
    expect(percent(1, 0)).toBeNull();
    expect(change(120, 100)).toBe("+20%");
    expect(change(80, 100)).toBe("−20%");
    expect(change(5, 0)).toBe("new");
    expect(change(0, 0)).toBe("same");
    expect(change(null, 3)).toBeNull();
    expect(costEstimate(2_000_000, 500_000, 50, 200)).toBe(200);
    expect(costEstimate(1, 1, null, 2)).toBeNull();
  });
  it("durations, compact numbers and tool names read plainly", () => {
    expect(duration(850)).toBe("850 ms");
    expect(duration(2_340)).toBe("2.3 s");
    expect(duration(null)).toBe("—");
    expect(compact(15_400)).toBe("15k");
    expect(compact(2_500_000)).toBe("2.5M");
    expect(toolLabel("salesforce_group")).toBe("Salesforce: breakdowns");
    expect(toolLabel("new_tool")).toBe("new tool");
  });
  it("technical failures are grouped into plain reasons", () => {
    expect(failureReason("Groq: The provider's rate limit or quota was reached (…)")).toBe("Provider rate limit or quota");
    expect(failureReason("DeepSeek: The provider refused the request (HTTP 402) (Insufficient Balance)")).toBe("Provider account out of credit");
    expect(failureReason("Stopped.")).toBe("Stopped by the person");
    expect(failureReason("something new")).toBe("Other");
    expect(groupFailures([{ error: "rate limit", count: 2 }, { error: "quota", count: 3 }, { error: "x", count: 1 }])).toEqual([{ reason: "Provider rate limit or quota", count: 5 }, { reason: "Other", count: 1 }]);
  });
});
