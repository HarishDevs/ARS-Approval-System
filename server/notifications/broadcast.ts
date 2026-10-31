import "server-only";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { countActiveDevices } from "@/lib/db/repositories/push.repository";
import { deliverOutbox } from "@/server/approvals/service";
import { logError } from "@/lib/logging/logger";
import type { NotifyInput } from "@/server/notifications/notify";

// D-252 (owner: "Notification Targeting Engine"): IT sends a notification to
// people, departments, roles, heads of department and managers, or everyone
// active. Recipients are worked out on the server from the live user list
// (active people only, never demo people), each gets an Inbox message and a
// push on every registered device, through the notification outbox (a
// claimed, retried queue; nothing is sent inside the request).

export const BROADCAST_CATEGORIES = ["ANNOUNCEMENT", "MANAGEMENT", "SYSTEM", "IMPORTANT"] as const;
export type BroadcastCategory = (typeof BROADCAST_CATEGORIES)[number];
export const CATEGORY_EVENT: Record<BroadcastCategory, string> = { ANNOUNCEMENT: "ADMIN_ANNOUNCEMENT", MANAGEMENT: "ADMIN_MANAGEMENT", SYSTEM: "ADMIN_SYSTEM", IMPORTANT: "ADMIN_IMPORTANT" };
export const CATEGORY_TEXT: Record<BroadcastCategory, string> = { ANNOUNCEMENT: "Announcement", MANAGEMENT: "Management notice", SYSTEM: "System notice", IMPORTANT: "Important alert" };

export const audienceSchema = z.object({
  everyone: z.boolean().default(false),
  userIds: z.array(z.number().int().positive()).max(500).default([]),
  departmentIds: z.array(z.number().int().positive()).max(100).default([]),
  roleCodes: z.array(z.string().regex(/^[A-Z_]{2,50}$/)).max(20).default([]),
  hods: z.boolean().default(false),
  managers: z.boolean().default(false),
});
export type Audience = z.infer<typeof audienceSchema>;

