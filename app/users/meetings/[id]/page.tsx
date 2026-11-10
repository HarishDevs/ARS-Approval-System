import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/server/authorization/guards";
import { PageHeader } from "@/features/shell/PageHeader";
import { Badge, Breadcrumbs } from "@/features/ui/Display";
import { HistoryList } from "@/features/modules/RecordParts";
import { ActionReviewForm, CloseOpenPointForm, MeetingButton, MomEditor, PointsEditor, RecordHeldForm, RespondForm } from "@/features/meetings/MeetingForms";
import { FollowUpBadge, indiaInput, MeetingStatusBadge, PointsBadge, whenText } from "@/features/meetings/MeetingParts";
import { listActions, listDecisions, listDepartmentIds, listMeetingEvents, listOpenPoints, listParticipants, listPeopleLabels, listPoints } from "@/lib/db/repositories/meetings.repository";
import { listPeopleFacts } from "@/lib/db/repositories/tasks.repository";
import { listDepartments } from "@/lib/db/repositories/organisation.repository";
import { loadMeetingFor } from "@/server/meetings/service";
import { actionState, ATTENDANCE_LABEL, compliance, durationBand, isCoordinator, isOwner, minutesBetween, MODE_LABEL, PRIORITY_LABEL, selfApproved } from "@/server/meetings/rules";
import { indiaDateTimeText } from "@/server/modules/settings";

export const metadata: Metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

const EVENT_TEXT: Record<string, string> = {
  SCHEDULED: "Scheduled",
  UPDATED: "Details changed",
  CANCELLED: "Cancelled",
  RESPONDED: "Answered the invitation",
  POINTS_SAVED: "Meeting points saved",
  POINTS_SUBMITTED: "Meeting points sent for approval",
  POINTS_APPROVED: "Meeting points approved",
  POINTS_RETURNED: "Meeting points returned",
  STARTED: "Meeting started",
  ENDED: "Meeting ended",
  MOM_SAVED: "MOM saved",
  MOM_SUBMITTED: "MOM sent for approval",
  MOM_APPROVED: "MOM approved",
  MOM_RETURNED: "MOM returned",
  ACTION_CONFIRMED: "Action confirmed done",
  ACTION_SENT_BACK: "Action sent back",
  ACTION_NOTE: "Follow-up note",
  OPEN_POINT_CLOSED: "Open point closed",
  FOLLOW_UP: "Follow-up scheduled",
  CLOSED: "Meeting closed",
  REMINDER_POINTS: "Points reminder sent",
  REMINDER_MOM: "MOM reminder sent",
};
const RESPONSE_LABEL: Record<string, string> = { PENDING: "No answer yet", ACCEPTED: "Attending", DECLINED: "Can't attend", TENTATIVE: "Maybe" };
const yesNo = (value: boolean | null) => (value === null ? "Not yet" : value ? "Yes" : "No");

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-label">{value}</dd>
    </div>
  );
}

