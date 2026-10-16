import "server-only";
import { getEnv } from "@/config/environment";
import type { NotifyInput } from "@/server/notifications/notify";
import { indiaDateTimeText } from "@/server/modules/settings";

// v1.9.0: the messages of the Task and Information modules. In-app always;
// email too (plain text, D-091); WhatsApp only when IT has switched on a
// template for the event (same rule as every other message).
const base = () => getEnv().APP_BASE_URL ?? "https://approval.arssteels.net";

function message(eventType: string, userId: number, title: string, text: string, path: string, entity: NonNullable<NotifyInput["entity"]>): NotifyInput {
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
