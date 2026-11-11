import { doaBandIndex, isConditionGroup, toCondition, type BuilderCondition, type BuilderInnerStage, type BuilderSpec, type BuilderStage, type BuilderStep } from "@/server/workflows/builder";
import { evaluateCondition } from "@/server/engine/conditions";
import type { ApprovalNode, CompletionRule, FormData, InstanceState, NodeStatus, NotifyNode, TaskStatus, WorkflowDefinition } from "@/server/engine/types";

// The request page's level map (S3-05b, F-14): every level and branch with
// its status and people. Pure and unit-tested. Uses the builder's stages
// when the version has them; otherwise lists approval steps in graph order.
export interface MapPerson {
  userId: number;
  name: string;
  // EXPECTED (v1.54.0, owner): a level not reached yet: who it will go to,
  // worked out from the route now (the engine resolves again when it arrives).
  status: TaskStatus | "TOLD" | "ASSIGNED" | "EXPECTED";
  decidedByName?: string; // only when a delegate acted
  comment?: string;
  decidedAt?: string;
}

export interface MapStep {
  nodeId: string;
  label: string;
  status: NodeStatus;
  rule: string; // "All must approve", "Any one", "Any 2"
  reason?: string; // skipped / blocked reason
  people: MapPerson[];
  notTaken?: boolean; // on the path a choice didn't take (D-068)
  type?: "WORK" | "NOTIFY"; // D-097; an approval step has none
  activatedAt?: string; // D-253: when it started waiting (the road's "pending since")
  completedAt?: string; // D-253: when it finished
  background?: boolean; // D-273: work handed out without holding the request up
}

export interface MapStage {
  kind: "STEP" | "PARALLEL" | "CHOICE";
  label: string;
  joinRule?: string;
  steps: MapStep[];
  // CHOICE only: the two paths; taken is null until the choice is reached.
  paths?: { label: string; taken: boolean | null; stages: MapStage[] }[];
}

const OPERATOR_WORDS: Record<string, string> = {
  GT: "is more than",
  GTE: "is at least",
  LT: "is less than",
  LTE: "is at most",
  EQ: "is",
  NEQ: "is not",
  IN: "is one of",
  NOT_IN: "is not one of",
  CONTAINS: "contains",
  IS_EMPTY: "is empty",
  IS_NOT_EMPTY: "is filled in",
};

const DATE_WORDS: Record<string, string> = { GT: "is after", GTE: "is on or after", LT: "is before", LTE: "is on or before" };

export function describeCondition(condition: { field: string; operator: string; value?: unknown }, fieldLabel: (key: string) => string): string {
  const isDate = typeof condition.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(condition.value);
  const value =
    typeof condition.value === "number"
      ? condition.value.toLocaleString("en-IN")
      : isDate
        ? new Date(`${condition.value as string}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
        : condition.value === undefined
          ? ""
          : String(condition.value);
  const words = (isDate ? DATE_WORDS[condition.operator] : undefined) ?? OPERATOR_WORDS[condition.operator] ?? condition.operator;
  return `${fieldLabel(condition.field)} ${words}${value ? ` ${value}` : ""}`.trim();
}

// A builder rule in words: one comparison, or "A and B" / "A or B".
export function describeBuilderCondition(condition: BuilderCondition, fieldLabel: (key: string) => string): string {
  if (!isConditionGroup(condition)) return describeCondition(condition, fieldLabel);
  return condition.conditions.map((item) => describeCondition(item, fieldLabel)).join(condition.match === "ALL" ? " and " : " or ");
}

export function describeRule(rule: CompletionRule, count: number, work = false): string {
  const verb = work ? "mark it done" : "approve";
  if (rule.type === "ALL") return count > 1 ? `All ${count} must ${verb}` : `Must ${verb}`;
  if (rule.type === "ANY_ONE") return count > 1 ? `Any one of ${count}` : `Must ${verb}`;
  return `Any ${rule.n} of ${count}`;
}

function describeJoin(rule: CompletionRule): string {
  if (rule.type === "ALL") return "All branches must finish";
  if (rule.type === "ANY_ONE") return "Any one branch is enough";
  return `Any ${rule.n} branches`;
}

const REASONS: Record<string, string> = {
  SKIP_CONDITION: "Skipped: its condition didn't apply",
  NO_APPROVER: "Skipped: nobody to approve",
  NO_ELIGIBLE_APPROVER: "Blocked: no eligible approver (IT has been told)",
  NOT_ENOUGH_APPROVERS: "Blocked: not enough approvers (IT has been told)",
  NO_MATCHING_BRANCH: "Blocked: no path matches (IT has been told)",
  SKIPPED_BY_IT: "Skipped by IT",
};

// FYI step (D-097): who was told, once it was reached.
function mapNotify(node: NotifyNode, state: InstanceState, names: ReadonlyMap<number, string>): MapStep {
  const nodeState = state.nodes[node.id];
  const told = nodeState?.notified ?? [];
  return {
    nodeId: node.id,
    label: node.label,
    status: nodeState?.status ?? "WAITING",
    rule: node.note ? `For information: ${node.note}` : "For information, nothing to do",
    people: told.map((userId) => ({ userId, name: names.get(userId) ?? `User #${userId}`, status: "TOLD" as const })),
    type: "NOTIFY",
  };
}

