import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { findRequest, findWorkflowVersion, userNames } from "@/lib/db/repositories/approvals.repository";
import { loadRequestRoad } from "@/server/approvals/road-view";
import { isExpiredApproval } from "@/server/approvals/expiry-rules";
import type { Actor } from "@/server/approvals/service";
import { deliveryOf, journeyVersion, overallDelivery, type Journey, type JourneyFyi, type JourneyTask, type JourneyTaskStatus } from "@/server/journey/types";

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : undefined);

// D-273: one request's journey, after the same record check as the request
// page (loadRequestRoad returns null for anyone who may not see it). Reads
// only existing records: the level map, the request's linked tasks (work
// steps, D-269, and background work, D-273), its FYI events and their
// delivery. Nothing here changes anything.
export async function loadJourney(requestId: number, viewer: Actor): Promise<Journey | null> {
  const loaded = await loadRequestRoad(requestId, viewer);
  if (!loaded) return null;
  const request = await findRequest(requestId);
  if (!request) return null;
  const db = getDbPool();
  const [[cursorRows], [taskRows], [fyiRows], requesterNames] = await Promise.all([
    db.query<RowDataPacket[]>("SELECT COALESCE(MAX(id), 0) AS cursor_id FROM approval_events WHERE request_id = ?", [requestId]),
    db.query<RowDataPacket[]>(
      `SELECT t.id, t.task_no, t.title, t.status, t.created_at, t.due_at, t.completed_at, u.name AS assignee,
              JSON_CONTAINS_PATH(t.form_data_json, 'one', '$.__approvalWork') AS blocking
       FROM tasks t JOIN users u ON u.id = t.assignee_id
       WHERE t.related_request_id = ? AND t.deleted_at IS NULL
         AND JSON_CONTAINS_PATH(t.form_data_json, 'one', '$.__approvalWork', '$.__approvalLink')
       ORDER BY t.id LIMIT 50`,
      [requestId],
    ),
    db.query<RowDataPacket[]>("SELECT id, node_id, created_at, payload_json FROM approval_events WHERE request_id = ? AND event_type = 'NOTIFIED' ORDER BY id LIMIT 50", [requestId]),
    userNames([request.requesterId]),
  ]);
  const now = Date.now();
  const tasks: JourneyTask[] = taskRows.map((row) => {
    const status = String(row.status) as JourneyTaskStatus;
    const open = status === "OPEN" || status === "IN_PROGRESS" || status === "BLOCKED";
    const due = row.due_at as Date | null;
    return {
      id: Number(row.id),
      taskNo: String(row.task_no),
      title: String(row.title),
      assignee: String(row.assignee),
      status,
      createdAt: (row.created_at as Date).toISOString(),
      ...(due ? { dueAt: due.toISOString() } : {}),
      ...(row.completed_at ? { completedAt: iso(row.completed_at as Date) } : {}),
      overdue: open && due !== null && due.getTime() < now,
      blocking: Number(row.blocking) === 1,
    };
  });

  const fyi: JourneyFyi[] = [];
  if (fyiRows.length > 0) {
    const events = fyiRows.map((row) => ({ id: Number(row.id), nodeId: String(row.node_id ?? ""), at: row.created_at as Date, userIds: ((typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json) as { userIds?: number[] }).userIds ?? [] }));
    const people = [...new Set(events.flatMap((event) => event.userIds))];
    const [version, names, deliveries] = await Promise.all([
      findWorkflowVersion(request.workflowVersionId),
      userNames(people),
      people.length
        ? db.query<RowDataPacket[]>(
            `SELECT n.id, n.user_id, n.created_at, d.status, d.next_retry_at
             FROM notifications n LEFT JOIN notification_deliveries d ON d.notification_id = n.id
             WHERE n.event_type = 'REQUEST_FYI' AND n.user_id IN (?) AND n.deep_link LIKE ?`,
            [people, `%/users/requests/${requestId}`],
          )
        : Promise.resolve([[]] as unknown as [RowDataPacket[]]),
    ]);
    const labelOf = (nodeId: string) => version?.definition.nodes.find((node) => node.id === nodeId)?.label ?? "For information";
    const rows = deliveries[0];
    for (const event of events) {
      const recipients = event.userIds.map((userId) => {
        // This event's message to that person: sent at or after the event.
        const mine = rows.filter((row) => Number(row.user_id) === userId && (row.created_at as Date).getTime() >= event.at.getTime() - 1000);
        const first = mine.length ? Math.min(...mine.map((row) => Number(row.id))) : null;
        const channels = mine
          .filter((row) => Number(row.id) === first && row.status)
          .map((row) => (row.status === "FAILED" && row.next_retry_at ? "QUEUED" : String(row.status)));
        return { name: names.get(userId) ?? `User #${userId}`, status: deliveryOf(first !== null, channels) };
      });
      fyi.push({ key: String(event.id), step: labelOf(event.nodeId), at: event.at.toISOString(), recipients, status: overallDelivery(recipients.map((recipient) => recipient.status)) });
    }
  }

  const cursor = Number(cursorRows[0]?.cursor_id ?? 0);
  const expired = isExpiredApproval(request.status, loaded.validUntil);
  return {
    requestId,
    requestNo: request.requestNo,
    title: request.title,
    requesterName: requesterNames.get(request.requesterId) ?? "",
    submittedAt: loaded.submittedAt,
    validUntil: loaded.validUntil,
    requestStatus: request.status,
    expired,
    road: loaded.road,
    tasks,
    fyi,
    cursor,
    version: journeyVersion(loaded.road, tasks, fyi, cursor, { title: request.title, validUntil: loaded.validUntil, expired }),
    updatedAt: loaded.updatedAt,
  };
}
