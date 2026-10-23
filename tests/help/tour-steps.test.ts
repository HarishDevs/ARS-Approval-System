import { describe, expect, it } from "vitest";
import { TOUR_STEPS, tourStepsFor } from "@/features/help/tour-steps";

// v1.14.0 (D-167): the onboarding tour's steps.
describe("onboarding tour steps", () => {
  it("covers approvals, tasks and the calendar, from welcome to finish", () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("finish");
    for (const id of ["overview", "new-request", "custom", "queue", "my-requests", "tasks", "new-task", "calendar", "google-calendar", "notifications", "out-of-office"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of ["Approvals", "Tasks", "Calendar"]) expect(TOUR_STEPS.some((step) => step.section === section)).toBe(true);
  });

  it("every step says something, and every page it opens is in the user space", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.intro.length).toBeGreaterThan(10);
      expect(step.points.length).toBeGreaterThan(0);
      if (step.path) expect(step.path).toMatch(/^\/users(\/|$)/);
    }
  });

  it("leaves out steps whose page is hidden from the person", () => {
    const steps = tourStepsFor((path) => !path.startsWith("/users/tasks"));
    expect(steps.map((step) => step.id)).not.toContain("tasks");
    expect(steps.map((step) => step.id)).not.toContain("new-task");
    expect(steps.map((step) => step.id)).toContain("notifications"); // no page of its own
    expect(tourStepsFor(() => true)).toHaveLength(TOUR_STEPS.length);
  });
});