function mapStep(node: ApprovalNode, state: InstanceState, names: ReadonlyMap<number, string>): MapStep {
  const nodeState = state.nodes[node.id];
  // The step's latest round: the current one, or the round it was finished
  // in when a resubmission kept it (earlier rounds are in the timeline).
  const nodeTasks = state.tasks.filter((task) => task.nodeId === node.id);
  const latestRound = nodeTasks.reduce((max, task) => Math.max(max, task.round), 0);
  const tasks = nodeTasks.filter((task) => task.round === latestRound);
  // D-273: background work: the people it was given to (their tasks live in Task Management).
  const handedTo: MapPerson[] = node.background ? (nodeState?.assigned ?? []).map((userId) => ({ userId, name: names.get(userId) ?? `User #${userId}`, status: "ASSIGNED" as const })) : [];
  const people: MapPerson[] = node.background ? handedTo : tasks.map((task) => ({
    userId: task.approverId,
    name: names.get(task.approverId) ?? `User #${task.approverId}`,
    status: task.status,
    ...(task.decidedBy && task.decidedBy !== task.approverId ? { decidedByName: names.get(task.decidedBy) ?? `User #${task.decidedBy}` } : {}),
    ...(task.comment ? { comment: task.comment } : {}),
    ...(task.decidedAt ? { decidedAt: task.decidedAt } : {}),
  }));
  const reason = nodeState?.reason ? (REASONS[nodeState.reason] ?? nodeState.reason) : undefined;
  // QA-WF-01 (v1.42.1): a step closed because another step at its level was
  // enough (an "any one" / "any N" join) is finished, not cancelled: the
  // level counts as done and the road's van moves on.
  const notNeeded = nodeState?.status === "CANCELLED" && nodeState.reason === "NOT_REQUIRED";
  return {
    nodeId: node.id,
    label: node.label,
    status: notNeeded ? "SKIPPED" : (nodeState?.status ?? "WAITING"),
    rule: node.background ? "Given as tasks; the request doesn't wait for them" : describeRule(node.completion, Math.max(people.length, 1), node.mode === "WORK"),
    ...(reason ? { reason } : {}),
    people,
    ...(node.mode === "WORK" ? { type: "WORK" as const } : {}),
    ...(node.background ? { background: true } : {}),
    ...(nodeState?.activatedAt ? { activatedAt: nodeState.activatedAt } : {}),
    ...(nodeState?.completedAt ? { completedAt: nodeState.completedAt } : {}),
  };
}

// Approval nodes in the order a request meets them (breadth-first from Start).
function graphOrder(definition: WorkflowDefinition): (ApprovalNode | NotifyNode)[] {
  const next = new Map<string, string[]>();
  for (const edge of definition.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const start = definition.nodes.find((node) => node.kind === "START");
  const seen = new Set<string>();
  const order: (ApprovalNode | NotifyNode)[] = [];
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node?.kind === "APPROVAL" || node?.kind === "NOTIFY") order.push(node);
    queue.push(...(next.get(id) ?? []));
  }
  return order;
}

