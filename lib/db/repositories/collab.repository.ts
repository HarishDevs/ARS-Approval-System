import "server-only";
import { CATEGORY_SQL, type NotificationCategory } from "@/server/notifications/categories";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { INDIA_TODAY_SQL } from "@/lib/db/repositories/directory.repository";

// Comments (F-15), delegations (F-30) and the in-app inbox (bell).

// ---- comments (append-only, D-061) -------------------------------------------------
export interface CommentItem {
  id: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: Date;
}

export async function insertComment(requestId: number, authorId: number, body: string, db: Queryable = getDbPool()): Promise<number> {
  const [result] = await db.query<ResultSetHeader>("INSERT INTO request_comments (request_id, author_id, body) VALUES (?, ?, ?)", [requestId, authorId, body]);
  return result.insertId;
}

export async function listComments(requestId: number, db: Queryable = getDbPool()): Promise<CommentItem[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number; author_id: number; name: string; body: string; created_at: Date })[]>(
    "SELECT c.id, c.author_id, u.name, c.body, c.created_at FROM request_comments c JOIN users u ON u.id = c.author_id WHERE c.request_id = ? ORDER BY c.id",
    [requestId],
  );
  return rows.map((row) => ({ id: row.id, authorId: row.author_id, authorName: row.name, body: row.body, createdAt: row.created_at }));
}

// The requester plus everyone with a pending task (who hears about a comment).
export async function commentAudience(requestId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { user_id: number })[]>(
    `SELECT requester_id AS user_id FROM approval_requests WHERE id = ?
     UNION SELECT approver_id FROM approval_tasks WHERE request_id = ? AND status = 'PENDING'`,
    [requestId, requestId],
  );
  return rows.map((row) => row.user_id);
}

// #9: people already on a request (requester and anyone with a task), for
// the "mention" shortcuts under the comment box.
export async function listMentionable(requestId: number, db: Queryable = getDbPool()): Promise<{ loginId: string; name: string }[]> {
  const [rows] = await db.query<(RowDataPacket & { login_id: string; name: string })[]>(
    `SELECT DISTINCT u.login_id, u.name FROM users u
     WHERE u.active = TRUE AND u.is_break_glass = FALSE AND (u.id = (SELECT requester_id FROM approval_requests WHERE id = ?)
       OR u.id IN (SELECT approver_id FROM approval_tasks WHERE request_id = ?)
       OR u.id IN (SELECT user_id FROM request_collaborators WHERE request_id = ? AND removed_at IS NULL))
     ORDER BY u.name LIMIT 40`,
    [requestId, requestId, requestId],
  );
  return rows.map((row) => ({ loginId: row.login_id, name: row.name }));
}

// ---- delegations (D-062) ---------------------------------------------------------------
export interface DelegationItem {
  id: number;
  userId: number;
  userName: string;
  delegateId: number;
  delegateName: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  state: "ACTIVE" | "UPCOMING" | "PAST" | "ENDED";
}

type DelegationRow = RowDataPacket & {
  id: number;
  user_id: number;
  user_name: string;
  delegate_id: number;
  delegate_name: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  state: DelegationItem["state"];
};

const DELEGATION_SELECT = `
  SELECT d.id, d.user_id, u.name AS user_name, d.delegate_id, g.name AS delegate_name,
         DATE_FORMAT(d.starts_on, '%Y-%m-%d') AS starts_on, DATE_FORMAT(d.ends_on, '%Y-%m-%d') AS ends_on, d.reason,
         CASE WHEN d.ended_at IS NOT NULL THEN 'ENDED'
              WHEN ${INDIA_TODAY_SQL} < d.starts_on THEN 'UPCOMING'
              WHEN ${INDIA_TODAY_SQL} > d.ends_on THEN 'PAST'
              ELSE 'ACTIVE' END AS state
  FROM delegations d JOIN users u ON u.id = d.user_id JOIN users g ON g.id = d.delegate_id`;

