import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { AddHolidayForm } from "@/features/admin/CalendarForms";
import { DepartmentHolidayForm, HolidayTasksButtons, RemoveDepartmentHolidayButton, TaskExtrasForm, TaskHolidaySettingsForm } from "@/features/admin/TaskHolidayForms";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { DIGEST_SETTINGS_KEY, parseDigestSettings, parseRecurrenceSettings, RECURRENCE_SETTINGS_KEY } from "@/server/work/more-rules";
import { requireArea } from "@/server/authorization/guards";
import { getWorkingDays } from "@/lib/db/repositories/calendar.repository";
import { listDepartmentHolidays, loadHolidaySettings, loadSetting, upcomingHolidayLoad } from "@/server/work/holiday-store";

export const metadata: Metadata = { title: "Task settings" };
export const dynamic = "force-dynamic";

// D-217: what Tasks do with holidays. The holidays are the organisation's
// one list (also used for approval response times): add them here or in
// Working calendar.
export default async function TaskHolidaysPage() {
  await requireArea("admin");
  const [settings, holidays, workingDays, departments, departmentHolidays, digest, recurrence] = await Promise.all([
    loadHolidaySettings(),
    upcomingHolidayLoad(),
    getWorkingDays(),
    listDepartments(),
    listDepartmentHolidays(),
    loadSetting(DIGEST_SETTINGS_KEY).then(parseDigestSettings),
    loadSetting(RECURRENCE_SETTINGS_KEY).then(parseRecurrenceSettings),
  ]);
  return (
    <>
      <PageHeader title="Task settings" description="Holidays for tasks (the same list as the Working calendar, plus department holidays), the morning summary and repeating tasks.">
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
        <section className="card divide-y divide-line">
          <h2 className="px-5 py-4 font-semibold">Department holidays</h2>
          <p className="px-5 py-3 text-caption text-ink-muted">Days off for one department only, for example a plant shutdown. They count for tasks assigned to people in that department, on top of the holidays for everyone.</p>
          {departmentHolidays.length === 0 && <p className="px-5 py-4 text-label text-ink-muted">No upcoming department holidays.</p>}
          {departmentHolidays.map((holiday) => (
            <div key={`${holiday.departmentId}:${holiday.day}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-label" data-testid="department-holiday">
              <span>
                <span className="font-medium">{holiday.name}</span> <span className="text-ink-muted">· {holiday.departmentName} · {holiday.day}</span>
              </span>
              <RemoveDepartmentHolidayButton departmentId={holiday.departmentId} date={holiday.day} />
            </div>
          ))}
          <DepartmentHolidayForm departments={departments.filter((department) => department.active).map((department) => ({ id: department.id, name: department.name }))} />
        </section>
        <section className="card">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Morning summary and repeating tasks</h2>
          <TaskExtrasForm digest={digest} recurrence={recurrence} />
        </section>
      </div>
    </>
  );
}
