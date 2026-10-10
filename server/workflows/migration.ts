import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { appendEvents, findRequest, findWorkflow, listVersions, type WorkflowVersionRecord } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { checkMigration, cleanMapping, remapState, type MigrationCheck, type StepMapping } from "@/server/workflows/migration-plan";
import { logError } from "@/lib/logging/logger";

// FN7 migration assistant (D-121). IT only. A dry run lists the open
// requests on a version with a verdict for each; a run moves the chosen ones
// to the live version, one locked transaction per request, re-checking each
// on its current state. Every run and every request's outcome is recorded.
export interface Actor {
  id: number;
  roles: readonly string[];
}
const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");
const OPEN = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"];
export const MAX_BATCH = 200;

export async function openCountsByVersion(workflowId: number): Promise<Map<number, number>> {
  const [rows] = await getDbPool().query<(RowDataPacket & { version_id: number; n: number })[]>(
    `SELECT r.workflow_version_id AS version_id, COUNT(*) AS n FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id
     WHERE v.workflow_id = ? AND r.deleted_at IS NULL AND r.status IN (?) GROUP BY r.workflow_version_id`,
    [workflowId, OPEN],
  );
  return new Map(rows.map((row) => [row.version_id, Number(row.n)]));
}

export interface PlannedRequest {
  id: number;
  requestNo: string;
  title: string;
  check: MigrationCheck;
}

async function versions(workflowId: number, fromVersionId: number): Promise<{ source: WorkflowVersionRecord; target: WorkflowVersionRecord } | null> {
  const all = await listVersions(workflowId);
  const source = all.find((version) => version.id === fromVersionId);
  const target = all.find((version) => version.status === "PUBLISHED");
  return source && target && source.id !== target.id ? { source, target } : null;
}

// Dry run: nothing changes.
export async function planMigration(input: { workflowId: number; fromVersionId: number; mapping: Record<string, string> }, actor: Actor) {
  const workflow = await findWorkflow(input.workflowId);
  if (!workflow || !isAdmin(actor)) return null;
  const pair = await versions(workflow.id, input.fromVersionId);
  if (!pair) return null;
  const mapping = cleanMapping(input.mapping, pair.source.definition, pair.target.definition);
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number })[]>(
    "SELECT id FROM approval_requests WHERE workflow_version_id = ? AND deleted_at IS NULL AND status IN (?) ORDER BY id LIMIT 500",
    [pair.source.id, OPEN],
  );
  const requests: PlannedRequest[] = [];
  for (const row of rows) {
    const request = await findRequest(row.id);
    if (!request) continue;
    requests.push({ id: request.id, requestNo: request.requestNo, title: request.title, check: checkMigration({ source: pair.source, target: pair.target, request, mapping }) });
  }
  return { workflow, ...pair, mapping, requests };
}

export interface MigrationReport {
  migrationId: number;
  moved: number;
  skipped: number;
  failed: number;
  items: { requestId: number; requestNo: string | null; outcome: "MOVED" | "SKIPPED" | "FAILED"; message: string }[];
}

