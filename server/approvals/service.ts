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
  findBySubmissionKey,
  findRecentDuplicate,
  listVersions,
  lockRequest,
  nextRequestNumber,
  publishWorkflowVersion,
  saveRequestState,
  syncTasks,
  userNames,
  type RequestRecord,
  type WorkflowRecord,
  type WorkflowVersionRecord,
} from "@/lib/db/repositories/approvals.repository";
import { loadDirectorySnapshot, toDirectory, type DirectorySnapshot } from "@/lib/db/repositories/directory.repository";
import { loadWorkingCalendar } from "@/lib/db/repositories/calendar.repository";
import { checkFormDefinition, parseFormSubmission, type FormField } from "@/server/forms/fields";
import { allSteps, checkDoaAmount, checkDoaForm, compileBuilder, type BuilderSpec } from "@/server/workflows/builder";
import { describeRule } from "@/server/approvals/step-map";
import { approverFieldKeys, ineligibleChoices, namedApprovers } from "@/server/approvals/approver-rules";
import { approverStatuses } from "@/lib/db/repositories/approvers.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { getEnv } from "@/config/environment";
import { notify } from "@/server/notifications/notify";
import { messagesForEvents } from "@/server/approvals/messages";
import { decide, putOnHold, reassignTask, reopen, resubmit, resume, simulate, startInstance, validateWorkflow, withdraw, EngineError } from "@/server/engine";
import type { Decision, EngineEvent, EngineResult, FormData as EngineFormData, RestartPolicy, ValidationResult, WorkflowDefinition } from "@/server/engine";
import { claimOutbox, insertOutbox, listStaleOutbox, markOutboxSent } from "@/lib/db/repositories/outbox.repository";
import type { NotifyInput } from "@/server/notifications/notify";
import { logError } from "@/lib/logging/logger";
import type { RoleCode } from "@/types/auth";

// The multi-level approval service (north star, S2-06, F-11 to F-13). The
// engine decides; this layer loads, locks, saves and tells people.
export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string; validation?: ValidationResult; fieldErrors?: Record<string, string> };

export interface Actor {
  id: number;
  roles: readonly RoleCode[];
}

// A submitted form didn't pass its checks (field → message).
class FormError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    readonly userMessage = "Check the highlighted fields.",
  ) {
    super("INVALID_FORM");
  }
}

const activeIds = (snapshot: DirectorySnapshot) => new Set(snapshot.users.filter((user) => user.active && !user.isBreakGlass).map((user) => user.id));
const approverIds = (snapshot: DirectorySnapshot) => new Set(snapshot.users.filter((user) => user.active && !user.isBreakGlass && user.approver).map((user) => user.id));

