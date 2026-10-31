import { describe, expect, it } from "vitest";
import { normaliseRecordNumber, parseSearchFilters } from "@/server/search/filters";
import { normaliseWhatsAppNumber } from "@/server/admin/user-rules";
import { levelState } from "@/features/requests/StepMap";
import type { MapStage } from "@/server/approvals/step-map";

// D-234: the UX-law changes that are pure logic.
describe("Postel: input read the way people type it", () => {
  it("request numbers without dashes, with spaces or without leading zeros", () => {
    for (const typed of ["pur2026123", "PUR 2026 123", "pur-2026-000123", "Pur/2026/123", "PUR.2026.000123"]) expect(normaliseRecordNumber(typed)).toBe("PUR-2026-000123");
    expect(normaliseRecordNumber("laptop for Ravi")).toBe("laptop for Ravi");
    expect(parseSearchFilters({ q: "edl 2026 7" }).q).toBe("EDL-2026-000007");
  });
  it("a WhatsApp number with the trunk 0", () => {
    expect(normaliseWhatsAppNumber("09876543210")).toBe("919876543210");
    expect(normaliseWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(normaliseWhatsAppNumber("98765-43210")).toBe("919876543210");
  });
});

describe("Goal gradient: a level's state in the approval stepper", () => {
  const step = (status: string, notTaken = false) => ({ nodeId: status, label: status, status, rule: "", people: [], notTaken }) as unknown as MapStage["steps"][number];
  it("done, now, to come, stopped", () => {
    expect(levelState({ kind: "STEP", label: "A", steps: [step("APPROVED")] })).toBe("done");
    expect(levelState({ kind: "PARALLEL", label: "B", steps: [step("APPROVED"), step("ACTIVE")] })).toBe("current");
    expect(levelState({ kind: "STEP", label: "C", steps: [step("WAITING")] })).toBe("upcoming");
    expect(levelState({ kind: "STEP", label: "D", steps: [step("REJECTED")] })).toBe("stopped");
    expect(levelState({ kind: "STEP", label: "E", steps: [step("SKIPPED"), step("WAITING", true)] })).toBe("done");
  });
});
