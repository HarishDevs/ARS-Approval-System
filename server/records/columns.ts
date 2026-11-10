import type { InfoRecord, RequestRecord, TaskRecord } from "@/lib/db/repositories/records.repository";
import type { RecordKind } from "@/server/records/filters";
import { amountText } from "@/server/records/amount";
import { priorityText, shownPriority } from "@/server/approvals/priority";
import { BUILT_IN_PRIORITY_COLOR } from "@/server/forms/option-colors";

// D-191: the columns of each register, shared by the table and the CSV, so
// both always say the same. `sort` names a key in SORTS (filters.ts).
export interface RecordColumn<Row> {
  key: string;
  label: string;
  sort?: string;
  value: (row: Row) => string;
  wide?: boolean;
  color?: (row: Row) => string | null; // v1.47.0: shown as a coloured pill (the CSV keeps the text)
}

export const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  CHANGES_REQUIRED: "Changes required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
  OPEN: "Open",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  DRAFT: "Draft",
  PUBLISHED: "Published",
  WITHDRAWN: "Withdrawn",
  ARCHIVED: "Archived",
};
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", NORMAL: "Normal", IMPORTANT: "Important", HIGH: "Most Important", URGENT: "Critical" };

const dateTime = (value: Date | null) => (value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "");
const daysBetween = (start: Date, end: Date | null) => Math.max(0, Math.floor(((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 86_400_000));
// A cancelled task reads "Cancelled" (a withdrawn request reads "Withdrawn").
const taskStatus = (status: string) => (status === "CANCELLED" ? "Cancelled" : STATUS_LABEL[status] ?? status);

// PB-34: the Amount column follows the viewer's confidential rule, so the
// request columns are made per viewer (the table and the CSV alike).
export function requestColumns(seeConfidential: boolean): RecordColumn<RequestRecord>[] {
  return [
    { key: "no", label: "Request no.", sort: "no", value: (row) => row.no },
    { key: "title", label: "Title", sort: "title", value: (row) => row.title, wide: true },
    { key: "type", label: "Approval type", sort: "type", value: (row) => row.type },
    { key: "amount", label: "Amount", value: (row) => amountText(row.amount, seeConfidential) },
    // v1.47.0: the request's Priority field (confidential → "Hidden", as Amount).
    { key: "priority", label: "Priority", value: (row) => priorityText(shownPriority(row.priority, seeConfidential)), color: (row) => shownPriority(row.priority, seeConfidential)?.color ?? null },
    { key: "raisedBy", label: "Raised by", sort: "raisedBy", value: (row) => row.raisedBy },
    { key: "department", label: "Department", sort: "department", value: (row) => row.department ?? "" },
    { key: "status", label: "Status", sort: "status", value: (row) => STATUS_LABEL[row.status] ?? row.status },
    { key: "step", label: "Current step", value: (row) => row.currentStep ?? "" },
    { key: "waiting", label: "Waiting on", value: (row) => row.waitingOn ?? "", wide: true },
    { key: "approvals", label: "Approvals given", value: (row) => String(row.approvals) },
    { key: "round", label: "Round", value: (row) => String(row.round) },
    { key: "submitted", label: "Submitted", sort: "submitted", value: (row) => dateTime(row.submitted) },
    { key: "closed", label: "Closed", sort: "closed", value: (row) => dateTime(row.closed) },
    { key: "age", label: "Days open", value: (row) => String(daysBetween(row.submitted, row.closed)) },
  ];
}

// The safe default: confidential amounts hidden.
export const REQUEST_COLUMNS: RecordColumn<RequestRecord>[] = requestColumns(false);

export const TASK_COLUMNS: RecordColumn<TaskRecord>[] = [
  { key: "no", label: "Task no.", sort: "no", value: (row) => row.no },
  { key: "title", label: "Title", sort: "title", value: (row) => row.title, wide: true },
  { key: "type", label: "Task type", sort: "type", value: (row) => row.type },
  { key: "priority", label: "Priority", sort: "priority", value: (row) => PRIORITY_LABEL[row.priority] ?? row.priority, color: (row) => BUILT_IN_PRIORITY_COLOR[row.priority] ?? null },
  { key: "status", label: "Status", sort: "status", value: (row) => taskStatus(row.status) },
  { key: "overdue", label: "Overdue", value: (row) => (row.overdue ? "Yes" : "") },
  { key: "assignee", label: "Assignee", sort: "assignee", value: (row) => row.assignee },
  { key: "department", label: "Department", sort: "department", value: (row) => row.department ?? "" },
  { key: "assignedBy", label: "Assigned by", value: (row) => row.assignedBy },
  { key: "created", label: "Created", sort: "created", value: (row) => dateTime(row.created) },
  { key: "due", label: "Due", sort: "due", value: (row) => dateTime(row.due) },
  { key: "completed", label: "Completed", sort: "completed", value: (row) => dateTime(row.completed) },
  { key: "related", label: "Related request", value: (row) => row.relatedRequest ?? "" },
];

export const INFO_COLUMNS: RecordColumn<InfoRecord>[] = [
  { key: "no", label: "Info no.", sort: "no", value: (row) => row.no },
  { key: "title", label: "Title", sort: "title", value: (row) => row.title, wide: true },
  { key: "type", label: "Information type", sort: "type", value: (row) => row.type },
  { key: "priority", label: "Priority", sort: "priority", value: (row) => PRIORITY_LABEL[row.priority] ?? row.priority, color: (row) => BUILT_IN_PRIORITY_COLOR[row.priority] ?? null },
  { key: "status", label: "Status", sort: "status", value: (row) => STATUS_LABEL[row.status] ?? row.status },
  { key: "createdBy", label: "Created by", sort: "createdBy", value: (row) => row.createdBy },
  { key: "department", label: "Department", sort: "department", value: (row) => row.department ?? "" },
  { key: "created", label: "Created", sort: "created", value: (row) => dateTime(row.created) },
  { key: "published", label: "Published", sort: "published", value: (row) => dateTime(row.published) },
  { key: "effective", label: "Effective from", value: (row) => row.effectiveOn ?? "" },
  { key: "expires", label: "Expires", value: (row) => row.expiresOn ?? "" },
  { key: "recipients", label: "Recipients", value: (row) => String(row.recipients) },
  { key: "read", label: "Read", value: (row) => String(row.read) },
  { key: "ack", label: "Acknowledged", value: (row) => (row.ackRequired ? String(row.acknowledged) : "Not asked") },
];

export function columnsFor(kind: RecordKind, viewer: { seeConfidential: boolean } = { seeConfidential: false }): RecordColumn<RequestRecord>[] | RecordColumn<TaskRecord>[] | RecordColumn<InfoRecord>[] {
  return kind === "requests" ? requestColumns(viewer.seeConfidential) : kind === "tasks" ? TASK_COLUMNS : INFO_COLUMNS;
}

export const RECORD_HREF: Record<RecordKind, (id: number) => string> = {
  requests: (id) => `/users/requests/${id}`,
  tasks: (id) => `/users/tasks/${id}`,
  information: (id) => `/users/information/${id}`,
};

export const RECORD_TITLE: Record<RecordKind, string> = { requests: "Approval requests", tasks: "Tasks", information: "Information" };
