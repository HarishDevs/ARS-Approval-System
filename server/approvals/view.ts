import "server-only";
import { loadLookupNames } from "@/lib/db/repositories/lookups.repository";
import { canViewRequest, findRequest, findValidity, findWorkflow, findWorkflowVersion, listTimeline, userNames } from "@/lib/db/repositories/approvals.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { activeDelegatorsFor, listComments, type CommentItem } from "@/lib/db/repositories/collab.repository";
import { buildStepMap, peopleInState, summarizeTracker, type MapStage, type TrackerSummary } from "@/server/approvals/step-map";
import { describeEvent, eventKind, type TimelineKind } from "@/server/approvals/timeline";
import { CONFIDENTIAL_TEXT, displayValue, isConfidential, OPTION_TYPES, storedLines, type FormField } from "@/server/forms/fields";
import { optionColor } from "@/server/forms/option-colors";
import { requestPriority, shownPriority, type ShownPriority } from "@/server/approvals/priority";
import type { Line } from "@/server/forms/dynamic";
import type { FormData as EngineFormData, InstanceStatus } from "@/server/engine/types";
import type { Actor } from "@/server/approvals/service";
import { listAttachments } from "@/lib/db/repositories/attachments.repository";
import { formatSize, previewKind } from "@/server/attachments/files";
import { listRevisions } from "@/lib/db/repositories/revisions.repository";
import { findSubmissionCheck, type SubmissionCheck } from "@/lib/db/repositories/checks.repository";
import { getDbPool } from "@/lib/db/client";
import { loadDirectorySnapshot, toDirectory } from "@/lib/db/repositories/directory.repository";
import { resolveApprovers } from "@/server/engine/engine";
import type { RowDataPacket } from "mysql2/promise";
import { listConsultations, type Consultation } from "@/lib/db/repositories/consult.repository";
import { visibleLinks } from "@/server/approvals/consult";
import type { LinkedRequest } from "@/lib/db/repositories/consult.repository";
import { diffRounds, type FieldChange } from "@/server/approvals/revisions";
import { canSeeConfidential as canSeeConfidentialValues } from "@/server/approvals/confidential";

// Everything the request page shows (F-14), after the record-level check
// (P1-30a layer 3, D-057): the requester, anyone with a task on it, or
// IT / Super Admin. Anyone else gets null → a plain 404, and it's audited.
export interface RequestView {
  id: number;
  requestNo: string;
  title: string;
  workflowName: string;
  workflowId: number;
  workflowActive: boolean;
  isCustom: boolean; // a custom approval (IT can make it an approval type, P5-04)
  status: InstanceStatus;
  round: number;
  requesterId: number;
  requesterName: string;
  form: FormField[];
  rawFields: Record<string, string>; // for the resubmit form
  fields: { key: string; label: string; value: string; lines?: Line[]; files?: number[]; pills?: { label: string; color: string | null }[] }[]; // files: attachment ids (ATTACHMENT fields); pills: coloured choice values (v1.47.0)
  priority: ShownPriority | null; // v1.47.0: the Priority field, shown beside the title
  stages: MapStage[];
  tracker: TrackerSummary;
  timeline: { id: number; at: Date; text: string; kind: TimelineKind }[];
  myTasks: { taskKey: string; label: string; forName: string | null; work: boolean }[];
  approvedByMe: boolean; // v1.49.5: a step of it was approved by the viewer (which list it belongs to)
  // IT only (D-098): steps that found nobody / no path, with what can be done.
  blockedSteps: { nodeId: string; label: string; kind: "APPROVAL" | "CONDITION"; work: boolean; reason: string; paths: { edgeId: string; label: string }[] }[];
  comments: CommentItem[];
  attachments: { id: number; name: string; size: string; uploadedBy: number; uploaderName: string; createdAt: Date; round: number; preview: "image" | "pdf" | null; fieldLabel: string | null }[];
  // RD-03: after a resubmit, what changed since the round before (null when
  // round 1; "unrecorded" for requests from before v1.6.0).
  changes: { round: number; fields: FieldChange[]; files: string[] } | "unrecorded" | null;
  // v1.6.0 (EN-04..EN-08)
  canRecall: boolean;
  question: { text: string; byName: string; at: string } | null; // an approver's open question (EN-05)
  canAnswerQuestion: boolean;
  canConsult: boolean;
  consultations: Consultation[];
  links: LinkedRequest[];
  canFollowUp: boolean;
  submissionCheck: SubmissionCheck | null; // FN1/EN-09: what was checked at submit
  budgetDepartment: string | null;
  canAddFiles: boolean;
  canResume: boolean;
  canResubmit: boolean;
  canWithdraw: boolean;
  canReopen: boolean;
  changesComment: string | null;
  holdReason: string | null;
  validUntil: Date | null; // A1: approved requests of types with a validity period
  confidentialHidden: boolean; // A8: some values are hidden from this viewer
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
  const allowed = request.requesterId === viewer.id || isAdmin(viewer) || (await canViewRequest(requestId, viewer.id));
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
  const revisions = state.round > 1 ? await listRevisions(requestId) : [];
  const revisionPeople = version.form
    .filter((field) => field.type === "PERSON")
    .flatMap((field) => revisions.map((revision) => revision.fields[field.key]))
    .filter((value): value is number => typeof value === "number");
  const actorIds = timelineRows.flatMap((row) => {
    const payload = row.payload as unknown as Record<string, unknown>;
    const single = ["actorId", "approverId", "onBehalfOf", "fromId", "toId", "consulteeId", "askedBy", "userId"].map((key) => payload[key]);
    const lists = Array.isArray(payload.userIds) ? (payload.userIds as unknown[]) : [];
    return [...single, ...lists].filter((value): value is number => typeof value === "number");
  });
  const names = await userNames([...new Set([request.requesterId, ...peopleInState(state), ...personFieldIds, ...actorIds, ...revisionPeople])]);
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

