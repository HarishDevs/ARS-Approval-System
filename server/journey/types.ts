// D-273 (owner's journey brief): what the animated journey shows for one
// request. Built on the server from the request's own records (the road from
// the level map, its linked tasks, its FYI messages and their delivery); the
// browser only draws it. Shared by server and browser (no server-only code).
import type { Road } from "@/server/approvals/road";

export type JourneyTaskStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";

export interface JourneyTask {
  id: number;
  taskNo: string;
  title: string;
  assignee: string;
  status: JourneyTaskStatus;
  createdAt: string;
  dueAt?: string;
  completedAt?: string;
  overdue: boolean;
  // A work step the request waits for (D-269), or background work (D-273).
  blocking: boolean;
}

export type DeliveryStatus = "DELIVERED" | "PENDING" | "FAILED";

export interface JourneyFyi {
  key: string; // the event id
  step: string;
  at: string;
  recipients: { name: string; status: DeliveryStatus }[];
  status: DeliveryStatus; // FAILED if any failed, PENDING if any waits, else DELIVERED
}

export interface Journey {
  requestId: number;
  requestNo: string;
  road: Road;
  tasks: JourneyTask[];
  fyi: JourneyFyi[];
  // The newest event on the request: news with a smaller cursor is older
  // than what the page shows and is ignored (out of order, repeated).
  cursor: number;
  // Changes whenever anything drawn changes (a task ticked has no request event).
  version: string;
  updatedAt: string;
}

export function journeyVersion(road: Road, tasks: readonly JourneyTask[], fyi: readonly JourneyFyi[], cursor: number): string {
  return [cursor, road.version, tasks.map((task) => `${task.id}:${task.status}:${task.overdue ? 1 : 0}`).join(","), fyi.map((item) => `${item.key}:${item.status}`).join(",")].join("#");
}

// FYI delivery for one person: nothing yet (the message is still in the
// outbox) is pending; then email or WhatsApp queued is pending, failed is failed.
export function deliveryOf(hasNotification: boolean, channels: readonly string[]): DeliveryStatus {
  if (!hasNotification) return "PENDING";
  if (channels.some((status) => status === "QUEUED")) return "PENDING";
  if (channels.some((status) => status === "FAILED")) return "FAILED"; // after the sender's retries
  return "DELIVERED";
}

export function overallDelivery(statuses: readonly DeliveryStatus[]): DeliveryStatus {
  if (statuses.includes("FAILED")) return "FAILED";
  if (statuses.includes("PENDING")) return "PENDING";
  return "DELIVERED";
}
