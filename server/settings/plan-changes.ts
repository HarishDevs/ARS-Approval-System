import type { ZodIssue } from "zod";
import type { SettingDefinition } from "@/server/settings/definitions";

// Pure planning step for a settings save (F-52, unit-tested). Decides what
// actually changes, validates each value against its safe limits, and never
// needs a secret's current plaintext:
//   - secret, left blank      → unchanged
//   - secret, new value       → replaced
//   - secret, "remove" ticked → cleared
//   - plain value             → changed only if it differs from the value in force
export interface CurrentSetting {
  value: string | null; // stored value (ciphertext for secrets)
}

export type PlannedChange =
  | { kind: "SET"; definition: SettingDefinition; value: string; before: string | null }
  | { kind: "CLEAR"; definition: SettingDefinition; before: string | null };

export interface SettingsPlan {
  changes: PlannedChange[];
  errors: Record<string, string>;
}

function describeIssue(issue: ZodIssue | undefined): string {
  if (!issue) return "This value isn't valid.";
  if (issue.code === "too_small" && issue.type === "number") return `Use ${String(issue.minimum)} or more.`;
  if (issue.code === "too_big" && issue.type === "number") return `Use ${String(issue.maximum)} or less.`;
  if (issue.code === "invalid_type" && issue.expected === "number") return "Enter a whole number.";
  return issue.message;
}

export function planSettingChanges(
  definitions: readonly SettingDefinition[],
  inputs: Record<string, string | undefined>,
  clears: ReadonlySet<string>,
  current: ReadonlyMap<string, CurrentSetting>,
): SettingsPlan {
  const changes: PlannedChange[] = [];
  const errors: Record<string, string> = {};

  for (const definition of definitions) {
    const stored = current.get(definition.key)?.value ?? null;
    const raw = inputs[definition.key];

    if (definition.encrypted) {
      const configured = stored !== null && stored !== "";
      if (clears.has(definition.key)) {
        if (configured) changes.push({ kind: "CLEAR", definition, before: null });
        continue;
      }
      if (raw === undefined || raw.trim() === "") continue;
      const parsed = definition.schema.safeParse(raw.trim());
      if (!parsed.success) {
        errors[definition.key] = describeIssue(parsed.error.issues[0]);
        continue;
      }
      changes.push({ kind: "SET", definition, value: String(parsed.data), before: null });
      continue;
    }

    if (raw === undefined) continue;
    const parsed = definition.schema.safeParse(raw.trim());
    if (!parsed.success) {
      errors[definition.key] = describeIssue(parsed.error.issues[0]);
      continue;
    }
    const next = String(parsed.data);
    const inForce = stored ?? definition.defaultValue ?? null;
    if (next === inForce) continue;
    changes.push({ kind: "SET", definition, value: next, before: inForce });
  }

  return { changes, errors };
}