  // A8: confidential values are for the requester, IT, and anyone who holds
  // or decided a task on the request (or covers a pending one today).
  const canSeeConfidential = await canSeeConfidentialValues(request, viewer);
  const hiddenKeys = new Set(canSeeConfidential ? [] : version.form.filter(isConfidential).map((field) => field.key));
  const allAttachments = await listAttachments(requestId);
  const attachmentRows = allAttachments.filter((file) => !file.fieldKey || !hiddenKeys.has(file.fieldKey));
  // QA-SEC-01: the timeline doesn't name a confidential field's files either.
  const hiddenNames = new Set(allAttachments.filter((file) => file.fieldKey && hiddenKeys.has(file.fieldKey)).map((file) => file.name));
  const submissionCheck = await findSubmissionCheck(requestId);
  // v1.54.0 (owner: "show the approval level name and who is going to
  // approve"): levels not reached yet name who they will go to, resolved now
  // with the engine's own rule (it resolves again when the level arrives).
  const open = state.status === "IN_PROGRESS" || state.status === "ON_HOLD" || state.status === "CHANGES_REQUIRED";
  const directory = open ? toDirectory(await loadDirectorySnapshot().catch(() => null) ?? { users: [], departmentHods: new Map(), roleMembers: new Map(), groupMembers: new Map(), delegations: new Map() }) : null;
  const expectedIds = new Map<string, number[]>();
  if (directory) {
    for (const node of version.definition.nodes) {
      if (node.kind !== "APPROVAL" && node.kind !== "NOTIFY") continue;
      const sources = node.kind === "NOTIFY" ? node.recipients : node.approvers;
      const allowRequester = node.kind === "NOTIFY" || node.mode === "WORK";
      expectedIds.set(node.id, resolveApprovers(sources, { requesterId: request.requesterId, formData: request.formData as EngineFormData, now: new Date().toISOString() }, directory, { allowRequester }).slice(0, 20));
    }
  }
  const expectedNames = expectedIds.size ? await userNames([...new Set([...expectedIds.values()].flat())].filter((id) => !names.has(id))) : new Map<number, string>();
  const expectedName = (id: number) => names.get(id) ?? expectedNames.get(id) ?? `User #${id}`;
  const stages = buildStepMap(version.definition, state, version.builder, names, {
    expected: (node) => (expectedIds.get(node.id) ?? []).map((userId) => ({ userId, name: expectedName(userId) })),
    formData: request.formData as EngineFormData,
    fieldLabel: (key) => version.form.find((field) => field.key === key)?.label ?? key,
  });