const toDelegation = (row: DelegationRow): DelegationItem => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name,
  delegateId: row.delegate_id,
  delegateName: row.delegate_name,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  reason: row.reason,
  state: row.state,
});

export async function listDelegationsInvolving(userId: number, db: Queryable = getDbPool()): Promise<DelegationItem[]> {
  const [rows] = await db.query<DelegationRow[]>(`${DELEGATION_SELECT} WHERE d.user_id = ? OR d.delegate_id = ? ORDER BY d.starts_on DESC LIMIT 50`, [userId, userId]);
  return rows.map(toDelegation);
}

export async function findDelegation(id: number, db: Queryable = getDbPool()): Promise<DelegationItem | null> {
  const [rows] = await db.query<DelegationRow[]>(`${DELEGATION_SELECT} WHERE d.id = ? LIMIT 1`, [id]);
  return rows[0] ? toDelegation(rows[0]) : null;
}

// True if the new range overlaps an open delegation of the same person.
export async function hasOverlappingDelegation(userId: number, startsOn: string, endsOn: string, db: Queryable = getDbPool()): Promise<boolean> {
  const [rows] = await db.query<(RowDataPacket & { found: number })[]>(
    "SELECT 1 AS found FROM delegations WHERE user_id = ? AND ended_at IS NULL AND starts_on <= ? AND ends_on >= ? LIMIT 1",
    [userId, endsOn, startsOn],
  );
  return rows.length > 0;
}

export async function insertDelegation(
  input: { userId: number; delegateId: number; startsOn: string; endsOn: string; reason: string | null; createdBy: number },
  db: Queryable = getDbPool(),
): Promise<number> {
  const [result] = await db.query<ResultSetHeader>(
    "INSERT INTO delegations (user_id, delegate_id, starts_on, ends_on, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [input.userId, input.delegateId, input.startsOn, input.endsOn, input.reason, input.createdBy],
  );
  return result.insertId;
}

export async function endDelegation(id: number, endedBy: number, db: Queryable = getDbPool()): Promise<boolean> {
  const [result] = await db.query<ResultSetHeader>("UPDATE delegations SET ended_at = CURRENT_TIMESTAMP, ended_by = ? WHERE id = ? AND ended_at IS NULL", [endedBy, id]);
  return result.affectedRows === 1;
}

export async function indiaToday(db: Queryable = getDbPool()): Promise<string> {
  const [rows] = await db.query<(RowDataPacket & { today: string })[]>(`SELECT DATE_FORMAT(${INDIA_TODAY_SQL}, '%Y-%m-%d') AS today`);
  return rows[0]!.today;
}

// ---- in-app inbox (bell, P1-44) -------------------------------------------------------------
// v1.9.0 (D-146): each item has its module (category); the bell and the
// Notifications page can show one module at a time.
export interface InboxItem {
  id: number;
  title: string;
  message: string;
  deepLink: string | null;
  createdAt: Date;
  read: boolean;
  category: NotificationCategory;
  bookmarked: boolean;
  archived: boolean;
}

// D-237: the one Inbox's views. Activity hides what was archived.
export type InboxState = "activity" | "bookmarks" | "archive";