// D-085: a person field that decides an approver takes approver-eligible
// people only. On a resubmit, the person already chosen stays valid.
function approverFieldErrors(definition: WorkflowDefinition, data: EngineFormData, snapshot: DirectorySnapshot, previous?: EngineFormData): Record<string, string> {
  const eligible = approverIds(snapshot);
  const errors: Record<string, string> = {};
  for (const key of approverFieldKeys(definition)) {
    const value = data[key];
    if (typeof value !== "number" || eligible.has(value) || (previous && previous[key] === value)) continue;
    errors[key] = "This person isn't an approver. Choose someone whose designation is ticked as Approver.";
  }
  return errors;
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

// What a version holds: the graph (given directly, or compiled from the
// builder, D-056) and the form (D-055).
export interface WorkflowContent {
  definition?: WorkflowDefinition;
  builder?: BuilderSpec;
  form?: FormField[];
}

type ResolvedContent = { definition: WorkflowDefinition; builder: BuilderSpec | null; form: FormField[]; validation: ValidationResult };

// previousNamed: people already named in the version being replaced; they stay valid (D-085).
async function resolveContent(content: WorkflowContent, previousNamed: readonly number[] = []): Promise<Result<ResolvedContent>> {
  const form = content.form ?? [];
  const formProblems = checkFormDefinition(form);
  if (formProblems.length) return { ok: false, code: "INVALID_FORM", message: formProblems.join(" ") };
  let definition = content.definition;
  if (content.builder) {
    const doaProblems = checkDoaForm(content.builder, form);
    if (doaProblems.length) return { ok: false, code: "INVALID_BUILDER", message: doaProblems.join(" ") };
    const compiled = compileBuilder(content.builder);
    if (!compiled.ok) return { ok: false, code: "INVALID_BUILDER", message: compiled.errors.join(" ") };
    definition = compiled.definition;
  }
  if (!definition) return { ok: false, code: "INVALID_WORKFLOW", message: "The workflow has no steps." };
  // People who don't exist are left to the validator (the draft saves, publishing is refused).
  const named = namedApprovers(definition);
  const statuses = await approverStatuses(named);
  const notApprovers = ineligibleChoices(named.filter((id) => statuses.has(id)), previousNamed, statuses);
  if (notApprovers.length) return { ok: false, code: "NOT_APPROVER", message: notApprovers.join(" ") };
  const validation = await checkWorkflow(definition, form.map((field) => field.key));
  return { ok: true, value: { definition, builder: content.builder ?? null, form, validation } };
}

export async function createWorkflow(
  input: { code: string; name: string; description?: string; kind: WorkflowRecord["kind"]; requestPrefix: string } & WorkflowContent,
  actor: Actor,
): Promise<Result<{ workflowId: number; versionId: number; validation: ValidationResult }>> {
  if (input.kind === "PREDEFINED" && !isAdmin(actor)) return { ok: false, code: "FORBIDDEN", message: "Only the IT team creates predefined approvals." };
  if (!/^[A-Z]{2,6}$/.test(input.requestPrefix)) return { ok: false, code: "INVALID_PREFIX", message: "Use 2 to 6 capital letters for the request prefix, e.g. PUR." };
  if (!/^[A-Z0-9_]{2,50}$/.test(input.code)) return { ok: false, code: "INVALID_CODE", message: "Use 2 to 50 capital letters, numbers or _ for the code, e.g. PURCHASE." };
  const resolved = await resolveContent(input);
  if (!resolved.ok) return resolved;
  const { definition, builder, form, validation } = resolved.value;
  try {
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
      const version = await insertWorkflowVersion(workflowId, { definition, form, builder }, actor.id, connection);
      await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_CREATED", entityType: "WORKFLOW", entityId: workflowId, metadata: { code: input.code, kind: input.kind, versionNo: version.versionNo } }, connection);
      return { workflowId, versionId: version.id };
    });
    return { ok: true, value: { ...ids, validation } };
  } catch (error) {
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") return { ok: false, code: "DUPLICATE_CODE", message: "Another workflow already uses this code." };
    throw error;
  }
}

