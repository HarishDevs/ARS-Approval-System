import { z } from "zod";
import type { SettingDefinition } from "@/server/settings/definitions";
import type { RawSetting } from "@/lib/db/repositories/settings.repository";

// Pure display rule (unit-tested): secrets are never decrypted for display,
// only reported as Configured / Not configured (D-016).
export type SettingStatus = "NOT_CONFIGURED" | "CONFIGURED" | "VALUE";

export interface DisplaySetting {
  key: string;
  label: string;
  group: string;
  valueType: SettingDefinition["valueType"];
  encrypted: boolean;
  status: SettingStatus;
  value: string | null;
  updatedAt: Date | null;
  // A fixed list of choices (an enum setting): shown as a dropdown.
  options?: string[];
}

export function resolveSettingForDisplay(definition: SettingDefinition, raw: RawSetting | null): DisplaySetting {
  const base = {
    key: definition.key,
    label: definition.label,
    group: definition.group,
    valueType: definition.valueType,
    encrypted: definition.encrypted,
    ...(definition.schema instanceof z.ZodEnum ? { options: definition.schema.options.map(String) } : {}),
  };
  if (definition.encrypted) {
    return { ...base, status: raw?.value ? "CONFIGURED" : "NOT_CONFIGURED", value: null, updatedAt: raw?.updatedAt ?? null };
  }
  if (raw && raw.value !== null) {
    return { ...base, status: "VALUE", value: raw.value, updatedAt: raw.updatedAt };
  }
  const hasDefault = definition.defaultValue !== undefined && definition.defaultValue !== "";
  return { ...base, status: hasDefault ? "VALUE" : "NOT_CONFIGURED", value: definition.defaultValue ?? null, updatedAt: null };
}
