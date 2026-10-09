import { describe, expect, it } from "vitest";
import { filterTopics, type HelpTopic } from "@/features/help/HelpTopics";
import { itDetails } from "@/features/help/CopyForIt";
import { pickRequestId } from "@/lib/logging/request-id";

describe("help and details for IT (#13, #14)", () => {
  const topics: HelpTopic[] = [
    { id: "a", group: "How to", title: "Put on hold", body: "Pauses the response time." },
    { id: "b", group: "Statuses", title: "Rejected", body: "Finished, never approved." },
  ];

  it("search matches every word, in title or text", () => {
    expect(filterTopics(topics, "").map((topic) => topic.id)).toEqual(["a", "b"]);
    expect(filterTopics(topics, "HOLD response").map((topic) => topic.id)).toEqual(["a"]);
    expect(filterTopics(topics, "hold rejected")).toEqual([]);
  });

  it("details for IT have the reference and nothing from the address query", () => {
    const text = itDetails({ reference: "8a1b2c3d4e5f6789-BOM", digest: "123", version: "1.5.0", path: "/users/requests/7", userAgent: "UA", screen: "390×844", now: new Date("2026-10-09T06:30:00Z") });
    expect(text).toContain("Reference: 8a1b2c3d4e5f6789-BOM");
    expect(text).toContain("Error code: 123");
    expect(text).toContain("App version: 1.5.0");
    expect(text).toContain("12:00:00");
    expect(itDetails({ reference: "", path: "/x", userAgent: "UA", screen: "1×1", now: new Date() })).not.toContain("Reference");
  });

  it("request ids: keeps a well-formed CF-Ray, otherwise makes a new one", () => {
    expect(pickRequestId("8a1b2c3d4e5f6789-BOM")).toBe("8a1b2c3d4e5f6789-BOM");
    expect(pickRequestId("bad id; drop table", () => "new-id-123")).toBe("new-id-123");
    expect(pickRequestId(null, () => "new-id-123")).toBe("new-id-123");
    expect(pickRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
