import "server-only";
import { routeChanged } from "@/server/engine/conditions";
import { departmentOfUser, mayRaise } from "@/server/approvals/raisers";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { withTransaction } from "@/lib/db/transaction";
import { getDbPool } from "@/lib/db/client";
import {
  appendEvents,
  countOpenRequests,
  deleteUnusedWorkflow,
  extendDueTimes,
  findPublishedVersion,
  findRequest,
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
  restartTaskClock,
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
import { compareRoutes } from "@/server/approvals/route-compare";
import { approverFieldKeys, ineligibleChoices, namedApprovers } from "@/server/approvals/approver-rules";
import { approverStatuses } from "@/lib/db/repositories/approvers.repository";
import { loadFieldLookups } from "@/lib/db/repositories/lookups.repository";
import { listUserIdsWithRole } from "@/lib/db/repositories/users.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { notify } from "@/server/notifications/notify";
import { messagesForEvents } from "@/server/approvals/messages";
import { answerInformation, askForInformation, decide, putOnHold, reassignTask, recall, reopen, resolveBlocked, resubmit, resume, simulate, startInstance, validateWorkflow, withdraw, EngineError } from "@/server/engine";
import type { BlockAction, Decision, EngineEvent, EngineResult, FormData as EngineFormData, RestartPolicy, ValidationResult, WorkflowDefinition, WorkflowNode } from "@/server/engine";
import { insertRevision } from "@/lib/db/repositories/revisions.repository";
import { insertSubmissionCheck, updateCommittedAmount } from "@/lib/db/repositories/checks.repository";
import { assessReadiness, type Readiness } from "@/server/approvals/readiness";
import type { InstanceStatus } from "@/server/engine/types";
import { claimOutbox, dropOutboxForDeletedRequests, insertOutbox, listStaleOutbox, markOutboxSent } from "@/lib/db/repositories/outbox.repository";
import type { NotifyInput } from "@/server/notifications/notify";
import { logError } from "@/lib/logging/logger";
import { DEFAULT_CUSTOM_FORM, loadCustomConfig } from "@/server/approvals/custom-config";
import { applyStepPolicy, unavailableFeatures } from "@/server/workflows/step-policy";
import type { RoleCode } from "@/types/auth";
import { appBaseUrl } from "@/lib/http/app-url";

// The multi-level approval service (north star, S2-06, F-11 to F-13). The
// engine decides; this layer loads, locks, saves and tells people.
export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string; validation?: ValidationResult; fieldErrors?: Record<string, string>; readiness?: Readiness };

export interface Actor {
  id: number;
  roles: readonly RoleCode[];
}

// A submitted form didn't pass its checks (field → message).
class FormError extends Error {
  constructor(
    readonly fieldErrors: Record<string, string>,
    readonly userMessage = "Check the highlighted fields.",
    readonly readiness?: Readiness,
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
  const [designations] = await db.query<(RowDataPacket & { id: number })[]>("SELECT id FROM designations WHERE active = TRUE");
  return {
    knownUserIds: users.map((row) => row.id),
    knownRoleCodes: roles.map((row) => row.code),
    knownDepartmentIds: departments.map((row) => row.id),
    knownGroupIds: groups.map((row) => row.id),
    knownDesignationIds: designations.map((row) => row.id),
  };
}

async function nonApproverDesignations(definition: WorkflowDefinition): Promise<string[]> {
  const uses = definition.nodes.flatMap((node) =>
    node.kind === "APPROVAL" && node.mode !== "WORK"
      ? node.approvers.filter((source) => source.type === "DESIGNATION").map((source) => ({ label: node.label, id: (source as { designationId: number }).designationId }))
      : [],
  );
  if (uses.length === 0) return [];
  const [rows] = await getDbPool().query<(RowDataPacket & { id: number; name: string })[]>("SELECT id, name FROM designations WHERE id IN (?) AND is_approver = FALSE", [
    [...new Set(uses.map((use) => use.id))],
  ]);
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return uses.filter((use) => names.has(use.id)).map((use) => `"${use.label}": ${names.get(use.id)} isn't ticked as an approver designation.`);
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
  // D-085/D-097: an approval step by designation needs an approver designation.
  const wrongDesignations = await nonApproverDesignations(definition);
  if (wrongDesignations.length) return { ok: false, code: "NOT_APPROVER", message: wrongDesignations.join(" ") };
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
  const published = await withTransaction(async (connection) => {
    if (!(await publishWorkflowVersion(version.id, workflow.id, actor.id, connection))) return false;
    await recordAudit({ actorUserId: actor.id, action: "WORKFLOW_PUBLISHED", entityType: "WORKFLOW", entityId: workflow.id, metadata: { versionNo: version.versionNo } }, connection);
    return true;
  });
  if (!published) return { ok: false, code: "NOT_DRAFT", message: "Someone else just published or replaced this version. Reload the page." };
  return { ok: true, value: { versionNo: version.versionNo } };
}

// Test mode (P3-05, F-50): the stages and the names that would approve,
// for sample form values and a sample requester. Nothing is saved.
export interface SimulationView {
  outcome: "APPROVED" | "BLOCKED";
  stages: { label: string; rule: string; people: string[] }[][];
  skipped: string[];
  // #11: why each step was skipped and which way each choice went.
  skippedReasons: string[];
  branches: string[];
  blocked: string[];
  formErrors: Record<string, string>;
  // #11: the same sample through the live version, and who a publish affects.
  comparison: { liveVersionNo: number; same: boolean; notes: string[] } | null;
  impact: { versionNo: number; isLive: boolean; openRequests: number } | null;
}

type RouteView = Omit<SimulationView, "formErrors" | "comparison" | "impact">;

async function simulateDefinition(definition: WorkflowDefinition, requesterId: number, formData: EngineFormData, directory: ReturnType<typeof toDirectory>): Promise<RouteView> {
  const result = simulate(definition, { requesterId, formData, now: now() }, directory);
  const names = await userNames([...new Set(result.stages.flat().flatMap((step) => step.approverIds))]);
  const nodes = new Map(definition.nodes.map((node) => [node.id, node.label]));
  const edges = new Map(definition.edges.map((edge) => [edge.id, edge]));
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
    skippedReasons: result.skipped.map((step) => `${step.label}: ${step.reason}`),
    branches: result.branches.map((branch) => {
      const target = edges.get(branch.edgeId)?.to;
      return `${nodes.get(branch.nodeId) ?? branch.nodeId}: went to ${(target && nodes.get(target)) ?? "the next step"}${branch.isDefault ? " (no rule matched, so the default path)" : ""}`;
    }),
    blocked: result.blocked.map((step) => `${step.label}: ${step.reason}`),
  };
}

