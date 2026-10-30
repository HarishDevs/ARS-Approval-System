import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { AddHolidayForm } from "@/features/admin/CalendarForms";
import { HolidayTasksButtons, TaskHolidaySettingsForm } from "@/features/admin/TaskHolidayForms";
import { requireArea } from "@/server/authorization/guards";
import { getWorkingDays } from "@/lib/db/repositories/calendar.repository";
import { loadHolidaySettings, upcomingHolidayLoad } from "@/server/work/holiday-store";

export const metadata: Metadata = { title: "Task holidays" };
export const dynamic = "force-dynamic";

// D-217: what Tasks do with holidays. The holidays are the organisation's
// one list (also used for approval response times): add them here or in
// Working calendar.
export default async function TaskHolidaysPage() {
  await requireArea("admin");
  const [settings, holidays, workingDays] = await Promise.all([loadHolidaySettings(), upcomingHolidayLoad(), getWorkingDays()]);
  return (
    <>
      <PageHeader title="Task holidays" description="When a task's due or start date falls on a holiday, people are warned and can keep the date or move it to a working day. The holidays are the same list as the Working calendar.">
        <Link href="/admin/calendar" className="btn-secondary btn-compact">
          Working calendar
        </Link>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Rules</h2>
          <TaskHolidaySettingsForm settings={settings} />
          <p className="border-t border-line px-5 py-3 text-caption text-ink-muted">Working days now: {workingDays.join(", ")}. Change them in the Working calendar.</p>
        </section>
        <section className="card divide-y divide-line">
          <h2 className="px-5 py-4 font-semibold">Upcoming holidays and the tasks due on them</h2>
          {holidays.length === 0 && <p className="px-5 py-4 text-label text-ink-muted">No upcoming holidays.</p>}
          {holidays.map((holiday) => (
            <div key={holiday.day} className="space-y-2 px-5 py-3 text-label" data-testid="task-holiday">
              <p>
                <span className="font-medium">{holiday.name}</span> <span className="text-ink-muted">· {holiday.day}</span>
                {holiday.openTasks > 0 && <span className="ml-2 text-warning-600">{holiday.openTasks} open task{holiday.openTasks === 1 ? "" : "s"} due</span>}
              </p>
              <HolidayTasksButtons date={holiday.day} count={holiday.openTasks} />
            </div>
          ))}
          <AddHolidayForm />
        </section>
      </div>
    </>
  );
}
