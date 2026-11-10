import type { Metadata } from "next";
import { CalendarCog } from "lucide-react";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { ManagementGroupForm, MeetingTypeForm } from "@/features/meetings/MeetingAdminForms";
import { listManagementMembers, listMeetingTypes, listPeopleLabels } from "@/lib/db/repositories/meetings.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";

export const metadata: Metadata = { title: "Meeting settings" };
export const dynamic = "force-dynamic";

// v1.51.0 (D-300): meeting types (one general format; the type only names
// the meeting and suggests its points) and the Management group (ED, MD).
export default async function MeetingSettingsPage() {
  await requireArea("admin");
  const [types, members, people, labels] = await Promise.all([listMeetingTypes(true), listManagementMembers(), listPeopleFacts(), listPeopleLabels()]);
  const options = people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})`, detail: labels.get(person.id) || undefined }));
  return (
    <>
      <PageHeader icon={CalendarCog} title="Meeting settings" description="Meeting types with their default points, and the Management group who see every meeting." />
      <div className="space-y-6">
        <section className="card px-5 py-4" aria-labelledby="management">
          <h2 id="management" className="mb-3 font-semibold">
            Management group (ED, MD)
          </h2>
          <ManagementGroupForm people={options} members={members} />
        </section>
        <section className="card px-5 py-4" aria-labelledby="types">
          <h2 id="types" className="mb-1 font-semibold">
            Meeting types
          </h2>
          <p className="mb-4 text-label text-ink-muted">Every type uses the same meeting format. A type hidden from use stays on its old meetings.</p>
          <ul className="space-y-2">
            {types.map((type) => (
              <li key={type.id} className="rounded-md border border-line">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <span className="font-medium">{type.name}</span>
                    <span className="text-caption text-ink-muted">
                      {type.active ? "In use" : "Hidden"}
                      {type.template ? ` · ${type.template.split(String.fromCharCode(10)).filter((line) => line.trim()).length} default point(s)` : ""} · Edit
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <MeetingTypeForm type={type} />
                  </div>
                </details>
              </li>
            ))}
            <li className="rounded-md border border-dashed border-line p-3">
              <h3 className="mb-2 font-medium">Add a type</h3>
              <MeetingTypeForm type={null} />
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
