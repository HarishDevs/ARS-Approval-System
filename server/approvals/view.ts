import "server-only";
import { loadLookupNames } from "@/lib/db/repositories/lookups.repository";
import { findRequest, findWorkflow, findWorkflowVersion, isParticipant, listTimeline, userNames } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { activeDelegatorsFor, listComments, type CommentItem } from "@/lib/db/repositories/collab.repository";
import { buildStepMap, peopleInState, summarizeTracker, type MapStage, type TrackerSummary } from "@/server/approvals/step-map";
import { describeEvent } from "@/server/approvals/timeline";
import { displayValue, type FormField } from "@/server/forms/fields";
import type { FormData as EngineFormData, InstanceStatus } from "@/server/engine/types";
import type { Actor } from "@/server/approvals/service";
import { listAttachments } from "@/lib/db/repositories/attachments.repository";
import { formatSize } from "@/server/attachments/files";

// Everything the request page shows (F-14), after the record-level check
// (P1-30a layer 3, D-057): the requester, anyone with a task on it, or
// IT / Super Admin. Anyone else gets null → a plain 404, and it's audited.
export interface RequestView {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  isCustom: boolean; // a custom approval (IT can make it an approval type, P5-04)
  status: InstanceStatus;
  round: number;
  requesterId: number;
  requesterName: string;
  form: FormField[];
  rawFields: Record<string, string>; // for the resubmit form
  fields: { key: string; label: string; value: string }[];
  stages: MapStage[];
  tracker: TrackerSummary;
  timeline: { id: number; at: Date; text: string }[];
  myTasks: { taskKey: string; label: string; forName: string | null; work: boolean }[];
  // IT only (D-098): steps that found nobody / no path, with what can be done.
  blockedSteps: { nodeId: string; label: string; kind: "APPROVAL" | "CONDITION"; work: boolean; reason: string; paths: { edgeId: string; label: string }[] }[];
  comments: CommentItem[];
  attachments: { id: number; name: string; size: string; uploaderName: string; createdAt: Date; round: number }[];
  canAddFiles: boolean;
  canResume: boolean;
  canResubmit: boolean;
  canWithdraw: boolean;
  canReopen: boolean;
  changesComment: string | null;
  holdReason: string | null;
}

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");

// When a finished request was closed: the latest decision time in its tasks.
function closedAt(state: { status: string; tasks: { decidedAt?: string }[] }): string | null {
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(state.status)) return null;
  return state.tasks.map((task) => task.decidedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

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
    const single = ["actorId", "approverId", "onBehalfOf", "fromId", "toId"].map((key) => payload[key]);
    const lists = Array.isArray(payload.userIds) ? (payload.userIds as unknown[]) : [];
    return [...single, ...lists].filter((value): value is number => typeof value === "number");
  });
  const names = await userNames([...new Set([request.requesterId, ...peopleInState(state), ...personFieldIds, ...actorIds])]);
  const lookupNames = version.form.some((field) => field.type === "LOOKUP") ? await loadLookupNames() : undefined;
  const labels = new Map(version.definition.nodes.map((node) => [node.id, node.label]));
  const labelOf = (nodeId: string) => labels.get(nodeId) ?? nodeId;
  const nameOf = (userId: number) => names.get(userId) ?? `User #${userId}`;

  // Mine, plus those of anyone who named me their delegate today (D-062);
  // never an approval on my own request (work on it may be mine, D-097).
  const workNodes = new Set(version.definition.nodes.filter((node) => node.kind === "APPROVAL" && node.mode === "WORK").map((node) => node.id));
  const delegators = await activeDelegatorsFor(viewer.id);
  const myPending = state.tasks.filter(
    (task) =>
      task.status === "PENDING" &&
      task.round === state.round &&
      (task.approverId === viewer.id || delegators.has(task.approverId)) &&
      (request.requesterId !== viewer.id || workNodes.has(task.nodeId)),
  );
  const edgeLabel = (edgeId: string) => {
    const edge = version.definition.edges.find((item) => item.id === edgeId);
    return edge ? `${edge.isDefault ? "Otherwise" : "When it matches"} → ${labelOf(edge.to)}` : edgeId;
  };
  const blockedSteps =
    isAdmin(viewer) && state.status === "IN_PROGRESS"
      ? version.definition.nodes
          .filter((node) => state.nodes[node.id]?.status === "BLOCKED" && (node.kind === "APPROVAL" || node.kind === "CONDITION"))
          .map((node) => ({
            nodeId: node.id,
            label: node.label,
            kind: node.kind as "APPROVAL" | "CONDITION",
            work: workNodes.has(node.id),
            reason: state.nodes[node.id]?.reason === "NO_MATCHING_BRANCH" ? "No path matches" : state.nodes[node.id]?.reason === "NOT_ENOUGH_APPROVERS" ? "Not enough approvers" : "Nobody eligible to approve",
            paths: node.kind === "CONDITION" ? version.definition.edges.filter((edge) => edge.from === node.id).map((edge) => ({ edgeId: edge.id, label: edgeLabel(edge.id) })) : [],
          }))
      : [];
  const holdNode = state.hold?.nodeId;

  const stages = buildStepMap(version.definition, state, version.builder, names, {
    formData: request.formData as EngineFormData,
    fieldLabel: (key) => version.form.find((field) => field.key === key)?.label ?? key,
  });

  return {
    id: request.id,
    requestNo: request.requestNo,
    title: request.title,
    workflowName: workflow.name,
    isCustom: workflow.kind === "CUSTOM",
    status: state.status,
    round: state.round,
    requesterId: request.requesterId,
    requesterName: nameOf(request.requesterId),
    form: version.form,
    rawFields: Object.fromEntries(Object.entries(request.formData).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])),
    fields: version.form.map((field) => ({ key: field.key, label: field.label, value: displayValue(field, request.formData[field.key], names, lookupNames) })),
    stages,
    tracker: summarizeTracker(stages, { status: state.status, requesterName: nameOf(request.requesterId), closedAt: closedAt(state), holdSince: state.hold?.at ?? null }),
    timeline: timelineRows
      .map((row) => ({ id: row.id, at: row.createdAt, text: describeEvent(row.payload, labelOf, nameOf, (nodeId) => workNodes.has(nodeId)) }))
      .filter((row): row is { id: number; at: Date; text: string } => row.text !== null),
    myTasks:
      state.status === "IN_PROGRESS"
        ? myPending.map((task) => ({ taskKey: task.id, label: labelOf(task.nodeId), forName: task.approverId === viewer.id ? null : nameOf(task.approverId), work: workNodes.has(task.nodeId) }))
        : [],
    blockedSteps,
    comments: await listComments(requestId),
    attachments: (await listAttachments(requestId)).map((file) => ({ id: file.id, name: file.name, size: formatSize(file.sizeBytes), uploaderName: file.uploaderName, createdAt: file.createdAt, round: file.round })),
    canAddFiles: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"].includes(state.status),
    canResume: state.status === "ON_HOLD" && (isAdmin(viewer) || myPending.some((task) => task.nodeId === holdNode)),
    canResubmit: state.status === "CHANGES_REQUIRED" && request.requesterId === viewer.id,
    canWithdraw: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"].includes(state.status) && request.requesterId === viewer.id,
    canReopen: state.status === "APPROVED" && viewer.roles.includes("SUPER_ADMIN"),
    changesComment: state.status === "CHANGES_REQUIRED" ? (state.changesRequested?.comment ?? null) : null,
    holdReason: state.status === "ON_HOLD" ? (state.hold?.reason ?? null) : null,
  };
}