export async function addDraftVersion(workflowId: number, content: WorkflowContent, actor: Actor): Promise<Result<{ versionId: number; versionNo: number; validation: ValidationResult }>> {
  const workflow = await findWorkflow(workflowId);
  if (!workflow || !canManageWorkflow(actor, workflow)) return { ok: false, code: "NOT_FOUND", message: "Workflow not found." };
  const latest = (await listVersions(workflowId))[0];
  const resolved = await resolveContent(content, latest ? namedApprovers(latest.definition) : []);
  if (!resolved.ok) return resolved;
  const { definition, builder, form, validation } = resolved.value;
  const version = await withTransaction(async (connection) => {
    const created = await insertWorkflowVersion(workflowId, { definition, form, builder }, actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_VERSION_CREATED", entityType: "WORKFLOW", entityId: workflowId, metadata: { versionNo: created.versionNo } }, connection);
    return created;
  });
  return { ok: true, value: { versionId: version.id, versionNo: version.versionNo, validation } };
}

export async function validateVersion(versionId: number): Promise<ValidationResult | null> {
  const version = await findWorkflowVersion(versionId);
  return version ? checkWorkflow(version.definition, version.form.map((field) => field.key)) : null;
}

// A version with validation errors can never be published (P3-04).
export async function publishVersion(versionId: number, actor: Actor): Promise<Result<{ versionNo: number }>> {
  const version = await findWorkflowVersion(versionId);
  const workflow = version ? await findWorkflow(version.workflowId) : null;
  if (!version || !workflow || !canManageWorkflow(actor, workflow)) return { ok: false, code: "NOT_FOUND", message: "Workflow not found." };
  if (version.status !== "DRAFT") return { ok: false, code: "NOT_DRAFT", message: "Only a draft can be published." };
  const validation = await checkWorkflow(version.definition, version.form.map((field) => field.key));
  if (!validation.valid) return { ok: false, code: "INVALID_WORKFLOW", message: "Fix the errors before publishing.", validation };
  await withTransaction(async (connection) => {
    await publishWorkflowVersion(version.id, workflow.id, actor.id, connection);
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_PUBLISHED", entityType: "WORKFLOW", entityId: workflow.id, metadata: { versionNo: version.versionNo } }, connection);
  });
  return { ok: true, value: { versionNo: version.versionNo } };
}

// Test mode (P3-05, F-50): the stages and the names that would approve,
// for sample form values and a sample requester. Nothing is saved.
export interface SimulationView {
  outcome: "APPROVED" | "BLOCKED";
  stages: { label: string; rule: string; people: string[] }[][];
  skipped: string[];
  blocked: string[];
  formErrors: Record<string, string>;
}

export async function simulateVersion(versionId: number, input: { requesterId: number; fields: Record<string, string | undefined> }): Promise<SimulationView | null> {
  const version = await findWorkflowVersion(versionId);
  if (!version) return null;
  const snapshot = await loadDirectorySnapshot();
  const active = new Set(snapshot.users.filter((user) => user.active && !user.isBreakGlass).map((user) => user.id));
  const parsed = parseFormSubmission(version.form, input.fields, active, await loadFieldLookups());
  // Test mode still runs with the values that are fine, so the IT team sees the effect of each field.
  const formData = parsed.data;
  const result = simulate(version.definition, { requesterId: input.requesterId, formData, now: now() }, toDirectory(snapshot));
  const names = await userNames([...new Set(result.stages.flat().flatMap((step) => step.approverIds))]);
  return {
    outcome: result.outcome,
    stages: result.stages.map((stage) =>
      stage.map((step) => ({
        label: step.label,
        rule: describeRule(step.completion, step.approverIds.length),
        people: step.approverIds.map((id) => names.get(id) ?? `User #${id}`),
      })),
    ),
    skipped: result.skipped.map((step) => step.label),
    blocked: result.blocked.map((step) => `${step.label}: ${step.reason}`),
    formErrors: parsed.ok ? {} : parsed.errors,
  };
}

// ---- requests (F-11, F-12, F-13) --------------------------------------------------------
interface Changed {
  request: RequestRecord;
  events: EngineEvent[];
  requesterName: string;
  outboxIds: number[];
}

function engineFailure(error: unknown): Result<never> {
  if (error instanceof EngineError || error instanceof ServiceError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

async function requesterName(id: number, db: Pick<PoolConnection, "query">): Promise<string> {
  const [rows] = await db.query<(RowDataPacket & { name: string })[]>("SELECT name FROM users WHERE id = ?", [id]);
  return rows[0]?.name ?? "Someone";
}

// Notifications (D-QA-06): worked out inside the action's transaction and
// written to the outbox with it, sent right after the commit. If the process
// dies first, the job runner sends what's left. A failed send never undoes
// the action.
async function prepareMessages(
  change: { request: RequestRecord; events: EngineEvent[]; requesterName: string },
  db: Pick<PoolConnection, "query">,
): Promise<NotifyInput[]> {
  const blocked = change.events.some((event) => event.type === "NODE_BLOCKED");
  const adminIds = blocked ? await listUserIdsWithRole("IT_ADMIN", db) : [];
  const nodes = blocked ? ((await findWorkflowVersion(change.request.workflowVersionId, db))?.definition.nodes ?? []) : [];
  const labelOf = (nodeId: string) => nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
  return messagesForEvents(
    change.events,
    { id: change.request.id, requestNo: change.request.requestNo, title: change.request.title, requesterId: change.request.requesterId, requesterName: change.requesterName },
    { baseUrl: getEnv().APP_BASE_URL ?? "https://approval.arssteels.net", adminIds, labelOf },
  );
}

async function queueMessages(change: { request: RequestRecord; events: EngineEvent[]; requesterName: string }, db: Pick<PoolConnection, "query">): Promise<number[]> {
  return insertOutbox(change.request.id, await prepareMessages(change, db), db);
}

// Send outbox rows; each is claimed first so it is sent by one sender only.
export async function deliverOutbox(ids: readonly number[]): Promise<number> {
  let sent = 0;
  for (const id of ids) {
    try {
      const message = await claimOutbox(id);
      if (!message) continue;
      await notify(message);
      await markOutboxSent(id);
      sent += 1;
    } catch (error) {
      logError("approvals: outbox delivery failed", error, { outboxId: id });
    }
  }
  return sent;
}

// Job runner: whatever the in-process sender didn't finish.
export async function runOutbox(): Promise<{ outboxSent: number }> {
  return { outboxSent: await deliverOutbox(await listStaleOutbox(200)) };
}

async function announce(changed: Changed): Promise<void> {
  await deliverOutbox(changed.outboxIds);
}

export async function submitRequest(
  input: { workflowId: number; title: string; fields: Record<string, string | undefined>; submissionKey?: string | null; allowDuplicate?: boolean; isCustom?: boolean },
  actor: Actor,
): Promise<Result<{ requestId: number; requestNo: string; status: string; repeated?: boolean }>> {
  // D-QA-01: the same form sent again (retry after a timeout) → the request it already made.
  if (input.submissionKey) {
    const earlier = await findBySubmissionKey(actor.id, input.submissionKey);
    if (earlier) return { ok: true, value: { requestId: earlier.id, requestNo: earlier.requestNo, status: earlier.status, repeated: true } };
  }
  const workflow = await findWorkflow(input.workflowId);
  if (!workflow || !workflow.active) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  if (workflow.kind === "CUSTOM" && workflow.ownerUserId !== actor.id) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  const version = await findPublishedVersion(workflow.id);
  if (!version) return { ok: false, code: "NOT_PUBLISHED", message: "This approval type has no published version yet." };
  const title = input.title.trim();
  const titleError = title.length < 3 || title.length > 200 ? "Give the request a title of 3 to 200 characters." : null;

  let changed: Changed;
  try {
    changed = await withTransaction(async (connection) => {
      const snapshot = await loadDirectorySnapshot(connection);
      const parsed = parseFormSubmission(version.form, input.fields, activeIds(snapshot), await loadFieldLookups(connection));
      const doaErrors = parsed.ok ? { ...checkDoaAmount(version.builder, parsed.data), ...approverFieldErrors(version.definition, parsed.data, snapshot) } : {};
      if (!parsed.ok || titleError || Object.keys(doaErrors).length) {
        throw new FormError({ ...(parsed.ok ? {} : parsed.errors), ...doaErrors, ...(titleError ? { title: titleError } : {}) });
      }
      // D-QA-02: the same title on the same type a few minutes ago (two tabs,
      // or a second click elsewhere). Checked once the form itself is valid.
      if (!input.allowDuplicate) {
        const duplicate = await findRecentDuplicate({ requesterId: actor.id, title, workflowId: input.isCustom ? null : workflow.id }, connection);
        if (duplicate) {
          const message = `You raised “${title}” as ${duplicate} a few minutes ago. If this is a separate request, tick “This is a separate request” and submit again.`;
          throw new FormError({ allowDuplicate: message }, message);
        }
      }
      const formData = parsed.data;
      const result = startInstance(version.definition, { requesterId: actor.id, formData, now: now() }, toDirectory(snapshot));
      const requestNo = await nextRequestNumber(workflow.requestPrefix, connection);
      const id = await insertRequest({ requestNo, workflowVersionId: version.id, requesterId: actor.id, title, formData, state: result.state, submissionKey: input.submissionKey ?? null }, connection);
      await syncTasks(id, result.state, version.definition.nodes, connection, await loadWorkingCalendar(connection));
      await appendEvents(id, [{ type: "SUBMITTED", requestNo }, ...result.events], actor.id, connection);
      const request: RequestRecord = {
        id,
        requestNo,
        workflowVersionId: version.id,
        requesterId: actor.id,
        title,
        formData,
        status: result.state.status,
        round: result.state.round,
        state: result.state,
        stateVersion: 1,
      };
      const change = { request, events: result.events, requesterName: await requesterName(actor.id, connection) };
      return { ...change, outboxIds: await queueMessages(change, connection) };
    });
  } catch (error) {
    if (error instanceof FormError) return { ok: false, code: error.fieldErrors.allowDuplicate ? "POSSIBLE_DUPLICATE" : "INVALID_FORM", message: error.userMessage, fieldErrors: error.fieldErrors };
    // Two copies of the same form racing: the unique key let one through.
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY" && input.submissionKey) {
      const earlier = await findBySubmissionKey(actor.id, input.submissionKey);
      if (earlier) return { ok: true, value: { requestId: earlier.id, requestNo: earlier.requestNo, status: earlier.status, repeated: true } };
    }
    return engineFailure(error);
  }
  await announce(changed);
  return { ok: true, value: { requestId: changed.request.id, requestNo: changed.request.requestNo, status: changed.request.status } };
}

type StepContext = { version: WorkflowVersionRecord; snapshot: DirectorySnapshot };
type Step = (request: RequestRecord, definition: WorkflowDefinition, directory: ReturnType<typeof toDirectory>, extra: StepContext) => EngineResult & { formData?: Record<string, unknown> };

// One locked read-modify-write for every action on an existing request.
async function mutate(requestId: number, actor: Actor, step: Step): Promise<Result<{ status: string }>> {
  let changed: Changed;
  try {
    changed = await withTransaction(async (connection) => {
      const request = await lockRequest(requestId, connection);
      if (!request) throw new ServiceError("NOT_FOUND", "Request not found.");
      const version = await findWorkflowVersion(request.workflowVersionId, connection);
      if (!version) throw new Error(`workflow version ${request.workflowVersionId} missing`);
      const snapshot = await loadDirectorySnapshot(connection);
      const result = step(request, version.definition, toDirectory(snapshot), { version, snapshot });
      if (!(await saveRequestState(request.id, request.stateVersion, result.state, result.formData ?? null, connection))) {
        throw new ServiceError("CONFLICT", "Someone else just changed this request. Reload and try again.");
      }
      await syncTasks(request.id, result.state, version.definition.nodes, connection, await loadWorkingCalendar(connection));
      await appendEvents(request.id, result.events, actor.id, connection);
      const change = {
        request: { ...request, state: result.state, status: result.state.status, round: result.state.round, stateVersion: request.stateVersion + 1 },
        events: result.events,
        requesterName: await requesterName(request.requesterId, connection),
      };
      return { ...change, outboxIds: await queueMessages(change, connection) };
    });
  } catch (error) {
    if (error instanceof FormError) return { ok: false, code: error.fieldErrors.allowDuplicate ? "POSSIBLE_DUPLICATE" : "INVALID_FORM", message: error.userMessage, fieldErrors: error.fieldErrors };
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

// Only the requester resubmits, on the same request number (G-04). New
// field values, if given, are checked against the request's form version.
export async function resubmitRequest(input: { requestId: number; fields?: Record<string, string | undefined>; policy?: RestartPolicy }, actor: Actor) {
  const lookups = input.fields ? await loadFieldLookups() : undefined;
  return mutate(input.requestId, actor, (request, definition, directory, { version, snapshot }) => {
    if (request.requesterId !== actor.id) throw new EngineError("NOT_AUTHORISED", "Only the person who raised the request can resubmit it.");
    let formData = request.formData as EngineFormData;
    if (input.fields) {
      const parsed = parseFormSubmission(version.form, input.fields, activeIds(snapshot), lookups);
      if (!parsed.ok) throw new FormError(parsed.errors);
      const doaErrors = { ...checkDoaAmount(version.builder, parsed.data), ...approverFieldErrors(version.definition, parsed.data, snapshot, request.formData as EngineFormData) };
      if (Object.keys(doaErrors).length) throw new FormError(doaErrors);
      formData = parsed.data;
    }
    const result = resubmit(definition, request.state, input.policy ?? "REQUESTING_STEP", { requesterId: request.requesterId, formData, now: now() }, directory);
    return { ...result, formData: input.fields ? formData : undefined };
  });
}

// ---- custom approvals (F-33, D-060) -------------------------------------------------
// Any user, any people, any mix of levels; submitted in one go as a CUSTOM
// workflow they own. A step made only of the requester is refused (no
// self-approval); everything else goes through the same validator.
export const CUSTOM_FORM: FormField[] = [
  { key: "details", label: "Details", type: "LONG_TEXT", required: true },
  { key: "amount", label: "Amount (₹)", type: "NUMBER", required: false, min: 0 },
];

export function checkCustomSpec(spec: BuilderSpec, requesterId: number): string[] {
  const problems: string[] = [];
  // A DoA matrix belongs to an approval type the IT team owns (D-075).
  if (spec.stages.some((stage) => stage.kind === "DOA")) problems.push("Custom approvals don't use a DoA matrix; pick the levels directly.");
  for (const step of allSteps(spec)) {
    if (step.approvers.kind === "PEOPLE" && step.approvers.userIds.every((id) => id === requesterId)) {
      problems.push(`"${step.label}": you can't approve your own request. Pick someone else.`);
    }
  }
  return problems;
}

export async function submitCustomRequest(
  input: { title: string; builder: BuilderSpec; fields: Record<string, string | undefined>; submissionKey?: string | null; allowDuplicate?: boolean },
  actor: Actor,
): Promise<Result<{ requestId: number; requestNo: string; status: string; repeated?: boolean }>> {
  if (input.submissionKey) {
    const earlier = await findBySubmissionKey(actor.id, input.submissionKey);
    if (earlier) return { ok: true, value: { requestId: earlier.id, requestNo: earlier.requestNo, status: earlier.status, repeated: true } };
  }
  const title = input.title.trim();
  if (!input.allowDuplicate && title.length >= 3) {
    const duplicate = await findRecentDuplicate({ requesterId: actor.id, title, workflowId: null });
    if (duplicate) {
      const message = `You raised “${title}” as ${duplicate} a few minutes ago. If this is a separate request, tick “This is a separate request” and submit again.`;
      return { ok: false, code: "POSSIBLE_DUPLICATE", message, fieldErrors: { allowDuplicate: message } };
    }
  }
  const own = checkCustomSpec(input.builder, actor.id);
  if (own.length) return { ok: false, code: "SELF_APPROVAL", message: own.join(" ") };
  const resolved = await resolveContent({ builder: input.builder, form: CUSTOM_FORM });
  if (!resolved.ok) return resolved;
  if (!resolved.value.validation.valid) {
    return { ok: false, code: "INVALID_WORKFLOW", message: resolved.value.validation.errors.map((issue) => issue.message).join(" "), validation: resolved.value.validation };
  }
  const created = await createWorkflow(
    {
      code: `CUSTOM_${actor.id}_${Date.now().toString(36).toUpperCase()}`,
      name: input.title.trim().slice(0, 150) || "Custom approval",
      kind: "CUSTOM",
      requestPrefix: "CUS",
      builder: input.builder,
      form: CUSTOM_FORM,
    },
    actor,
  );
  if (!created.ok) return created;
  const published = await publishVersion(created.value.versionId, actor);
  if (!published.ok) return published;
  return submitRequest({ workflowId: created.value.workflowId, title: input.title, fields: input.fields, submissionKey: input.submissionKey, allowDuplicate: true, isCustom: true }, actor);
}

// ---- handover (F-16, D-064) --------------------------------------------------------------
export interface HandoverReport {
  moved: number;
  skipped: { requestNo: string; reason: string }[];
}

// Moves every pending task of `fromUserId` to `toUserId`, one request at a
// time through the normal locked path (timeline, audit, notifications).
export async function handOverPendingTasks(fromUserId: number, toUserId: number, actor: Actor): Promise<Result<HandoverReport>> {
  if (!isAdmin(actor)) return { ok: false, code: "FORBIDDEN", message: "Only IT can hand over approvals." };
  if (fromUserId === toUserId) return { ok: false, code: "SAME_PERSON", message: "Choose someone else." };
  // D-085: whoever takes the approvals over must be an approver.
  const notApprover = ineligibleChoices([toUserId], [], await approverStatuses([toUserId]));
  if (notApprover.length) return { ok: false, code: "NOT_APPROVER", message: notApprover[0]! };
  const [rows] = await getDbPool().query<(RowDataPacket & { request_id: number; request_no: string; task_key: string })[]>(
    `SELECT t.request_id, r.request_no, t.task_key FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.approver_id = ? AND t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL ORDER BY t.id`,
    [fromUserId],
  );
  const report: HandoverReport = { moved: 0, skipped: [] };
  for (const row of rows) {
    const result = await mutate(row.request_id, actor, (request, _definition, directory) =>
      reassignTask(request.state, { taskId: row.task_key, toUserId, actorId: actor.id }, context(request), directory),
    );
    if (result.ok) report.moved += 1;
    else report.skipped.push({ requestNo: row.request_no, reason: result.message });
  }
  await recordAudit({ actorUserId: actor.id, action: "APPROVALS_HANDED_OVER", entityType: "USER", entityId: fromUserId, metadata: { toUserId, moved: report.moved, skipped: report.skipped.length } });
  return { ok: true, value: report };
}

export async function countPendingTasks(userId: number): Promise<number> {
  const [rows] = await getDbPool().query<(RowDataPacket & { total: number })[]>(
    `SELECT COUNT(*) AS total FROM approval_tasks t JOIN approval_requests r ON r.id = t.request_id
     WHERE t.approver_id = ? AND t.status = 'PENDING' AND r.status IN ('IN_PROGRESS', 'ON_HOLD') AND r.deleted_at IS NULL`,
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

// ---- withdraw and reopen (F-17, F-29, D-066) ---------------------------------------
export function withdrawRequest(input: { requestId: number; reason?: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request) => {
    if (request.requesterId !== actor.id) throw new ServiceError("NOT_AUTHORISED", "Only the person who raised the request can withdraw it.");
    return withdraw(request.state, { actorId: actor.id, reason: input.reason });
  });
}

export function reopenRequest(input: { requestId: number; reason: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory) => {
    if (!actor.roles.includes("SUPER_ADMIN")) throw new ServiceError("NOT_AUTHORISED", "Only the Super Admin can reopen an approved request.");
    return reopen(definition, request.state, { actorId: actor.id, reason: input.reason }, context(request), directory);
  });
}
