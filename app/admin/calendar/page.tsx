import { PageHeader } from "@/features/shell/PageHeader";
import { AddHolidayForm, RemoveHolidayButton, WorkingDaysForm } from "@/features/admin/CalendarForms";
import { requireArea } from "@/server/authorization/guards";
import { getWorkingDays, listHolidays } from "@/lib/db/repositories/calendar.repository";
import { WEEKDAYS } from "@/server/workflows/calendar";

// F-31 / D-067: response times count only working days.
export default async function CalendarPage() {
  await requireArea("admin");
  const [workingDays, holidays] = await Promise.all([getWorkingDays(), listHolidays()]);
  return (
    <>
      <PageHeader
        title="Working calendar"
        description="Response times (“respond within N hours”) only count working days. Changes apply to approvals that start afterwards."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Working days</h2>
          <WorkingDaysForm days={WEEKDAYS} selected={workingDays} />
        </section>
        <section className="card divide-y divide-line">
          <h2 className="px-5 py-4 font-semibold">Holidays</h2>
          {holidays.length === 0 && <p className="px-5 py-4 text-label text-ink-muted">No upcoming holidays.</p>}
          {holidays.map((holiday) => (
            <div key={holiday.date} className="flex items-center justify-between gap-3 px-5 py-3 text-label">
              <span>
                <span className="font-medium">{holiday.name}</span> <span className="text-ink-muted">· {holiday.date}</span>
              </span>
              <RemoveHolidayButton date={holiday.date} />
            </div>
          ))}
          <AddHolidayForm />
        </section>
      </div>
    </>
  );
}