export async function simulateVersion(versionId: number, input: { requesterId: number; fields: Record<string, string | undefined> }): Promise<SimulationView | null> {
  const version = await findWorkflowVersion(versionId);
  if (!version) return null;
  const snapshot = await loadDirectorySnapshot();
  const active = new Set(snapshot.users.filter((user) => user.active && !user.isBreakGlass).map((user) => user.id));
  const lookups = await loadFieldLookups();
  const parsed = parseFormSubmission(version.form, input.fields, active, lookups);
  // Test mode still runs with the values that are fine, so the IT team sees the effect of each field.
  const directory = toDirectory(snapshot);
  const route = await simulateDefinition(version.definition, input.requesterId, parsed.data, directory);
  const live = await findPublishedVersion(version.workflowId);
  let comparison: SimulationView["comparison"] = null;
  if (live && live.id !== version.id) {
    const liveRoute = await simulateDefinition(live.definition, input.requesterId, parseFormSubmission(live.form, input.fields, active, lookups).data, directory);
    comparison = { liveVersionNo: live.versionNo, ...compareRoutes(route, liveRoute) };
  }
  const impact = { versionNo: version.versionNo, isLive: live?.id === version.id, openRequests: await countOpenRequests(version.workflowId) };
  return { ...route, formErrors: parsed.ok ? {} : parsed.errors, comparison, impact };
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
  change: { request: RequestRecord; events: EngineEvent[]; requesterName: string; nodes?: readonly WorkflowNode[] },
  db: Pick<PoolConnection, "query">,
): Promise<NotifyInput[]> {
  const blocked = change.events.some((event) => event.type === "NODE_BLOCKED");
  const adminIds = blocked ? await listUserIdsWithRole("IT_ADMIN", db) : [];
  const nodes: readonly WorkflowNode[] = change.nodes ?? (await findWorkflowVersion(change.request.workflowVersionId, db))?.definition.nodes ?? [];
  const labelOf = (nodeId: string) => nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
  const isWorkStep = (nodeId: string) => nodes.some((node) => node.id === nodeId && node.kind === "APPROVAL" && node.mode === "WORK");
  const [followers] = await db.query<(RowDataPacket & { user_id: number })[]>(
    "SELECT c.user_id FROM request_collaborators c JOIN users u ON u.id = c.user_id WHERE c.request_id = ? AND c.removed_at IS NULL AND u.active = TRUE",
    [change.request.id],
  );
  return messagesForEvents(
    change.events,
    { id: change.request.id, requestNo: change.request.requestNo, title: change.request.title, requesterId: change.request.requesterId, requesterName: change.requesterName },
    { baseUrl: appBaseUrl(), adminIds, labelOf, isWorkStep, collaboratorIds: followers.map((row) => row.user_id) },
  );
}

