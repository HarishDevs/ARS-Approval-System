import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import type { ReportDefinition, ReportResult } from "@/server/reports/catalogue";
import { indiaDayStartUtc } from "@/server/modules/task-lists";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/server/modules/task-rules";
import { PRIORITY_LABEL, INFO_PRIORITY_LABEL, type InfoPriority, type TaskPriority } from "@/server/modules/settings";
import { INFO_STATE_LABEL, type InfoStatus } from "@/server/modules/info-rules";

// v1.9.0 (owner brief §13): Task and Information reports, in the same
// catalogue (IT only, like every report since v1.7.1). Organisation scope
// only; the period uses India dates turned into UTC bounds, so indexes stay
// usable. Only what the data can say reliably.
const range = (period: { from: string; to: string }) => [indiaDayStartUtc(period.from), new Date(indiaDayStartUtc(period.to).getTime() + 86_400_000)];
const iso = (value: Date | null) => (value ? value.toISOString() : null);
const hours = (minutes: unknown) => (minutes === null || minutes === undefined ? null : Math.round((Number(minutes) / 60) * 10) / 10);
const ORG = ["ORGANISATION"] as const;

async function run(sql: string, params: unknown[], cap: number): Promise<{ rows: RowDataPacket[]; truncated: boolean }> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(`${sql} LIMIT ${cap + 1}`, params);
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}

