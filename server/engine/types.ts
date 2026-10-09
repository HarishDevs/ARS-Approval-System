// ARS multi-level approval engine — data model (north star, D-000).
//
// A workflow is a GRAPH of nodes and edges, never fixed "Level 1–4"
// columns (G-16). Any number of levels, combined freely:
//   sequential   A → B → C
//   parallel     SPLIT → (A, B, C) → JOIN(ALL | ANY_ONE | ANY_N)
//   any-one      one APPROVAL node, several approvers, completion ANY_ONE
//   any-N-of-M   one APPROVAL node, completion ANY_N
//   conditional  CONDITION node with guarded edges + one default edge
//   hybrid       any nesting of the above
// The engine is pure: no database, no clock, no network. Callers pass the
// directory snapshot and "now", and persist the returned state.

export type ScalarValue = string | number | boolean | null;
export type FormData = Record<string, ScalarValue | ScalarValue[] | undefined>;

// ---- conditions ---------------------------------------------------------
export type ComparisonOperator =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "IN"
  | "NOT_IN"
  | "CONTAINS"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY";

export interface Comparison {
  field: string;
  operator: ComparisonOperator;
  value?: ScalarValue | ScalarValue[];
}

export interface ConditionGroup {
  op: "AND" | "OR";
  conditions: Condition[];
}

export type Condition = Comparison | ConditionGroup;

// ---- approvers ------------------------------------------------------------
export type ApproverSource =
  | { type: "USER"; userId: number }
  | { type: "ROLE"; roleCode: string }
  | { type: "REQUESTER_MANAGER" }
  | { type: "REQUESTER_MANAGERS_MANAGER" }
  | { type: "REQUESTER_DEPARTMENT_HOD" }
  | { type: "DEPARTMENT_HOD"; departmentId: number }
  | { type: "GROUP"; groupId: number }
  | { type: "FORM_FIELD_USER"; fieldKey: string }
  // Everyone active with this designation; optionally only in the
  // requester's own department (D-097).
  | { type: "DESIGNATION"; designationId: number; sameDepartment?: boolean }
  // The person who raised the request: for work steps and FYI only, never
  // an approver (no self-approval).
  | { type: "REQUESTER" };

export type CompletionRule = { type: "ALL" } | { type: "ANY_ONE" } | { type: "ANY_N"; n: number };

// ---- nodes & edges --------------------------------------------------------
interface BaseNode {
  id: string;
  label: string;
}

export interface StartNode extends BaseNode {
  kind: "START";
}

export interface EndNode extends BaseNode {
  kind: "END";
}

export interface ApprovalNode extends BaseNode {
  kind: "APPROVAL";
  approvers: ApproverSource[];
  completion: CompletionRule;
  // Skip this level when the condition matches (e.g. amount below a band).
  skipIf?: Condition;
  // When nobody eligible resolves: BLOCK (default, needs an admin) or SKIP.
  onNoApprover?: "BLOCK" | "SKIP";
  // Respond-within time (F-31). The engine only carries it; the job runner
  // turns it into reminders and escalation.
  slaHours?: number;
  // WORK (D-097): a task to do rather than a decision ("Mark as done"). It
  // can go to the requester, can't be rejected, and changes can still be
  // asked. Default APPROVE.
  mode?: "APPROVE" | "WORK";
}

// FYI (D-097): tells people the request reached this point, then moves on
// at once. Nobody has to act.
export interface NotifyNode extends BaseNode {
  kind: "NOTIFY";
  recipients: ApproverSource[];
  note?: string;
}

export interface SplitNode extends BaseNode {
  kind: "SPLIT";
}

// Waits for incoming branches: ALL, ANY_ONE, or ANY_N branches.
export interface JoinNode extends BaseNode {
  kind: "JOIN";
  completion: CompletionRule;
}

export interface ConditionNode extends BaseNode {
  kind: "CONDITION";
}

export type WorkflowNode = StartNode | EndNode | ApprovalNode | SplitNode | JoinNode | ConditionNode | NotifyNode;

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  // Only on edges leaving a CONDITION node. Checked in `order`; the first
  // match wins; the one `isDefault` edge is taken when nothing matches.
  condition?: Condition;
  isDefault?: boolean;
  order?: number;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ---- directory (who is who) — a snapshot the caller builds -----------------
export interface Directory {
  isActive(userId: number): boolean;
  managerOf(userId: number): number | null;
  departmentHodOf(userId: number): number | null;
  hodOfDepartment(departmentId: number): number | null;
  usersWithRole(roleCode: string): number[];
  groupMembers(groupId: number): number[];
  usersWithDesignation(designationId: number): number[];
  departmentOf(userId: number): number | null;
  // Delegation (D-018): may `actorId` act for `approverId` right now?
  canActFor(actorId: number, approverId: number): boolean;
}

export interface EngineContext {
  requesterId: number;
  formData: FormData;
  now: string; // ISO timestamp, supplied by the caller
}

