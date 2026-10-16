import { evaluateCondition } from "@/server/engine/conditions";
import { validateWorkflow } from "@/server/engine/validate";
import {
  EngineError,
  type ApprovalNode,
  type BlockAction,
  type NotifyNode,
  type ApprovalTask,
  type ApproverSource,
  type CompletionRule,
  type Decision,
  type Directory,
  type EngineContext,
  type EngineEvent,
  type EngineResult,
  type InstanceState,
  type JoinNode,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/server/engine/types";

// The multi-level approval engine (north star, D-000; F-10 to F-27).
// Pure functions: (definition, state, input) → new state + events. The
// caller persists the state, records the events on the timeline/audit and
// turns them into notifications.

// ---------------------------------------------------------------- helpers --

class Graph {
  readonly nodes = new Map<string, WorkflowNode>();
  readonly outgoing = new Map<string, WorkflowEdge[]>();
  readonly incoming = new Map<string, WorkflowEdge[]>();

  constructor(definition: WorkflowDefinition) {
    for (const node of definition.nodes) {
      this.nodes.set(node.id, node);
      this.outgoing.set(node.id, []);
      this.incoming.set(node.id, []);
    }
    for (const edge of definition.edges) {
      this.outgoing.get(edge.from)?.push(edge);
      this.incoming.get(edge.to)?.push(edge);
    }
    for (const list of this.outgoing.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  node(id: string): WorkflowNode {
    const node = this.nodes.get(id);
    if (!node) throw new EngineError("UNKNOWN_NODE", `Unknown step ${id}`);
    return node;
  }

  start(): WorkflowNode {
    const start = [...this.nodes.values()].find((node) => node.kind === "START");
    if (!start) throw new EngineError("INVALID_WORKFLOW", "Workflow has no Start.");
    return start;
  }
}

function clone(state: InstanceState): InstanceState {
  return JSON.parse(JSON.stringify(state)) as InstanceState;
}

function required(rule: CompletionRule, total: number): number {
  if (rule.type === "ALL") return total;
  if (rule.type === "ANY_ONE") return 1;
  return rule.n;
}

// Resolve approver sources to active user ids. The requester is never
// their own approver (no self-approval) unless the step is work or an FYI
// (allowRequester); duplicates collapse into one task.
export function resolveApprovers(sources: ApproverSource[], context: EngineContext, directory: Directory, options: { allowRequester?: boolean } = {}): number[] {
  const ids: number[] = [];
  const add = (id: number | null | undefined) => {
    if (typeof id === "number" && Number.isInteger(id) && id > 0) ids.push(id);
  };
  for (const source of sources) {
    switch (source.type) {
      case "USER":
        add(source.userId);
        break;
      case "ROLE":
        directory.usersWithRole(source.roleCode).forEach(add);
        break;
      case "REQUESTER_MANAGER":
        add(directory.managerOf(context.requesterId));
        break;
      case "REQUESTER_MANAGERS_MANAGER": {
        const manager = directory.managerOf(context.requesterId);
        add(manager === null ? null : directory.managerOf(manager));
        break;
      }
      case "REQUESTER_DEPARTMENT_HOD":
        add(directory.departmentHodOf(context.requesterId));
        break;
      case "DEPARTMENT_HOD":
        add(directory.hodOfDepartment(source.departmentId));
        break;
      case "GROUP":
        directory.groupMembers(source.groupId).forEach(add);
        break;
      case "FORM_FIELD_USER": {
        const value = context.formData[source.fieldKey];
        (Array.isArray(value) ? value : [value]).forEach((item) => add(typeof item === "string" ? Number(item) : (item as number)));
        break;
      }
      case "DESIGNATION": {
        const department = source.sameDepartment ? directory.departmentOf(context.requesterId) : null;
        directory
          .usersWithDesignation(source.designationId)
          .filter((id) => !source.sameDepartment || (department !== null && directory.departmentOf(id) === department))
          .forEach(add);
        break;
      }
      case "REQUESTER":
        add(context.requesterId);
        break;
    }
  }
  return [...new Set(ids)].filter((id) => (options.allowRequester || id !== context.requesterId) && directory.isActive(id));
}

const isWork = (node: WorkflowNode): boolean => node.kind === "APPROVAL" && node.mode === "WORK";

// --------------------------------------------------------------- runtime --

class Run {
  readonly events: EngineEvent[] = [];

  constructor(
    readonly graph: Graph,
    readonly state: InstanceState,
    readonly context: EngineContext,
    readonly directory: Directory,
  ) {}

  private nextId(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}${this.state.seq}`;
  }

  // Follow every outgoing edge of a finished node (a SPLIT fans out; other
  // nodes have one outgoing edge; a CONDITION picks one).
  advanceFrom(nodeId: string): void {
    const node = this.graph.node(nodeId);
    const edges = this.graph.outgoing.get(nodeId) ?? [];
    if (node.kind === "CONDITION") {
      const chosen = edges.find((edge) => !edge.isDefault && edge.condition && evaluateCondition(edge.condition, this.context.formData)) ?? edges.find((edge) => edge.isDefault);
      if (!chosen) {
        this.block(nodeId, "NO_MATCHING_BRANCH");
        return;
      }
      this.events.push({ type: "BRANCH_TAKEN", nodeId, edgeId: chosen.id, isDefault: Boolean(chosen.isDefault) });
      this.arrive(chosen);
      return;
    }
    for (const edge of edges) {
      if (this.state.status !== "IN_PROGRESS") return;
      this.arrive(edge);
    }
  }

  arrive(edge: WorkflowEdge): void {
    const target = this.graph.node(edge.to);
    if (target.kind === "JOIN") {
      this.arriveAtJoin(target, edge);
      return;
    }
    this.activate(target);
  }

  private arriveAtJoin(join: JoinNode, edge: WorkflowEdge): void {
    const nodeState = this.state.nodes[join.id]!;
    if (nodeState.status === "APPROVED" || nodeState.status === "CANCELLED") return; // late branch
    const arrived = (this.state.joins[join.id] ??= []);
    if (!arrived.includes(edge.id)) arrived.push(edge.id);
    nodeState.status = "ACTIVE";
    nodeState.activatedAt ??= this.context.now;
    const total = (this.graph.incoming.get(join.id) ?? []).length;
    if (arrived.length >= required(join.completion, total)) {
      nodeState.status = "APPROVED";
      nodeState.completedAt = this.context.now;
      this.events.push({ type: "NODE_APPROVED", nodeId: join.id });
      this.cancelOpenBranchesInto(join.id);
      this.advanceFrom(join.id);
    }
  }

  // When a JOIN is satisfied early (ANY_ONE / ANY_N), branches still in
  // progress are no longer needed: close their steps and tasks.
  private cancelOpenBranchesInto(joinId: string): void {
    const upstream = new Set<string>();
    const stack = [joinId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const edge of this.graph.incoming.get(id) ?? []) {
        const from = this.graph.nodes.get(edge.from);
        if (!from || upstream.has(from.id) || from.kind === "SPLIT" || from.kind === "START") continue;
        upstream.add(from.id);
        stack.push(from.id);
      }
    }
    for (const id of upstream) {
      const nodeState = this.state.nodes[id];
      if (nodeState && (nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED")) {
        nodeState.status = "CANCELLED";
        nodeState.completedAt = this.context.now;
        nodeState.reason = "NOT_REQUIRED";
        this.closeTasks(id, "NOT_REQUIRED");
      }
    }
  }

  activate(node: WorkflowNode): void {
    const nodeState = this.state.nodes[node.id]!;
    switch (node.kind) {
      case "START":
      case "SPLIT":
      case "CONDITION":
        nodeState.status = "APPROVED";
        nodeState.activatedAt = this.context.now;
        nodeState.completedAt = this.context.now;
        this.advanceFrom(node.id);
        return;
      case "END":
        nodeState.status = "APPROVED";
        nodeState.activatedAt = this.context.now;
        nodeState.completedAt = this.context.now;
        this.finishApproved();
        return;
      case "JOIN":
        return; // reached only through arriveAtJoin
      case "APPROVAL":
        this.activateApproval(node);
        return;
      case "NOTIFY":
        this.activateNotify(node);
        return;
    }
  }

  // FYI: tell the people, then carry straight on (nothing to decide).
  private activateNotify(node: NotifyNode): void {
    const nodeState = this.state.nodes[node.id]!;
    const userIds = resolveApprovers(node.recipients, this.context, this.directory, { allowRequester: true });
    nodeState.status = "APPROVED";
    nodeState.activatedAt = this.context.now;
    nodeState.completedAt = this.context.now;
    nodeState.notified = userIds;
    this.events.push({ type: "NOTIFIED", nodeId: node.id, userIds, ...(node.note ? { note: node.note } : {}) });
    this.advanceFrom(node.id);
  }

  private activateApproval(node: ApprovalNode): void {
    const nodeState = this.state.nodes[node.id]!;
    nodeState.activatedAt = this.context.now;
    nodeState.reason = undefined;
    if (node.skipIf && evaluateCondition(node.skipIf, this.context.formData)) {
      this.skip(node.id, "SKIP_CONDITION");
      return;
    }
    const approvers = resolveApprovers(node.approvers, this.context, this.directory, { allowRequester: isWork(node) });
    if (approvers.length === 0) {
      if (node.onNoApprover === "SKIP") this.skip(node.id, "NO_APPROVER");
      else this.block(node.id, "NO_ELIGIBLE_APPROVER");
      return;
    }
    if (approvers.length < required(node.completion, approvers.length)) {
      this.block(node.id, "NOT_ENOUGH_APPROVERS");
      return;
    }
    this.openTasks(node, approvers);
  }

  // The step waits for these people (resolved, or chosen by IT for a
  // blocked step).
  openTasks(node: ApprovalNode, approvers: readonly number[]): void {
    const nodeState = this.state.nodes[node.id]!;
    nodeState.status = "ACTIVE";
    nodeState.activatedAt = this.context.now;
    nodeState.reason = undefined;
    this.events.push({ type: "NODE_ACTIVATED", nodeId: node.id });
    for (const approverId of approvers) {
      const task: ApprovalTask = {
        id: this.nextId("t"),
        nodeId: node.id,
        round: this.state.round,
        approverId,
        status: "PENDING",
        createdAt: this.context.now,
      };
      this.state.tasks.push(task);
      this.events.push({ type: "TASK_CREATED", taskId: task.id, nodeId: node.id, approverId });
    }
  }

  skip(nodeId: string, reason: "SKIP_CONDITION" | "NO_APPROVER" | "SKIPPED_BY_IT"): void {
    const nodeState = this.state.nodes[nodeId]!;
    nodeState.status = "SKIPPED";
    nodeState.completedAt = this.context.now;
    nodeState.reason = reason;
    this.events.push({ type: "NODE_SKIPPED", nodeId, reason });
    this.advanceFrom(nodeId);
  }

  private block(nodeId: string, reason: "NO_ELIGIBLE_APPROVER" | "NOT_ENOUGH_APPROVERS" | "NO_MATCHING_BRANCH"): void {
    const nodeState = this.state.nodes[nodeId]!;
    nodeState.status = "BLOCKED";
    nodeState.reason = reason;
    this.events.push({ type: "NODE_BLOCKED", nodeId, reason });
  }

  closeTasks(nodeId: string | null, status: "NOT_REQUIRED" | "CANCELLED"): void {
    const byNode = new Map<string, string[]>();
    for (const task of this.state.tasks) {
      if (task.status !== "PENDING" || (nodeId !== null && task.nodeId !== nodeId)) continue;
      task.status = status;
      task.decidedAt = this.context.now;
      byNode.set(task.nodeId, [...(byNode.get(task.nodeId) ?? []), task.id]);
    }
    for (const [id, taskIds] of byNode) this.events.push({ type: "TASKS_CLOSED", nodeId: id, taskIds, status });
  }

  private finishApproved(): void {
    this.state.status = "APPROVED";
    for (const [id, nodeState] of Object.entries(this.state.nodes)) {
      if (nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED") {
        nodeState.status = "CANCELLED";
        nodeState.reason = "NOT_REQUIRED";
        nodeState.completedAt = this.context.now;
        this.closeTasks(id, "NOT_REQUIRED");
      }
    }
    this.events.push({ type: "INSTANCE_APPROVED" });
  }

  endActiveSteps(): void {
    for (const nodeState of Object.values(this.state.nodes)) {
      if (nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED") {
        nodeState.status = "CANCELLED";
        nodeState.completedAt = this.context.now;
      }
    }
  }

  // Called after a task decision on an APPROVAL node.
  evaluateApprovalNode(node: ApprovalNode): void {
    const nodeState = this.state.nodes[node.id]!;
    const tasks = this.state.tasks.filter(
      (task) => task.nodeId === node.id && task.round === this.state.round && task.status !== "CANCELLED" && task.status !== "NOT_REQUIRED",
    );
    const approved = tasks.filter((task) => task.status === "APPROVED").length;
    const pending = tasks.filter((task) => task.status === "PENDING").length;
    const need = required(node.completion, tasks.length);
    if (approved >= need) {
      nodeState.status = "APPROVED";
      nodeState.completedAt = this.context.now;
      this.closeTasks(node.id, "NOT_REQUIRED");
      this.events.push({ type: "NODE_APPROVED", nodeId: node.id });
      this.advanceFrom(node.id);
    } else if (approved + pending < need) {
      // Not enough people left who could still approve.
      this.rejectInstance(node.id);
    }
  }

  rejectInstance(nodeId: string): void {
    const nodeState = this.state.nodes[nodeId]!;
    nodeState.status = "REJECTED";
    nodeState.completedAt = this.context.now;
    this.state.status = "REJECTED";
    this.closeTasks(null, "CANCELLED");
    this.endActiveSteps();
  }
}

function freshState(definition: WorkflowDefinition, round: number, seq: number): InstanceState {
  const nodes: InstanceState["nodes"] = {};
  for (const node of definition.nodes) nodes[node.id] = { status: "WAITING" };
  return { status: "IN_PROGRESS", round, nodes, tasks: [], joins: {}, seq };
}

// ------------------------------------------------------------ public API --

export function startInstance(definition: WorkflowDefinition, context: EngineContext, directory: Directory): EngineResult {
  const validation = validateWorkflow(definition);
  if (!validation.valid) {
    throw new EngineError("INVALID_WORKFLOW", validation.errors.map((issue) => issue.message).join(" "));
  }
  const graph = new Graph(definition);
  const state = freshState(definition, 1, 0);
  const run = new Run(graph, state, context, directory);
  run.activate(graph.start());
  return { state, events: run.events };
}

export interface DecisionInput {
  taskId: string;
  actorId: number;
  decision: Decision;
  comment?: string;
}

// Server-side authorisation lives here (G-01, D-020): only the signed-in
// approver of a PENDING task — or their active delegate — can decide it.
export function decide(
  definition: WorkflowDefinition,
  previous: InstanceState,
  input: DecisionInput,
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "IN_PROGRESS") {
    throw new EngineError("NOT_IN_PROGRESS", previous.status === "ON_HOLD" ? "This request is on hold." : "This request is no longer waiting for approval.");
  }
  const state = clone(previous);
  const task = state.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task || task.status !== "PENDING") throw new EngineError("NOT_AUTHORISED", "This approval is not waiting for you.");
  const graph = new Graph(definition);
  const node = graph.node(task.nodeId);
  if (node.kind !== "APPROVAL") throw new EngineError("UNKNOWN_NODE", "Task is not on an approval step.");
  const work = node.mode === "WORK";
  const isApprover = task.approverId === input.actorId;
  const isDelegate = !isApprover && directory.canActFor(input.actorId, task.approverId);
  // Nobody approves their own request; a work task may be the requester's own.
  if ((!isApprover && !isDelegate) || (input.actorId === context.requesterId && !work)) {
    throw new EngineError("NOT_AUTHORISED", "You are not allowed to decide this approval.");
  }
  if (work && input.decision === "REJECT") throw new EngineError("INVALID_ACTION", "A work task is marked as done, or sent back for changes; it can't be rejected.");
  // v1.9.0 (audit AUD-05, D-147): one person, one vote per step. Someone who
  // already decided another task of this step in this round (e.g. as a
  // delegate and as a named approver) can't decide again.
  if (state.tasks.some((other) => other.id !== task.id && other.nodeId === task.nodeId && other.round === task.round && other.decidedBy === input.actorId)) {
    throw new EngineError("ALREADY_DECIDED", "You've already decided this step. Someone else has to decide the other part.");
  }
  const comment = input.comment?.trim();
  if ((input.decision === "REJECT" || input.decision === "REQUEST_CHANGES") && !comment) {
    throw new EngineError("COMMENT_REQUIRED", "Please give a reason.");
  }
  const run = new Run(graph, state, context, directory);

  task.decidedAt = context.now;
  task.decidedBy = input.actorId;
  if (isDelegate) task.onBehalfOf = task.approverId;
  if (comment) task.comment = comment;
  run.events.push({
    type: "TASK_DECIDED",
    taskId: task.id,
    nodeId: node.id,
    decision: input.decision,
    actorId: input.actorId,
    ...(isDelegate ? { onBehalfOf: task.approverId } : {}),
  });

  if (input.decision === "APPROVE") {
    task.status = "APPROVED";
    run.evaluateApprovalNode(node);
  } else if (input.decision === "REJECT") {
    task.status = "REJECTED";
    // ALL: one rejection ends it. ANY_ONE / ANY_N: only when the rule can no
    // longer be met by the people still to decide.
    if (node.completion.type === "ALL") run.rejectInstance(node.id);
    else run.evaluateApprovalNode(node);
    if (state.status === "REJECTED") {
      run.events.push({ type: "INSTANCE_REJECTED", nodeId: node.id, actorId: input.actorId, comment: comment! });
    }
  } else {
    task.status = "CHANGES_REQUESTED";
    state.status = "CHANGES_REQUIRED";
    const openNodeIds = Object.entries(state.nodes)
      .filter(([, nodeState]) => nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED")
      .map(([id]) => id)
      .filter((id) => graph.node(id).kind === "APPROVAL");
    state.changesRequested = { nodeId: node.id, by: input.actorId, at: context.now, comment: comment!, openNodeIds };
    run.closeTasks(null, "CANCELLED");
    run.endActiveSteps();
    run.events.push({ type: "CHANGES_REQUESTED", nodeId: node.id, actorId: input.actorId, comment: comment! });
  }
  return { state, events: run.events };
}

// On Hold (F-27): paused, stays open, counts as pending (never "complete").
export function putOnHold(
  previous: InstanceState,
  input: { taskId: string; actorId: number; reason?: string },
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "IN_PROGRESS") throw new EngineError("NOT_IN_PROGRESS", "Only a request waiting for approval can be put on hold.");
  const task = previous.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task || task.status !== "PENDING" || (task.approverId !== input.actorId && !directory.canActFor(input.actorId, task.approverId))) {
    throw new EngineError("NOT_AUTHORISED", "You are not allowed to put this request on hold.");
  }
  const state = clone(previous);
  state.status = "ON_HOLD";
  state.hold = { nodeId: task.nodeId, by: input.actorId, at: context.now, ...(input.reason ? { reason: input.reason } : {}) };
  return { state, events: [{ type: "PUT_ON_HOLD", nodeId: task.nodeId, actorId: input.actorId, ...(input.reason ? { reason: input.reason } : {}) }] };
}

export function resume(previous: InstanceState, input: { actorId: number; isAdmin?: boolean }, directory: Directory): EngineResult {
  if (previous.status !== "ON_HOLD" || !previous.hold) throw new EngineError("NOT_ON_HOLD", "This request is not on hold.");
  const hold = previous.hold;
  const canResume =
    input.isAdmin === true ||
    previous.tasks.some(
      (task) => task.nodeId === hold.nodeId && task.status === "PENDING" && (task.approverId === input.actorId || directory.canActFor(input.actorId, task.approverId)),
    );
  if (!canResume) throw new EngineError("NOT_AUTHORISED", "You are not allowed to resume this request.");
  const state = clone(previous);
  state.status = "IN_PROGRESS";
  delete state.hold;
  const pendingApproverIds = [...new Set(state.tasks.filter((task) => task.status === "PENDING").map((task) => task.approverId))];
  return { state, events: [{ type: "RESUMED", actorId: input.actorId, heldSince: hold.at, pendingApproverIds }] };
}

export type RestartPolicy = "BEGINNING" | "REQUESTING_STEP";

// Resubmission after "changes required" (F-26): same request, next round.
// The caller stores the new form version; history stays in the old rounds.
export function resubmit(
  definition: WorkflowDefinition,
  previous: InstanceState,
  policy: RestartPolicy,
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "CHANGES_REQUIRED" || !previous.changesRequested) {
    throw new EngineError("NOT_CHANGES_REQUIRED", "This request is not waiting for changes.");
  }
  const graph = new Graph(definition);
  const state = freshState(definition, previous.round + 1, previous.seq);
  state.tasks = previous.tasks.map((task) => ({ ...task }));
  const run = new Run(graph, state, context, directory);
  const restartNodeId = policy === "REQUESTING_STEP" ? previous.changesRequested.nodeId : graph.start().id;

  if (policy === "REQUESTING_STEP") {
    // Earlier steps keep their outcome from the previous round.
    for (const [id, nodeState] of Object.entries(previous.nodes)) {
      if (id !== restartNodeId && (nodeState.status === "APPROVED" || nodeState.status === "SKIPPED")) {
        state.nodes[id] = { ...nodeState };
      }
    }
    // Keep join arrivals from branches that stay finished, so a join isn't
    // left waiting for a branch that already completed.
    const edgesById = new Map(definition.edges.map((edge) => [edge.id, edge]));
    for (const [joinId, arrived] of Object.entries(previous.joins)) {
      const kept = arrived.filter((edgeId) => {
        const from = edgesById.get(edgeId)?.from;
        const status = from ? state.nodes[from]?.status : undefined;
        return status === "APPROVED" || status === "SKIPPED";
      });
      if (kept.length) {
        state.joins[joinId] = kept;
        if (state.nodes[joinId]?.status !== "APPROVED") state.nodes[joinId] = { status: "ACTIVE", activatedAt: previous.nodes[joinId]?.activatedAt };
      }
    }
  }
  run.events.push({ type: "RESUBMITTED", round: state.round, restartNodeId, changesAskedBy: previous.changesRequested.by });
  if (policy === "REQUESTING_STEP") {
    const restartIds = [...new Set([restartNodeId, ...previous.changesRequested.openNodeIds])];
    for (const id of restartIds) {
      if (state.status !== "IN_PROGRESS") break;
      run.activate(graph.node(id));
    }
  } else {
    run.activate(graph.node(restartNodeId));
  }
  return { state, events: run.events };
}

// Open tasks for one person (their "Waiting for me" list).
// Withdraw (F-17, D-066): the request is closed while still open. Every
// pending approval is closed. Who may withdraw is the caller's rule
// (only the requester).
export function withdraw(previous: InstanceState, input: { actorId: number; reason?: string }): EngineResult {
  if (previous.status !== "IN_PROGRESS" && previous.status !== "ON_HOLD" && previous.status !== "CHANGES_REQUIRED") {
    throw new EngineError("NOT_OPEN", "Only an open request can be withdrawn.");
  }
  const state = clone(previous);
  const closed: string[] = [];
  const approverIds = new Set<number>();
  for (const task of state.tasks) {
    if (task.status === "PENDING") {
      task.status = "CANCELLED";
      closed.push(task.id);
      approverIds.add(task.approverId);
    }
  }
  for (const nodeState of Object.values(state.nodes)) {
    if (nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED") nodeState.status = "CANCELLED";
  }
  state.status = "CANCELLED";
  delete state.hold;
  const reason = input.reason?.trim();
  return { state, events: [{ type: "WITHDRAWN", actorId: input.actorId, ...(reason ? { reason } : {}), closedTaskIds: closed, approverIds: [...approverIds] }] };
}

// Super Admin delete (D-086, audit R-04): an open request is closed the same
// way as a withdrawal, so its saved state and its task rows agree and the
// people waiting on it are told. A finished request keeps its outcome.
export function cancelForDeletion(previous: InstanceState, input: { actorId: number; reason: string }): EngineResult {
  const reason = input.reason.trim();
  if (!reason) throw new EngineError("COMMENT_REQUIRED", "Please give a reason.");
  const open = previous.status === "IN_PROGRESS" || previous.status === "ON_HOLD" || previous.status === "CHANGES_REQUIRED";
  if (!open) {
    return { state: previous, events: [{ type: "DELETED", actorId: input.actorId, reason, closedTaskIds: [], approverIds: [], wasOpen: false }] };
  }
  const withdrawn = withdraw(previous, { actorId: input.actorId, reason });
  const event = withdrawn.events[0] as Extract<EngineEvent, { type: "WITHDRAWN" }>;
  return { state: withdrawn.state, events: [{ type: "DELETED", actorId: input.actorId, reason, closedTaskIds: event.closedTaskIds, approverIds: event.approverIds, wasOpen: true }] };
}

// Reopen (F-29, D-066): an approved request starts again from the first
// level in a new round, on the same number and workflow version. Earlier
// approvals stay in the history but don't count.
export function reopen(
  definition: WorkflowDefinition,
  previous: InstanceState,
  input: { actorId: number; reason: string },
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "APPROVED") throw new EngineError("NOT_APPROVED", "Only an approved request can be reopened.");
  const reason = input.reason.trim();
  if (!reason) throw new EngineError("COMMENT_REQUIRED", "Please give a reason.");
  const graph = new Graph(definition);
  const state = freshState(definition, previous.round + 1, previous.seq);
  state.tasks = previous.tasks.map((task) => ({ ...task }));
  const run = new Run(graph, state, context, directory);
  run.events.push({ type: "REOPENED", actorId: input.actorId, reason, round: state.round });
  run.activate(graph.start());
  return { state, events: run.events };
}

// Handover (F-16, D-064): a pending task moves to another person, e.g.
// when its approver leaves. Only pending tasks move; decisions stay with
// whoever made them. The new person must be active, can't be the requester,
// and can't already have a task on the same step in this round.
export function reassignTask(
  previous: InstanceState,
  input: { taskId: string; toUserId: number; actorId: number; reason?: string; byApprover?: boolean },
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "IN_PROGRESS" && previous.status !== "ON_HOLD") {
    throw new EngineError("NOT_IN_PROGRESS", "Only an open request's approvals can be handed over.");
  }
  const state = clone(previous);
  const task = state.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task || task.status !== "PENDING") throw new EngineError("INVALID_REASSIGN", "This approval is no longer pending.");
  if (input.toUserId === task.approverId) throw new EngineError("INVALID_REASSIGN", "That person already has this approval.");
  if (!directory.isActive(input.toUserId)) throw new EngineError("INVALID_REASSIGN", "The new approver must be an active person.");
  if (input.toUserId === context.requesterId) throw new EngineError("INVALID_REASSIGN", "The requester can't approve their own request.");
  const clash = state.tasks.some((other) => other.nodeId === task.nodeId && other.round === task.round && other.approverId === input.toUserId && other.status !== "CANCELLED");
  if (clash) throw new EngineError("INVALID_REASSIGN", "That person is already an approver on this step.");
  const fromId = task.approverId;
  task.previousApprovers = [...(task.previousApprovers ?? []), fromId];
  task.approverId = input.toUserId;
  state.seq += 1;
  return {
    state,
    events: [
      {
        type: "TASK_REASSIGNED",
        taskId: task.id,
        nodeId: task.nodeId,
        fromId,
        toId: input.toUserId,
        actorId: input.actorId,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.byApprover ? { byApprover: true } : {}),
      },
    ],
  };
}

export function pendingTasksFor(state: InstanceState, userId: number, directory: Directory): ApprovalTask[] {
  if (state.status !== "IN_PROGRESS" && state.status !== "ON_HOLD") return [];
  return state.tasks.filter((task) => task.status === "PENDING" && (task.approverId === userId || directory.canActFor(userId, task.approverId)));
}

// Blocked step recovery (D-098, audit X-03). Only a step the engine marked
// BLOCKED can be moved on, and only by IT (the caller checks the role):
//   ASSIGN    approval/work step: these people decide it now
//   SKIP      approval/work step: treated as not needed
//   RETRY     resolve the approvers / the choice again (after fixing the masters)
//   TAKE_PATH choice step: follow this path
export function resolveBlocked(
  definition: WorkflowDefinition,
  previous: InstanceState,
  input: { nodeId: string; actorId: number; reason: string } & BlockAction,
  context: EngineContext,
  directory: Directory,
): EngineResult {
  if (previous.status !== "IN_PROGRESS") throw new EngineError("NOT_IN_PROGRESS", "Only a request waiting for approval can be moved on.");
  const reason = input.reason.trim();
  if (!reason) throw new EngineError("COMMENT_REQUIRED", "Please give a reason.");
  if (previous.nodes[input.nodeId]?.status !== "BLOCKED") throw new EngineError("NOT_BLOCKED", "This step isn't blocked any more. Reload the page.");
  const graph = new Graph(definition);
  const node = graph.node(input.nodeId);
  const state = clone(previous);
  const run = new Run(graph, state, context, directory);
  run.events.push({
    type: "BLOCK_RESOLVED",
    nodeId: node.id,
    actorId: input.actorId,
    action: input.action,
    reason,
    ...(input.action === "ASSIGN" ? { userIds: input.userIds } : {}),
  });
  if (node.kind === "APPROVAL") {
    if (input.action === "ASSIGN") {
      const work = node.mode === "WORK";
      const people = [...new Set(input.userIds)];
      if (people.length === 0) throw new EngineError("INVALID_ACTION", "Choose at least one person.");
      if (people.some((id) => !directory.isActive(id))) throw new EngineError("INVALID_ACTION", "Everyone chosen must be an active person.");
      if (!work && people.includes(context.requesterId)) throw new EngineError("INVALID_ACTION", "The requester can't approve their own request.");
      const need = required(node.completion, people.length);
      if (people.length < need) throw new EngineError("INVALID_ACTION", `This step needs at least ${need} people.`);
      run.openTasks(node, people);
    } else if (input.action === "SKIP") {
      run.skip(node.id, "SKIPPED_BY_IT");
    } else if (input.action === "RETRY") {
      run.activate(node);
    } else {
      throw new EngineError("INVALID_ACTION", "A path can only be chosen on a choice step.");
    }
  } else if (node.kind === "CONDITION") {
    const nodeState = state.nodes[node.id]!;
    if (input.action === "TAKE_PATH") {
      const edge = (graph.outgoing.get(node.id) ?? []).find((candidate) => candidate.id === input.edgeId);
      if (!edge) throw new EngineError("INVALID_ACTION", "That path doesn't leave this step.");
      nodeState.status = "APPROVED";
      nodeState.reason = undefined;
      nodeState.completedAt = context.now;
      run.events.push({ type: "BRANCH_TAKEN", nodeId: node.id, edgeId: edge.id, isDefault: Boolean(edge.isDefault) });
      run.arrive(edge);
    } else if (input.action === "RETRY") {
      nodeState.reason = undefined;
      run.activate(node);
    } else {
      throw new EngineError("INVALID_ACTION", "On a choice step, pick a path or try again.");
    }
  } else {
    throw new EngineError("INVALID_ACTION", "This step can't be moved on by hand.");
  }
  return { state, events: run.events };
}

// Recall (EN-04, BD-1): the requester takes their own request back to change
// it, while it is still waiting (or on hold). Like "ask for changes", but by
// the requester: pending approvals close, every decision already made stays
// in the history, and resubmitting restarts every step that was open (the
// type's restart rule applies). Who may recall is the caller's rule.
export function recall(definition: WorkflowDefinition, previous: InstanceState, input: { actorId: number; reason: string }, context: EngineContext, directory: Directory): EngineResult {
  if (previous.status !== "IN_PROGRESS" && previous.status !== "ON_HOLD") {
    throw new EngineError("NOT_RECALLABLE", "Only a request that is still waiting for approval can be recalled.");
  }
  const reason = input.reason.trim();
  if (!reason) throw new EngineError("COMMENT_REQUIRED", "Please say why you're recalling it.");
  const graph = new Graph(definition);
  const openNodeIds = Object.entries(previous.nodes)
    .filter(([, nodeState]) => nodeState.status === "ACTIVE" || nodeState.status === "BLOCKED")
    .map(([id]) => id)
    .filter((id) => graph.node(id).kind === "APPROVAL");
  if (openNodeIds.length === 0) throw new EngineError("NOT_RECALLABLE", "There is no open step to recall it from.");
  const state = clone(previous);
  const run = new Run(graph, state, context, directory);
  const pending = state.tasks.filter((task) => task.status === "PENDING");
  state.status = "CHANGES_REQUIRED";
  delete state.hold;
  state.changesRequested = { nodeId: openNodeIds[0]!, by: input.actorId, at: context.now, comment: reason, openNodeIds };
  run.closeTasks(null, "CANCELLED");
  run.endActiveSteps();
  run.events.push({ type: "RECALLED", actorId: input.actorId, reason, closedTaskIds: pending.map((task) => task.id), approverIds: [...new Set(pending.map((task) => task.approverId))] });
  return { state, events: run.events };
}

// Ask for information (EN-05, BD-2): the approver (or their delegate) asks
// the requester a question. The request waits on hold (the response time
// stops, nobody else decides meanwhile) until the requester answers.
export function askForInformation(previous: InstanceState, input: { taskId: string; actorId: number; question: string }, context: EngineContext, directory: Directory): EngineResult {
  const question = input.question.trim();
  if (!question) throw new EngineError("COMMENT_REQUIRED", "Please write the question.");
  const held = putOnHold(previous, { taskId: input.taskId, actorId: input.actorId, reason: question }, context, directory);
  const nodeId = held.state.hold!.nodeId;
  held.state.hold = { ...held.state.hold!, kind: "INFO" };
  return { state: held.state, events: [{ type: "INFO_REQUESTED", nodeId, actorId: input.actorId, question }] };
}

// The requester's answer resumes it. Only for a question (an ordinary hold
// is resumed by the approver).
export function answerInformation(previous: InstanceState, input: { actorId: number; answer: string }, context: EngineContext): EngineResult {
  if (previous.status !== "ON_HOLD" || previous.hold?.kind !== "INFO") throw new EngineError("NOT_ON_HOLD", "Nobody is waiting for an answer on this request.");
  if (input.actorId !== context.requesterId) throw new EngineError("NOT_AUTHORISED", "Only the person who raised the request can answer.");
  const answer = input.answer.trim();
  if (!answer) throw new EngineError("COMMENT_REQUIRED", "Please write your answer.");
  const hold = previous.hold;
  const state = clone(previous);
  state.status = "IN_PROGRESS";
  delete state.hold;
  const pendingApproverIds = [...new Set(state.tasks.filter((task) => task.status === "PENDING").map((task) => task.approverId))];
  return { state, events: [{ type: "INFO_ANSWERED", actorId: input.actorId, answer, askedBy: hold.by, heldSince: hold.at, pendingApproverIds }] };
}
