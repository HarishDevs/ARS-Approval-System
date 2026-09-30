import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { getDbPool } from "@/lib/db/client";
import {
  appendEvents,
  findPublishedVersion,
  findWorkflow,
  findWorkflowVersion,
  insertRequest,
  insertWorkflow,
  insertWorkflowVersion,
  lockRequest,
  nextRequestNumber,
  publishWorkflowVersion,
  saveRequestState,
  syncTasks,
  type RequestRecord,
  type WorkflowRecord,
} from "@/lib/db/repositories/approvals.repository";
import { loadDirectorySnapshot, toDirectory } from "@/lib/db/repositories/directory.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getEnv } from "@/config/environment";
import { notify } from "@/server/notifications/notify";
import { messagesForEvents } from "@/server/approvals/messages";
import { decide, putOnHold, resubmit, resume, startInstance, validateWorkflow, EngineError } from "@/server/engine";
import type { Decision, EngineEvent, EngineResult, FormData as EngineFormData, RestartPolicy, ValidationResult, WorkflowDefinition } from "@/server/engine";
import { logError } from "@/lib/logging/logger";
import type { RoleCode } from "@/types/auth";

// The multi-level approval service (north star, S2-06, F-11 to F-13). The
// engine decides; this layer loads, locks, saves and tells people.
export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string; validation?: ValidationResult };

export interface Actor {
  id: number;
  roles: readonly RoleCode[];
}

// Errors the service raises itself (not from the engine).
class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isAdmin = (actor: Actor) => actor.roles.includes("IT_ADMIN") || actor.roles.includes("SUPER_ADMIN");
const now = () => new Date().toISOString();

// ---- workflows (F-50) ------------------------------------------------------------
async function validationContext(db: Pick<PoolConnection, "query"> = getDbPool()) {
  const [users] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM users WHERE active = TRUE AND is_break_glass = FALSE");
  const [roles] = await db.query<(RowDataPacket & { code: string })[]>("SELECT code FROM roles WHERE active = TRUE");
  const [departments] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM departments WHERE active = TRUE");
  const [groups] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM approver_groups WHERE active = TRUE");
  return {
    knownUserIds: users.map((row) => row.id),
    knownRoleCodes: roles.map((row) => row.code),
    knownDepartmentIds: departments.map((row) => row.id),
    knownGroupIds: groups.map((row) => row.id),
  };
}

export async function checkWorkflow(definition: WorkflowDefinition, formFieldKeys?: readonly string[]): Promise<ValidationResult> {
  return validateWorkflow(definition, { ...(await validationContext()), ...(formFieldKeys ? { formFieldKeys } : {}) });
}

function canManageWorkflow(actor: Actor, workflow: Pick<WorkflowRecord, "kind" | "ownerUserId">): boolean {
  return workflow.kind === "PREDEFINED" ? isAdmin(actor) : workflow.ownerUserId === actor.id || isAdmin(actor);
}