export async function queueMessages(change: { request: RequestRecord; events: EngineEvent[]; requesterName: string; nodes?: readonly WorkflowNode[] }, db: Pick<PoolConnection, "query">): Promise<number[]> {
  return insertOutbox(change.request.id, await prepareMessages(change, db), db);
}

// Send outbox rows; each is claimed first so it is sent by one sender only.
export async function deliverOutbox(ids: readonly number[]): Promise<number> {
  let sent = 0;
  for (const id of ids) {
    try {
      const message = await claimOutbox(id);
      if (!message) continue;
      const summary = await notify(message);
      // Audit AUD-08 (v1.9.0): nothing recorded (e.g. the database was busy)
      // = not sent; the row is tried again after its claim runs out.
      if (!summary.recorded && !summary.inactive) {
        logError("approvals: outbox message not recorded; will retry", null, { outboxId: id });
        continue;
      }
      await markOutboxSent(id);
      sent += 1;
    } catch (error) {
      logError("approvals: outbox delivery failed", error, { outboxId: id });
    }
  }
  return sent;
}

// Job runner: whatever the in-process sender didn't finish.
export async function runOutbox(): Promise<{ outboxSent: number; outboxDropped: number }> {
  const outboxDropped = await dropOutboxForDeletedRequests();
  return { outboxSent: await deliverOutbox(await listStaleOutbox(200)), outboxDropped };
}

async function announce(changed: Changed): Promise<void> {
  await deliverOutbox(changed.outboxIds);
}

// FN5 amendment of an approved request (see server/approvals/amendments.ts).
export interface AmendmentInput {
  originalId: number;
  reason: string;
  basePaise: number | null;
  effective: EngineFormData; // the values being amended (typed)
}
export interface AmendmentChange {
  key: string;
  from: unknown;
  to: unknown;
}

const OPEN_STATUSES = ["IN_PROGRESS", "ON_HOLD", "CHANGES_REQUIRED"];

async function checkAmendment(amendment: AmendmentInput, data: EngineFormData, form: readonly FormField[], connection: Pick<PoolConnection, "query">): Promise<AmendmentChange[]> {
  const [original] = await connection.query<(RowDataPacket & { status: string; deleted_at: Date | null })[]>("SELECT status, deleted_at FROM approval_requests WHERE id = ? FOR UPDATE", [amendment.originalId]);
  if (!original[0] || original[0].deleted_at || original[0].status !== "APPROVED") throw new FormError({ amendment: "Only an approved request can be amended." }, "Only an approved request can be amended.");
  const [open] = await connection.query<(RowDataPacket & { request_no: string })[]>(
    `SELECT r.request_no FROM request_amendments a JOIN approval_requests r ON r.id = a.amendment_id
     WHERE a.original_id = ? AND r.deleted_at IS NULL AND r.status IN (?) LIMIT 1 FOR UPDATE`,
    [amendment.originalId, OPEN_STATUSES],
  );
  if (open[0]) throw new FormError({ amendment: `Amendment ${open[0].request_no} is still in progress. Wait for its decision, or withdraw it.` }, "An amendment is already in progress.");
  const changes: AmendmentChange[] = [];
  for (const field of form) {
    if (field.type === "SECTION") continue;
    const keys = field.type === "LINE_ITEMS" ? [field.key, `${field.key}__lines`] : [field.key];
    if (keys.some((key) => JSON.stringify(data[key] ?? null) !== JSON.stringify(amendment.effective[key] ?? null))) changes.push({ key: field.key, from: amendment.effective[field.key] ?? null, to: data[field.key] ?? null });
  }
  if (!changes.length) throw new FormError({ amendment: "Nothing has changed. Change at least one value." }, "Nothing has changed.");
  return changes;
}

class AlreadySubmitted extends Error {
  constructor(
    readonly requestId: number,
    readonly requestNo: string,
    readonly status: InstanceStatus,
  ) {
    super("already submitted");
  }
}

