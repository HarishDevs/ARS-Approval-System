import { describe, expect, it } from "vitest";
import { parseReceipts } from "@/server/notifications/receipts";

// S8-03: receipts in Meta's shape or a flat shape; nothing else counts.
describe("WhatsApp delivery receipts", () => {
  it("reads Meta's webhook shape", () => {
    const meta = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.A", status: "delivered" }, { id: "wamid.B", status: "read" }, { id: "wamid.C", status: "sent" }] } }] }] };
    expect(parseReceipts(meta)).toEqual([
      { messageId: "wamid.A", status: "DELIVERED" },
      { messageId: "wamid.B", status: "READ" },
    ]);
  });

  it("reads a flat receipt or a list of them", () => {
    expect(parseReceipts({ waMessageId: "w1", status: "DELIVERED" })).toEqual([{ messageId: "w1", status: "DELIVERED" }]);
    expect(parseReceipts([{ messageId: "w2", status: "read" }])).toEqual([{ messageId: "w2", status: "READ" }]);
  });

  it("ignores anything without an id or a known status", () => {
    expect(parseReceipts({ status: "read" })).toEqual([]);
    expect(parseReceipts({ id: "x", status: "failed" })).toEqual([]);
    expect(parseReceipts("nonsense")).toEqual([]);
  });
});
