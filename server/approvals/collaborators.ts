import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool, type Queryable } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { appendEvents, findRequest, isParticipant } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { insertOutbox } from "@/lib/db/repositories/outbox.repository";
import { deliverOutbox, type Actor } from "@/server/approvals/service";
import { requestLink } from "@/server/approvals/messages";
import { getEnv } from "@/config/environment";

// Request collaborators (v1.6.1, D-127). The requester (or IT) adds anyone
// active in the organisation to follow a request: they can see it, comment
// and add files, and are told how it goes. They never approve: a
// collaborator is not an approver, and adding one changes no step.
export const MAX_COLLABORATORS = 20;

export interface Collaborator {
  userId: number;
  name: string;
  loginId: string;
  addedByName: string;
  addedAt: Date;
}

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

export async function listCollaborators(requestId: number, db: Queryable = getDbPool()): Promise<Collaborator[]> {
  const [rows] = await db.query<(RowDataPacket & { user_id: number; name: string; login_id: string; added_by_name: string; added_at: Date })[]>(
    `SELECT c.user_id, u.name, u.login_id, a.name AS added_by_name, c.added_at
     FROM request_collaborators c JOIN users u ON u.id = c.user_id JOIN users a ON a.id = c.added_by
     WHERE c.request_id = ? AND c.removed_at IS NULL ORDER BY u.name`,
    [requestId],
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.name, loginId: row.login_id, addedByName: row.added_by_name, addedAt: row.added_at }));
}

// The requester and IT manage the list; anyone on the list can leave it.
export async function canManageCollaborators(requestId: number, actor: Actor): Promise<boolean> {
  const request = await findRequest(requestId);
  return Boolean(request && (request.requesterId === actor.id || isAdmin(actor)));
}

type Outcome = { ok: true; added: number[]; skipped: string[] } | { ok: false; message: string };

export async function addCollaborators(requestId: number, userIds: readonly number[], actor: Actor, options: { notify?: boolean } = {}): Promise<Outcome> {
  const request = await findRequest(requestId);
  if (!request || !(request.requesterId === actor.id || isAdmin(actor))) return { ok: false, message: "Not found." };
  const wanted = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_COLLABORATORS);
  if (!wanted.length) return { ok: false, message: "Choose at least one person." };
  const db = getDbPool();
  const [people] = await db.query<(RowDataPacket & { id: number; name: string; active: number; is_break_glass: number })[]>("SELECT id, name, active, is_break_glass FROM users WHERE id IN (?)", [wanted]);
  const skipped: string[] = [];
  const valid = wanted.filter((id) => {
    const person = people.find((row) => row.id === id);
    if (!person || !person.active || person.is_break_glass) {
      skipped.push(person ? `${person.name} (inactive)` : `#${id}`);
      return false;
    }
    if (id === request.requesterId) {
      skipped.push(`${person.name} (the requester)`);
      return false;
    }
    return true;
  });
  const result = await withTransaction(async (connection) => {
    // Lock the request row so two adds can't pass the limit together.
    await connection.query("SELECT id FROM approval_requests WHERE id = ? FOR UPDATE", [requestId]);
    const [current] = await connection.query<(RowDataPacket & { user_id: number })[]>("SELECT user_id FROM request_collaborators WHERE request_id = ? AND removed_at IS NULL", [requestId]);
    const already = new Set(current.map((row) => row.user_id));
    const fresh = valid.filter((id) => !already.has(id));
    if (already.size + fresh.length > MAX_COLLABORATORS) return { ok: false as const, message: `A request can have at most ${MAX_COLLABORATORS} collaborators.` };
    for (const id of fresh) {
      await connection.query(
        `INSERT INTO request_collaborators (request_id, user_id, added_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE added_by = VALUES(added_by), added_at = CURRENT_TIMESTAMP, removed_by = NULL, removed_at = NULL`,
        [requestId, id, actor.id],
      );
    }
    if (!fresh.length) return { ok: true as const, added: [] as number[], outboxIds: [] as number[] };
    await appendEvents(requestId, [{ type: "COLLABORATORS_ADDED", actorId: actor.id, userIds: fresh }], actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "REQUEST_COLLABORATORS_ADDED", entityType: "REQUEST", entityId: requestId, metadata: { userIds: fresh } }, connection);
    const [names] = await connection.query<(RowDataPacket & { name: string })[]>("SELECT name FROM users WHERE id = ?", [actor.id]);
    const link = requestLink(getEnv().APP_BASE_URL ?? "https://approval.arssteels.net", requestId);
    const ref = `${request.requestNo} · ${request.title}`;
    const outboxIds =
      options.notify === false
        ? []
        : await insertOutbox(
            requestId,
            fresh.map((userId) => ({
              eventType: "COLLABORATOR_ADDED",
              userId,
              title: "You were added to a request",
              message: `${names[0]?.name ?? "Someone"} added you to follow ${ref}.`,
              deepLink: link,
              email: { subject: `You were added to ${request.requestNo}`, text: `${names[0]?.name ?? "Someone"} added you as a collaborator on this request. You can see it, comment and add files, and you'll be told how it goes. You don't need to approve anything.\n\n${ref}\n\n${link}` },
              whatsappVariables: null,
            })),
            connection,
          );
    return { ok: true as const, added: fresh, outboxIds };
  });
  if (!result.ok) return result;
  await deliverOutbox(result.outboxIds);
  return { ok: true, added: result.added, skipped };
}

export async function removeCollaborator(requestId: number, userId: number, actor: Actor): Promise<{ ok: true } | { ok: false; message: string }> {
  const request = await findRequest(requestId);
  const allowed = request && (request.requesterId === actor.id || isAdmin(actor) || (actor.id === userId && (await isParticipant(requestId, actor.id))));
  if (!request || !allowed) return { ok: false, message: "Not found." };
  return withTransaction(async (connection) => {
    const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
      "UPDATE request_collaborators SET removed_at = CURRENT_TIMESTAMP, removed_by = ? WHERE request_id = ? AND user_id = ? AND removed_at IS NULL",
      [actor.id, requestId, userId],
    );
    if (result.affectedRows !== 1) return { ok: false as const, message: "That person isn't a collaborator." };
    await appendEvents(requestId, [{ type: "COLLABORATOR_REMOVED", actorId: actor.id, userId }], actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "REQUEST_COLLABORATOR_REMOVED", entityType: "REQUEST", entityId: requestId, metadata: { userId } }, connection);
    return { ok: true as const };
  });
}

// From form data: the picker sends one `collaborator` value per person.
export function collaboratorIdsFrom(formData: FormData): number[] {
  return formData
    .getAll("collaborator")
    .map((value) => (typeof value === "string" && /^\d{1,10}$/.test(value) ? Number(value) : 0))
    .filter((id) => id > 0);
}