export async function submitRequest(
  // FN1: attachmentCount (files with the submit), acknowledged (warnings
  // confirmed; allowDuplicate is the older name), overrideReason (why a
  // possible duplicate isn't one).
  input: { workflowId: number; title: string; fields: Record<string, string | undefined>; submissionKey?: string | null; allowDuplicate?: boolean; acknowledged?: boolean; overrideReason?: string; attachmentCount?: number; isCustom?: boolean; amendment?: AmendmentInput },
  actor: Actor,
): Promise<Result<{ requestId: number; requestNo: string; status: string; repeated?: boolean }>> {
  // D-QA-01: the same form sent again (retry after a timeout) → the request it already made.
  if (input.submissionKey) {
    const earlier = await findBySubmissionKey(actor.id, input.submissionKey);
    if (earlier) return { ok: true, value: { requestId: earlier.id, requestNo: earlier.requestNo, status: earlier.status, repeated: true } };
  }
  const workflow = await findWorkflow(input.workflowId);
  if (!workflow || !workflow.active) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  // v1.9.0 (D-147): types limited to some departments or people (amendments
  // and custom approvals are the requester's own, so they aren't limited).
  if (workflow.kind === "PREDEFINED" && !input.amendment && !mayRaise(workflow.settings, { id: actor.id, roles: actor.roles, departmentId: await departmentOfUser(actor.id) })) {
    return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available to you." };
  }
  if (workflow.kind === "CUSTOM" && workflow.ownerUserId !== actor.id) return { ok: false, code: "NOT_FOUND", message: "This approval type isn't available." };
  const version = await findPublishedVersion(workflow.id);
  if (!version) return { ok: false, code: "NOT_PUBLISHED", message: "This approval type has no published version yet." };
  const title = input.title.trim();

  let changed: Changed;
  try {
    changed = await withTransaction(async (connection) => {
      // FN1: the readiness service is the authority, inside this transaction
      // (it locks the type and the budget row, so two submits can't both
      // pass a duplicate or budget check).
      const assessed = await assessReadiness(
        { workflow, version, title: input.title, fields: input.fields, attachmentCount: input.attachmentCount ?? 0, requester: actor, isCustom: input.isCustom, amendment: input.amendment ? { originalId: input.amendment.originalId, basePaise: input.amendment.basePaise } : undefined },
        { db: connection, lock: true, approverFieldErrors: (definition, data, snap) => approverFieldErrors(definition, data, snap) },
      );
      // A copy of this submit (same key) that got the type lock first wins;
      // read it with a locking read, past this transaction's snapshot.
      if (input.submissionKey) {
        const [copies] = await connection.query<(RowDataPacket & { id: number; request_no: string; status: InstanceStatus })[]>(
          "SELECT id, request_no, status FROM approval_requests WHERE requester_id = ? AND submission_key = ? LIMIT 1 FOR SHARE",
          [actor.id, input.submissionKey],
        );
        if (copies[0]) throw new AlreadySubmitted(copies[0].id, copies[0].request_no, copies[0].status);
      }
      const readiness = assessed.readiness;
      const blocking = readiness.items.filter((item) => item.severity === "BLOCKING");
      if (blocking.length) {
        const fieldErrors: Record<string, string> = {};
        for (const item of blocking) fieldErrors[item.field ?? "readiness"] ??= item.message;
        throw new FormError(fieldErrors, blocking.some((item) => item.field) ? "Check the highlighted fields." : blocking[0]!.message, readiness);
      }
      const confirmed = Boolean(input.acknowledged || input.allowDuplicate);
      if (readiness.needsConfirmation && !confirmed) {
        const warnings = readiness.items.filter((item) => item.severity === "WARNING");
        const onlyRecent = warnings.every((item) => item.code === "RECENT_DUPLICATE");
        const message = onlyRecent ? warnings[0]!.message.replace("confirm and submit again", "tick “This is a separate request” and submit again") : "Please review the warnings below, confirm, and submit again.";
        throw new FormError({ allowDuplicate: message }, message, readiness);
      }
      const reason = (input.overrideReason ?? "").trim();
      if (readiness.needsReason && reason.length < 5) {
        throw new FormError({ overrideReason: "Say why this isn't a duplicate (at least 5 characters)." }, "Say why this isn't a duplicate.", readiness);
      }
      // FN5: one amendment at a time, of a request that is still approved,
      // and it must change something.
      const changes = input.amendment ? await checkAmendment(input.amendment, assessed.data, version.form, connection) : null;
      const snapshot = await loadDirectorySnapshot(connection);
      const parsed = { data: assessed.data };
      const formData = parsed.data;
      const result = startInstance(version.definition, { requesterId: actor.id, formData, now: now() }, toDirectory(snapshot));
      const requestNo = await nextRequestNumber(workflow.requestPrefix, connection);
      const id = await insertRequest({ requestNo, workflowVersionId: version.id, requesterId: actor.id, title, formData, state: result.state, submissionKey: input.submissionKey ?? null }, connection);
      await syncTasks(id, result.state, version.definition.nodes, connection, await loadWorkingCalendar(connection));
      await appendEvents(id, [{ type: "SUBMITTED", requestNo }, ...result.events], actor.id, connection);
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_SUBMITTED", entityType: "REQUEST", entityId: id, metadata: { requestNo, workflowVersionId: version.id } }, connection); // SEC-12 (v1.10.0)
      await insertRevision(id, result.state.round, title, formData, actor.id, connection);
      await insertSubmissionCheck(id, readiness, { acknowledged: confirmed, overrideReason: reason || null }, connection);
      if (readiness.needsReason) await recordAudit({ actorUserId: actor.id, action: "DUPLICATE_WARNING_OVERRIDDEN", entityType: "REQUEST", entityId: id, metadata: { reason } }, connection);
      if (input.amendment && changes) {
        await connection.query("INSERT INTO request_amendments (original_id, amendment_id, reason, changes_json, base_paise, created_by) VALUES (?, ?, ?, ?, ?, ?)", [
          input.amendment.originalId,
          id,
          input.amendment.reason,
          JSON.stringify(changes),
          input.amendment.basePaise,
          actor.id,
        ]);
        await recordAudit({ actorUserId: actor.id, action: "AMENDMENT_SUBMITTED", entityType: "REQUEST", entityId: input.amendment.originalId, metadata: { amendmentId: id, requestNo, fields: changes.map((change) => change.key) } }, connection);
      }
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
    if (error instanceof FormError) return { ok: false, code: error.fieldErrors.allowDuplicate ? "POSSIBLE_DUPLICATE" : "INVALID_FORM", message: error.userMessage, fieldErrors: error.fieldErrors, readiness: error.readiness };
    // Two copies of the same form racing: the unique key let one through.
    if (error instanceof AlreadySubmitted) return { ok: true, value: { requestId: error.requestId, requestNo: error.requestNo, status: error.status, repeated: true } };
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
      const calendar = await loadWorkingCalendar(connection);
      await syncTasks(request.id, result.state, version.definition.nodes, connection, calendar);
      await appendEvents(request.id, result.events, actor.id, connection);
      // RD-03: a new round keeps what was submitted in it (and, for a
      // request from before v1.6.0, what the previous round had).
      if (result.state.round > request.round) {
        await insertRevision(request.id, request.round, request.title, request.formData, request.requesterId, connection);
        await insertRevision(request.id, result.state.round, request.title, result.formData ?? request.formData, actor.id, connection);
      }
      await afterChange(request.id, result.events, version.definition.nodes, actor, connection, calendar);
      const change = {
        request: { ...request, state: result.state, status: result.state.status, round: result.state.round, stateVersion: request.stateVersion + 1 },
        events: result.events,
        requesterName: await requesterName(request.requesterId, connection),
        nodes: version.definition.nodes,
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

const LIFECYCLE_AUDIT = { PUT_ON_HOLD: "REQUEST_PUT_ON_HOLD", WITHDRAWN: "REQUEST_WITHDRAWN", REOPENED: "REQUEST_REOPENED", RESUBMITTED: "REQUEST_RESUBMITTED" } as const;

// Bookkeeping every change shares:
// - decisions also go to the audit log (audit gap: they were timeline-only);
// - a handover restarts the response clock for the new person (R-07);
// - time on hold doesn't count against the response time.
async function afterChange(
  requestId: number,
  events: readonly EngineEvent[],
  nodes: readonly WorkflowNode[],
  actor: Actor,
  db: Pick<PoolConnection, "query">,
  calendar: Awaited<ReturnType<typeof loadWorkingCalendar>>,
): Promise<void> {
  for (const event of events) {
    if (event.type === "TASK_DECIDED") {
      await recordAudit(
        { actorUserId: actor.id, action: "REQUEST_DECIDED", entityType: "REQUEST", entityId: requestId, onBehalfOfUserId: event.onBehalfOf ?? null, metadata: { decision: event.decision, step: event.nodeId, task: event.taskId } },
        db,
      );
    } else if (event.type === "BLOCK_RESOLVED") {
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_UNBLOCKED", entityType: "REQUEST", entityId: requestId, metadata: { step: event.nodeId, how: event.action, userIds: event.userIds ?? [], reason: event.reason } }, db);
    } else if (event.type === "RESUMED") {
      if (event.heldSince) await extendDueTimes(requestId, (Date.now() - new Date(event.heldSince).getTime()) / 1000, db);
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_RESUMED", entityType: "REQUEST", entityId: requestId }, db);
    } else if (event.type === "PUT_ON_HOLD" || event.type === "WITHDRAWN" || event.type === "REOPENED" || event.type === "RESUBMITTED") {
      // SEC-12 (v1.10.0, audit AUD-12): the lifecycle changes are in the
      // central audit log too, not only on the request's timeline.
      await recordAudit({ actorUserId: actor.id, action: LIFECYCLE_AUDIT[event.type], entityType: "REQUEST", entityId: requestId }, db);
    } else if (event.type === "INFO_ANSWERED") {
      // EN-05: waiting for the answer doesn't count against the response time.
      await extendDueTimes(requestId, (Date.now() - new Date(event.heldSince).getTime()) / 1000, db);
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_INFO_ANSWERED", entityType: "REQUEST", entityId: requestId, metadata: { askedBy: event.askedBy } }, db);
    } else if (event.type === "INFO_REQUESTED") {
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_INFO_REQUESTED", entityType: "REQUEST", entityId: requestId, metadata: { step: event.nodeId } }, db);
    } else if (event.type === "RECALLED") {
      await recordAudit({ actorUserId: actor.id, action: "REQUEST_RECALLED", entityType: "REQUEST", entityId: requestId, metadata: { reason: event.reason, closedTasks: event.closedTaskIds } }, db);
    } else if (event.type === "TASK_REASSIGNED") {
      await recordAudit(
        { actorUserId: actor.id, action: event.byApprover ? "TASK_DELEGATED" : "TASK_HANDED_OVER", entityType: "REQUEST", entityId: requestId, metadata: { task: event.taskId, from: event.fromId, to: event.toId, reason: event.reason ?? null } },
        db,
      );
    }
  }
  const reassigned = events.filter((event) => event.type === "TASK_REASSIGNED").map((event) => (event as { taskId: string }).taskId);
  await restartTaskClock(requestId, reassigned, nodes, db, calendar);
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
  // D-101: where to restart is set per approval type (default: the step that asked).
  const typePolicy = async (versionWorkflowId: number) => (await findWorkflow(versionWorkflowId))?.resubmitPolicy ?? "REQUESTING_STEP";
  const policy = input.policy ?? (await policyForRequest(input.requestId, typePolicy));
  const result = await mutate(input.requestId, actor, (request, definition, directory, { version, snapshot }) => {
    if (request.requesterId !== actor.id) throw new EngineError("NOT_AUTHORISED", "Only the person who raised the request can resubmit it.");
    let formData = request.formData as EngineFormData;
    if (input.fields) {
      const parsed = parseFormSubmission(version.form, input.fields, activeIds(snapshot), lookups);
      if (!parsed.ok) throw new FormError(parsed.errors);
      const doaErrors = { ...checkDoaAmount(version.builder, parsed.data), ...approverFieldErrors(version.definition, parsed.data, snapshot, request.formData as EngineFormData) };
      if (Object.keys(doaErrors).length) throw new FormError(doaErrors);
      formData = parsed.data;
    }
    // v1.9.0 (audit AUD-02, D-147): new values that change the route restart
    // it from the beginning, so a level they now need can't stay skipped.
    const effectivePolicy = input.fields && routeChanged(definition, request.formData as EngineFormData, formData) ? "BEGINNING" : policy;
    const result = resubmit(definition, request.state, effectivePolicy, { requesterId: request.requesterId, formData, now: now() }, directory);
    return { ...result, formData: input.fields ? formData : undefined };
  });
  // EN-09: a new amount moves the budget commitment with it.
  if (result.ok && input.fields) await syncBudgetAmount(input.requestId).catch((error) => logError("resubmit: budget amount not updated", error, { requestId: input.requestId }));
  return result;
}

async function syncBudgetAmount(requestId: number): Promise<void> {
  const request = await findRequest(requestId);
  const version = request ? await findWorkflowVersion(request.workflowVersionId) : null;
  const workflow = version ? await findWorkflow(version.workflowId) : null;
  if (!request || !workflow?.settings?.budget.enabled) return;
  const amount = request.formData[workflow.settings.budget.amountField];
  // FN5: an amendment counts only its change against the amount it amended.
  const [base] = await getDbPool().query<(RowDataPacket & { base_paise: number | null })[]>("SELECT base_paise FROM request_amendments WHERE amendment_id = ?", [requestId]);
  const basePaise = base[0]?.base_paise === null || base[0]?.base_paise === undefined ? 0 : Number(base[0].base_paise);
  await updateCommittedAmount(requestId, typeof amount === "number" ? Math.round(amount * 100) - basePaise : null);
}

async function policyForRequest(requestId: number, typePolicy: (workflowId: number) => Promise<RestartPolicy>): Promise<RestartPolicy> {
  const [rows] = await getDbPool().query<(RowDataPacket & { workflow_id: number })[]>(
    "SELECT v.workflow_id FROM approval_requests r JOIN workflow_versions v ON v.id = r.workflow_version_id WHERE r.id = ?",
    [requestId],
  );
  return rows[0] ? typePolicy(rows[0].workflow_id) : "REQUESTING_STEP";
}

// ---- v1.6.0: recall, questions, passing an approval on (EN-04, EN-05, EN-07) -----------
// Recall: only the requester, while it is still waiting (BD-1).
export function recallRequest(input: { requestId: number; reason: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory) => {
    if (request.requesterId !== actor.id) throw new EngineError("NOT_AUTHORISED", "Only the person who raised the request can recall it.");
    return recall(definition, request.state, { actorId: actor.id, reason: input.reason }, context(request), directory);
  });
}

// An approver asks the requester a question (BD-2).
export function askForInfo(input: { requestId: number; taskKey: string; question: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, _definition, directory) => askForInformation(request.state, { taskId: input.taskKey, actorId: actor.id, question: input.question }, context(request), directory));
}

export function answerInfo(input: { requestId: number; answer: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request) => answerInformation(request.state, { actorId: actor.id, answer: input.answer }, context(request)));
}

// EN-07 (BD-10): the approver (or their delegate) passes their own pending
// approval to a colleague. Approval steps need an approver-eligible person
// (D-085); work steps any active person. Never the requester, never someone
// already on the step, never back to someone who held it this round, and at
// most 3 hand-ons per approval. Immediate; both are told; audited.
export const MAX_HAND_ONS = 3;
export function delegateTask(input: { requestId: number; taskKey: string; toUserId: number; reason: string }, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory, { snapshot }) => {
    const task = request.state.tasks.find((candidate) => candidate.id === input.taskKey);
    if (!task || task.status !== "PENDING") throw new EngineError("INVALID_REASSIGN", "This approval is no longer waiting.");
    if (task.approverId !== actor.id && !directory.canActFor(actor.id, task.approverId)) throw new EngineError("NOT_AUTHORISED", "Only the person this approval is waiting for can pass it on.");
    const reason = input.reason.trim();
    if (reason.length < 3) throw new EngineError("COMMENT_REQUIRED", "Say why you're passing it on.");
    if (input.toUserId === actor.id || input.toUserId === task.approverId) throw new EngineError("INVALID_REASSIGN", "Choose someone else.");
    if ((task.previousApprovers ?? []).includes(input.toUserId)) throw new EngineError("INVALID_REASSIGN", "That person already passed this approval on; it can't go back to them.");
    if ((task.previousApprovers ?? []).length >= MAX_HAND_ONS) throw new EngineError("INVALID_REASSIGN", `This approval has been passed on ${MAX_HAND_ONS} times already. Ask IT to hand it over.`);
    const node = definition.nodes.find((candidate) => candidate.id === task.nodeId);
    const work = node?.kind === "APPROVAL" && node.mode === "WORK";
    const target = snapshot.users.find((user) => user.id === input.toUserId);
    if (!target || !target.active || target.isBreakGlass) throw new EngineError("INVALID_REASSIGN", "Choose an active person.");
    if (!work && target.approver === false) throw new EngineError("INVALID_REASSIGN", "Choose someone who can approve (Manager and above).");
    return reassignTask(request.state, { taskId: task.id, toUserId: input.toUserId, actorId: actor.id, reason, byApprover: true }, context(request), directory);
  });
}

