import { describe, expect, it } from "vitest";
import { hodReportText, hodWeekDue } from "@/server/reports/hod-weekly-text";

// D-247 (audit FI-D01): the weekly HOD report's timing and wording.
describe("weekly HOD report", () => {
  it("is due from Monday 09:00 India time, for the 7 days before that Monday", () => {
    expect(hodWeekDue(new Date("2026-11-02T03:29:00Z"))).toBeNull(); // Monday 2 Nov 2026, 08:59 IST: not yet
    expect(hodWeekDue(new Date("2026-11-03T03:29:00Z"))).not.toBeNull(); // Tuesday: due (since Monday 09:00)
    const due = hodWeekDue(new Date("2026-11-02T03:30:00Z"))!; // Monday 09:00 IST
    expect(due.weekStart).toBe("2026-11-02");
    expect(due.label).toBe("2026-10-26 to 2026-11-01");
    expect(due.to.toISOString()).toBe("2026-11-01T18:30:00.000Z"); // Monday 00:00 IST
    expect(due.to.getTime() - due.from.getTime()).toBe(7 * 86_400_000);
    // Later in the same week it is still that week (a runner that was down catches up).
    expect(hodWeekDue(new Date("2026-11-08T17:00:00Z"))!.weekStart).toBe("2026-11-02");
  });

  it("says the week's numbers and the oldest waiting requests", () => {
    const text = hodReportText({
      department: "Purchase",
      hodName: "Harini",
      weekLabel: "2026-10-26 to 2026-11-01",
      stats: { raised: 4, approved: 2, rejected: 1, openNow: 3, overdueNow: 1, oldest: [{ requestNo: "PUR-2026-000001", title: "Crane", submittedAt: new Date("2026-10-20T05:00:00Z") }] },
      link: "https://approval.arssteels.net/admin/analytics",
    });
    expect(text).toContain("Requests raised by your department in the week: 4");
    expect(text).toContain("Overdue now (an approval past its response time): 1");
    expect(text).toContain("- PUR-2026-000001: Crane (since 2026-10-20)");
  });
});
