import "server-only";
import type { NotifyInput } from "@/server/notifications/notify";
import { indiaDateTimeText } from "@/server/modules/settings";
import { appBaseUrl } from "@/lib/http/app-url";

// v1.9.0: the messages of the Task and Information modules. In-app always;
// email too (plain text, D-091); WhatsApp only when IT has switched on a
// template for the event (same rule as every other message).
const base = () => appBaseUrl();

function message(eventType: string, userId: number, title: string, text: string, path: string, entity: NotifyInput["entity"]): NotifyInput {
  const link = `${base()}${path}`;
  return {
    eventType,
    userId,
    title: title.slice(0, 200),
    message: text.slice(0, 1000),
    deepLink: link,
    entity,
    email: { subject: title.slice(0, 180), text: `${text}\n\nOpen it: ${link}\n\nSign in to see the details. This message can't be answered.` },
    whatsappVariables: { title: title.slice(0, 120), link },
  };
}

export interface TaskInfo {
  id: number;
  taskNo: string;
  title: string;
  dueAt?: Date | null;
}

const taskPath = (task: TaskInfo) => `/users/tasks/${task.id}`;
const due = (task: TaskInfo) => (task.dueAt ? ` Due ${indiaDateTimeText(task.dueAt)}.` : "");

export const taskMessages = {
  assigned: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_ASSIGNED", to, `Task for you: ${task.taskNo} ${task.title}`, `${by} assigned you the task "${task.title}" (${task.taskNo}).${due(task)}`, taskPath(task), { type: "TASK", id: task.id }),
  updated: (task: TaskInfo, to: number, what: string) => message("WORK_TASK_UPDATED", to, `Task ${task.taskNo}: ${what}`, `"${task.title}" (${task.taskNo}): ${what}.`, taskPath(task), { type: "TASK", id: task.id }),
  comment: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_COMMENT", to, `New comment on task ${task.taskNo}`, `${by} commented on "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  completed: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_COMPLETED", to, `Task completed: ${task.taskNo}`, `${by} completed "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  reopened: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_REOPENED", to, `Task reopened: ${task.taskNo}`, `${by} reopened "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  cancelled: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_CANCELLED", to, `Task cancelled: ${task.taskNo}`, `${by} cancelled "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  dueSoon: (task: TaskInfo, to: number) => message("WORK_TASK_DUE_SOON", to, `Task due soon: ${task.taskNo}`, `"${task.title}" (${task.taskNo}) is due soon.${due(task)}`, taskPath(task), { type: "TASK", id: task.id }),
  overdue: (task: TaskInfo, to: number) => message("WORK_TASK_OVERDUE", to, `Task overdue: ${task.taskNo}`, `"${task.title}" (${task.taskNo}) is overdue.${due(task)}`, taskPath(task), { type: "TASK", id: task.id }),
  // D-215: Task & Project Management.
  mentioned: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_MENTION", to, `${by} mentioned you on ${task.taskNo}`, `${by} mentioned you in a comment on "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  followed: (task: TaskInfo, to: number, by: string) => message("WORK_TASK_UPDATED", to, `You now follow task ${task.taskNo}`, `${by} added you as a follower of "${task.title}" (${task.taskNo}).`, taskPath(task), { type: "TASK", id: task.id }),
  unblocked: (task: TaskInfo, to: number) => message("WORK_TASK_UPDATED", to, `Ready to start: ${task.taskNo}`, `Everything blocking "${task.title}" (${task.taskNo}) is now complete.`, taskPath(task), { type: "TASK", id: task.id }),
};

export interface ProjectInfo {
  id: number;
  name: string;
}
const projectPath = (project: ProjectInfo) => `/users/work/projects/${project.id}`;
export const projectMessages = {
  added: (project: ProjectInfo, to: number, by: string, role: string) => message("WORK_PROJECT_MEMBER", to, `Added to project: ${project.name}`, `${by} added you to the project "${project.name}" as ${role.toLowerCase()}.`, projectPath(project), null),
  status: (project: ProjectInfo, to: number, by: string, status: string, title: string) =>
    message("WORK_PROJECT_STATUS", to, `${project.name}: ${status}`, `${by} posted a status update on "${project.name}": ${status}. ${title}`, `${projectPath(project)}?view=overview`, null),
};

export interface InfoSummary {
  id: number;
  infoNo: string;
  title: string;
  ackRequired: boolean;
}

const infoPath = (info: InfoSummary) => `/users/information/${info.id}`;