// ---- blocked steps (D-098) ---------------------------------------------------------
// IT moves a step on that found nobody to approve (or no path).
export function resolveBlockedStep(input: { requestId: number; nodeId: string; reason: string } & BlockAction, actor: Actor) {
  return mutate(input.requestId, actor, (request, definition, directory) => {
    if (!isAdmin(actor)) throw new ServiceError("NOT_AUTHORISED", "Only IT can move a blocked step on.");
    const { requestId: _requestId, ...rest } = input;
    void _requestId;
    return resolveBlocked(definition, request.state, { ...rest, actorId: actor.id }, context(request), directory);
  });
}

// ---- custom approvals (F-33, D-060) -------------------------------------------------
// Any user, any people, any mix of levels; submitted in one go as a CUSTOM
// workflow they own. A step made only of the requester is refused (no
// self-approval); everything else goes through the same validator.
// v1.8.0: the fields and step options come from Admin → Custom approval
// (server/approvals/custom-config.ts); these are the defaults.
export const CUSTOM_FORM: FormField[] = DEFAULT_CUSTOM_FORM;

export function checkCustomSpec(spec: BuilderSpec, requesterId: number): string[] {
  const problems: string[] = [];
  // A DoA matrix belongs to an approval type the IT team owns (D-075).
  if (spec.stages.some((stage) => stage.kind === "DOA")) problems.push("Custom approvals don't use a DoA matrix; pick the levels directly.");
  for (const step of allSteps(spec)) {
    if ((step.type ?? "APPROVE") !== "APPROVE") continue; // work and FYI may be your own
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
  // v1.8.0: IT's set-up decides the fields and any fixed step options; a
  // fixed option overrides whatever the browser sent.
  const config = await loadCustomConfig();
  const builder = applyStepPolicy(input.builder, config.policy);
  const unavailable = unavailableFeatures(builder, config.policy);
  if (unavailable.length) return { ok: false, code: "INVALID_WORKFLOW", message: unavailable.join(" ") };
  const own = checkCustomSpec(builder, actor.id);
  if (own.length) return { ok: false, code: "SELF_APPROVAL", message: own.join(" ") };
  const resolved = await resolveContent({ builder, form: config.form });
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
      builder,
      form: config.form,
    },
    actor,
  );
  if (!created.ok) return created;
  // R-06: if publishing or submitting fails, the one-off approval type made
  // for it is removed again, so no orphan is left behind.
  const discard = () => withTransaction((connection) => deleteUnusedWorkflow(created.value.workflowId, connection)).catch((error) => logError("custom approval: cleanup failed", error));
  const published = await publishVersion(created.value.versionId, actor);
  if (!published.ok) {
    await discard();
    return published;
  }
  try {
    const submitted = await submitRequest({ workflowId: created.value.workflowId, title: input.title, fields: input.fields, submissionKey: input.submissionKey, allowDuplicate: true, isCustom: true }, actor);
    if (!submitted.ok || submitted.value.repeated) await discard();
    return submitted;
  } catch (error) {
    await discard();
    throw error;
  }
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