export async function runMigration(
  input: { workflowId: number; fromVersionId: number; requestIds: readonly number[]; mapping: Record<string, string>; acceptWarnings: boolean },
  actor: Actor,
): Promise<{ ok: true; report: MigrationReport } | { ok: false; message: string }> {
  const workflow = await findWorkflow(input.workflowId);
  if (!workflow || !isAdmin(actor)) return { ok: false, message: "Not found." };
  const pair = await versions(workflow.id, input.fromVersionId);
  if (!pair) return { ok: false, message: "Choose an older version; requests move to the live version." };
  const ids = [...new Set(input.requestIds)].slice(0, MAX_BATCH);
  if (!ids.length) return { ok: false, message: "Choose at least one request." };
  const mapping: StepMapping = cleanMapping(input.mapping, pair.source.definition, pair.target.definition);
  const [created] = await getDbPool().query<ResultSetHeader>(
    "INSERT INTO workflow_migrations (workflow_id, from_version_id, to_version_id, mapping_json, accept_warnings, requested_by) VALUES (?, ?, ?, ?, ?, ?)",
    [workflow.id, pair.source.id, pair.target.id, JSON.stringify(mapping), input.acceptWarnings, actor.id],
  );
  const migrationId = created.insertId;
  const report: MigrationReport = { migrationId, moved: 0, skipped: 0, failed: 0, items: [] };
  const targetLabel = new Map(pair.target.definition.nodes.map((node) => [node.id, node.label]));

  for (const requestId of ids) {
    let item: MigrationReport["items"][number];
    try {
      item = await withTransaction(async (connection) => {
        const [locked] = await connection.query<(RowDataPacket & { workflow_version_id: number; state_version: number })[]>(
          "SELECT workflow_version_id, state_version FROM approval_requests WHERE id = ? AND deleted_at IS NULL FOR UPDATE",
          [requestId],
        );
        const request = locked[0] ? await findRequest(requestId, connection) : null;
        if (!request || locked[0]!.workflow_version_id !== pair.source.id) return { requestId, requestNo: request?.requestNo ?? null, outcome: "SKIPPED" as const, message: "It isn't on this version any more." };
        // Re-checked on the request as it is now, inside the lock.
        const check = checkMigration({ source: pair.source, target: pair.target, request, mapping });
        if (check.verdict === "BLOCKED" || check.verdict === "MANUAL") return { requestId, requestNo: request.requestNo, outcome: "SKIPPED" as const, message: check.reasons[0] ?? "Not safe to move." };
        if (check.verdict === "WARNINGS" && !input.acceptWarnings) return { requestId, requestNo: request.requestNo, outcome: "SKIPPED" as const, message: "Has warnings; tick 'Move requests with warnings' to include it." };
        const state = remapState(request.state, mapping, pair.target.definition);
        const [updated] = await connection.query<ResultSetHeader>(
          "UPDATE approval_requests SET workflow_version_id = ?, state_json = ?, state_version = state_version + 1 WHERE id = ? AND state_version = ?",
          [pair.target.id, JSON.stringify(state), requestId, locked[0]!.state_version],
        );
        if (updated.affectedRows !== 1) throw new Error("state changed while moving");
        // Task rows follow renamed steps and carry the target's step names.
        const [tasks] = await connection.query<(RowDataPacket & { id: number; node_id: string })[]>("SELECT id, node_id FROM approval_tasks WHERE request_id = ?", [requestId]);
        for (const task of tasks) {
          const nodeId = mapping[task.node_id] ?? task.node_id;
          const label = targetLabel.get(nodeId);
          if (label) await connection.query("UPDATE approval_tasks SET node_id = ?, node_label = ? WHERE id = ?", [nodeId, label.slice(0, 200), task.id]);
        }
        await appendEvents(requestId, [{ type: "VERSION_MIGRATED", actorId: actor.id, fromVersionNo: pair.source.versionNo, toVersionNo: pair.target.versionNo, migrationId }], actor.id, connection);
        return { requestId, requestNo: request.requestNo, outcome: "MOVED" as const, message: check.verdict === "WARNINGS" ? `Moved with warnings: ${check.reasons.join(" ")}`.slice(0, 500) : "Moved." };
      });
    } catch (error) {
      logError("workflow migration: request failed", error, { migrationId, requestId });
      item = { requestId, requestNo: null, outcome: "FAILED", message: "Couldn't move it; nothing was changed for this request. Try again." };
    }
    report.items.push(item);
    report[item.outcome === "MOVED" ? "moved" : item.outcome === "SKIPPED" ? "skipped" : "failed"] += 1;
    await getDbPool()
      .query("INSERT INTO workflow_migration_items (migration_id, request_id, outcome, verdict, message) VALUES (?, ?, ?, ?, ?)", [migrationId, requestId, item.outcome, null, item.message.slice(0, 500)])
      .catch((error) => logError("workflow migration: item not recorded", error, { migrationId, requestId }));
  }
  await getDbPool().query("UPDATE workflow_migrations SET finished_at = CURRENT_TIMESTAMP, moved = ?, skipped = ?, failed = ? WHERE id = ?", [report.moved, report.skipped, report.failed, migrationId]);
  await recordAudit({
    actorUserId: actor.id,
    action: "WORKFLOW_MIGRATION_RUN",
    entityType: "WORKFLOW",
    entityId: workflow.id,
    metadata: { migrationId, fromVersion: pair.source.versionNo, toVersion: pair.target.versionNo, mapping, acceptWarnings: input.acceptWarnings, moved: report.moved, skipped: report.skipped, failed: report.failed },
  });
  return { ok: true, report };
}

export interface MigrationRun {
  id: number;
  fromVersionNo: number;
  toVersionNo: number;
  byName: string;
  createdAt: Date;
  finishedAt: Date | null;
  moved: number;
  skipped: number;
  failed: number;
}

export async function listMigrationRuns(workflowId: number): Promise<MigrationRun[]> {
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; from_no: number; to_no: number; by_name: string; created_at: Date; finished_at: Date | null; moved: number; skipped: number; failed: number })[]>(
    `SELECT m.id, f.version_no AS from_no, t.version_no AS to_no, u.name AS by_name, m.created_at, m.finished_at, m.moved, m.skipped, m.failed
     FROM workflow_migrations m JOIN workflow_versions f ON f.id = m.from_version_id JOIN workflow_versions t ON t.id = m.to_version_id JOIN users u ON u.id = m.requested_by
     WHERE m.workflow_id = ? ORDER BY m.id DESC LIMIT 20`,
    [workflowId],
  );
  return rows.map((row) => ({ id: row.id, fromVersionNo: row.from_no, toVersionNo: row.to_no, byName: row.by_name, createdAt: row.created_at, finishedAt: row.finished_at, moved: row.moved, skipped: row.skipped, failed: row.failed }));
}

export async function listMigrationItems(migrationId: number): Promise<{ requestId: number; requestNo: string; outcome: string; message: string | null }[]> {
  const [rows] = await getDbPool().query<(RowDataPacket & { request_id: number; request_no: string; outcome: string; message: string | null })[]>(
    "SELECT i.request_id, r.request_no, i.outcome, i.message FROM workflow_migration_items i JOIN approval_requests r ON r.id = i.request_id WHERE i.migration_id = ? ORDER BY i.id",
    [migrationId],
  );
  return rows.map((row) => ({ requestId: row.request_id, requestNo: row.request_no, outcome: row.outcome, message: row.message }));
}