export function buildStepMap(
  definition: WorkflowDefinition,
  state: InstanceState,
  spec: BuilderSpec | null,
  names: ReadonlyMap<number, string>,
  context: { formData?: FormData; fieldLabel?: (key: string) => string; expected?: (node: ApprovalNode | NotifyNode) => { userId: number; name: string }[] } = {},
): MapStage[] {
  const approvalNodes = new Map(
    definition.nodes.filter((node): node is ApprovalNode | NotifyNode => node.kind === "APPROVAL" || node.kind === "NOTIFY").map((node) => [node.id, node]),
  );
  const nodeFor = (step: BuilderStep) => approvalNodes.get(`step_${step.id}`);
  // v1.54.0 (owner): a level not reached yet shows who it will go to.
  const withExpected = (step: MapStep, node: ApprovalNode | NotifyNode): MapStep =>
    step.people.length === 0 && step.status === "WAITING" && context.expected ? { ...step, people: context.expected(node).map((person) => ({ ...person, status: "EXPECTED" as const })) } : step;
  const mapAny = (node: ApprovalNode | NotifyNode) => withExpected(node.kind === "NOTIFY" ? mapNotify(node, state, names) : mapStep(node, state, names), node);
  const fieldLabel = context.fieldLabel ?? ((key: string) => key);

  // A level not reached yet whose skip condition already holds on the form
  // is shown as skipped now, like DoA levels (S12): the engine will skip it.
  const withPreview = (step: MapStep, builderStep: BuilderStep): MapStep =>
    step.status === "WAITING" && builderStep.skipWhen && context.formData && evaluateCondition(toCondition(builderStep.skipWhen), context.formData)
      ? { ...step, status: "SKIPPED", reason: `Skipped: ${describeBuilderCondition(builderStep.skipWhen, fieldLabel)}` }
      : step;

  const mapStages = (stages: readonly (BuilderStage | BuilderInnerStage)[], notTaken: boolean): MapStage[] => {
    const out: MapStage[] = [];
    for (const stage of stages) {
      if (stage.kind === "STEP") {
        const node = nodeFor(stage.step);
        if (node) out.push({ kind: "STEP", label: node.label, steps: [{ ...withPreview(mapAny(node), stage.step), ...(notTaken ? { notTaken } : {}) }] });
      } else if (stage.kind === "PARALLEL") {
        const steps = stage.steps.flatMap((builderStep) => {
          const node = nodeFor(builderStep);
          return node ? [{ ...withPreview(mapAny(node), builderStep), ...(notTaken ? { notTaken } : {}) }] : [];
        });
        const joinRule: CompletionRule = stage.join === "ANY_N" ? { type: "ANY_N", n: stage.n ?? 1 } : { type: stage.join };
        out.push({ kind: "PARALLEL", label: stage.label, joinRule: describeJoin(joinRule), steps });
      } else if (stage.kind === "DOA") {
        // Each DoA level shows on its own; levels the amount doesn't need
        // say so in DoA terms.
        // Levels not yet reached are shown as skipped already when the
        // amount's band doesn't tick them (the engine will skip them).
        const amount = Number(context.formData?.[stage.field]);
        const band = Number.isFinite(amount) && context.formData?.[stage.field] !== undefined ? doaBandIndex(stage.limits, amount) : null;
        for (const level of stage.levels) {
          const node = nodeFor(level.step);
          if (!node) continue;
          const step = mapAny(node);
          const notNeeded =
            (step.status === "SKIPPED" && state.nodes[node.id]?.reason === "SKIP_CONDITION") || (step.status === "WAITING" && band !== null && !level.bands[band]);
          const doaStep = notNeeded ? { ...step, status: "SKIPPED" as const, reason: "Not needed at this amount (DoA)" } : step;
          out.push({ kind: "STEP", label: node.label, steps: [{ ...doaStep, ...(notTaken ? { notTaken } : {}) }] });
        }
      } else {
        const reached = state.nodes[`choice_${stage.id}`]?.status === "APPROVED";
        const thenTaken = reached && context.formData ? evaluateCondition(toCondition(stage.condition), context.formData) : null;
        const label = describeBuilderCondition(stage.condition, fieldLabel);
        out.push({
          kind: "CHOICE",
          label: `${stage.label}: if ${label}`,
          steps: [],
          paths: [
            { label: `If ${label}`, taken: thenTaken, stages: mapStages(stage.then, notTaken || thenTaken === false) },
            { label: "Otherwise", taken: thenTaken === null ? null : !thenTaken, stages: mapStages(stage.otherwise, notTaken || thenTaken === true) },
          ],
        });
      }
    }
    return out;
  };

  if (spec) return mapStages(spec.stages, false);
  return graphOrder(definition).map((node) => ({ kind: "STEP", label: node.label, steps: [mapAny(node)] }));
}

