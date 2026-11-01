import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPool } from "@/lib/db/client";
import { canViewRequest, findRequest, findWorkflowVersion, userNames } from "@/lib/db/repositories/approvals.repository";
import { buildStepMap, peopleInState } from "@/server/approvals/step-map";
import { buildRoad, miniRoad, type MiniRoad, type Road } from "@/server/approvals/road";
import type { FormData as EngineFormData, InstanceState } from "@/server/engine/types";
import type { Actor } from "@/server/approvals/service";

// D-253: the road for one request (the request page's live updates), after
// the same record-level check as the request page: the requester, anyone
// with a task on it, or IT. Light: no timeline, comments or files.
const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

export async function loadRequestRoad(requestId: number, viewer: Actor): Promise<{ road: Road; updatedAt: string } | null> {
  const request = await findRequest(requestId);
  if (!request) return null;
  if (request.requesterId !== viewer.id && !isAdmin(viewer) && !(await canViewRequest(requestId, viewer.id))) return null;
  const version = await findWorkflowVersion(request.workflowVersionId);
  if (!version) return null;
  const names = await userNames(peopleInState(request.state));
  const stages = buildStepMap(version.definition, request.state, version.builder, names, {
    formData: request.formData as EngineFormData,
    fieldLabel: (key) => version.form.find((field) => field.key === key)?.label ?? key,
  });
  const [rows] = await getDbPool().query<(RowDataPacket & { submitted_at: Date; closed_at: Date | null; updated_at: Date })[]>(
    "SELECT submitted_at, closed_at, updated_at FROM approval_requests WHERE id = ? LIMIT 1",
    [requestId],
  );
  const row = rows[0];
  const road = buildRoad(stages, {
    status: request.state.status,
    submittedAt: row?.submitted_at?.toISOString() ?? null,
    closedAt: row?.closed_at?.toISOString() ?? null,
    holdSince: request.state.hold?.at ?? null,
  });
  return { road, updatedAt: (row?.updated_at ?? new Date()).toISOString() };
}

// D-256: the small road for list rows. One query for the whole page of rows
// (state and workflow version), the same calculation as the request page.
export async function miniRoads(requestIds: readonly number[]): Promise<Map<number, MiniRoad>> {
  const out = new Map<number, MiniRoad>();
  if (!requestIds.length) return out;
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; workflow_version_id: number; state_json: unknown; form_data_json: unknown })[]>(
    "SELECT id, workflow_version_id, state_json, form_data_json FROM approval_requests WHERE id IN (?)",
    [requestIds],
  );
  const versions = new Map<number, Awaited<ReturnType<typeof findWorkflowVersion>>>();
  for (const versionId of new Set(rows.map((row) => row.workflow_version_id))) versions.set(versionId, await findWorkflowVersion(versionId));
  const none = new Map<number, string>();
  for (const row of rows) {
    const version = versions.get(row.workflow_version_id);
    if (!version) continue;
    const state = (typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json) as InstanceState;
    const formData = (typeof row.form_data_json === "string" ? JSON.parse(row.form_data_json) : row.form_data_json) as EngineFormData;
    const stages = buildStepMap(version.definition, state, version.builder, none, { formData, fieldLabel: (key) => key });
    out.set(row.id, miniRoad(buildRoad(stages, { status: state.status })));
  }
  return out;
}
