import type { Metadata } from "next";
import { CalendarPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Breadcrumbs } from "@/features/ui/Display";
import { ScheduleMeetingForm, type ScheduleDefaults } from "@/features/meetings/MeetingForms";
import { indiaDay, indiaInput, indiaTime } from "@/features/meetings/MeetingParts";
import { listActions, listDepartmentIds, listMeetingTypes, listOpenPoints, listParticipants, listPeopleLabels } from "@/lib/db/repositories/meetings.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";

import { loadMeetingFor } from "@/server/meetings/service";
import { actionState, carriesForward } from "@/server/meetings/rules";
import { personLabel } from "@/lib/people/label";

export const metadata: Metadata = { title: "Schedule a meeting" };
export const dynamic = "force-dynamic";

// v1.51.0 (D-300): schedule a meeting, edit one (?edit=ID) or schedule the
// follow-up of one (?followUp=ID: open actions and open points carry over).
export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ edit?: string; followUp?: string }> }) {
  const { user } = await requireArea("users");
  const query = await searchParams;
  const editId = query.edit && /^\d{1,10}$/.test(query.edit) ? Number(query.edit) : null;
  const parentId = query.followUp && /^\d{1,10}$/.test(query.followUp) ? Number(query.followUp) : null;
  const [types, people, departments, labels] = await Promise.all([listMeetingTypes(), listPeopleFacts(), listDepartments(), listPeopleLabels()]);
  const personOptions = people.map((person) => ({ id: person.id, label: personLabel(person), detail: labels.get(person.id) || undefined }));
  const departmentOptions = departments.filter((department) => department.active).map((department) => ({ id: department.id, label: department.name }));

  // Tomorrow 10:00 to 11:00 by default.
  const tomorrow = new Date(Date.now() + 86_400_000);
  let defaults: ScheduleDefaults = {
    meetingId: null,
    rowVersion: null,
    parentMeetingId: null,
    title: "",
    description: "",
    typeId: null,
    departmentId: null,
    departmentIds: [],
    ownerId: null,
    coordinatorId: user.id,
    participantIds: [],
    mode: "OFFLINE",
    venue: "",
    link: "",
    priority: "NORMAL",
    confidentiality: "GENERAL",
    guests: "",
    date: indiaDay(tomorrow),
    startTime: "10:00",
    endTime: "11:00",
    agendaDue: "",
    momDue: "",
    pointsPolicy: "LAST_APPROVED",
  };
  let title = "Schedule a meeting";
  let carried: { actions: number; openPoints: number } | undefined;

  const source = editId ?? parentId;
  if (source) {
    const loaded = await loadMeetingFor(source, user);
    if (!loaded) notFound();
    const { meeting } = loaded;
    if (editId && !loaded.actions.has("EDIT_DETAILS")) notFound();
    if (parentId && !loaded.actions.has("FOLLOW_UP")) notFound();
    const [participants, departmentIds] = await Promise.all([listParticipants(meeting.id), listDepartmentIds(meeting.id)]);
    const length = meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime();
    defaults = {
      ...defaults,
      title: editId ? meeting.title : `Follow-up: ${meeting.title}`.slice(0, 200),
      description: meeting.description ?? "",
      typeId: meeting.typeId,
      departmentId: meeting.departmentId,
      departmentIds,
      ownerId: meeting.ownerId,
      coordinatorId: meeting.coordinatorId,
      participantIds: participants.map((person) => person.userId),
      mode: meeting.mode,
      venue: meeting.venue ?? "",
      link: meeting.link ?? "",
      priority: meeting.priority,
      confidentiality: meeting.confidentiality,
      guests: meeting.guests ?? "",
      pointsPolicy: meeting.pointsPolicy,
    };
    if (editId) {
      defaults = {
        ...defaults,
        meetingId: meeting.id,
        rowVersion: meeting.rowVersion,
        date: indiaDay(meeting.scheduledStart),
        startTime: indiaTime(meeting.scheduledStart),
        endTime: indiaTime(meeting.scheduledEnd),
        agendaDue: indiaInput(meeting.agendaDueAt),
        momDue: indiaInput(meeting.momDueAt),
      };
      title = `Edit ${meeting.meetingNo}`;
    } else {
      // A week after the meeting followed up, same time and length.
      const start = new Date(meeting.scheduledStart.getTime() + 7 * 86_400_000);
      defaults = { ...defaults, parentMeetingId: meeting.id, date: indiaDay(start), startTime: indiaTime(start), endTime: indiaTime(new Date(start.getTime() + length)) };
      const [actions, openPoints] = await Promise.all([listActions(meeting.id), listOpenPoints(meeting.id)]);
      carried = {
        actions: actions.filter((action) => action.taskId && carriesForward(actionState({ taskStatus: action.taskStatus, dueAt: action.taskDueAt, confirmedAt: action.confirmedAt }))).length,
        openPoints: openPoints.filter((point) => point.status === "OPEN").length,
      };
      title = `Follow-up of ${meeting.meetingNo}`;
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ href: "/users/meetings", label: "Meetings" }, { label: title }]} />
      <PageHeader icon={CalendarPlus} title={title} description="One Meeting Owner approves the points and MOM; one Coordinator runs the meeting. They can be the same person." />
      <ScheduleMeetingForm
        defaults={defaults}
        types={types.map((type) => ({ id: type.id, name: type.name, template: type.template }))}
        people={personOptions}
        departments={departmentOptions}
        carried={carried}
      />
    </>
  );
}