export async function createWorkflow(
  input: { code: string; name: string; description?: string; kind: WorkflowRecord["kind"]; requestPrefix: string; definition: WorkflowDefinition },
  actor: Actor,
): Promise<Result<{ workflowId: number; versionId: number; validation: ValidationResult }>> {
  if (input.kind === "PREDEFINED" && !isAdmin(actor)) return { ok: false, code: "FORBIDDEN", message: "Only the IT team creates predefined approvals." };
  if (!/^[A-Z]{2,6}$/.test(input.requestPrefix)) return { ok: false, code: "INVALID_PREFIX", message: "Use 2 to 6 capital letters for the request prefix, e.g. PUR." };
  const validation = await checkWorkflow(input.definition);
  const ids = await withTransaction(async (connection) => {
    const workflowId = await insertWorkflow(
      {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        kind: input.kind,
        requestPrefix: input.requestPrefix,
        ownerUserId: input.kind === "CUSTOM" ? actor.id : null,
        createdBy: actor.id,
      },
      connection,
    );
    const version = await insertWorkflowVersion(workflowId, input.definition, actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_CREATED", entityType: "WORKFLOW", entityId: workflowId, metadata: { code: input.code, kind: input.kind, versionNo: version.versionNo } }, connection);
    return { workflowId, versionId: version.id };
  });
  return { ok: true, value: { ...ids, validation } };
}

export async function addDraftVersion(workflowId: number, definition: WorkflowDefinition, actor: Actor): Promise<Result<{ versionId: number; versionNo: number; validation: ValidationResult }>> {
  const workflow = await findWorkflow(workflowId);
  if (!workflow || !canManageWorkflow(actor, workflow)) return { ok: false, code: "NOT_FOUND", message: "Workflow not found." };
  const validation = await checkWorkflow(definition);
  const version = await withTransaction(async (connection) => {
    const created = await insertWorkflowVersion(workflowId, definition, actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_VERSION_CREATED", entityType: "WORKFLOW", entityId: workflowId, metadata: { versionNo: created.versionNo } }, connection);
    return created;
  });
  return { ok: true, value: { versionId: version.id, versionNo: version.versionNo, validation } };
}

// A version with validation errors can never be published (P3-04).
export async function publishVersion(versionId: number, actor: Actor): Promise<Result<{ versionNo: number }>> {
  const version = await findWorkflowVersion(versionId);
  const workflow = version ? await findWorkflow(version.workflowId) : null;
  if (!version || !workflow || !canManageWorkflow(actor, workflow)) return { ok: false, code: "NOT_FOUND", message: "Workflow not found." };
  if (version.status !== "DRAFT") return { ok: false, code: "NOT_DRAFT", message: "Only a draft can be published." };
  const validation = await checkWorkflow(version.definition);
  if (!validation.valid) return { ok: false, code: "INVALID_WORKFLOW", message: "Fix the errors before publishing.", validation };
  await withTransaction(async (connection) => {
    await publishWorkflowVersion(version.id, workflow.id, actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_PUBLISHED", entityType: "WORKFLOW", entityId: workflow.id, metadata: { versionNo: version.versionNo } }, connection);
  });
  return { ok: true, value: { versionNo: version.versionNo } };
}

// ---- requests (F-11, F-12, F-13) --------------------------------------------------------
interface Changed {
  request: RequestRecord;
  events: EngineEvent[];
  requesterName: string;
}

function engineFailure(error: unknown): Result<never> {
  if (error instanceof EngineError || error instanceof ServiceError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

async function requesterName(id: number, db: Pick<PoolConnection, "query">): Promise<string> {
  const [rows] = await db.query<(RowDataPacket & { name: string })[]>("SELECT name FROM users WHERE id = ?", [id]);
  return rows[0]?.name ?? "Someone";
}

// Notifications after the commit; a failed send never undoes the action.
async function announce(changed: Changed): Promise<void> {
  try {
    const adminIds = changed.events.some((event) => event.type === "NODE_BLOCKED") ? await listUserIdsWithRole("IT_ADMIN") : [];
    const messages = messagesForEvents(
      changed.events,
      { id: changed.request.id, requestNo: changed.request.requestNo, title: changed.request.title, requesterId: changed.request.requesterId, requesterName: changed.requesterName },
      { baseUrl: getEnv().APP_BASE_URL ?? "https://approvals.arssteels.net", adminIds },
    );
    for (const message of messages) await notify(message);
  } catch (error) {
    logError("approvals: announce failed", error, { requestId: changed.request.id });
  }
}

export async function submitRequest(input: { workflowId: number; title: string; formData: EngineFormData }, actor: Actor): Promise<Result<{ requestId: number; requestNo: string; status: string }>> {
  const workflow = await findWorkflow(input.workflowId);
  if (!workflow || !workflow.active) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  if (workflow.kind === "CUSTOM" && workflow.ownerUserId !== actor.id) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  const version = await findPublishedVersion(workflow.id);
  if (!version) return { ok: false, code: "NOT_PUBLISHED", message: "This approval type has no published version yet." };
  const title = input.title.trim();
  if (title.length < 3 || title.length > 200) return { ok: false, code: "INVALID_TITLE", message: "Give the request a title of 3 to 200 characters." };

  let changed: Changed;
  try {
    changed = await withTransaction(async (connection) => {
      const directory = toDirectory(await loadDirectorySnapshot(connection));
      const result = startInstance(version.definition, { requesterId: actor.id, formData: input.formData, now: now() }, directory);
      const requestNo = await nextRequestNumber(workflow.requestPrefix, connection);
      const id = await insertRequest({ requestNo, workflowVersionId: version.id, requesterId: actor.id, title, formData: input.formData, state: result.state }, connection);
      await syncTasks(id, result.state, version.definition.nodes, connection);
      await appendEvents(id, [{ type: "SUBMITTED", requestNo }, ...result.events], actor.id, connection);
      const request: RequestRecord = {
        id,
        requestNo,
        workflowVersionId: version.id,
        requesterId: actor.id,
        title,
        formData: input.formData,
        status: result.state.status,
        round: result.state.round,
        state: result.state,
        stateVersion: 1,
      };
      return { request, events: result.events, requesterName: await requesterName(actor.id, connection) };
    });
  } catch (error) {
    return engineFailure(error);
  }
  await announce(changed);
  return { ok: true, value: { requestId: changed.request.id, requestNo: changed.request.requestNo, status: changed.request.status } };
}

type Step = (request: RequestRecord, definition: WorkflowDefinition, directory: ReturnType<typeof toDirectory>) => EngineResult & { formData?: Record<string, unknown> };

// One locked read-modify-write for every action on an existing request.
async function mutate(requestId: number, actor: Actor, step: Step): Promise<Result<{ status: string }>> {
  let changed: Changed;
  try {
    changed = await withTransaction(async (connection) => {
      const request = await lockRequest(requestId, connection);
      if (!request) throw new ServiceError("NOT_FOUND", "Request not found.");
      const version = await findWorkflowVersion(request.workflowVersionId, connection);
      if (!version) throw new Error(`workflow version ${request.workflowVersionId} missing`);
      const directory = toDirectory(await loadDirectorySnapshot(connection));
      const result = step(request, version.definition, directory);
      if (!(await saveRequestState(request.id, request.stateVersion, result.state, result.formData ?? null, connection))) {
        throw new ServiceError("CONFLICT", "Someone else just changed this request. Reload and try again.");
      }
      await syncTasks(request.id, result.state, version.definition.nodes, connection);
      await appendEvents(request.id, result.events, actor.id, connection);
      return {
        request: { ...request, state: result.state, status: result.state.status, round: result.state.round, stateVersion: request.stateVersion + 1 },
        events: result.events,
        requesterName: await requesterName(request.requesterId, connection),
      };
    });
  } catch (error) {
    return engineFailure(error);
  }
  await announce(changed);
  return { ok: true, value: { status: changed.request.status } };
}

const context = (request: RequestRecord) => ({ requesterId: request.requesterId, formData: request.formData as EngineFormData, now: now() });

export function decideTask(input: { requestId: number; taskKey: string; decision: Decision; comment?: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory) =>
    decide(definition, request.state, { taskId: input.taskKey, actorId: actor.id, decision: input.decision, comment: input.comment }, context(request), directory),
  );
}

export function holdTask(input: { requestId: number; taskKey: string; reason?: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, _definition, directory) =>
    putOnHold(request.state, { taskId: input.taskKey, actorId: actor.id, reason: input.reason }, context(request), directory),
  );
}

export function resumeRequest(requestId: number, actor: Actor) {
  return mutate(requestId, actor, (request, _definition, directory) => resume(request.state, { actorId: actor.id, isAdmin: isAdmin(actor) }, directory));
}

// Only the requester resubmits, on the same request number (G-04).
export function resubmitRequest(input: { requestId: number; formData?: EngineFormData; policy?: RestartPolicy }, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory) => {
    if (request.requesterId !== actor.id) throw new EngineError("NOT_AUTHORISED", "Only the person who raised the request can resubmit it.");
    const formData = (input.formData ?? request.formData) as EngineFormData;
    const result = resubmit(definition, request.state, input.policy ?? "REQUESTING_STEP", { requesterId: request.requesterId, formData, now: now() }, directory);
    return { ...result, formData: input.formData ?? undefined };
  });
}
