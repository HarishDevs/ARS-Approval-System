import { describe, expect, it } from "vitest";
import { cleanDraftContent, isEmptyDraft, parseDraftKey } from "@/server/drafts/rules";

describe("draft rules (#3)", () => {
  it("accepts only WF:<id> and CUSTOM keys", () => {
    expect(parseDraftKey("WF:12")).toEqual({ kind: "WORKFLOW", workflowId: 12, key: "WF:12" });
    expect(parseDraftKey("CUSTOM")).toEqual({ kind: "CUSTOM", key: "CUSTOM" });
    for (const bad of ["WF:", "WF:-1", "WF:1;DROP", "custom", "", null, 5]) expect(parseDraftKey(bad)).toBeNull();
  });

  it("keeps text values, drops form machinery and odd keys, refuses oversized content", () => {
    const clean = cleanDraftContent({ title: "Laptop", fields: { amount: "85,000", submissionKey: "x", attachments: "f", $ACTION_ID: "a", "bad key": "v", n: 5 } });
    expect(clean).toEqual({ title: "Laptop", fields: { amount: "85,000" } });
    expect(cleanDraftContent({ title: "x", fields: { notes: "a".repeat(5001) } })).toBeNull();
    expect(cleanDraftContent({ title: "x", fields: "nope" })).toBeNull();
    expect(cleanDraftContent({ title: "x".repeat(300), fields: {} })?.title).toHaveLength(200);
  });

  it("an untouched form isn't worth a draft", () => {
    expect(isEmptyDraft({ title: " ", fields: { amount: "", spec: "{}" } })).toBe(true);
    expect(isEmptyDraft({ title: "", fields: { amount: "5" } })).toBe(false);
  });
});
