import type { InstanceState } from "@/server/engine/types";

// What "re-check" finds for an in-progress request (v1.7.0, A6), without the
// database. The workflow state is the record; task rows are its copy.
export type Diagnosis =
  | { kind: "OK" }
  | { kind: "NO_OPEN_STEP" }
  | { kind: "TASKS_OUT_OF_STEP"; missingKeys: string[]; mismatchedKeys: string[]; orphanKeys: string[] };

export function diagnoseState(state: InstanceState, rows: readonly { taskKey: string; status: string }[]): Diagnosis {
  if (state.status === "IN_PROGRESS" && !Object.values(state.nodes ?? {}).some((node) => node.status === "ACTIVE" || node.status === "BLOCKED")) return { kind: "NO_OPEN_STEP" };
  const byKey = new Map(rows.map((row) => [row.taskKey, row.status]));
  const stateKeys = new Set(state.tasks.map((task) => task.id));
  const missingKeys = state.tasks.filter((task) => !byKey.has(task.id)).map((task) => task.id);
  const mismatchedKeys = state.tasks.filter((task) => byKey.has(task.id) && byKey.get(task.id) !== task.status).map((task) => task.id);
  // Pending rows the workflow state doesn't have at all.
  const orphanKeys = rows.filter((row) => row.status === "PENDING" && !stateKeys.has(row.taskKey)).map((row) => row.taskKey);
  if (!missingKeys.length && !mismatchedKeys.length && !orphanKeys.length) return { kind: "OK" };
  return { kind: "TASKS_OUT_OF_STEP", missingKeys, mismatchedKeys, orphanKeys };
}