export const broadcastSchema = z.object({
  title: z.string().trim().min(3, "Give it a title.").max(120),
  message: z.string().trim().min(3, "Write the message.").max(500),
  category: z.enum(BROADCAST_CATEGORIES),
  priority: z.enum(["NORMAL", "HIGH"]).default("NORMAL"),
  // A page of the app to open; only /users/… (what every recipient can open).
  link: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === "" || (/^\/users(\/|$|\?)/.test(value) && !/[\s\\]/.test(value)), "Use a page of the app starting with /users, or leave it empty.")
    .default(""),
  audience: audienceSchema,
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const audienceIsEmpty = (audience: Audience) => !audience.everyone && !audience.userIds.length && !audience.departmentIds.length && !audience.roleCodes.length && !audience.hods && !audience.managers;

// Every active, non-demo person the audience reaches (each once).
export async function resolveAudience(audience: Audience): Promise<number[]> {
  if (audienceIsEmpty(audience)) return [];
  const db = getDbPool();
  const base = "SELECT u.id FROM users u WHERE u.active = TRUE AND u.is_demo = FALSE";
  if (audience.everyone) {
    const [rows] = await db.query<(RowDataPacket & { id: number })[]>(base);
    return rows.map((row) => row.id);
  }
  const parts: string[] = [];
  const params: unknown[] = [];
  if (audience.userIds.length) {
    parts.push("u.id IN (?)");
    params.push(audience.userIds);
  }
  if (audience.departmentIds.length) {
    parts.push("u.department_id IN (?)");
    params.push(audience.departmentIds);
  }
  if (audience.roleCodes.length) {
    parts.push("EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code IN (?))");
    params.push(audience.roleCodes);
  }
  if (audience.hods) parts.push("EXISTS (SELECT 1 FROM departments d WHERE d.hod_user_id = u.id AND d.active = TRUE)");
  if (audience.managers) parts.push("EXISTS (SELECT 1 FROM users m WHERE m.reporting_manager_id = u.id AND m.active = TRUE)");
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>(`${base} AND (${parts.join(" OR ")})`, params);
  return [...new Set(rows.map((row) => row.id))];
}

export async function describeAudience(audience: Audience): Promise<string> {
  if (audience.everyone) return "Everyone active";
  const db = getDbPool();
  const bits: string[] = [];
  if (audience.departmentIds.length) {
    const [rows] = await db.query<(RowDataPacket & { name: string })[]>("SELECT name FROM departments WHERE id IN (?) ORDER BY name", [audience.departmentIds]);
    bits.push(`Departments: ${rows.map((row) => row.name).join(", ")}`);
  }
  if (audience.roleCodes.length) bits.push(`Roles: ${audience.roleCodes.join(", ")}`);
  if (audience.hods) bits.push("Heads of department");
  if (audience.managers) bits.push("Managers (people with a team)");
  if (audience.userIds.length) bits.push(`${audience.userIds.length} named ${audience.userIds.length === 1 ? "person" : "people"}`);
  return bits.join("; ").slice(0, 300) || "Nobody";
}

export async function previewAudience(audience: Audience): Promise<{ people: number; devices: number }> {
  const ids = await resolveAudience(audience);
  return { people: ids.length, devices: await countActiveDevices(ids) };
}

// Records the broadcast, queues one outbox message per person in the same
// transaction, then starts sending in the background. The job runner sends
// whatever is left (and anything a crash interrupted).
export async function sendBroadcast(input: BroadcastInput, actor: { id: number; sessionId: string; ipAddress: string | null }): Promise<{ id: number; recipients: number }> {
  const recipients = await resolveAudience(input.audience);
  if (!recipients.length) throw new Error("NO_RECIPIENTS");
  const audienceText = await describeAudience(input.audience);
  const { id, outboxIds } = await withTransaction(async (connection) => {
    const [result] = await connection.query<ResultSetHeader>(
      "INSERT INTO admin_broadcasts (created_by, title, message, category, priority, link, audience_json, audience_text, recipients) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [actor.id, input.title, input.message, input.category, input.priority, input.link || null, JSON.stringify(input.audience), audienceText, recipients.length],
    );
    const broadcastId = result.insertId;
    const messages: NotifyInput[] = recipients.map((userId) => ({
      eventType: CATEGORY_EVENT[input.category],
      userId,
      title: input.title,
      message: input.message,
      deepLink: input.link || "/users/inbox",
      email: null,
      whatsappVariables: null,
      priority: input.priority,
      broadcastId,
    }));
    const ids = await insertOutbox(null, messages, connection);
    return { id: broadcastId, outboxIds: ids };
  });
  await recordAudit({
    actorUserId: actor.id,
    action: "NOTIFICATION_BROADCAST",
    entityType: "BROADCAST",
    entityId: id,
    sessionId: actor.sessionId,
    ipAddress: actor.ipAddress,
    metadata: { category: input.category, priority: input.priority, audience: audienceText, recipients: recipients.length },
  });
  // In the background: the person who pressed Send isn't kept waiting.
  setTimeout(() => void deliverOutbox(outboxIds).catch((error) => logError("broadcast delivery failed", error, { broadcastId: id })), 0);
  return { id, recipients: recipients.length };
}

// ---- the dashboard ----------------------------------------------------

export interface BroadcastRow {
  id: number;
  title: string;
  category: BroadcastCategory;
  priority: "NORMAL" | "HIGH";
  audienceText: string;
  createdBy: string;
  createdAt: Date;
  recipients: number;
  inboxed: number;
  pushQueued: number;
  pushSent: number;
  pushFailed: number;
  pushGone: number;
  failureCodes: string | null;
}

export async function listBroadcasts(limit = 50): Promise<BroadcastRow[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    `SELECT b.id, b.title, b.category, b.priority, b.audience_text, u.name AS created_by, b.created_at, b.recipients,
       (SELECT COUNT(*) FROM notifications n WHERE n.broadcast_id = b.id) AS inboxed,
       COALESCE(SUM(d.status = 'QUEUED'), 0) AS push_queued,
       COALESCE(SUM(d.status = 'SENT'), 0) AS push_sent,
       COALESCE(SUM(d.status = 'FAILED' AND d.failure_code NOT LIKE 'PUSH_GONE%'), 0) AS push_failed,
       COALESCE(SUM(d.failure_code LIKE 'PUSH_GONE%' OR d.failure_code = 'DEVICE_GONE'), 0) AS push_gone,
       GROUP_CONCAT(DISTINCT CASE WHEN d.status = 'FAILED' THEN d.failure_code END) AS failure_codes
     FROM admin_broadcasts b
     JOIN users u ON u.id = b.created_by
     LEFT JOIN notifications n2 ON n2.broadcast_id = b.id
     LEFT JOIN notification_deliveries d ON d.notification_id = n2.id AND d.channel = 'PUSH'
     GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    audienceText: row.audience_text,
    createdBy: row.created_by,
    createdAt: row.created_at,
    recipients: Number(row.recipients),
    inboxed: Number(row.inboxed),
    pushQueued: Number(row.push_queued),
    pushSent: Number(row.push_sent),
    pushFailed: Number(row.push_failed),
    pushGone: Number(row.push_gone),
    failureCodes: row.failure_codes,
  }));
}

export interface PushOverview {
  devices: number;
  activeDevices: number;
  peopleWithDevices: number;
  sent30: number;
  accepted30: number;
  failed30: number;
  waiting: number;
}

// Last 30 days. "Accepted" = the push service took it (not proof it was seen).
export async function pushOverview(): Promise<PushOverview> {
  const db = getDbPool();
  const [[devices], [deliveries]] = await Promise.all([
    db.query<RowDataPacket[]>("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'ACTIVE'), 0) AS active, COUNT(DISTINCT CASE WHEN status = 'ACTIVE' THEN user_id END) AS people FROM push_subscriptions WHERE status <> 'REMOVED'"),
    db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'SENT'), 0) AS accepted, COALESCE(SUM(status = 'FAILED'), 0) AS failed, COALESCE(SUM(status = 'QUEUED'), 0) AS waiting
       FROM notification_deliveries WHERE channel = 'PUSH' AND status <> 'SKIPPED' AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)`,
    ),
  ]);
  return {
    devices: Number(devices[0]?.total ?? 0),
    activeDevices: Number(devices[0]?.active ?? 0),
    peopleWithDevices: Number(devices[0]?.people ?? 0),
    sent30: Number(deliveries[0]?.total ?? 0),
    accepted30: Number(deliveries[0]?.accepted ?? 0),
    failed30: Number(deliveries[0]?.failed ?? 0),
    waiting: Number(deliveries[0]?.waiting ?? 0),
  };
}

export interface AdminDeviceRow {
  id: number;
  person: string;
  loginId: string;
  deviceType: string;
  browser: string | null;
  operatingSystem: string | null;
  installed: boolean;
  status: string;
  service: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastFailureCode: string | null;
}

// IT's view of the devices: never the endpoint or the keys, only the push
// service's host.
export async function listAllDevices(limit = 300): Promise<AdminDeviceRow[]> {
  const [rows] = await getDbPool().query<RowDataPacket[]>(
    `SELECT s.id, u.name, u.login_id, s.device_type, s.browser, s.operating_system, s.installed, s.status, s.endpoint, s.created_at, s.last_used_at, s.last_failure_code
     FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status <> 'REMOVED' ORDER BY s.last_seen_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => {
    let service = "unknown";
    try {
      service = new URL(row.endpoint as string).host;
    } catch {
      service = "unknown";
    }
    return {
      id: row.id,
      person: row.name,
      loginId: row.login_id,
      deviceType: row.device_type,
      browser: row.browser,
      operatingSystem: row.operating_system,
      installed: Boolean(row.installed),
      status: row.status,
      service,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      lastFailureCode: row.last_failure_code,
    };
  });
}
