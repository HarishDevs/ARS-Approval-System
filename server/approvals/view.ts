import "server-only";
import { findRequest, findWorkflow, findWorkflowVersion, isParticipant, listTimeline, userNames } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { buildStepMap, peopleInState, type MapStage } from "@/server/approvals/step-map";
import { describeEvent } from "@/server/approvals/timeline";
import { displayValue, type FormField } from "@/server/forms/fields";
import type { InstanceStatus } from "@/server/engine/types";
import type { Actor } from "@/server/approvals/service";

// Everything the request page shows (F-14), after the record-level check
// (P1-30a layer 3, D-057): the requester, anyone with a task on it, or
// IT / Super Admin. Anyone else gets null → a plain 404, and it's audited.
export interface RequestView {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  status: InstanceStatus;
  round: number;
  requesterId: number;
  requesterName: string;
  form: FormField[];
  rawFields: Record<string, string>; // for the resubmit form
  fields: { key: string; label: string; value: string }[];
  stages: MapStage[];
  timeline: { id: number; at: Date; text: string }[];
  myTasks: { taskKey: string; label: string }[];
  canResume: boolean;
  canResubmit: boolean;
  changesComment: string | null;
  holdReason: string | null;
}

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

export async function loadRequestView(requestId: number, viewer: Actor): Promise<RequestView | null> {
  const request = await findRequest(requestId);
  if (!request) return null;
  const allowed = request.requesterId === viewer.id || isAdmin(viewer) || (await isParticipant(requestId, viewer.id));
  if (!allowed) {
    await recordAudit({ actorUserId: viewer.id, action: "REQUEST_ACCESS_DENIED", entityType: "REQUEST", entityId: requestId, result: "FAILURE" });
    return null;
  }
  const version = await findWorkflowVersion(request.workflowVersionId);
  const workflow = version ? await findWorkflow(version.workflowId) : null;
  if (!version || !workflow) return null;

  const state = request.state;
  const personFieldIds = version.form
    .filter((field) => field.type === "PERSON")
    .map((field) => request.formData[field.key])
    .filter((value): value is number => typeof value === "number");
  const timelineRows = await listTimeline(requestId);
  const actorIds = timelineRows.flatMap((row) => {
    const payload = row.payload as unknown as Record<string, unknown>;
    return ["actorId", "approverId", "onBehalfOf"].map((key) => payload[key]).filter((value): value is number => typeof value === "number");
  });
  const names = await userNames([...new Set([request.requesterId, ...peopleInState(state), ...personFieldIds, ...actorIds])]);
  const labels = new Map(version.definition.nodes.map((node) => [node.id, node.label]));
  const labelOf = (nodeId: string) => labels.get(nodeId) ?? nodeId;
  const nameOf = (userId: number) => names.get(userId) ?? `User #${userId}`;

  const myPending = state.tasks.filter((task) => task.status === "PENDING" && task.round === state.round && task.approverId === viewer.id);
  const holdNode = state.hold?.nodeId;

  return {
    id: request.id,
    requestNo: request.requestNo,
    title: request.title,
    workflowName: workflow.name,
    status: state.status,
    round: state.round,
    requesterId: request.requesterId,
    requesterName: nameOf(request.requesterId),
    form: version.form,
    rawFields: Object.fromEntries(Object.entries(request.formData).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])),
    fields: version.form.map((field) => ({ key: field.key, label: field.label, value: displayValue(field, request.formData[field.key], names) })),
    stages: buildStepMap(version.definition, state, version.builder, names),
    timeline: timelineRows
      .map((row) => ({ id: row.id, at: row.createdAt, text: describeEvent(row.payload, labelOf, nameOf) }))
      .filter((row): row is { id: number; at: Date; text: string } => row.text !== null),
    myTasks: state.status === "IN_PROGRESS" ? myPending.map((task) => ({ taskKey: task.id, label: labelOf(task.nodeId) })) : [],
    canResume: state.status === "ON_HOLD" && (isAdmin(viewer) || myPending.some((task) => task.nodeId === holdNode)),
    canResubmit: state.status === "CHANGES_REQUIRED" && request.requesterId === viewer.id,
    changesComment: state.status === "CHANGES_REQUIRED" ? (state.changesRequested?.comment ?? null) : null,
    holdReason: state.status === "ON_HOLD" ? (state.hold?.reason ?? null) : null,
  };
}