  return {
    id: request.id,
    requestNo: request.requestNo,
    title: request.title,
    workflowName: workflow.name,
    workflowId: workflow.id,
    workflowActive: workflow.active,
    isCustom: workflow.kind === "CUSTOM",
    status: state.status,
    round: state.round,
    requesterId: request.requesterId,
    requesterName: nameOf(request.requesterId),
    form: version.form,
    rawFields: Object.fromEntries(Object.entries(request.formData).filter(([key]) => !hiddenKeys.has(key.replace(/__lines$/, ""))).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])),
    fields: version.form
      .filter((field) => field.type !== "SECTION")
      .map((field) =>
        hiddenKeys.has(field.key)
          ? { key: field.key, label: field.label, value: CONFIDENTIAL_TEXT }
          : {
        key: field.key,
        label: field.label,
        value: displayValue(field, request.formData[field.key], names, lookupNames),
        ...(field.type === "LINE_ITEMS" ? { lines: storedLines(request.formData, field.key) } : {}),
        ...(field.type === "ATTACHMENT" ? { files: attachmentRows.filter((file) => file.fieldKey === field.key).map((file) => file.id) } : {}),
        ...choicePills(field, request.formData[field.key]),
            },
      ),
    stages,
    tracker: summarizeTracker(stages, { status: state.status, requesterName: nameOf(request.requesterId), closedAt: closedAt(state), holdSince: state.hold?.at ?? null }),
    timeline: timelineRows
      .map((row) => {
        const payload = row.payload.type === "ATTACHMENTS_ADDED" && hiddenNames.size ? { ...row.payload, names: row.payload.names.map((name) => (hiddenNames.has(name) ? "a confidential file" : name)) } : row.payload;
        return { id: row.id, at: row.createdAt, text: describeEvent(payload, labelOf, nameOf, (nodeId) => workNodes.has(nodeId)), kind: eventKind(payload) };
      })
      .filter((row): row is { id: number; at: Date; text: string; kind: TimelineKind } => row.text !== null),
    approvedByMe: state.tasks.some((task) => task.status === "APPROVED" && task.approverId === viewer.id),
    myTasks:
      state.status === "IN_PROGRESS"
        ? myPending.map((task) => ({ taskKey: task.id, label: labelOf(task.nodeId), forName: task.approverId === viewer.id ? null : nameOf(task.approverId), work: workNodes.has(task.nodeId) }))
        : [],
    blockedSteps,
    comments: await listComments(requestId),
    attachments: attachmentRows.map((file) => ({ id: file.id, name: file.name, size: formatSize(file.sizeBytes), uploadedBy: file.uploadedBy, uploaderName: file.uploaderName, createdAt: file.createdAt, round: file.round, preview: previewKind(file.contentType), fieldLabel: file.fieldKey ? (version.form.find((field) => field.key === file.fieldKey)?.label ?? null) : null })),
    changes: (() => {
      if (state.round <= 1) return null;
      const before = revisions.find((revision) => revision.round === state.round - 1);
      const after = revisions.find((revision) => revision.round === state.round);
      if (!before || !after) return "unrecorded" as const;
      return {
        round: state.round,
        fields: diffRounds(version.form, before, after, (field, value) => displayValue(field, value, names, lookupNames)).map((change) => (hiddenKeys.has(change.key) ? { ...change, before: CONFIDENTIAL_TEXT, after: CONFIDENTIAL_TEXT } : change)),
        files: attachmentRows.filter((file) => file.round === state.round).map((file) => file.name),
      };
    })(),
    canAddFiles: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"].includes(state.status),
    canRecall: request.requesterId === viewer.id && (state.status === "IN_PROGRESS" || state.status === "ON_HOLD"),
    question: state.status === "ON_HOLD" && state.hold?.kind === "INFO" ? { text: state.hold.reason ?? "", byName: nameOf(state.hold.by), at: state.hold.at } : null,
    canAnswerQuestion: state.status === "ON_HOLD" && state.hold?.kind === "INFO" && request.requesterId === viewer.id,
    canConsult: (state.status === "IN_PROGRESS" || state.status === "ON_HOLD") && myPending.length > 0,
    consultations: await listConsultations(requestId),
    links: await visibleLinks(requestId, viewer),
    canFollowUp: state.status === "APPROVED",
    submissionCheck,
    budgetDepartment: submissionCheck?.budget.departmentId ? ((await departmentNameOf(submissionCheck.budget.departmentId)) ?? null) : null,
    canResume: state.status === "ON_HOLD" && (isAdmin(viewer) || myPending.some((task) => task.nodeId === holdNode)),
    canResubmit: state.status === "CHANGES_REQUIRED" && request.requesterId === viewer.id,
    canWithdraw: ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"].includes(state.status) && request.requesterId === viewer.id,
    canReopen: state.status === "APPROVED" && viewer.roles.includes("SUPER_ADMIN"),
    changesComment: state.status === "CHANGES_REQUIRED" ? (state.changesRequested?.comment ?? null) : null,
    holdReason: state.status === "ON_HOLD" ? (state.hold?.reason ?? null) : null,
    validUntil: state.status === "APPROVED" ? await findValidity(requestId) : null,
    confidentialHidden: hiddenKeys.size > 0,
    priority: shownPriority(requestPriority(version.form, request.formData), canSeeConfidential),
  };
}

// v1.47.0: a choice value with colours set in the Form Designer is shown as
// coloured pills (nothing extra when its options have no colours).
function choicePills(field: FormField, value: unknown): { pills?: { label: string; color: string | null }[] } {
  if (!OPTION_TYPES.includes(field.type) || !field.optionColors) return {};
  const values = (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item !== "");
  if (values.length === 0) return {};
  return { pills: values.map((item) => ({ label: item, color: optionColor(field, item) })) };
}

async function departmentNameOf(id: number): Promise<string | null> {
  const [rows] = await getDbPool().query<(RowDataPacket & { name: string })[]>("SELECT name FROM departments WHERE id = ?", [id]);
  return rows[0]?.name ?? null;
}
