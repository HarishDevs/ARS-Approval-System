import { describe, expect, it } from "vitest";
import { softFailure } from "@/server/ops/automation";

// D-248 (V181-A6, audit AUD-17): a step that reports its own failure is a failed run.
describe("job steps that report their own failure", () => {
  it("are failures, with the reason", () => {
    expect(softFailure({ templateSync: "failed: CEOITBox said 401" })).toBe("TEMPLATESYNC_FAILED: CEOITBox said 401");
    expect(softFailure({ backup: "FAILED" })).toBe("BACKUP_FAILED");
    expect(softFailure({ backup: "DONE", offsite: "FAILED", offsiteError: "HTTP 403" })).toBe("OFFSITE_FAILED: HTTP 403");
    expect(softFailure({ salesforce: "failed" })).toBe("SALESFORCE_FAILED");
  });
  it("counts and other words are not", () => {
    expect(softFailure({ templateSync: "synced", failed: 0, sent: 3 })).toBeNull();
    expect(softFailure({ templateSync: "skipped: no CEOITBox key" })).toBeNull();
    expect(softFailure({ backup: "DONE", offsite: "OFF" })).toBeNull();
  });
});
