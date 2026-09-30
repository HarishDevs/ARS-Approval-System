import "server-only";
import { withTransaction } from "@/lib/db/transaction";
import { clearSetting, listRawSettings, recordSettingHistory, upsertSetting } from "@/lib/db/repositories/settings.repository";
import { recordAudit } from "@/lib/db/repositories/audit.repository";
import { encryptSecret } from "@/lib/security/encryption";
import { keyedHash } from "@/lib/security/hashing";
import { SETTING_DEFINITIONS, type SettingDefinition } from "@/server/settings/definitions";
import { planSettingChanges, type PlannedChange } from "@/server/settings/plan-changes";

// F-52 / F-51: save one group of settings from /superadmin. All changes in
// one transaction: value, history row and audit entry. Secrets are stored
// encrypted; history and audit only ever see a keyed fingerprint.
export interface SaveSettingsResult {
  changed: string[];
  errors: Record<string, string>;
}

function fingerprint(value: string): string {
  return `fp:${keyedHash(`setting:${value}`).slice(0, 16)}`;
}

function historyRef(definition: SettingDefinition, value: string | null): string | null {
  if (value === null) return null;
  return definition.encrypted ? fingerprint(value) : `v:${value}`.slice(0, 255);
}

export async function saveSettingsGroup(
  group: SettingDefinition["group"],
  inputs: Record<string, string | undefined>,
  clears: ReadonlySet<string>,
  actor: { userId: number; sessionId: string; ipAddress: string | null },
): Promise<SaveSettingsResult> {
  const definitions = SETTING_DEFINITIONS.filter((definition) => definition.group === group);
  const current = new Map((await listRawSettings()).map((row) => [row.key, { value: row.value }]));
  const plan = planSettingChanges(definitions, inputs, clears, current);
  if (Object.keys(plan.errors).length > 0 || plan.changes.length === 0) {
    return { changed: [], errors: plan.errors };
  }

  await withTransaction(async (connection) => {
    for (const change of plan.changes) {
      await applyChange(change, current.has(change.definition.key), actor, connection);
    }
  });
  return { changed: plan.changes.map((change) => change.definition.key), errors: {} };
}

async function applyChange(
  change: PlannedChange,
  existed: boolean,
  actor: { userId: number; sessionId: string; ipAddress: string | null },
  connection: Parameters<typeof upsertSetting>[1],
): Promise<void> {
  const { definition } = change;
  const secret = definition.encrypted;
  if (change.kind === "CLEAR") {
    await clearSetting(definition.key, actor.userId, connection);
    await recordSettingHistory({ key: definition.key, changedBy: actor.userId, changeType: "UPDATE", oldRef: "secret", newRef: "cleared" }, connection);
  } else {
    await upsertSetting(
      {
        key: definition.key,
        group: definition.group,
        valueType: definition.valueType,
        encrypted: secret,
        storedValue: secret ? encryptSecret(change.value) : change.value,
        updatedBy: actor.userId,
      },
      connection,
    );
    await recordSettingHistory(
      {
        key: definition.key,
        changedBy: actor.userId,
        changeType: existed ? "UPDATE" : "CREATE",
        oldRef: secret ? null : historyRef(definition, change.before),
        newRef: historyRef(definition, change.value),
      },
      connection,
    );
  }
  await recordAudit(
    {
      actorUserId: actor.userId,
      action: change.kind === "CLEAR" ? "SETTING_CLEARED" : "SETTING_CHANGED",
      entityType: "SETTING",
      entityId: definition.key,
      sessionId: actor.sessionId,
      ipAddress: actor.ipAddress,
      metadata: secret
        ? { secret: true, after: change.kind === "SET" ? fingerprint(change.value) : null }
        : { before: change.before, after: change.kind === "SET" ? change.value : null },
    },
    connection,
  );
}
