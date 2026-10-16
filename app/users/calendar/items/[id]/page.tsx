import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { EntryForm } from "@/features/calendar/EntryForm";
import { CommandButton } from "@/features/integrations/CalendarForms";
import { deleteCalendarItemAction } from "@/app/users/calendar-actions";
import { personalItem } from "@/server/calendar/service";

export const metadata: Metadata = { title: "Calendar entry" };
export const dynamic = "force-dynamic";

const indiaParts = (value: Date) => {
  const iso = new Date(value.getTime() + 330 * 60_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

// v1.11.0: a personal calendar entry. Only its owner can open it; anyone
// else gets the same 404 as a missing page.
export default async function CalendarItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const item = await personalItem({ id: user.id, roles: user.roles }, Number(id));
  if (!item) notFound();
  const start = item.startsAt ? indiaParts(item.startsAt) : null;
  const end = item.endsAt ? indiaParts(item.endsAt) : null;
  return (
    <>
      <Breadcrumbs items={[{ href: "/users/calendar", label: "Calendar" }, { label: "Entry" }]} />
      <PageHeader title={item.title} description={item.origin === "GOOGLE" ? "From your Google Calendar. Changes here go back to Google." : "Your personal entry."} />
      {item.recurring && <p className="mb-4 text-label text-warning-600">This is a repeating Google event. ARS shows its first occurrence; change the series in Google Calendar.</p>}
      <section className="card max-w-2xl p-4">
        <EntryForm
          values={{
            itemId: item.id,
            title: item.title,
            notes: item.notes ?? "",
            allDay: item.allDay,
            date: item.allDay ? (item.startDate ?? "") : (start?.date ?? ""),
            endDate: item.allDay && item.endDate !== item.startDate ? (item.endDate ?? "") : "",
            start: start?.time ?? "09:00",
            end: end?.time ?? "",
          }}
          submitLabel="Save changes"
        />
        <div className="mt-6 border-t border-line pt-4">
          <CommandButton action={deleteCalendarItemAction} fields={{ itemId: item.id }} label="Delete entry" confirm="Delete this entry? It is also removed from your Google Calendar if connected." confirmLabel="Delete" danger />
        </div>
      </section>
    </>
  );
}