// ---- runtime state (JSON-serialisable, persisted by the caller) -----------
export type InstanceStatus = "IN_PROGRESS" | "ON_HOLD" | "CHANGES_REQUIRED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type NodeStatus = "WAITING" | "ACTIVE" | "APPROVED" | "REJECTED" | "SKIPPED" | "BLOCKED" | "CANCELLED";

export type TaskStatus = "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" | "NOT_REQUIRED" | "CANCELLED";

export interface ApprovalTask {
  id: string;
  nodeId: string;
  round: number; // only tasks of the current round count toward completion
  approverId: number;
  status: TaskStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: number; // the authenticated actor (G-01)
  onBehalfOf?: number; // set when a delegate acted
  comment?: string;
}

export interface NodeState {
  status: NodeStatus;
  activatedAt?: string;
  completedAt?: string;
  reason?: string;
  notified?: number[]; // FYI step: who was told
}

export interface InstanceState {
  status: InstanceStatus;
  round: number; // increments on every resubmission restart
  nodes: Record<string, NodeState>;
  tasks: ApprovalTask[];
  joins: Record<string, string[]>; // join node id → ids of edges that arrived
  hold?: { nodeId: string; by: number; at: string; reason?: string };
  // openNodeIds: every step that was still open when changes were asked, so
  // a restart "at the requesting step" also restarts parallel branches.
  changesRequested?: { nodeId: string; by: number; at: string; comment: string; openNodeIds: string[] };
  seq: number;
}

// ---- events the caller turns into notifications / audit / timeline ---------
export type EngineEvent =
  | { type: "NODE_ACTIVATED"; nodeId: string }
  | { type: "TASK_CREATED"; taskId: string; nodeId: string; approverId: number }
  | { type: "NODE_APPROVED"; nodeId: string }
  | { type: "NODE_SKIPPED"; nodeId: string; reason: "SKIP_CONDITION" | "NO_APPROVER" | "SKIPPED_BY_IT" }
  | { type: "NODE_BLOCKED"; nodeId: string; reason: "NO_ELIGIBLE_APPROVER" | "NOT_ENOUGH_APPROVERS" | "NO_MATCHING_BRANCH" }
  | { type: "TASK_DECIDED"; taskId: string; nodeId: string; decision: Decision; actorId: number; onBehalfOf?: number }
  | { type: "TASKS_CLOSED"; nodeId: string; taskIds: string[]; status: "NOT_REQUIRED" | "CANCELLED" }
  | { type: "BRANCH_TAKEN"; nodeId: string; edgeId: string; isDefault: boolean }
  | { type: "INSTANCE_APPROVED" }
  | { type: "INSTANCE_REJECTED"; nodeId: string; actorId: number; comment: string }
  | { type: "CHANGES_REQUESTED"; nodeId: string; actorId: number; comment: string }
  | { type: "PUT_ON_HOLD"; nodeId: string; actorId: number; reason?: string }
  | { type: "RESUMED"; actorId: number; heldSince?: string; pendingApproverIds?: number[] }
  | { type: "RESUBMITTED"; round: number; restartNodeId: string; changesAskedBy?: number }
  | { type: "NOTIFIED"; nodeId: string; userIds: number[]; note?: string }
  | { type: "BLOCK_RESOLVED"; nodeId: string; actorId: number; action: BlockAction["action"]; userIds?: number[]; reason: string }
  | { type: "TASK_REASSIGNED"; taskId: string; nodeId: string; fromId: number; toId: number; actorId: number }
  | { type: "WITHDRAWN"; actorId: number; reason?: string; closedTaskIds: string[]; approverIds: number[] }
  | { type: "DELETED"; actorId: number; reason: string; closedTaskIds: string[]; approverIds: number[]; wasOpen: boolean }
  | { type: "REOPENED"; actorId: number; reason: string; round: number };

export type Decision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

// How IT moves a blocked step on (D-098).
export type BlockAction =
  | { action: "ASSIGN"; userIds: number[] } // approval/work step: these people decide
  | { action: "SKIP" } // treat the step as not needed
  | { action: "RETRY" } // resolve the approvers again (after fixing the masters)
  | { action: "TAKE_PATH"; edgeId: string }; // choice with no matching path

export interface EngineResult {
  state: InstanceState;
  events: EngineEvent[];
}

export type EngineErrorCode =
  | "INVALID_WORKFLOW"
  | "NOT_IN_PROGRESS"
  | "NOT_ON_HOLD"
  | "NOT_CHANGES_REQUIRED"
  | "NOT_AUTHORISED"
  | "COMMENT_REQUIRED"
  | "UNKNOWN_NODE"
  | "INVALID_REASSIGN"
  | "NOT_OPEN"
  | "NOT_APPROVED"
  | "NOT_BLOCKED"
  | "INVALID_ACTION";

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
