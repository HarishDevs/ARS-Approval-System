import { describe, expect, it } from "vitest";
import { describeEvent, eventKind } from "@/server/approvals/timeline";
import { cleanExpiredReason, expiredReasonError, isExpiredApproval } from "@/server/approvals/expiry-rules";
import { requestStatusDisplay } from "@/features/requests/StatusPill";
import { mayFinishWithoutApprover, parseTypeSettings } from "@/server/workflows/type-settings";

// Owner decisions of 2 Nov 2026: how DR-01, DR-02, DR-05 and DR-09 show to people.
const labels: Record<string, string> = { b: "CFO", y: "Plant head", x: "Finance", j: "Heads complete", m: "Manager" };
const labelOf = (id: string) => labels[id] ?? id;
const nameOf = (id: number) => ({ 3: "Hari (HOD)", 1: "Asha" })[id] ?? `#${id}`;

describe("timeline entries", () => {
  it("DR-09: the route change names the steps added and removed and where it restarted", () => {
    const text = describeEvent({ type: "ROUTE_CHANGED", added: ["b"], removed: ["y"], approverChanged: [], restartNodeIds: ["b"], fromBeginning: false }, labelOf, nameOf);
    expect(text).toBe('Route changed by the new details: it now needs "CFO"; no longer needs "Plant head". It starts again from "CFO"; earlier approvals stand.');
    const fromStart = describeEvent({ type: "ROUTE_CHANGED", added: [], removed: [], approverChanged: ["x"], restartNodeIds: ["start"], fromBeginning: true }, labelOf, nameOf);
    expect(fromStart).toContain('has a new approver for "Finance"');
    expect(fromStart).toContain("It starts again from the beginning.");
    expect(eventKind({ type: "ROUTE_CHANGED", added: [], removed: [], approverChanged: [], restartNodeIds: [], fromBeginning: false })).toBe("resubmit");
  });

  it("DR-01: a branch that ended while the others carry on", () => {
    expect(describeEvent({ type: "BRANCH_ENDED", nodeId: "x", joinId: "j" }, labelOf, nameOf)).toBe('"Finance" was rejected; the other branches of "Heads complete" carry on');
  });

  it("DR-02: sent to the HOD, or to IT when there is none", () => {
    expect(describeEvent({ type: "HUMAN_APPROVAL_ROUTED", nodeId: "m", to: "HOD", userIds: [3] }, labelOf, nameOf)).toContain("sent to Hari (HOD) (head of department)");
    expect(describeEvent({ type: "HUMAN_APPROVAL_ROUTED", nodeId: "m", to: "IT", userIds: [] }, labelOf, nameOf)).toContain("IT has been asked to choose who approves");
  });

  it("DR-05: the reason for using an expired approval", () => {
    const text = describeEvent({ type: "EXPIRED_REUSED", actorId: 1, kind: "FOLLOW_UP", reason: "Work still going on", newRequestId: 9, newRequestNo: "PR-0009" }, labelOf, nameOf);
    expect(text).toBe("Asha raised a follow-up (PR-0009) from this expired approval: Work still going on");
  });
});

describe("DR-05: Expired is derived, never stored", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  it("only an approved request past its valid-until date is expired", () => {
    expect(isExpiredApproval("APPROVED", new Date("2026-11-01T00:00:00Z"), now)).toBe(true);
    expect(isExpiredApproval("APPROVED", new Date("2026-12-01T00:00:00Z"), now)).toBe(false);
    expect(isExpiredApproval("APPROVED", null, now)).toBe(false);
    expect(isExpiredApproval("REJECTED", new Date("2026-11-01T00:00:00Z"), now)).toBe(false);
  });

  it("the status pill reads Expired for an expired approval, Approved otherwise", () => {
    expect(requestStatusDisplay("APPROVED", "2020-01-01T00:00:00Z").label).toBe("Expired");
    expect(requestStatusDisplay("APPROVED", null).label).toBe("Approved");
    expect(requestStatusDisplay("APPROVED").label).toBe("Approved");
    expect(requestStatusDisplay("IN_PROGRESS", "2020-01-01T00:00:00Z").label).toBe("In progress");
  });

  it("a reason is required (at least 5 characters, spaces squeezed)", () => {
    expect(cleanExpiredReason("  still   needed  ")).toBe("still needed");
    expect(expiredReasonError(cleanExpiredReason(" ok "))).toMatch(/expired/);
    expect(expiredReasonError("still needed")).toBeNull();
  });
});

describe("DR-02: the type setting", () => {
  it("is off by default and only counts for predefined types", () => {
    expect(parseTypeSettings({}).mayFinishWithoutApprover).toBe(false);
    const on = parseTypeSettings({ mayFinishWithoutApprover: true });
    expect(mayFinishWithoutApprover({ kind: "PREDEFINED", settings: on })).toBe(true);
    expect(mayFinishWithoutApprover({ kind: "CUSTOM", settings: on })).toBe(false);
    expect(mayFinishWithoutApprover({ kind: "PREDEFINED", settings: parseTypeSettings(null) })).toBe(false);
  });
});