// Everyone the page needs a name for.
export function peopleInState(state: InstanceState): number[] {
  const ids = new Set<number>();
  for (const task of state.tasks) {
    ids.add(task.approverId);
    if (task.decidedBy) ids.add(task.decidedBy);
    if (task.onBehalfOf) ids.add(task.onBehalfOf);
  }
  return [...ids];
}

// "Where it is now" (spec #2): one plain summary over the level map, so it
// can never disagree with it. Uses only what the map already shows.
export interface TrackerSummary {
  headline: string;
  detail?: string;
  done: number;
  total: number;
  tone: "progress" | "waiting" | "attention" | "done" | "stopped";
}

export function flatSteps(stages: readonly MapStage[]): MapStep[] {
  return stages.flatMap((stage) => [...stage.steps, ...(stage.paths ?? []).flatMap((path) => flatSteps(path.stages))]);
}

export function summarizeTracker(
  stages: readonly MapStage[],
  input: { status: InstanceState["status"]; requesterName: string; closedAt?: string | null; holdSince?: string | null },
): TrackerSummary {
  const steps = flatSteps(stages).filter((step) => !step.notTaken && step.type !== "NOTIFY");
  const done = steps.filter((step) => step.status === "APPROVED" || step.status === "SKIPPED").length;
  const total = steps.length;
  const names = (step: MapStep) => step.people.filter((person) => person.status === "PENDING").map((person) => person.name);
  const when = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;
  const blocked = steps.filter((step) => step.status === "BLOCKED");
  const active = steps.filter((step) => step.status === "ACTIVE");
  const next = steps.find((step) => step.status === "WAITING");
  switch (input.status) {
    case "APPROVED":
      return { headline: "Fully approved", detail: input.closedAt ? `Finished ${when(input.closedAt)}` : undefined, done, total, tone: "done" };
    case "REJECTED":
      return { headline: "Rejected", detail: input.closedAt ? `Closed ${when(input.closedAt)}` : undefined, done, total, tone: "stopped" };
    case "CANCELLED":
      return { headline: "Withdrawn or removed", detail: input.closedAt ? `Closed ${when(input.closedAt)}` : undefined, done, total, tone: "stopped" };
    case "CHANGES_REQUIRED":
      return { headline: `Back with ${input.requesterName} for changes`, detail: "It continues once the changes are resubmitted.", done, total, tone: "attention" };
    case "ON_HOLD":
      return { headline: "On hold", detail: input.holdSince ? `Since ${when(input.holdSince)}. It continues when the approver resumes it.` : "It continues when the approver resumes it.", done, total, tone: "attention" };
    default: {
      if (blocked.length) return { headline: `Stuck at "${blocked[0]!.label}"`, detail: "Nobody can act on this step yet. IT has been told and can move it on.", done, total, tone: "attention" };
      const waitingFor = active.flatMap((step) => names(step).map((name) => ({ name, step: step.label, verb: step.type === "WORK" ? "to do" : "to decide" })));
      if (!waitingFor.length) return { headline: "In progress", done, total, tone: "progress" };
      const people = [...new Set(waitingFor.map((item) => item.name))];
      const stepsNow = [...new Set(active.map((step) => `"${step.label}"`))];
      return {
        headline: `Waiting for ${people.length > 3 ? `${people.slice(0, 3).join(", ")} and ${people.length - 3} more` : people.join(", ")} ${waitingFor[0]!.verb}`,
        detail: `At ${stepsNow.join(" and ")}.${next ? ` Next: "${next.label}".` : " This is the last step."}`,
        done,
        total,
        tone: "waiting",
      };
    }
  }
}