export function moduleReports(cap: () => number): ReportDefinition[] {
  return [
    {
      key: "task_register",
      name: "Task register",
      description: "Every task created in the period: type, assignee, priority, status, due and completion time.",
      scopes: ORG,
      usesPeriod: true,
      run: async (_scope, _viewer, filter): Promise<ReportResult> => {
        const [from, to] = range(filter.period);
        const { rows, truncated } = await run(
          `SELECT t.task_no, t.title, mt.name AS type, c.name AS creator, a.name AS assignee, d.name AS department, t.priority, t.status, t.created_at, t.due_at, t.completed_at,
                  CASE WHEN t.completed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) END AS minutes,
                  (t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at IS NOT NULL AND t.due_at < UTC_TIMESTAMP()) AS overdue
           FROM tasks t JOIN module_type_versions v ON v.id = t.type_version_id JOIN module_types mt ON mt.id = v.type_id
           JOIN users c ON c.id = t.created_by JOIN users a ON a.id = t.assignee_id LEFT JOIN departments d ON d.id = a.department_id
           WHERE t.created_at >= ? AND t.created_at < ? ORDER BY t.id DESC`,
          [from, to],
          cap(),
        );
        return {
          columns: [
            { key: "no", label: "Task", kind: "text" },
            { key: "title", label: "Title", kind: "text" },
            { key: "type", label: "Task type", kind: "text" },
            { key: "creator", label: "Created by", kind: "text" },
            { key: "assignee", label: "Assignee", kind: "text" },
            { key: "department", label: "Assignee's department", kind: "text" },
            { key: "priority", label: "Priority", kind: "text" },
            { key: "status", label: "Status", kind: "text" },
            { key: "overdue", label: "Overdue", kind: "text" },
            { key: "created", label: "Created", kind: "datetime" },
            { key: "due", label: "Due", kind: "datetime" },
            { key: "completed", label: "Completed", kind: "datetime" },
            { key: "hours", label: "Hours to complete", kind: "hours" },
          ],
          rows: rows.map((row) => [
            row.task_no,
            row.title,
            row.type,
            row.creator,
            row.assignee,
            row.department ?? "",
            PRIORITY_LABEL[row.priority as TaskPriority] ?? row.priority,
            TASK_STATUS_LABEL[row.status as TaskStatus] ?? row.status,
            Number(row.overdue) ? "Yes" : "",
            iso(row.created_at),
            iso(row.due_at),
            iso(row.completed_at),
            hours(row.minutes),
          ]),
          truncated,
        };
      },
    },
    {
      key: "task_workload",
      name: "Task workload by assignee",
      description: "Open, overdue and blocked tasks per person now; tasks they completed in the period and the average hours to complete.",
      scopes: ORG,
      usesPeriod: true,
      run: async (_scope, _viewer, filter): Promise<ReportResult> => {
        const [from, to] = range(filter.period);
        const { rows, truncated } = await run(
          `SELECT a.name AS assignee, d.name AS department,
                  SUM(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')) AS open_now,
                  SUM(t.status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND t.due_at IS NOT NULL AND t.due_at < UTC_TIMESTAMP()) AS overdue_now,
                  SUM(t.status = 'BLOCKED') AS blocked_now,
                  SUM(t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ?) AS completed,
                  AVG(CASE WHEN t.status = 'COMPLETED' AND t.completed_at >= ? AND t.completed_at < ? THEN TIMESTAMPDIFF(MINUTE, t.created_at, t.completed_at) END) AS minutes
           FROM tasks t JOIN users a ON a.id = t.assignee_id LEFT JOIN departments d ON d.id = a.department_id
           GROUP BY a.id, a.name, d.name
           HAVING open_now > 0 OR completed > 0
           ORDER BY overdue_now DESC, open_now DESC, a.name`,
          [from, to, from, to],
          cap(),
        );
        return {
          columns: [
            { key: "assignee", label: "Assignee", kind: "text" },
            { key: "department", label: "Department", kind: "text" },
            { key: "open", label: "Open now", kind: "number" },
            { key: "overdue", label: "Overdue now", kind: "number" },
            { key: "blocked", label: "Blocked now", kind: "number" },
            { key: "completed", label: "Completed in period", kind: "number" },
            { key: "hours", label: "Average hours to complete", kind: "hours" },
          ],
          rows: rows.map((row) => [row.assignee, row.department ?? "", Number(row.open_now), Number(row.overdue_now), Number(row.blocked_now), Number(row.completed), hours(row.minutes)]),
          truncated,
        };
      },
    },
    {
      key: "information_register",
      name: "Information register",
      description: "Information published in the period: type, sender, recipients, how many read it and acknowledged it, and its state.",
      scopes: ORG,
      usesPeriod: true,
      run: async (_scope, _viewer, filter): Promise<ReportResult> => {
        const [from, to] = range(filter.period);
        const { rows, truncated } = await run(
          `SELECT i.info_no, i.title, mt.name AS type, c.name AS sender, i.priority, i.status, i.ack_required, i.published_at, i.expires_on,
                  (i.status = 'PUBLISHED' AND i.expires_on IS NOT NULL AND i.expires_on < DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE))) AS expired,
                  COUNT(r.user_id) AS recipients, SUM(r.read_at IS NOT NULL) AS read_count, SUM(r.acknowledged_at IS NOT NULL) AS ack_count
           FROM info_items i JOIN module_type_versions v ON v.id = i.type_version_id JOIN module_types mt ON mt.id = v.type_id JOIN users c ON c.id = i.created_by
           LEFT JOIN info_recipients r ON r.info_id = i.id
           WHERE i.published_at >= ? AND i.published_at < ?
           GROUP BY i.id ORDER BY i.published_at DESC`,
          [from, to],
          cap(),
        );
        return {
          columns: [
            { key: "no", label: "Information", kind: "text" },
            { key: "title", label: "Subject", kind: "text" },
            { key: "type", label: "Type", kind: "text" },
            { key: "sender", label: "Sent by", kind: "text" },
            { key: "priority", label: "Importance", kind: "text" },
            { key: "state", label: "State", kind: "text" },
            { key: "published", label: "Published", kind: "datetime" },
            { key: "recipients", label: "Recipients", kind: "number" },
            { key: "read", label: "Read %", kind: "percent" },
            { key: "ack", label: "Acknowledged %", kind: "percent" },
            { key: "outstanding", label: "Not yet acknowledged", kind: "number" },
          ],
          rows: rows.map((row) => {
            const recipients = Number(row.recipients);
            const pct = (count: number) => (recipients ? Math.round((count / recipients) * 1000) / 10 : null);
            const ack = Number(row.ack_required) === 1;
            const state = Number(row.expired) ? INFO_STATE_LABEL.EXPIRED : INFO_STATE_LABEL[row.status as InfoStatus];
            return [
              row.info_no,
              row.title,
              row.type,
              row.sender,
              INFO_PRIORITY_LABEL[row.priority as InfoPriority] ?? row.priority,
              state,
              iso(row.published_at),
              recipients,
              pct(Number(row.read_count)),
              ack ? pct(Number(row.ack_count)) : null,
              ack ? recipients - Number(row.ack_count) : null,
            ];
          }),
          truncated,
        };
      },
    },
    {
      key: "outstanding_acknowledgements",
      name: "Outstanding acknowledgements",
      description: "People who haven't yet acknowledged published, unexpired information that asks for it (now; the period isn't used).",
      scopes: ORG,
      usesPeriod: false,
      run: async (): Promise<ReportResult> => {
        const { rows, truncated } = await run(
          `SELECT u.name AS person, d.name AS department, i.info_no, i.title, i.published_at, r.read_at
           FROM info_recipients r JOIN info_items i ON i.id = r.info_id JOIN users u ON u.id = r.user_id LEFT JOIN departments d ON d.id = u.department_id
           WHERE i.status = 'PUBLISHED' AND i.ack_required = TRUE AND r.acknowledged_at IS NULL AND u.active = TRUE
             AND (i.expires_on IS NULL OR i.expires_on >= DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 330 MINUTE)))
           ORDER BY i.published_at, u.name`,
          [],
          cap(),
        );
        return {
          columns: [
            { key: "person", label: "Person", kind: "text" },
            { key: "department", label: "Department", kind: "text" },
            { key: "no", label: "Information", kind: "text" },
            { key: "title", label: "Subject", kind: "text" },
            { key: "published", label: "Published", kind: "datetime" },
            { key: "read", label: "Opened", kind: "text" },
          ],
          rows: rows.map((row) => [row.person, row.department ?? "", row.info_no, row.title, iso(row.published_at), row.read_at ? "Yes" : "Not yet"]),
          truncated,
        };
      },
    },
  ];
}