// v1.7.0 (A3): IT moves chosen pending tasks (any approvers) to one person,
// each through the normal locked path, with a result for every item. An
// approval step needs an approver-eligible person (D-085); a work step any
// active person; never the requester, never the person who already holds it.
export const BULK_REASSIGN_MAX = 100;
export type ReassignOutcome = { requestId: number; taskKey: string; requestNo: string | null; ok: boolean; message: string };

export async function bulkReassign(items: readonly { requestId: number; taskKey: string }[], toUserId: number, reason: string, actor: Actor): Promise<Result<ReassignOutcome[]>> {
  if (!isAdmin(actor)) return { ok: false, code: "FORBIDDEN", message: "Only IT can reassign approvals." };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, code: "COMMENT_REQUIRED", message: "Say why they're being moved." };
  const unique = [...new Map(items.map((item) => [`${item.requestId}:${item.taskKey}`, item])).values()].slice(0, BULK_REASSIGN_MAX);
  const outcomes: ReassignOutcome[] = [];
  for (const item of unique) {
    const [rows] = await getDbPool().query<(RowDataPacket & { request_no: string })[]>("SELECT request_no FROM approval_requests WHERE id = ? AND deleted_at IS NULL", [item.requestId]);
    const requestNo = rows[0]?.request_no ?? null;
    if (!requestNo) {
      outcomes.push({ ...item, requestNo, ok: false, message: "Not found." });
      continue;
    }
    try {
      const result = await mutate(item.requestId, actor, (request, definition, directory, { snapshot }) => {
        const task = request.state.tasks.find((candidate) => candidate.id === item.taskKey);
        if (!task || task.status !== "PENDING" || task.round !== request.state.round) throw new EngineError("INVALID_REASSIGN", "No longer waiting.");
        if (!["IN_PROGRESS", "ON_HOLD"].includes(request.state.status)) throw new EngineError("INVALID_REASSIGN", "The request isn't open for approval.");
        if (task.approverId === toUserId) throw new EngineError("INVALID_REASSIGN", "Already with that person.");
        if (request.requesterId === toUserId) throw new EngineError("INVALID_REASSIGN", "That person raised the request.");
        const node = definition.nodes.find((candidate) => candidate.id === task.nodeId);
        const work = node?.kind === "APPROVAL" && node.mode === "WORK";
        const target = snapshot.users.find((user) => user.id === toUserId);
        if (!target || !target.active || target.isBreakGlass) throw new EngineError("INVALID_REASSIGN", "Choose an active person.");
        if (!work && target.approver === false) throw new EngineError("INVALID_REASSIGN", "That person can't approve (Manager and above).");
        return reassignTask(request.state, { taskId: task.id, toUserId, actorId: actor.id, reason: why }, context(request), directory);
      });
      outcomes.push({ ...item, requestNo, ok: result.ok, message: result.ok ? "Moved." : result.message });
    } catch (error) {
      logError("bulk reassign item failed", error, { requestId: item.requestId });
      outcomes.push({ ...item, requestNo, ok: false, message: "Something went wrong with this one. Try it on its own." });
    }
  }
  await recordAudit({ actorUserId: actor.id, action: "APPROVALS_BULK_REASSIGNED", entityType: "USER", entityId: toUserId, metadata: { moved: outcomes.filter((outcome) => outcome.ok).length, failed: outcomes.filter((outcome) => !outcome.ok).length } });
  return { ok: true, value: outcomes };
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
