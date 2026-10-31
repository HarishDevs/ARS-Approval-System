import { describe, expect, it, vi } from "vitest";
import { runResult, sendToEach } from "@/server/reports/send-each";

// D-243 (audit DB-013): a scheduled report with several recipients sends to
// each on their own; one failure doesn't stop the others.
describe("scheduled report recipients", () => {
  it("a failure for the 2nd of 3 still sends to the 3rd, and the run is a partial success", async () => {
    const sent: string[] = [];
    const onError = vi.fn();
    const outcome = await sendToEach(
      ["owner@example.test", "bad@example.test", "third@example.test"],
      async (to) => {
        if (to.startsWith("bad")) throw new Error("Resend rejected the email (HTTP 422).");
        sent.push(to);
      },
      onError,
    );
    expect(sent).toEqual(["owner@example.test", "third@example.test"]);
    expect(outcome).toEqual({ sent: 2, failed: 1, firstError: "Error: Resend rejected the email (HTTP 422)." });
    expect(onError).toHaveBeenCalledOnce();
    const result = runResult(outcome, 3);
    expect(result.status).toBe("SENT");
    expect(result.note).toContain("Sent to 2 of 3; 1 failed");
  });

  it("everyone failing is a FAILED run; everyone sent adds no note", async () => {
    const none = await sendToEach([1, 2], async () => {
      throw new Error("down");
    });
    expect(runResult(none, 2)).toMatchObject({ status: "FAILED", note: expect.stringContaining("Not sent to anyone") });
    const all = await sendToEach([1, 2], async () => undefined);
    expect(runResult(all, 2)).toEqual({ status: "SENT", note: "" });
  });
});