// v1.51.0 (D-300, D-301): one meeting. The Coordinator runs it (points,
// attendance, MOM); the Meeting Owner approves the points and the MOM;
// participants see everything once shared. Anyone else gets "not found".
export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scheduled?: string; updated?: string }> }) {
  const { user } = await requireArea("users");
  const { id } = await params;
  if (!/^\d{1,10}$/.test(id)) notFound();
  const loaded = await loadMeetingFor(Number(id), user);
  if (!loaded) notFound();
  const { meeting, viewer, actions: can } = loaded;
  const [participants, points, decisions, actionItems, openPoints, events, people, labels, departmentIds, departments] = await Promise.all([
    listParticipants(meeting.id),
    listPoints(meeting.id),
    listDecisions(meeting.id),
    listActions(meeting.id),
    listOpenPoints(meeting.id),
    listMeetingEvents(meeting.id),
    listPeopleFacts(),
    listPeopleLabels(),
    listDepartmentIds(meeting.id),
    listDepartments(),
  ]);
  const query = await searchParams;
  const coordinator = isCoordinator(meeting, user.id) || viewer.isAdmin;
  const owner = isOwner(meeting, user.id);
  const personOptions = people.map((person) => ({ id: person.id, label: `${person.name} (${person.loginId})`, detail: labels.get(person.id) || undefined }));
  const me = participants.find((person) => person.userId === user.id);
  // Points are shown to participants once approved (or while the meeting runs on the last version).
  const pointsShared = meeting.pointsStatus === "APPROVED" || !["SCHEDULED"].includes(meeting.status) || coordinator || owner;
  const momShared = meeting.status === "MOM_APPROVED" || meeting.status === "CLOSED" || coordinator || owner;
  const facts = compliance(meeting);
  const minutes = minutesBetween(meeting.actualStart, meeting.actualEnd);
  const involved = departments.filter((department) => departmentIds.includes(department.id)).map((department) => department.name);
  const editingPoints = can.has("EDIT_POINTS");
  const editingMom = can.has("EDIT_MOM");
  const tasked = actionItems.filter((action) => action.taskId);
  const present = participants.filter((person) => person.attendance === "PRESENT" || person.attendance === "LATE").length;
  const blocked = meeting.status === "SCHEDULED" && coordinator && !can.has("START");
  const heldForm = can.has("END") && meeting.status === "SCHEDULED" && meeting.scheduledStart.getTime() <= Date.now();
  const panelHasItems = Boolean(
    (can.has("RESPOND") && me) ||
    can.has("START") ||
    (can.has("END") && meeting.status === "IN_PROGRESS") ||
    heldForm ||
    blocked ||
    can.has("EDIT_DETAILS") ||
    can.has("FOLLOW_UP") ||
    can.has("CLOSE") ||
    can.has("CANCEL"),
  );

  return (
    <>
      <Breadcrumbs items={[{ href: "/users/meetings", label: "Meetings" }, { label: meeting.meetingNo }]} />
      <PageHeader title={meeting.title} meta={`${meeting.meetingNo} · ${meeting.typeName} · ${whenText(meeting.scheduledStart, meeting.scheduledEnd)}`}>
        <MeetingStatusBadge status={meeting.status} />
        {(meeting.status === "SCHEDULED" || meeting.status === "IN_PROGRESS") && <PointsBadge status={meeting.pointsStatus} />}
        {meeting.confidentiality === "MANAGEMENT" && <Badge tone="warning">Management only</Badge>}
      </PageHeader>
      {query.scheduled && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Meeting scheduled. Everyone on it was told.
        </p>
      )}
      {query.updated && (
        <p role="status" className="mb-4 rounded-md bg-success-50 px-3 py-2 text-label text-success-600">
          Changes saved. Participants were told.
        </p>
      )}
      {meeting.status === "CANCELLED" && (
        <p className="mb-4 rounded-md bg-warning-50 px-3 py-2 text-label text-warning-600">Cancelled{meeting.cancelledReason ? `: ${meeting.cancelledReason}` : "."}</p>
      )}
      {meeting.pointsStatus === "RETURNED" && meeting.pointsRemarks && coordinator && (
        <p className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-label text-danger-600">Points returned by the Meeting Owner: {meeting.pointsRemarks}</p>
      )}
      {meeting.status === "MOM_RETURNED" && meeting.momRemarks && (
        <p className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-label text-danger-600">MOM returned by the Meeting Owner: {meeting.momRemarks}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="card px-5 py-4" aria-labelledby="details">
            <h2 id="details" className="mb-3 font-semibold">
              Details
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="Meeting Owner" value={meeting.ownerName} />
              <Fact label="Coordinator" value={meeting.coordinatorName} />
              <Fact label="Priority" value={PRIORITY_LABEL[meeting.priority]} />
              <Fact label="Mode" value={MODE_LABEL[meeting.mode]} />
              <Fact label="Venue" value={meeting.venue ?? "—"} />
              {meeting.link && (
                <Fact
                  label="Link"
                  value={
                    <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">
                      Join
                    </a>
                  }
                />
              )}
              <Fact label="Organising department" value={meeting.departmentName ?? "—"} />
              {involved.length > 0 && <Fact label="Departments involved" value={involved.join(", ")} />}
              {meeting.guests && <Fact label="External guests" value={meeting.guests} />}
              <Fact label="Points due by" value={meeting.agendaDueAt ? indiaDateTimeText(meeting.agendaDueAt) : "—"} />
              <Fact label="MOM due by" value={meeting.momDueAt ? indiaDateTimeText(meeting.momDueAt) : "—"} />
              {meeting.parentMeetingId && (
                <Fact
                  label="Follows up"
                  value={
                    <Link href={`/users/meetings/${meeting.parentMeetingId}`} className="text-primary-700 underline">
                      {meeting.parentMeetingNo}
                    </Link>
                  }
                />
              )}
              {meeting.actualStart && <Fact label="Held" value={`${indiaDateTimeText(meeting.actualStart)}${meeting.actualEnd ? ` to ${indiaDateTimeText(meeting.actualEnd)}` : ""}`} />}
              {minutes !== null && <Fact label="Duration" value={`${minutes} min (${durationBand(minutes)})`} />}
            </dl>
            {meeting.description && <p className="mt-3 whitespace-pre-wrap text-label">{meeting.description}</p>}
          </section>

          <section className="card px-5 py-4" aria-labelledby="points">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="points" className="font-semibold">
                Meeting points
              </h2>
              <PointsBadge status={meeting.pointsStatus} />
            </div>
            {editingPoints ? (
              <PointsEditor
                meetingId={meeting.id}
                rowVersion={meeting.rowVersion}
                initial={points.map((point) => ({ id: point.id, title: point.title, presenterId: point.presenterId }))}
                people={personOptions}
                canSubmit={can.has("SUBMIT_POINTS")}
                selfApprove={selfApproved(meeting, user.id)}
              />
            ) : !pointsShared ? (
              <p className="text-label text-ink-muted">The meeting points are shared once the Meeting Owner approves them.</p>
            ) : points.length === 0 ? (
              <p className="text-label text-ink-muted">No meeting points yet.</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5" data-testid="meeting-points">
                {points.map((point) => (
                  <li key={point.id}>
                    {point.title}
                    {point.presenterName && <span className="text-label text-ink-muted"> · {point.presenterName}</span>}
                  </li>
                ))}
              </ol>
            )}
            {can.has("DECIDE_POINTS") && (
              <div className="mt-4 flex flex-wrap gap-2 rounded-md bg-warning-50 p-3">
                <p className="w-full text-label text-warning-600">{meeting.coordinatorName} sent these points for your approval.</p>
                <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="APPROVE_POINTS" label="Approve points" variant="primary" />
                <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="RETURN_POINTS" label="Return" remarks remarksRequired remarksLabel="What to change" danger />
              </div>
            )}
          </section>

          {editingMom ? (
            <section className="card px-5 py-4" aria-labelledby="mom">
              <h2 id="mom" className="mb-3 font-semibold">
                Minutes of meeting (MOM)
              </h2>
              <MomEditor
                meetingId={meeting.id}
                rowVersion={meeting.rowVersion}
                people={personOptions}
                canSubmit={can.has("SUBMIT_MOM")}
                selfApprove={selfApproved(meeting, user.id)}
                defaults={{
                  points: points.map((point) => ({ id: point.id, title: point.title, discussion: point.discussion ?? "" })),
                  decisions,
                  actions: actionItems
                    .filter((action) => !action.taskId)
                    .map((action) => ({ title: action.title, description: action.description ?? "", ownerId: action.ownerId, priority: action.priority, dueOn: action.dueOn ?? "" })),
                  tasked: tasked.map((action) => ({ title: action.title, ownerName: action.ownerName, taskNo: action.taskNo })),
                  openPoints: openPoints
                    .filter((point) => point.status === "OPEN" && !point.carriedFromId)
                    .map((point) => ({ text: point.text, ownerId: point.ownerId, reviewOn: point.reviewOn ?? "" })),
                  attendance: participants.map((person) => ({ userId: person.userId, name: person.name, attendance: person.attendance })),
                }}
              />
            </section>
          ) : (
            momShared &&
            !["SCHEDULED", "IN_PROGRESS", "CANCELLED"].includes(meeting.status) && (
              <section className="card space-y-4 px-5 py-4" aria-labelledby="mom">
                <h2 id="mom" className="font-semibold">
                  Minutes of meeting (MOM)
                </h2>
                {points.some((point) => point.discussion) && (
                  <ol className="list-decimal space-y-2 pl-5">
                    {points.map((point) => (
                      <li key={point.id}>
                        <p className="font-medium">{point.title}</p>
                        {point.discussion && <p className="whitespace-pre-wrap text-label">{point.discussion}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {decisions.length > 0 && (
                  <div>
                    <h3 className="mb-1 font-medium">Decisions</h3>
                    <ul className="list-disc space-y-1 pl-5 text-label">
                      {decisions.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {can.has("DECIDE_MOM") && (
                  <div className="flex flex-wrap gap-2 rounded-md bg-warning-50 p-3">
                    <p className="w-full text-label text-warning-600">{meeting.coordinatorName} sent the MOM for your approval. Approving turns each action item into a task.</p>
                    <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="APPROVE_MOM" label="Approve MOM" variant="primary" remarks remarksLabel="Remarks" />
                    <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="RETURN_MOM" label="Return" remarks remarksRequired remarksLabel="What to change" danger />
                  </div>
                )}
              </section>
            )
          )}

          {(actionItems.length > 0 || openPoints.length > 0) && !editingMom && momShared && (
            <section className="card px-5 py-4" aria-labelledby="follow">
              <h2 id="follow" className="mb-3 font-semibold">
                Action items and follow-up
              </h2>
              {actionItems.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table" data-testid="meeting-actions">
                    <thead>
                      <tr>
                        <th scope="col">Action</th>
                        <th scope="col">Responsible</th>
                        <th scope="col">Due</th>
                        <th scope="col">Status</th>
                        {can.has("CONFIRM_ACTIONS") && <th scope="col">Follow-up</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {actionItems.map((action) => {
                        const state = actionState({ taskStatus: action.taskStatus, dueAt: action.taskDueAt, confirmedAt: action.confirmedAt });
                        return (
                          <tr key={action.id}>
                            <td>
                              {action.taskId ? (
                                <Link href={`/users/tasks/${action.taskId}`} className="text-primary-700 underline">
                                  {action.taskNo}
                                </Link>
                              ) : null}{" "}
                              {action.title}
                              {action.carriedFromId && <span className="text-caption text-ink-muted"> (carried forward)</span>}
                              {action.reviewNote && <p className="text-caption text-ink-muted">Note: {action.reviewNote}</p>}
                            </td>
                            <td className="text-label">{action.ownerName}</td>
                            <td className="text-label">{action.taskDueAt ? indiaDateTimeText(action.taskDueAt) : (action.dueOn ?? "—")}</td>
                            <td>
                              <FollowUpBadge state={state} />
                              {action.confirmedByName && <p className="text-caption text-ink-muted">by {action.confirmedByName}</p>}
                            </td>
                            {can.has("CONFIRM_ACTIONS") && (
                              <td>
                                {action.taskId && state !== "CONFIRMED" && state !== "CANCELLED" && (
                                  <ActionReviewForm actionId={action.id} canConfirm={state === "DONE_UNCONFIRMED"} canSendBack={state === "DONE_UNCONFIRMED"} />
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {openPoints.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 font-medium">Open points</h3>
                  <ul className="space-y-2">
                    {openPoints.map((point) => (
                      <li key={point.id} className="rounded-md border border-line p-3 text-label">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p>{point.text}</p>
                            <p className="text-caption text-ink-muted">
                              {point.ownerName ? `${point.ownerName} · ` : ""}
                              {point.reviewOn ? `review on ${point.reviewOn}` : "no review date"}
                              {point.carriedFromId ? " · carried forward" : ""}
                            </p>
                            {point.status === "CLOSED" && <p className="text-caption text-success-600">Closed: {point.closedNote}</p>}
                          </div>
                          {point.status === "OPEN" && can.has("CONFIRM_ACTIONS") && <CloseOpenPointForm pointId={point.id} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="card px-5 py-4" aria-labelledby="history">
            <h2 id="history" className="mb-3 font-semibold">
              History
            </h2>
            <HistoryList entries={events.map((event) => ({ id: event.id, when: event.createdAt, who: event.actorName, what: EVENT_TEXT[event.eventType] ?? event.eventType, detail: event.body }))} />
          </section>
        </div>

        {/* On phones the actions come first; on wide screens they sit on the right. */}
        <aside className="order-first space-y-4 lg:order-none" aria-label="Meeting actions">
          <section className="card space-y-3 px-5 py-4">
            <h2 className="font-semibold">What you can do</h2>
            {!panelHasItems && (
              <p className="text-label text-ink-muted">
                {can.has("CONFIRM_ACTIONS")
                  ? "Follow up the action items on the left."
                  : can.has("DECIDE_POINTS") || can.has("DECIDE_MOM") || editingPoints || editingMom
                    ? "Your part is on the left."
                    : "Nothing for you to do here."}
              </p>
            )}
            {can.has("RESPOND") && me && <RespondForm meetingId={meeting.id} current={me.response} />}
            {can.has("START") && <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="START" label="Start meeting" variant="primary" />}
            {can.has("END") && meeting.status === "IN_PROGRESS" && (
              <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="END" label="End meeting" confirm="The MOM is then written and sent to the Meeting Owner." />
            )}
            {heldForm && <RecordHeldForm meetingId={meeting.id} rowVersion={meeting.rowVersion} start={indiaInput(meeting.scheduledStart)} end={indiaInput(meeting.scheduledEnd)} />}
            {blocked && <p className="text-caption text-ink-muted">The Meeting Owner asked for approved points before the meeting can start.</p>}
            {can.has("EDIT_DETAILS") && (
              <Link href={`/users/meetings/new?edit=${meeting.id}`} className="btn-secondary btn-compact">
                Edit details
              </Link>
            )}
            {can.has("FOLLOW_UP") && (
              <Link href={`/users/meetings/new?followUp=${meeting.id}`} className="btn-secondary btn-compact">
                Schedule follow-up meeting
              </Link>
            )}
            {can.has("CLOSE") && (
              <MeetingButton
                meetingId={meeting.id}
                rowVersion={meeting.rowVersion}
                action="CLOSE"
                label="Close meeting"
                confirm="Every action item must be confirmed done or carried to a follow-up meeting."
              />
            )}
            {can.has("CANCEL") && <MeetingButton meetingId={meeting.id} rowVersion={meeting.rowVersion} action="CANCEL" label="Cancel meeting" remarks remarksRequired remarksLabel="Reason" danger />}
          </section>

          <section className="card px-5 py-4" aria-labelledby="people">
            <h2 id="people" className="mb-2 font-semibold">
              Participants ({participants.length}){meeting.actualStart ? ` · ${present} present` : ""}
            </h2>
            <ul className="space-y-1.5 text-label" data-testid="meeting-participants">
              {participants.map((person) => (
                <li key={person.userId} className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span>
                    {person.name}
                    {person.userId === meeting.ownerId && <span className="text-caption text-ink-muted"> · Owner</span>}
                    {person.userId === meeting.coordinatorId && <span className="text-caption text-ink-muted"> · Coordinator</span>}
                  </span>
                  <span className="text-caption text-ink-muted">{meeting.actualStart ? ATTENDANCE_LABEL[person.attendance] : RESPONSE_LABEL[person.response]}</span>
                </li>
              ))}
            </ul>
          </section>

          {meeting.status !== "SCHEDULED" && meeting.status !== "CANCELLED" && (
            <section className="card px-5 py-4" aria-labelledby="compliance">
              <h2 id="compliance" className="mb-2 font-semibold">
                On time?
              </h2>
              <dl className="grid grid-cols-2 gap-2">
                <Fact label="Points in time" value={yesNo(facts.agendaOnTime)} />
                <Fact label="Started on time" value={yesNo(facts.startedOnTime)} />
                <Fact label="Ended on time" value={yesNo(facts.endedOnTime)} />
                <Fact label="MOM in time" value={yesNo(facts.momOnTime)} />
              </dl>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