export const infoMessages = {
  published: (info: InfoSummary, to: number, by: string) =>
    message("INFO_PUBLISHED", to, `${info.ackRequired ? "Please read and acknowledge" : "For your information"}: ${info.title}`, `${by} sent you "${info.title}" (${info.infoNo}).${info.ackRequired ? " Please open it and press Acknowledge." : ""}`, infoPath(info), { type: "INFO", id: info.id }),
  updated: (info: InfoSummary, to: number, by: string) => message("INFO_UPDATED", to, `Updated: ${info.title}`, `${by} updated "${info.title}" (${info.infoNo}).`, infoPath(info), { type: "INFO", id: info.id }),
  withdrawn: (info: InfoSummary, to: number, by: string) => message("INFO_WITHDRAWN", to, `Withdrawn: ${info.title}`, `${by} withdrew "${info.title}" (${info.infoNo}). You don't need to act on it.`, infoPath(info), { type: "INFO", id: info.id }),
  ackReminder: (info: InfoSummary, to: number) => message("INFO_ACK_REMINDER", to, `Reminder: please acknowledge ${info.title}`, `You haven't acknowledged "${info.title}" (${info.infoNo}) yet.`, infoPath(info), { type: "INFO", id: info.id }),
};

// v1.51.0 (D-300): Meeting Management. Everything the Coordinator enters
// reaches the participants; approvals reach the Meeting Owner.
export interface MeetingInfo {
  id: number;
  meetingNo: string;
  title: string;
  start?: Date | null;
}
const meetingPath = (meeting: MeetingInfo) => `/users/meetings/${meeting.id}`;
const when = (meeting: MeetingInfo) => (meeting.start ? ` On ${indiaDateTimeText(meeting.start)}.` : "");
export const meetingMessages = {
  invited: (meeting: MeetingInfo, to: number, by: string) => message("MEETING_INVITED", to, `Meeting: ${meeting.title}`, `${by} added you to the meeting "${meeting.title}" (${meeting.meetingNo}).${when(meeting)}`, meetingPath(meeting), null),
  updated: (meeting: MeetingInfo, to: number, what: string) => message("MEETING_UPDATED", to, `Meeting ${meeting.meetingNo}: ${what}`, `"${meeting.title}" (${meeting.meetingNo}): ${what}.${when(meeting)}`, meetingPath(meeting), null),
  cancelled: (meeting: MeetingInfo, to: number, by: string, reason: string) => message("MEETING_CANCELLED", to, `Meeting cancelled: ${meeting.title}`, `${by} cancelled "${meeting.title}" (${meeting.meetingNo}). Reason: ${reason}`, meetingPath(meeting), null),
  toApprove: (meeting: MeetingInfo, to: number, by: string, what: "meeting points" | "MOM") => message("MEETING_APPROVAL", to, `To approve: ${what} of ${meeting.meetingNo}`, `${by} sent the ${what} of "${meeting.title}" (${meeting.meetingNo}) for your approval.`, meetingPath(meeting), null),
  decided: (meeting: MeetingInfo, to: number, by: string, what: "meeting points" | "MOM", approved: boolean, remarks: string) =>
    message("MEETING_DECIDED", to, `${what === "MOM" ? "MOM" : "Meeting points"} ${approved ? "approved" : "returned"}: ${meeting.meetingNo}`, `${by} ${approved ? "approved" : "returned"} the ${what} of "${meeting.title}" (${meeting.meetingNo}).${remarks ? ` Remarks: ${remarks}` : ""}`, meetingPath(meeting), null),
  published: (meeting: MeetingInfo, to: number, what: "meeting points" | "MOM") => message("MEETING_PUBLISHED", to, `${what === "MOM" ? "MOM" : "Meeting points"} ready: ${meeting.title}`, `The ${what} of "${meeting.title}" (${meeting.meetingNo}) are ready to read.${when(meeting)}`, meetingPath(meeting), null),
  reminder: (meeting: MeetingInfo, to: number, what: "meeting points" | "MOM", due: Date) => message("MEETING_REMINDER", to, `Due soon: ${what} of ${meeting.meetingNo}`, `The ${what} of "${meeting.title}" (${meeting.meetingNo}) are due by ${indiaDateTimeText(due)}.`, meetingPath(meeting), null),
  responded: (meeting: MeetingInfo, to: number, by: string, answer: string) => message("MEETING_UPDATED", to, `${by}: ${answer.toLowerCase()} for ${meeting.meetingNo}`, `${by} answered "${answer}" for "${meeting.title}" (${meeting.meetingNo}).`, meetingPath(meeting), null),
  actionReview: (meeting: MeetingInfo, to: number, by: string, confirmed: boolean, title: string, note: string) =>
    message("MEETING_ACTION", to, `Action ${confirmed ? "confirmed" : "sent back"}: ${title.slice(0, 80)}`, `${by} ${confirmed ? "confirmed as done" : "sent back"} the action "${title}" from "${meeting.title}" (${meeting.meetingNo}).${note ? ` Note: ${note}` : ""}`, meetingPath(meeting), null),
};