export async function countUnread(userId: number, db: Queryable = getDbPool(), category?: NotificationCategory | null): Promise<number> {
  const [rows] = await db.query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM notifications n WHERE n.user_id = ? AND n.read_at IS NULL AND n.archived_at IS NULL${category ? ` AND ${CATEGORY_SQL} = ?` : ""}`,
    category ? [userId, category] : [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

// Unread counts per module, in one query.
export async function countUnreadByCategory(userId: number, db: Queryable = getDbPool()): Promise<Record<NotificationCategory, number>> {
  const [rows] = await db.query<(RowDataPacket & { category: NotificationCategory; total: number })[]>(
    `SELECT ${CATEGORY_SQL} AS category, COUNT(*) AS total FROM notifications n WHERE n.user_id = ? AND n.read_at IS NULL AND n.archived_at IS NULL GROUP BY 1`,
    [userId],
  );
  const counts: Record<NotificationCategory, number> = { APPROVAL: 0, TASK: 0, INFORMATION: 0, SYSTEM: 0 };
  for (const row of rows) counts[row.category] = Number(row.total);
  return counts;
}

// Newest first (by id, so the order is stable), a page at a time: `beforeId`
// continues after the last one shown. Only the person's own rows.
export async function listInbox(userId: number, limit: number, beforeId?: number, db: Queryable = getDbPool(), category?: NotificationCategory | null, state: InboxState = "activity", unreadOnly = false): Promise<InboxItem[]> {
  const where = ["n.user_id = ?", state === "archive" ? "n.archived_at IS NOT NULL" : state === "bookmarks" ? "n.bookmarked_at IS NOT NULL" : "n.archived_at IS NULL"];
  if (unreadOnly) where.push("n.read_at IS NULL");
  const params: unknown[] = [userId];
  if (beforeId) {
    where.push("n.id < ?");
    params.push(beforeId);
  }
  if (category) {
    where.push(`${CATEGORY_SQL} = ?`);
    params.push(category);
  }
  const [rows] = await db.query<(RowDataPacket & { id: number; title: string; message: string; deep_link: string | null; created_at: Date; read_at: Date | null; bookmarked_at: Date | null; archived_at: Date | null; category: NotificationCategory })[]>(
    `SELECT n.id, n.title, n.message, n.deep_link, n.created_at, n.read_at, n.bookmarked_at, n.archived_at, ${CATEGORY_SQL} AS category FROM notifications n WHERE ${where.join(" AND ")} ORDER BY n.id DESC LIMIT ?`,
    [...params, limit],
  );
  return rows.map((row) => ({ id: row.id, title: row.title, message: row.message, deepLink: row.deep_link, createdAt: row.created_at, read: row.read_at !== null, category: row.category, bookmarked: row.bookmarked_at !== null, archived: row.archived_at !== null }));
}

export async function markAllRead(userId: number, db: Queryable = getDbPool()): Promise<number> {
  return (await markAllReadReturningIds(userId, db)).length;
}

// WS / FB-03: which ones were marked, so "Undo" can put exactly those back.
export async function markAllReadReturningIds(userId: number, db: Queryable = getDbPool()): Promise<number[]> {
  const [rows] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1000", [userId]);
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) await db.query<ResultSetHeader>("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (?) AND read_at IS NULL", [userId, ids]);
  return ids;
}

// Only the person's own notifications are ever touched (user_id in every query).
export async function markRead(userId: number, ids: readonly number[], db: Queryable = getDbPool()): Promise<number> {
  if (ids.length === 0) return 0;
  const [result] = await db.query<ResultSetHeader>("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (?) AND read_at IS NULL", [userId, ids.slice(0, 1000)]);
  return result.affectedRows;
}

export async function markUnread(userId: number, ids: readonly number[], db: Queryable = getDbPool()): Promise<number> {
  if (ids.length === 0) return 0;
  const [result] = await db.query<ResultSetHeader>("UPDATE notifications SET read_at = NULL WHERE user_id = ? AND id IN (?)", [userId, ids.slice(0, 1000)]);
  return result.affectedRows;
}

// Who named this person as their delegate today.
export async function activeDelegatorsFor(delegateId: number, db: Queryable = getDbPool()): Promise<Set<number>> {
  const [rows] = await db.query<(RowDataPacket & { user_id: number })[]>(
    `SELECT user_id FROM delegations WHERE delegate_id = ? AND ended_at IS NULL AND ${INDIA_TODAY_SQL} BETWEEN starts_on AND ends_on`,
    [delegateId],
  );
  return new Set(rows.map((row) => row.user_id));
}
